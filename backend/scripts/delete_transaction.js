import pg from 'pg';

const { Pool } = pg;

// Hardcoded config from frontend/.env for reliability
const pool = new Pool({
    host: 'sethu-admin.postgres.database.azure.com',
    port: 5432,
    database: 'postgres',
    user: 'azureuser',
    password: 'Leo@123456',
    ssl: { rejectUnauthorized: false }
});

const getTableName = (baseName) => {
    // We assume 'test' environment based on user logs
    return `test_${baseName.toLowerCase()}`;
};

async function main() {
    let client;
    try {
        console.log('🔌 Connecting to DB...');
        client = await pool.connect();

        const paymentsTable = getTableName('Payments');
        const orderId = 'order_SHtv9FRBXCRr6u';

        console.log(`🗑️ Attempting to delete transaction '${orderId}' from table '${paymentsTable}'...`);

        const res = await client.query(
            `DELETE FROM "${paymentsTable}" WHERE order_id = $1 RETURNING *`,
            [orderId]
        );

        if (res.rowCount > 0) {
            console.log('✅ Successfully deleted transaction:', res.rows[0]);
        } else {
            console.log(`⚠️ Transaction with ID ${orderId} not found in ${paymentsTable}.`);
        }
    } catch (err) {
        console.error('❌ Error executing query:', err.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
