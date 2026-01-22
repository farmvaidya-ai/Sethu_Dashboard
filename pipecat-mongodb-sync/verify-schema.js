const path = require('path');
const { sequelize } = require(path.join(__dirname, './src/config/database'));

async function verifySchema() {
    try {
        console.log('--- Verifying Schema Expansion ---');

        const [agents] = await sequelize.query('SELECT * FROM "Agents" LIMIT 1');
        const [sessions] = await sequelize.query('SELECT * FROM "Sessions" WHERE service_id IS NOT NULL LIMIT 1');

        console.log('\n[Agent Data Sample]');
        if (agents && agents.length > 0) {
            const a = agents[0];
            console.log(`Name: ${a.name}`);
            console.log(`Region: ${a.region}`);
            console.log(`Ready: ${a.ready}`);
            console.log(`Active Deployment ID: ${a.active_deployment_id}`);
            console.log(`Auto Scaling: ${JSON.stringify(a.auto_scaling)}`);
            console.log(`Deployment Info: ${JSON.stringify(a.deployment)}`);
        } else {
            console.log('No agents found yet.');
        }

        console.log('\n[Session Data Sample]');
        if (sessions && sessions.length > 0) {
            const s = sessions[0];
            console.log(`Session ID: ${s.session_id}`);
            console.log(`Service ID: ${s.service_id}`);
            console.log(`Org ID: ${s.organization_id}`);
            console.log(`Deployment ID: ${s.deployment_id}`);
            console.log(`Completion Status: ${s.completion_status}`);
        } else {
            console.log('No sessions with new schema found yet (Run sync first).');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await sequelize.close();
    }
}

verifySchema();
