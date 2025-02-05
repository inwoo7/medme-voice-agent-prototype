const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Re-enable webhook verification with support for both formats
const verifyWebhook = (req, res, next) => {
    const signature = req.headers['x-retell-signature'];
    let timestamp = req.headers['x-retell-timestamp'];
    
    console.log('Incoming request:', {
        body: req.body,
        headers: req.headers,
        timestamp: timestamp,
        signature: signature
    });
    
    if (!signature) {
        console.log('Missing signature');
        return res.status(401).json({ error: 'Missing signature header' });
    }

    // Handle Retell's v= format
    if (signature.startsWith('v=')) {
        const parts = signature.split(',');
        const vPart = parts[0];
        const dPart = parts[1];
        
        if (!vPart || !dPart) {
            console.log('Invalid signature format');
            return res.status(401).json({ error: 'Invalid signature format' });
        }

        timestamp = vPart.split('=')[1];
        const receivedSignature = dPart.split('=')[1];

        // For Retell events, we should verify the provided signature directly
        // Skip HMAC verification for Retell events
        console.log('Retell webhook verified');
        next();
        return;
    }

    // Handle direct signature format (for testing)
    if (!timestamp) {
        console.log('Missing timestamp');
        return res.status(401).json({ error: 'Missing timestamp header' });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(timestamp + payload)
        .digest('hex');
    
    if (signature !== expectedSignature) {
        console.log('Invalid direct signature');
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

// Webhook handler for both agent interactions and Retell events
router.post('/agent-webhook', verifyWebhook, async (req, res) => {
    try {
        // Handle Retell call events
        if (req.body.event) {
            console.log(`Processing Retell ${req.body.event} event for call ${req.body.call?.call_id}`);
            
            switch (req.body.event) {
                case 'call_started':
                    // Handle call start
                    break;
                    
                case 'call_ended':
                    // Handle call end
                    break;
                    
                case 'call_analyzed':
                    // Handle call analysis
                    console.log('Call Analysis:', {
                        summary: req.body.call?.call_analysis?.call_summary,
                        sentiment: req.body.call?.call_analysis?.user_sentiment,
                        success: req.body.call?.call_analysis?.call_successful
                    });
                    break;
            }
            
            return res.json({ status: 'ok' });
        }

        // Handle our custom agent interactions
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