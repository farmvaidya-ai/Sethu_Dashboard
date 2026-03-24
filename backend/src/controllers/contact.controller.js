const { Contact } = require('../models');

exports.getContact = async (req, res) => {
    try {
        const { agent_id, mobile_number } = req.params;
        const contact = await Contact.findOne({ where: { agent_id, mobile_number } });
        res.json({ success: true, contact });
    } catch (error) {
        console.error('Error fetching contact:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch contact' });
    }
};

exports.saveContact = async (req, res) => {
    try {
        const { agent_id, mobile_number } = req.params;
        const { name, village, mandal, district, pincode, state } = req.body;

        if (!agent_id || !mobile_number) {
            return res.status(400).json({ success: false, error: 'agent_id and mobile_number are required' });
        }

        // Upsert uses unique index on (agent_id, mobile_number)
        const [contact, created] = await Contact.upsert({
            agent_id,
            mobile_number,
            name,
            village,
            mandal,
            district,
            pincode,
            state
        });

        res.json({ success: true, contact, created });
    } catch (error) {
        console.error('Error saving contact:', error);
        res.status(500).json({ success: false, error: 'Failed to save contact' });
    }
};
