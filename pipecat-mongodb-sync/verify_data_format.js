const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

// Setup Sequelize connection
const sequelize = new Sequelize(
    process.env.POSTGRES_DB,
    process.env.POSTGRES_USER,
    process.env.POSTGRES_PASSWORD,
    {
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        dialect: 'postgres',
        logging: false, // Extract clean output
        dialectOptions: {
            ssl: process.env.POSTGRES_SSL === 'true' ? {
                require: true,
                rejectUnauthorized: false
            } : false
        }
    }
);

async function verifyData() {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database.');

        // 1. Verify Agent Data
        const [agents] = await sequelize.query('SELECT * FROM "Agents" LIMIT 1');
        if (agents.length > 0) {
            const agent = agents[0];
            console.log('\n--- 🕵️‍♀️ AGENT DATA VERIFICATION ---');
            console.log(`Agent Name: ${agent.agent_name}`);

            const config = agent.config || {};
            const metadata = agent.metadata || {};

            console.log('Checking for new mapped fields...');
            console.log(`- active_session_count (in config): ${config.active_session_count !== undefined ? '✅ Found (' + config.active_session_count + ')' : '❌ Missing'}`);
            console.log(`- auto_scaling (in config): ${config.auto_scaling ? '✅ Found' : '❌ Missing'}`);
            console.log(`- deployment (in metadata): ${metadata.deployment ? '✅ Found' : '❌ Missing'}`);
            console.log(`- agentProfile (in metadata): ${metadata.agentProfile ? '✅ Found (' + metadata.agentProfile + ')' : '❌ Missing'}`);
            console.log(`- raw_data (in metadata): ${metadata.raw_data ? '✅ Found (Full JSON preserved)' : '❌ Missing'}`);

            if (metadata.raw_data) {
                console.log('\nVerifying raw_data content (sample keys):');
                const rawKeys = Object.keys(metadata.raw_data);
                console.log('Keys:', rawKeys.slice(0, 10).join(', '));
            }
        } else {
            console.log('\n⚠️ No agents found in DB to verify.');
        }

        // 2. Verify Session Data
        const [sessions] = await sequelize.query('SELECT * FROM "Sessions" LIMIT 1');
        if (sessions.length > 0) {
            const session = sessions[0];
            console.log('\n--- 🕵️‍♀️ SESSION DATA VERIFICATION ---');
            console.log(`Session ID: ${session.session_id}`);

            const meta = session.metadata || {};
            console.log('Checking for mapped fields...');
            console.log(`- bot_start_seconds (in metadata): ${meta.bot_start_seconds !== undefined ? '✅ Found (' + meta.bot_start_seconds + ')' : '❌ Missing'}`);
            console.log(`- cold_start (in metadata): ${meta.cold_start !== undefined ? '✅ Found (' + meta.cold_start + ')' : '❌ Missing'}`);
            console.log(`- completion_status (in metadata): ${meta.completion_status !== undefined ? '✅ Found (' + meta.completion_status + ')' : '❌ Missing'}`);
            console.log(`- raw_data (in metadata): ${meta.raw_data ? '✅ Found' : '❌ Missing'}`);
        } else {
            console.log('\n⚠️ No sessions found in DB to verify.');
        }

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await sequelize.close();
    }
}

verifyData();
