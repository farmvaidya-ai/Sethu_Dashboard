import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

const pool = new Pool({
    host: 'sethu-admin.postgres.database.azure.com',
    port: 5432,
    database: 'postgres',
    user: 'azureuser',
    password: 'Leo@123456',
    ssl: { rejectUnauthorized: false }
});

async function main() {
    let client;
    const out = [];
    try {
        client = await pool.connect();

        // 1. Check one UsageLog
        const logs = await client.query(`
            SELECT call_sid, from_number, to_number, direction, call_status
            FROM "test_usagelogs" 
            ORDER BY created_at DESC 
            LIMIT 3
        `);
        out.push('=== USAGE LOGS ===');
        for (const log of logs.rows) {
            out.push(`  call_sid: ${log.call_sid}`);
            out.push(`  from: ${log.from_number}`);
            out.push(`  to: ${log.to_number}`);
            out.push(`  direction: ${log.direction}`);
            out.push(`  call_status: ${log.call_status}`);
            out.push('---');
        }

        // 2. Session telephony metadata for first log
        const log = logs.rows[0];
        if (log && log.call_sid) {
            const sess = await client.query(`
                SELECT session_id, agent_id, metadata->'telephony' as tel
                FROM "test_sessions" 
                WHERE metadata->'telephony'->>'call_id' = $1
            `, [log.call_sid]);

            out.push('\n=== SESSION FOR FIRST LOG ===');
            if (sess.rows.length > 0) {
                out.push(`  session_id: ${sess.rows[0].session_id}`);
                out.push(`  agent_id: ${sess.rows[0].agent_id}`);
                const tel = sess.rows[0].tel;
                out.push(`  telephony keys: ${JSON.stringify(Object.keys(tel || {}))}`);
                for (const [k, v] of Object.entries(tel || {})) {
                    out.push(`  tel.${k} = ${v}`);
                }
            } else {
                out.push('  NO SESSION FOUND');
            }
        }

        // 3. ATC config
        out.push('\n=== AGENT TELEPHONY CONFIG ===');
        const atc = await client.query(`SELECT * FROM "test_agent_telephony_config" LIMIT 2`);
        for (const r of atc.rows) {
            out.push(`  ${JSON.stringify(r)}`);
        }

        fs.writeFileSync('diagnosis_output.txt', out.join('\n'));
        console.log('Written to diagnosis_output.txt');

    } catch (err) {
        out.push('ERROR: ' + err.message);
        fs.writeFileSync('diagnosis_output.txt', out.join('\n'));
        console.error('Error:', err.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
