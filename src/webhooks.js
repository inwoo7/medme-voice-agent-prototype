const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Re-enable webhook verification with detailed logging
const verifyWebhook = (req, res, next) => {
    const signature = req.headers['x-retell-signature'];
    const timestamp = req.headers['x-retell-timestamp'];
    
    console.log('Incoming request:', {
        body: req.body,
        headers: req.headers,
        timestamp: timestamp,
        signature: signature
    });
    
    if (!signature || !timestamp) {
        console.log('Missing headers:', { signature, timestamp });
        return res.status(401).json({ error: 'Missing signature headers' });
    }

    const payload = JSON.stringify(req.body);
    console.log('Payload for signature:', payload);
    console.log('Timestamp + Payload:', timestamp + payload);

    const expectedSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(timestamp + payload)
        .digest('hex');
    
    console.log('Signature comparison:', {
        expected: expectedSignature,
        received: signature,
        match: expectedSignature === signature
    });

    if (signature !== expectedSignature) {
        console.log('Invalid signature');
        return res.status(401).json({ 
            error: 'Invalid signature',
            debug: {
                expected: expectedSignature,
                received: signature,
                timestamp: timestamp,
                payloadUsed: payload
            }
        });
    }

    console.log('Webhook verified successfully');
    next();
};

// Basic webhook handler for agent interactions
router.post('/agent-webhook', verifyWebhook, async (req, res) => {
    try {
        const { intent, user_input, call_id } = req.body;
        
        let response = {
            response: "",
            metadata: {}
        };

        switch (intent) {
            case 'ASSESS_SYMPTOMS':
                response.response = "I understand you're not feeling well. Let me ask you a few questions to better understand your symptoms. What symptoms are you experiencing?";
                response.metadata = { stage: 'initial_assessment' };
                break;

            case 'BOOK_PHARMACY':
                response.response = "I'll help you book an appointment at the pharmacy. What time would work best for you?";
                response.metadata = { stage: 'booking' };
                break;

            case 'MEDICATION_REMINDER':
                response.response = "I can help you set up medication reminders. How often do you need to take your medication?";
                response.metadata = { stage: 'reminder_setup' };
                break;

            case 'FOLLOW_UP':
                response.response = "How have you been feeling since your last pharmacy visit?";
                response.metadata = { stage: 'follow_up' };
                break;

            default:
                response.response = "I'm here to help with your healthcare needs. Would you like to book an appointment, set up medication reminders, or discuss your symptoms?";
                response.metadata = { stage: 'initial' };
        }

        console.log(`Processed intent: ${intent} for call ${call_id}`);
        res.json(response);
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({
            response: "I apologize, but I'm having trouble processing your request. Can you please try again?",
            metadata: { error: error.message }
        });
    }
});

module.exports = router; 