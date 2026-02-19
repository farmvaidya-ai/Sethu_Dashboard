import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    host: 'sethu-admin.postgres.database.azure.com',
    port: 5432,
    database: 'postgres',
    user: 'azureuser',
    password: 'Leo@123456',
    ssl: { rejectUnauthorized: false }
});

const getTableName = (baseName) => {
    return `test_${baseName.toLowerCase()}`;
};

async function main() {
    let client;
    try {
        console.log('🔌 Connecting...');
        client = await pool.connect();

        const usageTable = getTableName('UsageLogs');
        const sessionsTable = getTableName('Sessions');
        const atcTable = getTableName('agent_telephony_config'); // Verify case!

        console.log(`🔍 Checking recent calls in ${usageTable}...`);

        const logs = await client.query(`
            SELECT id, call_sid, from_number, to_number, direction, created_at, user_id 
            FROM "${usageTable}" 
            WHERE created_at > '2026-02-19 00:00:00'
            ORDER BY created_at DESC 
            LIMIT 50
        `);

        for (const log of logs.rows) {
            console.log('\n------------------------------------------------');
            console.log(`📞 Log ID: ${log.id}, SID: ${log.call_sid}`);
            console.log(`   From: ${log.from_number}, To: ${log.to_number}, Dir: ${log.direction}`);

            // Check Session
            const sessionRes = await client.query(`
                SELECT session_id, agent_id, metadata 
                FROM "${sessionsTable}" 
                WHERE metadata->'telephony'->>'call_id' = $1
            `, [log.call_sid]);

            if (sessionRes.rowCount > 0) {
                const s = sessionRes.rows[0];
                console.log(`   ✅ Linked Session: ${s.session_id}, Agent: ${s.agent_id}`);
                console.log(`   Metadata Telephony:`, s.metadata?.telephony);

                // Check ATC
                const atcRes = await client.query(`
                    SELECT exophone 
                    FROM "test_agent_telephony_config" 
                    WHERE agent_id = $1
                `, [s.agent_id]);

                if (atcRes.rowCount > 0) {
                    console.log(`   ✅ Agent Exophone: ${atcRes.rows[0].exophone}`);
                } else {
                    console.log(`   ⚠️ No ATC found for Agent ${s.agent_id}`);
                    // Check if ATC table exists properly
                }
            } else {
                console.log(`   ❌ No Session found with call_id = ${log.call_sid}`);
                // Try searching metadata for SID anywhere
                const searchRes = await client.query(`
                    SELECT session_id, metadata 
                    FROM "${sessionsTable}" 
                    WHERE metadata::text LIKE $1
                    LIMIT 1
                `, [`%${log.call_sid}%`]);

                if (searchRes.rowCount > 0) {
                    console.log(`   ⚠️ Found SID in metadata but NOT in 'telephony.call_id'. Found in:`);
                    console.log(JSON.stringify(searchRes.rows[0].metadata, null, 2));
                }
            }
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
