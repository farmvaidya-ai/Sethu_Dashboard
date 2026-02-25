const { ActiveCall, User, UsageLog } = require('../models');
const ExotelController = require('../controllers/ExotelController');
const logger = require('../utils/logger');

const MONITOR_INTERVAL_MS = 10000; // 10 seconds

async function checkActiveCalls() {
    try {
        const activeCalls = await ActiveCall.findAll();

        if (activeCalls.length === 0) return;

        logger.debug(`Monitoring ${activeCalls.length} active calls...`);

        // Fetch all users involved in active calls to minimize DB hits (or fetch individually)
        // Individual fetch is safer for consistent data
        for (const call of activeCalls) {
            try {
                const user = await User.findByPk(call.user_id);
                if (!user) {
                    logger.warn(`User for call ${call.call_sid} not found. Terminating.`);
                    await ExotelController.terminateCall(call.call_sid);
                    await call.destroy();
                    continue;
                }

                // Check Subscription
                const now = new Date();
                if (user.subscription_expiry && new Date(user.subscription_expiry) < now) {
                    logger.info(`User ${user.email} subscription expired. Terminating call ${call.call_sid}.`);
                    await ExotelController.terminateCall(call.call_sid);
                    // Cleanup is handled by callback or subsequent checks, but we should destroy here to be safe?
                    // If we destroy here and callback comes later, it handles graceful "not found".
                    await call.destroy();
                    continue;
                }

                // Check Minutes
                // We should conceptually deduct "consumed so far" to see if they are out?
                // Or just check if balance <= 0 (assuming balance includes what they started with)
                // The prompt says: "Every ~10 seconds: if(admin.minutes_balance <= 0){ terminateCall(); }"
                // This implies "minutes_balance" is the remaining balance.
                // If we don't deduct *during* the call, "balance" stays static until call ends.
                // If they start with 5 mins, and talk for 10 mins, we need to kill at 5 mins.
                // So we MUST calculate "pending deduction".

                const durationSoFarMinutes = Math.ceil((now - new Date(call.start_time)) / 60000);
                const projectedBalance = user.minutes_balance - durationSoFarMinutes;

                if (projectedBalance <= 0) {
                    logger.info(`User ${user.email} minutes exhausted (Duration: ${durationSoFarMinutes}m). Terminating call ${call.call_sid}.`);
                    await ExotelController.terminateCall(call.call_sid);
                    // We should probably deduct the used minutes now to prevent free overage?
                    // Or rely on callback. 
                    // Let's rely on callback for final deduction to be accurate, or force update here.
                    // If we force update here, we must prevent double deduction in callback.
                    // Let's just kill it. The callback will handle deduction based on actual duration.
                    // But we should mark it as "killing" so we don't spam kill commands.
                    await call.destroy();
                }

            } catch (err) {
                logger.error(`Error monitoring call ${call.call_sid}:`, err);
            }
        }
    } catch (error) {
        logger.error('Error in CallMonitorService:', error);
    }
}

let intervalId = null;

exports.start = () => {
    if (intervalId) return;
    logger.info('Starting Call Monitor Service...');
    intervalId = setInterval(checkActiveCalls, MONITOR_INTERVAL_MS);
};

exports.stop = () => {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('Stopped Call Monitor Service.');
    }
};
