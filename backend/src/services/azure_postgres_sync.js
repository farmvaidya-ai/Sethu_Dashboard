const { Client } = require('pg');
const { sequelize } = require('../config/database');
const { getTableName } = require('../config/tables');
const { generateSummary } = require('./summary.service');
const logger = require('../utils/logger');

const AZURE_CONFIG = {
    host: process.env.AZURE_PG_HOST || 'pipecat-pg-dev.postgres.database.azure.com',
    port: parseInt(process.env.AZURE_PG_PORT || '5432', 10),
    database: process.env.AZURE_PG_DATABASE || 'pipecat_logs',
    user: process.env.AZURE_PG_USER || 'pipecatadmin',
    password: process.env.AZURE_PG_PASSWORD || '',
    ssl: { rejectUnauthorized: false },
    // Keep a persistent connection pool
    connectionTimeoutMillis: 10000,
    query_timeout: 30000
};

// ─── HIGH-WATER MARK ─────────────────────────────────────────────────────────
// Tracks MAX(updated_at) of Azure rows we have processed.
let _lastAzureSyncTime = null;

async function _getHighWaterMark() {
    if (!_lastAzureSyncTime) {
        try {
            const table = getTableName('System_Settings');
            const setting = await sequelize.query(
                `SELECT setting_value FROM "${table}" WHERE setting_key = 'azure_sync_hwm'`,
                { type: sequelize.QueryTypes.SELECT }
            );
            if (setting && setting.length > 0 && setting[0].setting_value) {
                _lastAzureSyncTime = new Date(setting[0].setting_value);
                logger.info(`[Azure] Persistent high-water mark loaded: ${_lastAzureSyncTime.toISOString()}`);
            }
        } catch (e) {
            logger.warn(`[Azure] Could not load HWM from DB: ${e.message}`);
        }

        if (!_lastAzureSyncTime) {
            _lastAzureSyncTime = new Date('2026-01-01T00:00:00Z');
            logger.info(`[Azure] First run — high-water mark initialized to ${_lastAzureSyncTime.toISOString()}`);
        }
    }
    return _lastAzureSyncTime;
}

async function _saveHighWaterMark(timestamp) {
    if (!timestamp) return;
    try {
        const table = getTableName('System_Settings');
        await sequelize.query(`
            INSERT INTO "${table}" (setting_key, setting_value, description, updated_at)
            VALUES ('azure_sync_hwm', :val, 'High-water mark for Azure log sync', NOW())
            ON CONFLICT (setting_key) 
            DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
        `, { 
            replacements: { val: timestamp.toISOString() },
            type: sequelize.QueryTypes.INSERT
        });
    } catch (e) {
        logger.error(`[Azure] Failed to save HWM: ${e.message}`);
    }
}

