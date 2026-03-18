import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const usageTable = process.env.APP_ENV === 'test' ? 'test_usagelogs' : 'UsageLogs';
    
    console.log(`Migrating ${usageTable}...`);
    
    try {
        // 1. Remove duplicates if any
        await pool.query(`
            DELETE FROM "${usageTable}" a
            USING "${usageTable}" b
            WHERE a.id > b.id
              AND a.call_sid = b.call_sid
              AND a.call_sid IS NOT NULL
        `);
        console.log('✅ Duplicates removed');

        // 2. Add Unique Constraint to call_sid
        // We drop the existing partial index if it exists to avoid confusion
        await pool.query(`DROP INDEX IF EXISTS idx_usagelogs_call_sid`);
        
        // Add a proper UNIQUE constraint
        await pool.query(`ALTER TABLE "${usageTable}" ADD CONSTRAINT unique_call_sid UNIQUE (call_sid)`);
        console.log('✅ Unique constraint added to call_sid');
        
    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log('ℹ️ Unique constraint already exists');
        } else {
            console.error('❌ Migration failed:', err.message);
        }
    }
    
    process.exit(0);
}

migrate();
