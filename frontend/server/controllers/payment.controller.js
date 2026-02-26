import pg from 'pg';
import Razorpay from 'razorpay';
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

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const SUBSCRIPTION_AMOUNT = 650000; // 6500 INR in paise

export const createSubscriptionOrder = async (req, res) => {
    try {
        // Authenticate (token already verified if middleware attached, decoded available in req.user)
        // Assume auth middleware attached decoded token to req.user or req.decoded
        // In frontend/server/index.js, routes often check auth manually if not using global middleware,
        // but campaign routes use router with explicit controller.
        // We will assume usage of auth middleware or perform token check inside if needed.
        // Let's assume standard Express request with user attached.

        // Wait, typical pattern in index.js is manual token verification in each route handler (lines 676-686).
        // If I use a route, I should probably attach a middleware or verify here.
        // I will assume the route definition uses a middleware to populate req.user.

        const userId = req.user.userId;

        const options = {
            amount: SUBSCRIPTION_AMOUNT,
            currency: "INR",
            receipt: `sub_${userId}_${Date.now()}`,
            notes: {
                type: 'subscription',
                userId: userId
            }
        };

        const order = await razorpay.orders.create(options);

        // Record pending payment
        await pool.query(
            `INSERT INTO "${getTableName('Payments')}" (
                id, user_id, amount, currency, status, order_id, type, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [crypto.randomUUID(), userId, SUBSCRIPTION_AMOUNT, 'INR', 'created', order.id, 'subscription']
        );

        res.json({
            success: true,
            order_id: order.id,
            amount: SUBSCRIPTION_AMOUNT,
            key_id: process.env.RAZORPAY_KEY_ID,
            currency: "INR"
        });

    } catch (error) {
        console.error('Error creating subscription order:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
};

export const createRechargeOrder = async (req, res) => {
    try {
        const userId = req.user.userId;
        const requestedAmount = parseInt(req.body.amount, 10);

        if (!requestedAmount || requestedAmount < 1000) {
            return res.status(400).json({ success: false, message: 'Minimum recharge amount is ₹1,000' });
        }

        const amountInPaise = requestedAmount * 100;
        const creditsToAdd = requestedAmount; // 1:1 ratio for Credits

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `min_${userId}_${Date.now()}`,
            notes: {
                type: 'minutes',
                userId: userId
            }
        };

        const order = await razorpay.orders.create(options);

        await pool.query(
            `INSERT INTO "${getTableName('Payments')}" (
                id, user_id, amount, currency, status, order_id, type, minutes_added, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            [crypto.randomUUID(), userId, amountInPaise, 'INR', 'created', order.id, 'minutes', creditsToAdd]
        );

        res.json({
            success: true,
            order_id: order.id,
            amount: amountInPaise,
            key_id: process.env.RAZORPAY_KEY_ID,
            currency: "INR"
        });

    } catch (error) {
        console.error('Error creating recharge order:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const { order_id, payment_id, signature } = req.body;
        const userId = req.user.userId;

        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(order_id + "|" + payment_id)
            .digest('hex');

        if (generated_signature === signature) {
            // Check payment record
            const paymentRes = await pool.query(
                `SELECT * FROM "${getTableName('Payments')}" WHERE order_id = $1`,
                [order_id]
            );
            const payment = paymentRes.rows[0];

            if (!payment) {
                return res.status(404).json({ success: false, message: 'Payment record not found' });
            }

            if (payment.status === 'captured') {
                return res.json({ success: true, message: 'Payment already processed' });
            }

            // Update Payment
            await pool.query(
                `UPDATE "${getTableName('Payments')}" SET status = 'captured', payment_id = $1, updated_at = NOW() WHERE order_id = $2`,
                [payment_id, order_id]
            );

            // Update User
            const userRes = await pool.query(
                `SELECT * FROM "${getTableName('Users')}" WHERE user_id = $1`,
                [userId]
            );
            const user = userRes.rows[0];

            if (payment.type === 'subscription') {
                const now = new Date();
                let expiry = now;
                if (user.subscription_expiry && new Date(user.subscription_expiry) > now) {
                    expiry = new Date(user.subscription_expiry);
                }
                // Add 30 days
                expiry.setDate(expiry.getDate() + 30);

                await pool.query(
                    `UPDATE "${getTableName('Users')}" SET subscription_expiry = $1, updated_at = NOW() WHERE user_id = $2`,
                    [expiry, userId]
                );
            } else if (payment.type === 'minutes') {
                await pool.query(
                    `UPDATE "${getTableName('Users')}" SET minutes_balance = COALESCE(minutes_balance, 0) + $1, updated_at = NOW() WHERE user_id = $2`,
                    [payment.minutes_added, userId]
                );
            }

            res.json({ success: true, message: 'Payment verified and account updated' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid signature' });
        }

    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

export const getBalances = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            `SELECT subscription_expiry, minutes_balance, active_lines, phone_number FROM "${getTableName('Users')}" WHERE user_id = $1`,
            [userId]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching balances:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch balances' });
    }
};

export const getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const paymentsTable = getTableName('Payments');
        const usageTable = getTableName('UsageLogs');
        const sessionsTable = getTableName('Sessions');
        const atcTable = getTableName('Agent_Telephony_Config');

        const validFilters = ['payments', 'calls', 'all'];
        const filter = validFilters.includes(req.query.filter) ? req.query.filter : 'all';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        let dataQuery = '';
        let countQuery = '';
        let params = [userId];

        // Helper for robust details JSON
        // IMPORTANT: Exotel campaign calls store from_number=customer, to_number=exophone
        // For OUTBOUND calls: logical From (caller) = exophone = ul.to_number, logical To (recipient) = customer = ul.from_number
        // For INBOUND calls: logical From (caller) = customer = ul.from_number, logical To (recipient) = exophone = ul.to_number
        const detailsJson = `
            json_build_object(
                'from', CASE
                    WHEN ul.direction = 'outbound' OR ul.direction IS NULL THEN
                        COALESCE(NULLIF(ul.to_number, 'Unknown'), atc.exophone)
                    ELSE
                        COALESCE(NULLIF(ul.from_number, 'Unknown'), NULLIF(s.metadata->'telephony'->>'customer_number', ''))
                END,
                'to', CASE
                    WHEN ul.direction = 'outbound' OR ul.direction IS NULL THEN
                        COALESCE(NULLIF(ul.from_number, 'Unknown'), NULLIF(s.metadata->'telephony'->>'customer_number', ''))
                    ELSE
                        COALESCE(NULLIF(ul.to_number, 'Unknown'), atc.exophone)
                END,
                'status', COALESCE(NULLIF(ul.call_status, 'Unknown'), CASE WHEN ul.minutes_used > 0 THEN 'Completed' ELSE 'Attempted' END),
                'direction', COALESCE(ul.direction, 'outbound'),
                'sid', ul.call_sid,
                'recording_url', ul.recording_url,
                'session_id', s.session_id
            )
        `;

        if (filter === 'payments') {
            dataQuery = `
                SELECT 
                    id, created_at, type, COALESCE(minutes_added, 0) as credit_amount, 0 as debit_amount, 'credit' as transaction_type,
                    CASE 
                        WHEN type = 'subscription' THEN 'Subscription Purchase'
                        WHEN type = 'minutes' THEN 'Minutes Recharge'
                        WHEN type = 'manual_adjustment' THEN 'Admin Adjustment'
                        ELSE type 
                    END as description,
                    json_build_object('order_id', order_id, 'payment_id', payment_id, 'status', status) as details
                FROM "${paymentsTable}" 
                WHERE user_id = $1
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `;
            countQuery = `SELECT COUNT(*) FROM "${paymentsTable}" WHERE user_id = $1`;

        } else if (filter === 'calls') {
            dataQuery = `
                SELECT 
                    ul.id, ul.created_at, 'call' as type, 0 as credit_amount, ROUND((ul.minutes_used * 3.5)::numeric, 2) as debit_amount, 'debit' as transaction_type,
                    CASE 
                        WHEN ul.direction = 'inbound' THEN 'Incoming Call'
                        WHEN ul.direction = 'outbound' OR ul.direction IS NULL THEN 'Outgoing Call'
                        ELSE 'Call Usage' 
                    END as description,
                    ${detailsJson} as details
                FROM "${usageTable}" ul
                LEFT JOIN "${atcTable}" atc ON (
                    atc.exophone = ul.to_number OR atc.exophone = ul.from_number
                )
                LEFT JOIN LATERAL (
                    SELECT s.session_id, s.agent_id, s.metadata
                    FROM "${sessionsTable}" s
                    WHERE (
                        s.metadata->'telephony'->>'call_id' = ul.call_sid
                        OR (
                            s.agent_id = atc.agent_id
                            AND s.started_at BETWEEN (ul.created_at - INTERVAL '10 minutes') AND (ul.created_at + INTERVAL '10 minutes')
                        )
                    )
                    ORDER BY ABS(EXTRACT(EPOCH FROM (s.started_at - ul.created_at)))
                    LIMIT 1
                ) s ON true
                WHERE ul.user_id = $1
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `;
            countQuery = `SELECT COUNT(*) FROM "${usageTable}" WHERE user_id = $1`;
        } else {
            // ALL
            dataQuery = `
                SELECT * FROM (
                    SELECT 
                        id, created_at, type, COALESCE(minutes_added, 0) as credit_amount, 0 as debit_amount, 'credit' as transaction_type,
                        CASE 
                            WHEN type = 'subscription' THEN 'Subscription Purchase'
                            WHEN type = 'minutes' THEN 'Minutes Recharge'
                            WHEN type = 'manual_adjustment' THEN 'Admin Adjustment'
                            ELSE type 
                        END as description,
                        json_build_object('order_id', order_id, 'payment_id', payment_id, 'status', status) as details
                    FROM "${paymentsTable}" 
                    WHERE user_id = $1
                    
                    UNION ALL
                    
                    SELECT 
                        ul.id, ul.created_at, 'call' as type, 0 as credit_amount, ROUND((ul.minutes_used * 3.5)::numeric, 2) as debit_amount, 'debit' as transaction_type,
                        CASE 
                            WHEN ul.direction = 'inbound' THEN 'Incoming Call'
                            WHEN ul.direction = 'outbound' THEN 'Outgoing Call'
                            ELSE 'Call Usage' 
                        END as description,
                        ${detailsJson} as details
                    FROM "${usageTable}" ul
                    LEFT JOIN "${atcTable}" atc ON (
                        atc.exophone = ul.to_number OR atc.exophone = ul.from_number
                    )
                    LEFT JOIN LATERAL (
                        SELECT s.session_id, s.agent_id, s.metadata
                        FROM "${sessionsTable}" s
                        WHERE (
                            s.metadata->'telephony'->>'call_id' = ul.call_sid
                            OR (
                                s.agent_id = atc.agent_id
                                AND s.started_at BETWEEN (ul.created_at - INTERVAL '10 minutes') AND (ul.created_at + INTERVAL '10 minutes')
                            )
                        )
                        ORDER BY ABS(EXTRACT(EPOCH FROM (s.started_at - ul.created_at)))
                        LIMIT 1
                    ) s ON true
                    WHERE ul.user_id = $1
                ) as combined_history
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `;
            countQuery = `
                SELECT SUM(cnt) as count FROM (
                    SELECT COUNT(*) as cnt FROM "${paymentsTable}" WHERE user_id = $1
                    UNION ALL
                    SELECT COUNT(*) as cnt FROM "${usageTable}" WHERE user_id = $1
                ) as total_counts
            `;
        }

        const [dataRes, countRes] = await Promise.all([
            pool.query(dataQuery, [userId, limit, offset]),
            pool.query(countQuery, [userId])
        ]);

        res.json({
            success: true,
            data: dataRes.rows,
            pagination: {
                total: parseInt(countRes.rows[0].count || 0),
                page,
                limit,
                totalPages: Math.ceil(parseInt(countRes.rows[0].count || 0) / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching combined history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
};

export const adjustCredits = async (req, res) => {
    try {
        const { amount, targetUserId } = req.body;
        const adminId = req.user.userId;

        // Verify Admin (Double check, though route should protect)
        const adminCheck = await pool.query(`SELECT role FROM "${getTableName('Users')}" WHERE user_id = $1`, [adminId]);
        if (!adminCheck.rows[0] || (adminCheck.rows[0].role !== 'super_admin' && adminId !== 'master_root_0')) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const userId = targetUserId || adminId; // Default to self if not specified (for now UI adjusts self)

        // Record Adjustment
        await pool.query(
            `INSERT INTO "${getTableName('Payments')}" (
                id, user_id, amount, currency, status, order_id, type, minutes_added, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            [crypto.randomUUID(), userId, 0, 'INR', 'captured', `adj_${Date.now()}`, 'manual_adjustment', amount]
        );

        // Update Balance
        await pool.query(
            `UPDATE "${getTableName('Users')}" SET minutes_balance = COALESCE(minutes_balance, 0) + $1, updated_at = NOW() WHERE user_id = $2`,
            [amount, userId]
        );

        res.json({ success: true, message: 'Credits adjusted successfully' });
    } catch (error) {
        console.error('Error adjusting credits:', error);
        res.status(500).json({ success: false, message: 'Failed to adjust credits' });
    }
};
