import pg from 'pg';
import axios from 'axios';
import crypto from 'crypto';

const { Pool } = pg;

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const getTableName = (baseTableName) => {
    return process.env.APP_ENV === 'test' ? `test_${baseTableName.toLowerCase()}` : baseTableName;
};

const exotelConfig = {
    apiKey: process.env.EXOTEL_API_KEY,
    apiToken: process.env.EXOTEL_API_TOKEN,
    accountSid: process.env.EXOTEL_ACCOUNT_SID,
    subdomain: process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com'
};

const terminateCall = async (callSid) => {
    try {
        const auth = Buffer.from(`${exotelConfig.apiKey}:${exotelConfig.apiToken}`).toString('base64');
        const url = `https://${exotelConfig.subdomain}/v1/Accounts/${exotelConfig.accountSid}/Calls/${callSid}.json`;
        await axios.post(url, {}, { headers: { 'Authorization': `Basic ${auth}` } });
        console.log(`🔪 Monitor terminated call ${callSid}`);
    } catch (error) {
        console.error(`Failed to terminate call ${callSid}:`, error.message);
    }
};

export const startMonitor = () => {
    console.log('🏁 Starting Call Monitor Service (Polling Mode)...');

    const checkCallStatus = async (call) => {
        try {
            const auth = Buffer.from(`${exotelConfig.apiKey}:${exotelConfig.apiToken}`).toString('base64');
            const url = `https://${exotelConfig.subdomain}/v1/Accounts/${exotelConfig.accountSid}/Calls/${call.call_sid}.json`;

            const response = await axios.get(url, { headers: { 'Authorization': `Basic ${auth}` } });
            const callDetails = response.data?.Call;

            if (!callDetails) return;

            const status = callDetails.Status; // in-progress, completed, failed, busy, no-answer, canceled, ringing

            if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
                console.log(`📞 Call ${call.call_sid} finished with status: ${status}`);
                console.log(`🔍 Raw Call Details:`, JSON.stringify(callDetails));

                let duration = parseInt(callDetails.Duration) || 0;

                // If completed but duration is missing, wait for next poll
                if (status === 'completed' && duration === 0) {
                    // Check if it's been too long? (Optional, skipping for now to keep simple)
                    console.log(`⏳ Call ${call.call_sid} completed but Duration is 0. Waiting for Exotel update...`);
                    return;
                }

                const durationMinutes = parseFloat((duration / 60).toFixed(2));
                console.log(`Calculated Duration in Min (Precise): ${durationMinutes}`);

                if (durationMinutes > 0) {
                    const usersTable = getTableName('Users');
                    const usageTable = getTableName('UsageLogs');

                    const uRes = await pool.query(`SELECT role, created_by FROM "${usersTable}" WHERE user_id = $1`, [call.user_id]);
                    const u = uRes.rows[0];

                    if (u) {
                        // Exemption Logic
                        const isExempt = u.role === 'super_admin' || call.user_id === 'master_root_0';

                        if (!isExempt) {
                            let billableUserId = call.user_id;
                            if (u.role === 'user' && u.created_by) {
                                billableUserId = u.created_by;
                            }

                            console.log(`💰 Deducting ${durationMinutes} min from user ${billableUserId}`);

                            await pool.query(
                                `UPDATE "${usersTable}" SET minutes_balance = ROUND((minutes_balance - $1)::numeric, 2), updated_at = NOW() WHERE user_id = $2`,
                                [durationMinutes, billableUserId]
                            );

                            // Log Usage with full call details
                            const direction = callDetails.Direction === 'inbound' ? 'inbound' : 'outbound';
                            await pool.query(
                                `INSERT INTO "${usageTable}" (id, user_id, call_sid, minutes_used, direction, from_number, to_number, call_status, recording_url, timestamp, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW())`,
                                [
                                    crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
                                    call.user_id,
                                    call.call_sid,
                                    durationMinutes,
                                    direction,
                                    callDetails.From || null,
                                    callDetails.To || null,
                                    callDetails.Status || 'completed',
                                    callDetails.RecordingUrl || null
                                ]
                            );
                        } else {
                            console.log(`StartMonitor: Skipping deduction for Exempt User ${call.user_id}`);
                        }
                    }
                }

                // Remove from ActiveCalls
                await pool.query(`DELETE FROM "${getTableName('ActiveCalls')}" WHERE call_sid = $1`, [call.call_sid]);
            }

        } catch (error) {
            console.error(`Failed to check status for ${call.call_sid}:`, error.message);
            // If 404, maybe call is gone? Remove it?
            if (error.response && error.response.status === 404) {
                await pool.query(`DELETE FROM "${getTableName('ActiveCalls')}" WHERE call_sid = $1`, [call.call_sid]);
            }
        }
    };

    setInterval(async () => {
        try {
            const activeCalls = await pool.query(`SELECT * FROM "${getTableName('ActiveCalls')}"`);
            if (activeCalls.rows.length === 0) return;

            for (const call of activeCalls.rows) {
                await checkCallStatus(call); // Check each call
            }
        } catch (error) {
            console.error('Monitor loop error:', error);
        }
    }, 10000); // Check every 10 seconds
};
