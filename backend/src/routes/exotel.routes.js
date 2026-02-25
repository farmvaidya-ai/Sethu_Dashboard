const express = require('express');
const router = express.Router();
const ExotelController = require('../controllers/ExotelController');

// Exotel calls this
router.post('/incoming', ExotelController.handleIncoming);
router.post('/callback', ExotelController.handleStatusCallback); // Optional, for end-of-call logic

module.exports = router;
