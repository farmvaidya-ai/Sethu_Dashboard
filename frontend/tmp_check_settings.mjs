
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple env loader
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2) {
            process.env[parts[0].trim()] = parts[1].trim();
        }
    });
}

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const APP_ENV = process.env.APP_ENV || 'production';
const getTableName = (baseTableName) => {
    if (APP_ENV === 'test') return `test_${baseTableName.toLowerCase()}`;
    return baseTableName;
};

async function checkSettings() {
    try {
        const tableName = getTableName('System_Settings');
        const res = await pool.query(`SELECT setting_key, setting_value FROM "${tableName}" WHERE setting_key IN ('campaign_throttle_cpm', 'total_throttle_cpm', 'calls_throttle_cpm')`);
        console.log('--- System Capacity Settings ---');
        res.rows.forEach(row => {
            console.log(`${row.setting_key}: ${row.setting_value}`);
        });
        await pool.end();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSettings();
