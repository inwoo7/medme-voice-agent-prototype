const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Webhook verification middleware
const verifyWebhook = (req, res, next) => {
    const signature = req.headers['x-retell-signature'];
    const timestamp = req.headers['x-retell-timestamp'];
    
    if (!signature || !timestamp) {
        return res.status(401).json({ error: 'Missing signature headers' });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(timestamp + payload)
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

// Basic webhook handler for agent interactions
router.post('/agent-webhook', verifyWebhook, async (req, res) => {
    try {
        const { intent, user_input } = req.body;
        
        // Example response based on intent
        let response = {
            response: "I'm processing your request...",
            metadata: {}
        };

        switch (intent) {
            case 'CHECK_AVAILABILITY':
                response.response = "Let me check available appointment slots...";
                // Here you would integrate with your appointment system
                break;

            case 'BOOK_APPOINTMENT':
                response.response = "I'll help you book that appointment...";
                // Here you would integrate with your booking system
                break;

            default:
                response.response = "I'm not sure how to handle that request.";
        }

        res.json(response);
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({
            response: "I'm sorry, but I'm having trouble processing that request.",
            metadata: { error: error.message }
        });
    }
});

module.exports = router; 