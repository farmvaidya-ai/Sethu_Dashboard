const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const contactController = require('../controllers/contact.controller');

// All endpoints require authentication
router.use(authenticate);

router.get('/:agent_id/:mobile_number', contactController.getContact);
router.post('/:agent_id/:mobile_number', contactController.saveContact);

module.exports = router;