// ─── CONCURRENT UPSERT HELPER ─────────────────────────────────────────────────
// Runs up to `concurrency` promises at a time (simple pool).
async function runConcurrent(tasks, concurrency = 5) {
    const results = [];
    let idx = 0;
    const worker = async () => {
        while (idx < tasks.length) {
            const i = idx++;
            try { results[i] = await tasks[i](); }
            catch (e) { results[i] = null; }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
    return results;
}

// ─── BACKGROUND SUMMARY (fire-and-forget) ────────────────────────────────────
// Generates summary AFTER the session is already saved — sync loop never blocks.
function enqueueSummaryInBackground(Conversation, sessionId, turns) {
    setImmediate(async () => {
        try {
            const summary = await generateSummary(turns);
            if (summary) {
                await Conversation.update({ summary }, { where: { session_id: sessionId } });
                logger.debug(`[Azure] Summary saved for ${sessionId}`);
            }
        } catch (e) {
            logger.error(`[Azure] Background summary failed for ${sessionId}: ${e.message}`);
        }
    });
}

// ─── MAIN SYNC FUNCTION ───────────────────────────────────────────────────────
async function syncAzurePostgresLogs(Agent, Session, Conversation) {
    logger.info('🚀 [Azure] Starting incremental sync...');
    const syncStart = Date.now();

    const client = new Client(AZURE_CONFIG);
    try {
        await client.connect();

        // ── 1. FETCH EXCLUDED LISTS (parallel) ───────────────────────────────
        const [excludedAgentsRes, excludedSessionsRes] = await Promise.all([
            sequelize.query(
                `SELECT item_id FROM "${getTableName('Excluded_Items')}" WHERE item_type = 'agent'`,
                { type: sequelize.QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT item_id FROM "${getTableName('Excluded_Items')}" WHERE item_type = 'session'`,
                { type: sequelize.QueryTypes.SELECT }
            )
        ]);
        const excludedAgentIds = new Set(excludedAgentsRes.map(e => e.item_id));
        const excludedSessionIds = new Set(excludedSessionsRes.map(e => e.item_id));

        // ── 2. INCREMENTAL FETCH — rows updated since last sync ──────────────
        // We use updated_at (not created_at) so that sessions synced mid-call
        // (with ended_at=NULL) get re-fetched automatically once Azure sets
        // their ended_at and bumps updated_at.
        const hwm = await _getHighWaterMark();
        const res = await client.query(
            `SELECT * FROM sessions
             WHERE updated_at > $1
             ORDER BY updated_at ASC
             LIMIT 1500`,          // increased limit for faster catch-up
            [hwm]
        );
        const rows = res.rows;

        if (rows.length === 0) {
            logger.info('[Azure] No new rows since last sync. Skipping.');
            return;
        }
        logger.info(`[Azure] Fetched ${rows.length} new rows from Azure (since ${hwm.toISOString()})`);

        // ── 3. FILTER rows upfront (no per-row DB round-trips for this) ───────
        const validRows = rows.filter(row =>
            row.session_id &&
            !excludedAgentIds.has(row.agent_id || 'unknown') &&
            !excludedSessionIds.has(row.session_id)
        );

        // ── 4. PRE-LOAD existing records IN BULK (2 queries total, not N*2) ───
        const sessionIds = validRows.map(r => r.session_id);

        const [existingSessions, existingConvs] = await Promise.all([
            Session.findAll({ where: { session_id: sessionIds }, attributes: ['session_id', 'metadata'] }),
            Conversation.findAll({ where: { session_id: sessionIds }, attributes: ['session_id', 'summary'] })
        ]);

        const existingSessionMap = new Map(existingSessions.map(s => [s.session_id, s]));
        const existingConvMap = new Map(existingConvs.map(c => [c.session_id, c]));

        // ── 5. UPSERT AGENTS (deduplicated, parallel) ─────────────────────────
        const agentMap = new Map();
        for (const row of validRows) {
            const id = row.agent_id || 'unknown';
            if (!agentMap.has(id)) agentMap.set(id, row.agent_name || 'Azure Agent');
        }

        await runConcurrent(
            [...agentMap.entries()].map(([agentId, agentName]) => async () => {
                const sessionCount = await Session.count({ where: { agent_id: agentId } });
                await Agent.upsert({
                    agent_id: agentId,
                    name: agentName,
                    session_count: sessionCount,
                    created_at: new Date(),
                    updated_at: new Date(),
                    last_synced: new Date()
                });
            }),
            5
        );
        logger.info(`[Azure] Upserted ${agentMap.size} agent(s)`);

        // ── 6. PROCESS SESSIONS + CONVERSATIONS CONCURRENTLY ─────────────────
        const now = new Date();
        let syncedCount = 0;
        const SUMMARY_CUTOFF = new Date('2026-01-28T00:00:00Z');

        const tasks = validRows.map(row => async () => {
            const sessionId = row.session_id;
            const startedAt = row.started_at ? new Date(row.started_at) : now;
            const endedAt = row.ended_at ? new Date(row.ended_at) : null;
            const durationSeconds = row.duration_seconds || 0;
            const completionStatus = row.status || 'completed';

            // --- Build merged metadata without a SELECT per row ---
            const existingSession = existingSessionMap.get(sessionId);
            let mergedMetadata = existingSession ? (existingSession.metadata || {}) : {};
            if (row.metadata) mergedMetadata = { ...mergedMetadata, ...row.metadata };
            if (row.call_id || row.stream_id || row.caller_id) {
                mergedMetadata.telephony = {
                    ...(mergedMetadata.telephony || {}),
                    call_id: row.call_id || mergedMetadata.telephony?.call_id,
                    stream_id: row.stream_id || mergedMetadata.telephony?.stream_id,
                    caller_id: row.caller_id || mergedMetadata.telephony?.caller_id
                };
            }

            // Upsert session
            await Session.upsert({
                session_id: sessionId,
                agent_id: row.agent_id,
                agent_name: row.agent_name,
                started_at: startedAt,
                ended_at: endedAt,
                status: completionStatus,
                completion_status: completionStatus,
                duration_seconds: durationSeconds,
                metadata: mergedMetadata,
                last_synced: now
            });

            // Upsert conversation (if turns exist)
            const turns = row.conversation || [];
            if (turns.length === 0) return;

            const totalTurns = row.conversation_count || turns.length;
            const firstMsgTime = turns[0]?.timestamp ? new Date(turns[0].timestamp) : startedAt;
            const lastMsgTime = turns[turns.length - 1]?.timestamp ? new Date(turns[turns.length - 1].timestamp) : now;

            const existingConv = existingConvMap.get(sessionId);

            // Decide summary WITHOUT blocking the loop
            let finalSummary = null;
            if (existingConv?.summary) {
                finalSummary = existingConv.summary;          // already have one — reuse
            } else if (row.summary) {
                finalSummary = row.summary;                   // Azure already computed it
            }
            // If neither, save the record NOW (fast), then generate in background
            const needsBackgroundSummary =
                !finalSummary &&
                endedAt &&
                turns.length > 0 &&
                startedAt >= SUMMARY_CUTOFF;

            await Conversation.upsert({
                session_id: sessionId,
                agent_id: row.agent_id,
                agent_name: row.agent_name,
                turns,
                total_turns: totalTurns,
                first_message_at: firstMsgTime,
                last_message_at: lastMsgTime,
                summary: finalSummary,      // null is fine — background will fill it
                review_status: row.review_status || 'pending',
                reviewed_by: row.reviewed_by || null,
                reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
                last_synced: now
            });

            await Session.update({ conversation_count: totalTurns }, { where: { session_id: sessionId } });

            // Fire-and-forget summary — does NOT block this cycle
            if (needsBackgroundSummary) {
                enqueueSummaryInBackground(Conversation, sessionId, turns);
            }

            syncedCount++;
        });

        // Run up to 15 sessions concurrently for faster catch-up
        await runConcurrent(tasks, 15);

        // ── 7. ADVANCE HIGH-WATER MARK using MAX(updated_at) ─────────────────
        // Must use updated_at here to match our query — not created_at or
        // local last_synced (which is polluted by the Pipecat sync).
        if (rows.length > 0) {
            const latestUpdatedAt = rows.reduce((max, r) =>
                new Date(r.updated_at) > max ? new Date(r.updated_at) : max,
                new Date(_lastAzureSyncTime)
            );
            _lastAzureSyncTime = latestUpdatedAt;
            await _saveHighWaterMark(_lastAzureSyncTime);
            logger.info(`[Azure] High-water mark advanced to ${_lastAzureSyncTime.toISOString()} (Saved)`);
        }

        const elapsed = ((Date.now() - syncStart) / 1000).toFixed(1);
        logger.info(`✅ [Azure] Sync complete: ${syncedCount} conversations in ${elapsed}s`);

    } catch (err) {
        logger.error('❌ [Azure] Sync error:', err.message);
    } finally {
        await client.end();
    }
}

module.exports = { syncAzurePostgresLogs };
