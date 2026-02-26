const Razorpay = require('razorpay');
const crypto = require('crypto');
const { User, Payment } = require('../models'); // Assuming index.js exports these
const { razorpay: rzpConfig } = require('../config/platform');
const logger = require('../utils/logger');

const razorpay = new Razorpay({
    key_id: rzpConfig.key_id,
    key_secret: rzpConfig.key_secret
});

const SUBSCRIPTION_AMOUNT = 650000; // 6500 INR in paise
const MINUTES_RECHARGE_AMOUNT = 350000; // 3500 INR in paise
const MINUTES_PER_RECHARGE = 1000;

exports.createSubscriptionOrder = async (req, res) => {
    try {
        const userId = req.user.user_id; // From auth middleware

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

        // create payment record (pending)
        await Payment.create({
            user_id: userId,
            amount: SUBSCRIPTION_AMOUNT,
            currency: 'INR',
            status: 'created',
            order_id: order.id,
            type: 'subscription'
        });

        res.json({
            success: true,
            order_id: order.id,
            amount: SUBSCRIPTION_AMOUNT,
            key_id: rzpConfig.key_id
        });

    } catch (error) {
        logger.error('Error creating subscription order:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
};

exports.createRechargeOrder = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const options = {
            amount: MINUTES_RECHARGE_AMOUNT,
            currency: "INR",
            receipt: `min_${userId}_${Date.now()}`,
            notes: {
                type: 'minutes',
                userId: userId
            }
        };

        const order = await razorpay.orders.create(options);

        await Payment.create({
            user_id: userId,
            amount: MINUTES_RECHARGE_AMOUNT,
            currency: 'INR',
            status: 'created',
            order_id: order.id,
            type: 'minutes',
            minutes_added: MINUTES_PER_RECHARGE
        });

        res.json({
            success: true,
            order_id: order.id,
            amount: MINUTES_RECHARGE_AMOUNT,
            key_id: rzpConfig.key_id
        });

    } catch (error) {
        logger.error('Error creating recharge order:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const { order_id, payment_id, signature } = req.body;
        const userId = req.user.user_id;

        const generated_signature = crypto
            .createHmac('sha256', rzpConfig.key_secret)
            .update(order_id + "|" + payment_id)
            .digest('hex');

        if (generated_signature === signature) {
            // Success
            const payment = await Payment.findOne({ where: { order_id: order_id } });

            if (!payment) {
                return res.status(404).json({ success: false, message: 'Payment record not found' });
            }

            if (payment.status === 'captured') {
                return res.json({ success: true, message: 'Payment already processed' });
            }

            // Update Payment
            payment.status = 'captured';
            payment.payment_id = payment_id;
            await payment.save();

            // Update User
            const user = await User.findByPk(userId);

            if (payment.type === 'subscription') {
                const now = new Date();
                const expiry = user.subscription_expiry && new Date(user.subscription_expiry) > now
                    ? new Date(new Date(user.subscription_expiry).getTime() + 30 * 24 * 60 * 60 * 1000)
                    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

                user.subscription_expiry = expiry;
            } else if (payment.type === 'minutes') {
                user.minutes_balance = (user.minutes_balance || 0) + payment.minutes_added;
            }

            await user.save();

            res.json({ success: true, message: 'Payment verified and account updated' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid signature' });
        }

    } catch (error) {
        logger.error('Error verifying payment:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

exports.getBalances = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const user = await User.findByPk(userId, {
            attributes: ['subscription_expiry', 'minutes_balance', 'active_lines']
        });
        res.json({ success: true, data: user });
    } catch (error) {
        logger.error('Error fetching balances:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch balances' });
    }
};
