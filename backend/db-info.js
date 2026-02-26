const { Client } = require('pg');
const fs = require('fs');
const client = new Client({
    host: 'sethu-admin.postgres.database.azure.com',
    port: 5432,
    database: 'postgres',
    user: 'azureuser',
    password: 'Leo@123456',
    ssl: true
});

async function run() {
    await client.connect();
    let output = '';
    output += '--- DATABASE SIZE ---\n';
    let res = await client.query(`SELECT pg_size_pretty(pg_database_size('postgres')) as size;`);
    output += res.rows[0].size + '\n';

    output += '\n--- TABLE SIZES ---\n';
    res = await client.query(`
    SELECT relname as table_name,
           pg_size_pretty(pg_total_relation_size(relid)) as total_size,
           n_live_tup as row_count
    FROM pg_catalog.pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC;
  `);
    output += JSON.stringify(res.rows, null, 2) + '\n';

    output += '\n--- POLICIES ---\n';
    res = await client.query(`SELECT tablename, policyname, roles, cmd, qual FROM pg_policies;`);
    output += JSON.stringify(res.rows, null, 2) + '\n';

    await client.end();
    fs.writeFileSync('db-info-output-utf8.txt', output, 'utf8');
}
run().catch(console.error);
