require('dotenv').config();

module.exports = {
    razorpay: {
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    },
    exotel: {
        sid: process.env.EXOTEL_SID,
        token: process.env.EXOTEL_TOKEN,
        subdomain: process.env.EXOTEL_SUBDOMAIN,
        pipecat_number: process.env.PIPECAT_NUMBER // The Pipecat number to dial
    }
};
