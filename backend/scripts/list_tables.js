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

async function main() {
    let client;
    try {
        console.log('🔌 Connecting...');
        client = await pool.connect();
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log('Tables:', res.rows.map(r => r.table_name));
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
