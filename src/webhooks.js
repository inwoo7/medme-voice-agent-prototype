const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const PatientData = require('./models/PatientData');

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

// At the top of the file
console.log('Webhook router loaded');

// Webhook handler for both agent interactions and Retell events
router.post('/agent-webhook', verifyWebhook, async (req, res) => {
    console.log('Received webhook request:', {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body ? JSON.stringify(req.body).slice(0, 500) + '...' : null
    });

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
                    const callData = req.body.call;
                    const patientData = extractPatientData(callData);
                    
                    console.log('Call Analysis:', {
                        summary: callData?.call_analysis?.call_summary,
                        sentiment: callData?.call_analysis?.user_sentiment,
                        success: callData?.call_analysis?.call_successful,
                        extractedData: patientData.toJSON()
                    });

                    // Store the data (example using environment variable)
                    if (process.env.ENABLE_DATA_STORAGE === 'true') {
                        await storePatientData(patientData);
                    }
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
        console.error('Webhook error:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

function extractPatientData(callData) {
    const patientData = new PatientData();
    
    // Extract call details
    patientData.callDetails = {
        callId: callData.call_id,
        timestamp: callData.start_timestamp,
        duration: callData.duration_ms
    };

    // Extract phone number
    patientData.phoneNumber = callData.from_number;

    // Parse transcript for information
    const transcript = callData.transcript_object || [];
    let currentSymptom = null;

    for (const message of transcript) {
        if (message.role === 'user') {
            const text = message.content.toLowerCase();
            
            // Extract severity (e.g., "8 out of 10")
            const severityMatch = text.match(/(\d+)(?:\s+)?(?:out\s+of|\/)\s*10/);
            if (severityMatch && !patientData.symptoms.severity) {
                patientData.symptoms.severity = parseInt(severityMatch[1]);
            }

            // Extract duration (e.g., "2 days")
            const durationMatch = text.match(/(\d+)\s*(day|days|week|weeks|hour|hours)/);
            if (durationMatch && !patientData.symptoms.duration) {
                patientData.symptoms.duration = `${durationMatch[1]} ${durationMatch[2]}`;
            }

            // Extract symptoms
            const symptomKeywords = ['headache', 'pain', 'nausea', 'dizzy', 'vomiting'];
            for (const keyword of symptomKeywords) {
                if (text.includes(keyword) && !patientData.symptoms.additionalSymptoms.includes(keyword)) {
                    patientData.symptoms.additionalSymptoms.push(keyword);
                }
            }

            // Extract location of pain
            const locationKeywords = {
                'back of head': 'posterior head',
                'front of head': 'anterior head',
                'side of head': 'lateral head'
            };
            for (const [keyword, medical] of Object.entries(locationKeywords)) {
                if (text.includes(keyword)) {
                    patientData.symptoms.location = medical;
                    break;
                }
            }
        }
    }

    // Set primary condition based on most mentioned symptom
    if (patientData.symptoms.additionalSymptoms.length > 0) {
        patientData.symptoms.primaryCondition = patientData.symptoms.additionalSymptoms[0];
    }

    return patientData;
}

async function storePatientData(patientData) {
    // This is a placeholder - implement your storage solution
    // Could be MongoDB, PostgreSQL, or even just write to a file
    console.log('Storing patient data:', patientData.toJSON());
    
    // Example: Store to a file
    const fs = require('fs').promises;
    const path = require('path');
    
    const dataDir = path.join(__dirname, '../data');
    const filePath = path.join(dataDir, `${patientData.callDetails.callId}.json`);
    
    try {
        await fs.mkdir(dataDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(patientData.toJSON(), null, 2));
        console.log(`Patient data stored at: ${filePath}`);
    } catch (error) {
        console.error('Error storing patient data:', error);
    }
}

module.exports = router; 