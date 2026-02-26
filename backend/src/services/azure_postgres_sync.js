const { Client } = require('pg');
const { DataTypes } = require('sequelize');
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
    ssl: { rejectUnauthorized: false }
};

async function syncAzurePostgresLogs(Agent, Session, Conversation) {
    logger.info('🚀 Starting sync from Azure PostgreSQL...');
    const client = new Client(AZURE_CONFIG);
    try {
        await client.connect();
        logger.info('✅ Connected to source Azure PostgreSQL');

        const excludedAgentsRes = await sequelize.query(`
            SELECT item_id FROM "${getTableName('Excluded_Items')}"
            WHERE item_type = 'agent'
        `, { type: sequelize.QueryTypes.SELECT });
        const excludedAgentIds = new Set(excludedAgentsRes.map(e => e.item_id));

        const excludedSessionsRes = await sequelize.query(`
            SELECT item_id FROM "${getTableName('Excluded_Items')}"
            WHERE item_type = 'session'
        `, { type: sequelize.QueryTypes.SELECT });
        const excludedSessionIds = new Set(excludedSessionsRes.map(e => e.item_id));

        const res = await client.query(`
            SELECT * FROM sessions 
            WHERE created_at > (NOW() - INTERVAL '7 days')
            ORDER BY created_at ASC
        `);
        const rows = res.rows;
        logger.info(`Fetched ${rows.length} sessions from Azure DB (last 7 days).`);

        let syncedCount = 0;
        let newAgents = new Set();

        for (const row of rows) {
            const agentId = row.agent_id || 'unknown';
            const agentName = row.agent_name || 'Azure Agent';
            const sessionId = row.session_id;

            if (!sessionId) continue;
            if (excludedAgentIds.has(agentId)) continue;
            if (excludedSessionIds.has(sessionId)) continue;

            newAgents.add(JSON.stringify({ id: agentId, name: agentName }));
        }

        for (const agentStr of newAgents) {
            const agent = JSON.parse(agentStr);
            const sessionCount = await Session.count({ where: { agent_id: agent.id } });
            await Agent.upsert({
                agent_id: agent.id,
                name: agent.name,
                session_count: sessionCount,
                created_at: new Date(),
                updated_at: new Date(),
                last_synced: new Date()
            });
        }

        for (const row of rows) {
            const sessionId = row.session_id;
            if (!sessionId || excludedSessionIds.has(sessionId) || excludedAgentIds.has(row.agent_id)) continue;

            const startedAt = row.started_at ? new Date(row.started_at) : new Date();
            const endedAt = row.ended_at ? new Date(row.ended_at) : null;
            const durationSeconds = row.duration_seconds || 0;
            const completionStatus = row.status || 'completed';

            const existingSession = await Session.findByPk(sessionId);
            const existingConv = await Conversation.findByPk(sessionId);

            let mergedMetadata = existingSession ? (existingSession.metadata || {}) : {};
            if (row.metadata) {
                mergedMetadata = { ...mergedMetadata, ...row.metadata };
            }

            if (row.call_id || row.stream_id || row.caller_id) {
                mergedMetadata.telephony = {
                    ...(mergedMetadata.telephony || {}),
                    call_id: row.call_id || mergedMetadata.telephony?.call_id,
                    stream_id: row.stream_id || mergedMetadata.telephony?.stream_id,
                    caller_id: row.caller_id || mergedMetadata.telephony?.caller_id
                };
            }

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
                last_synced: new Date()
            });

            const turns = row.conversation || [];
            if (turns.length > 0) {
                const totalTurns = row.conversation_count || turns.length;
                let firstMsgTime = turns[0]?.timestamp ? new Date(turns[0].timestamp) : startedAt;
                let lastMsgTime = turns[turns.length - 1]?.timestamp ? new Date(turns[turns.length - 1].timestamp) : new Date();

                let finalSummary = null;
                if (existingConv && existingConv.summary) {
                    finalSummary = existingConv.summary;
                } else if (row.summary) {
                    finalSummary = row.summary;
                } else if (endedAt && turns.length > 0 && !existingConv?.summary && new Date(startedAt) >= new Date('2026-01-28T00:00:00Z')) {
                    try {
                        finalSummary = await generateSummary(turns);
                    } catch (summaryError) {
                        logger.error(`Failed to generate summary for Azure DB session ${sessionId}:`, summaryError.message);
                    }
                }

                await Conversation.upsert({
                    session_id: sessionId,
                    agent_id: row.agent_id,
                    agent_name: row.agent_name,
                    turns: turns,
                    total_turns: totalTurns,
                    first_message_at: firstMsgTime,
                    last_message_at: lastMsgTime,
                    summary: finalSummary,
                    review_status: row.review_status || 'pending',
                    reviewed_by: row.reviewed_by,
                    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
                    last_synced: new Date()
                });

                await Session.update({ conversation_count: totalTurns }, { where: { session_id: sessionId } });
                syncedCount++;
            }
        }
        logger.info(`✅ Azure Sync Complete: Processed ${syncedCount} conversations.`);
    } catch (err) {
        logger.error('❌ Error in Azure PostgreSQL Sync:', err.message);
    } finally {
        await client.end();
    }
}

module.exports = { syncAzurePostgresLogs };
