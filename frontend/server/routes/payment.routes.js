import express from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-dev-secret-do-not-use-in-prod';

// Middleware to verify token and attach user
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, email, role, ... }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

router.post('/subscription/create', authenticate, paymentController.createSubscriptionOrder);
router.post('/minutes/create', authenticate, paymentController.createRechargeOrder);
router.post('/verify', authenticate, paymentController.verifyPayment);
router.get('/balances', authenticate, paymentController.getBalances);
router.get('/history', authenticate, paymentController.getTransactionHistory);
router.post('/adjust-credits', authenticate, paymentController.adjustCredits);

export default router;
