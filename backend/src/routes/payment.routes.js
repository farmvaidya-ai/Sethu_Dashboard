const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');
const { authenticate } = require('../middleware/auth');

// Protect these routes with auth
router.post('/subscription/create', authenticate, PaymentController.createSubscriptionOrder);
router.post('/minutes/create', authenticate, PaymentController.createRechargeOrder);
router.post('/verify', authenticate, PaymentController.verifyPayment);
router.get('/balances', authenticate, PaymentController.getBalances);

// Webhook might not need auth token but signature verification (handled in controller logic usually, or here)
// For Razorpay, signature is in headers/body. The verifyPayment above is for frontend flow.
// If you implement a backend webhook from Razorpay, add a separate route. PaymentController.webhook
// For this plan, the frontend calls verify, so we are good.

module.exports = router;
