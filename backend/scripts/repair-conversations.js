/**
 * Conversation Repair Script - Re-fetch logs for ALL sessions with missing/incomplete data
 * 
 * Targets sessions with duration >= 5 minutes where logged data doesn't match what
 * Pipecat API actually has. Uses per-session targeted fetching (query=sessionId).
 * 
 * Works in both test and production environments:
 *   - By default, reads APP_ENV from .env (currently "test")
 *   - Use --env=production to run against production tables
 * 
 * Usage:
 *   node scripts/repair-conversations.js                         # Repair incomplete sessions (test env)
 *   node scripts/repair-conversations.js --force                 # Re-sync ALL sessions >= min duration
 *   node scripts/repair-conversations.js --force --min-duration=0  # Re-sync ALL sessions (any duration)
 *   node scripts/repair-conversations.js --env=production        # Run against production tables
 *   node scripts/repair-conversations.js --agent=ngo             # Filter to specific agent
 *   node scripts/repair-conversations.js --min-duration=300      # Custom min duration in seconds (default 300 = 5 min)
 *   node scripts/repair-conversations.js --dry-run               # Preview only, no DB writes
 *   node scripts/repair-conversations.js --env=production --force --dry-run   # Preview production repair
 *   node scripts/repair-conversations.js --force --force-overwrite --min-duration=0  # Decontaminate ALL (bypass shrinkage protection)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ============ CLI ARGUMENT PARSING ============
const args = process.argv.slice(2);

function getArg(name) {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
}

const CLI_ENV = getArg('env');                                     // --env=production or --env=test
const agentFilter = getArg('agent') || null;                       // --agent=ngo
const minDuration = parseInt(getArg('min-duration') || '300');     // --min-duration=300 (default 5 min)
const forceAll = args.includes('--force');                         // Re-sync ALL sessions, not just incomplete
const forceOverwrite = args.includes('--force-overwrite');         // Bypass shrinkage protection (decontaminate)
const dryRun = args.includes('--dry-run');                         // Preview only, no DB writes

// Override APP_ENV if --env flag is provided
if (CLI_ENV) {
    process.env.APP_ENV = CLI_ENV;
}
const APP_ENV = process.env.APP_ENV || 'production';

// ============ IMPORTS (after env override so table names resolve correctly) ============
const { sequelize, testConnection } = require(path.join(__dirname, '../src/config/database'));
const PipecatClient = require(path.join(__dirname, '../src/config/pipecat'));
const { getTableName, logEnvironmentInfo } = require(path.join(__dirname, '../src/config/tables'));
const logger = require(path.join(__dirname, '../src/utils/logger'));
const {
    normalizeLogs,
    extractTelephonyMetadata
} = require(path.join(__dirname, '../src/services/pipecat_normalization'));
const { generateSummary } = require(path.join(__dirname, '../src/services/summary.service'));

const SYNC_START_DATE = new Date('2026-01-01T00:00:00Z');

async function repairConversations() {
    // ============ STARTUP BANNER ============
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('🔧 CONVERSATION REPAIR SCRIPT');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`   Environment:    ${APP_ENV.toUpperCase()}`);
    logger.info(`   Min Duration:   ${minDuration}s (${(minDuration / 60).toFixed(1)} min)`);
    logger.info(`   Agent Filter:   ${agentFilter || 'ALL agents'}`);
    logger.info(`   Mode:           ${forceAll ? 'FORCE (re-sync all >= min duration)' : 'SMART (incomplete only)'}`);
    logger.info(`   Force Overwrite: ${forceOverwrite ? 'YES (bypass shrinkage protection for decontamination)' : 'NO'}`);
    logger.info(`   Dry Run:        ${dryRun ? 'YES (preview - no DB writes)' : 'NO (will write to DB)'}`);
    logger.info('═══════════════════════════════════════════════════════════');
    logEnvironmentInfo();

    if (APP_ENV === 'production' && !dryRun) {
        logger.warn('⚠️  PRODUCTION MODE - Will write to production tables!');
        logger.warn('⚠️  Starting in 5 seconds... Press Ctrl+C to abort.');
        await new Promise(r => setTimeout(r, 5000));
    }

    await testConnection();

    const client = new PipecatClient();
    const tableSessions = getTableName('Sessions');
    const tableConversations = getTableName('Conversations');

    // ============ FIND SESSIONS NEEDING REPAIR ============
    let whereClause = '';
    const replacements = { startDate: SYNC_START_DATE, minDuration };

    if (agentFilter) {
        whereClause += ` AND s.agent_name ILIKE :agentName`;
        replacements.agentName = `%${agentFilter}%`;
    }

    // Quality filter for smart mode (non-force):
    // Target sessions that are likely missing data
    let qualityFilter = '';
    if (!forceAll) {
        qualityFilter = `
            AND (
                -- No conversation data at all
                c.session_id IS NULL
                -- Very few turns for a long call (likely missing most data)
                OR (s.duration_seconds >= :minDuration AND (c.total_turns IS NULL OR c.total_turns < 5))
                -- Turn density too low: expect at least ~1 turn per minute
                OR (s.duration_seconds >= :minDuration 
                    AND c.total_turns IS NOT NULL 
                    AND c.total_turns < GREATEST(s.duration_seconds / 60, 5))
                -- Has turns but many missing bot responses (broken pairing from old sync)
                OR (c.total_turns IS NOT NULL AND c.total_turns > 3 AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(c.turns) AS t 
                    WHERE (t->>'assistant_message') IS NULL OR (t->>'assistant_message') = ''
                ) AND (
                    (SELECT COUNT(*) FROM jsonb_array_elements(c.turns) AS t 
                     WHERE (t->>'assistant_message') IS NULL OR (t->>'assistant_message') = ''
                    ) > c.total_turns * 0.3
                ))
            )
        `;
    }

    const sessionsToRepair = await sequelize.query(`
        SELECT s.session_id, s.agent_id, s.agent_name, s.started_at, s.ended_at,
               s.duration_seconds, s.status,
               c.total_turns, c.summary
        FROM "${tableSessions}" s
        LEFT JOIN "${tableConversations}" c ON s.session_id = c.session_id
        WHERE s.started_at >= :startDate
        AND s.duration_seconds >= :minDuration
        ${whereClause}
        ${qualityFilter}
        ORDER BY s.duration_seconds DESC, s.started_at DESC
    `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
    });

    logger.info(`📋 Found ${sessionsToRepair.length} sessions to repair`);

    if (sessionsToRepair.length === 0) {
        logger.info('✅ No sessions need repair!');
        await sequelize.close();
        return;
    }

    // ============ PRE-REPAIR SUMMARY ============
    const totalDuration = sessionsToRepair.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    const avgDuration = totalDuration / sessionsToRepair.length;
    const noDataCount = sessionsToRepair.filter(s => !s.total_turns).length;
    const lowTurnCount = sessionsToRepair.filter(s => s.total_turns && s.total_turns < 10).length;

    logger.info('');
    logger.info('📊 Sessions breakdown:');
    logger.info(`   No conversation data:  ${noDataCount}`);
    logger.info(`   Low turns (<10):       ${lowTurnCount}`);
    logger.info(`   Has some data:         ${sessionsToRepair.length - noDataCount - lowTurnCount}`);
    logger.info(`   Avg duration:          ${(avgDuration / 60).toFixed(1)} min`);
    logger.info(`   Total duration:        ${(totalDuration / 3600).toFixed(1)} hours`);
    logger.info('');

    // ============ DRY RUN: JUST LIST ============
    if (dryRun) {
        logger.info('🔍 DRY RUN - Sessions that would be repaired:');
        logger.info('');
        for (let i = 0; i < sessionsToRepair.length; i++) {
            const s = sessionsToRepair[i];
            logger.info(`   ${i + 1}. ${s.session_id} | ${s.agent_name.padEnd(20)} | ${(s.duration_seconds / 60).toFixed(1).padStart(6)}m | turns: ${String(s.total_turns || 0).padStart(4)}`);
        }
        logger.info('');
        logger.info(`Total: ${sessionsToRepair.length} sessions would be repaired.`);
        logger.info('Run without --dry-run to execute.');
        await sequelize.close();
        return;
    }

    // ============ REPAIR LOOP ============
    let repaired = 0;
    let improved = 0;
    let unchanged = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < sessionsToRepair.length; i++) {
        const session = sessionsToRepair[i];
        const sessionId = session.session_id;
        const progress = `[${i + 1}/${sessionsToRepair.length}]`;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const eta = i > 0 ? (((Date.now() - startTime) / i) * (sessionsToRepair.length - i) / 1000 / 60).toFixed(1) : '?';

        try {
            logger.info(`${progress} (${elapsed}s, ETA ~${eta}m) ${sessionId} | ${session.agent_name} | ${(session.duration_seconds / 60).toFixed(1)}m | current: ${session.total_turns || 0} turns`);

            // ============ FETCH ALL LOGS FROM PIPECAT API ============
            // Uses `query` param (not `session_id`) for proper API-level filtering
            const allSessionLogs = await client.getAllLogsForSessionById(session.agent_name, sessionId);

            if (allSessionLogs.length === 0) {
                logger.debug(`${progress} No logs found`);
                unchanged++;
                continue;
            }
            // Only deduplicate by timestamp+content to prevent pagination overlap.
            const seen = new Set();
            const dedupedLogs = allSessionLogs.filter(l => {
                const key = `${l.timestamp}|${(l.log || '').substring(0, 200)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            const sessionLogEntries = dedupedLogs.map(l => ({ log: l.log || '', timestamp: l.timestamp }));
            // Pass sessionId so event-based parser can assign UUID-less logs to this session
            let turns = normalizeLogs(sessionLogEntries, sessionId);

            if (!turns || turns.length === 0) {
                logger.warn(`${progress} ⚠️ 0 turns from ${allSessionLogs.length} raw logs`);
                unchanged++;
                continue;
            }

            // ============ COMPARE & MERGE WITH EXISTING DATA ============
            const existing = await sequelize.query(`
                SELECT session_id, total_turns, turns, summary FROM "${tableConversations}" WHERE session_id = :sessionId
            `, { replacements: { sessionId }, type: sequelize.QueryTypes.SELECT });

            const existingConv = existing[0] || null;
            const oldTurnCount = existingConv?.total_turns || 0;
            const oldTurnsData = existingConv?.turns || [];
            const oldBotResponses = Array.isArray(oldTurnsData) ? oldTurnsData.filter(t => t.assistant_message).length : 0;

            // Intelligent merge strategy
            if (existingConv && Array.isArray(oldTurnsData) && oldTurnsData.length > 0) {
                if (forceOverwrite) {
                    // --force-overwrite: Always use new (filtered) data, no merge from old (possibly contaminated) data
                    logger.info(`${progress} 🧹 Force overwrite: ${oldTurnsData.length}→${turns.length} turns (decontamination mode)`);
                } else if (turns.length >= oldTurnsData.length) {
                    turns.forEach((newTurn, idx) => {
                        if (idx < oldTurnsData.length) {
                            const oldTurn = oldTurnsData[idx];
                            if (!newTurn.assistant_message && oldTurn?.assistant_message) {
                                newTurn.assistant_message = oldTurn.assistant_message;
                            }
                            if (!newTurn.user_message && oldTurn?.user_message) {
                                newTurn.user_message = oldTurn.user_message;
                            }
                        }
                    });
                } else {
                    // New data has fewer turns - only replace if quality is better
                    const newBotResponses = turns.filter(t => t.assistant_message).length;
                    const oldBotRatio = oldTurnsData.length > 0 ? oldBotResponses / oldTurnsData.length : 0;
                    const newBotRatio = turns.length > 0 ? newBotResponses / turns.length : 0;

                    if (newBotRatio <= oldBotRatio && newBotResponses <= oldBotResponses) {
                        logger.debug(`${progress} Skip: new (${turns.length}t) < existing (${oldTurnsData.length}t), no quality gain`);
                        unchanged++;
                        continue;
                    }
                    logger.info(`${progress} 📊 Replacing despite fewer turns (${oldTurnsData.length}→${turns.length}) - better quality`);
                }
            }

            const finalBotResponses = turns.filter(t => t.assistant_message).length;

            // Skip if no improvement at all (unless force-overwrite mode)
            if (!forceOverwrite && existingConv && turns.length <= oldTurnCount && finalBotResponses <= oldBotResponses) {
                logger.debug(`${progress} No improvement (${oldTurnCount}→${turns.length}t, ${oldBotResponses}→${finalBotResponses}b)`);
                unchanged++;
                continue;
            }

            // ============ EXTRACT TELEPHONY METADATA ============
            for (const logEntry of sessionLogEntries) {
                const telephony = extractTelephonyMetadata(logEntry.log);
                if (telephony) {
                    await sequelize.query(`
                        UPDATE "${tableSessions}" SET metadata = metadata || :telephony::jsonb WHERE session_id = :sessionId
                    `, { replacements: { sessionId, telephony: JSON.stringify({ telephony }) }, type: sequelize.QueryTypes.UPDATE }).catch(() => {});
                    break;
                }
            }

            // ============ GENERATE SUMMARY IF MISSING ============
            let summary = existingConv?.summary || null;
            if (!summary && session.ended_at && turns.length > 0) {
                const isRecent = new Date(session.started_at) >= new Date('2026-01-28T00:00:00Z');
                if (isRecent) {
                    try {
                        summary = await generateSummary(turns);
                    } catch (sumErr) {
                        logger.debug(`${progress} Summary failed: ${sumErr.message}`);
                    }
                }
            }

            // ============ WRITE TO DATABASE ============
            const time = turns[turns.length - 1]?.timestamp || new Date();
            await sequelize.query(`
                INSERT INTO "${tableConversations}" (session_id, agent_id, agent_name, turns, total_turns, first_message_at, last_message_at, summary, last_synced, created_at, updated_at)
                VALUES (:sessionId, :agentId, :agentName, :turns::jsonb, :totalTurns, :firstMessageAt, :lastMessageAt, :summary, NOW(), NOW(), NOW())
                ON CONFLICT (session_id) DO UPDATE SET
                    turns = :turns::jsonb,
                    total_turns = :totalTurns,
                    first_message_at = :firstMessageAt,
                    last_message_at = :lastMessageAt,
                    summary = COALESCE(:summary, "${tableConversations}".summary),
                    last_synced = NOW(),
                    updated_at = NOW()
            `, {
                replacements: {
                    sessionId,
                    agentId: session.agent_id,
                    agentName: session.agent_name,
                    turns: JSON.stringify(turns),
                    totalTurns: turns.length,
                    firstMessageAt: turns[0]?.timestamp || time,
                    lastMessageAt: time,
                    summary
                },
                type: sequelize.QueryTypes.INSERT
            });

            await sequelize.query(`
                UPDATE "${tableSessions}" SET conversation_count = :count WHERE session_id = :sessionId
            `, { replacements: { count: turns.length, sessionId }, type: sequelize.QueryTypes.UPDATE });

            repaired++;
            if (turns.length > oldTurnCount || finalBotResponses > oldBotResponses) {
                improved++;
                logger.info(`${progress} ✅ IMPROVED: ${oldTurnCount} → ${turns.length} turns, ${oldBotResponses} → ${finalBotResponses} bot (${allSessionLogs.length} logs)`);
            } else {
                logger.info(`${progress} ✅ Synced: ${turns.length} turns, ${finalBotResponses} bot`);
            }

        } catch (err) {
            failed++;
            logger.error(`${progress} ❌ Failed ${sessionId}: ${err.message}`);
        }

        // Rate limit between sessions
        await client.delay(100);
    }

    // ============ FINAL REPORT ============
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info('');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('📊 REPAIR COMPLETE');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`   Environment:     ${APP_ENV.toUpperCase()}`);
    logger.info(`   Tables:          ${tableSessions}, ${tableConversations}`);
    logger.info(`   Total processed: ${sessionsToRepair.length}`);
    logger.info(`   Repaired:        ${repaired}`);
    logger.info(`   Improved:        ${improved}`);
    logger.info(`   Unchanged:       ${unchanged}`);
    logger.info(`   Failed:          ${failed}`);
    logger.info(`   Duration:        ${totalTime}s (${(totalTime / 60).toFixed(1)}m)`);
    logger.info('═══════════════════════════════════════════════════════════');

    await sequelize.close();
}

repairConversations()
    .then(() => {
        logger.info('🏁 Repair script finished.');
        process.exit(0);
    })
    .catch(err => {
        logger.error('💀 Repair script failed:', err);
        process.exit(1);
    });
