const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
    try {
        await pool.query('ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "last_expiry_alert_at" TIMESTAMP WITH TIME ZONE;').catch(e => console.error("Could not alter Users:", e.message));
        await pool.query('ALTER TABLE "test_users" ADD COLUMN IF NOT EXISTS "last_expiry_alert_at" TIMESTAMP WITH TIME ZONE;').catch(e => console.error("Could not alter test_users:", e.message));
        console.log('✅ Column last_expiry_alert_at added successfully.');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}
run();
