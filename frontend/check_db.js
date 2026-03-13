import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function check() {
    try {
        console.log("Checking stored telephony call_ids...");
        const res = await pool.query(`
            SELECT session_id, metadata->'telephony'->>'call_id' as call_id
            FROM "Sessions" 
            WHERE metadata->'telephony'->>'call_id' IS NOT NULL 
            ORDER BY started_at DESC LIMIT 20
        `);
        
        console.log(`Found ${res.rows.length} sessions with call_id in metadata.`);
        res.rows.forEach(row => {
            console.log(`SID: ${row.session_id}, CallID: ${row.call_id} (Length: ${row.call_id?.length || 0})`);
        });

    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await pool.end();
    }
}

check();
