const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const PatientData = require('./models/PatientData');
const sheetsService = require('./services/sheets');
const util = require('util');

// Re-enable webhook verification with support for both formats
const verifyWebhook = (req, res, next) => {
    console.log('\n========== NEW WEBHOOK REQUEST ==========');
    console.log('Time:', new Date().toISOString());
    console.log('URL:', req.url);
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('=======================================\n');
    next(); // Allow all requests for now
};

// At the top of the file
console.log('Webhook router loaded');

// Initialize sheets service when the server starts
sheetsService.init().catch(console.error);

// Webhook handler for both agent interactions and Retell events
router.post('/agent-webhook', verifyWebhook, async (req, res) => {
    console.log('\n========== WEBHOOK REQUEST RECEIVED ==========');
    console.log('Time:', new Date().toISOString());
    console.log('Path:', req.originalUrl);
    console.log('Event:', req.body?.event);
    console.log('Call ID:', req.body?.call?.call_id);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('============================================\n');

    try {
        // Handle Retell call events
        if (req.body.event) {
            console.log(`Processing Retell ${req.body.event} event`);
            
            switch (req.body.event) {
                case 'call_started':
                    console.log('Call started:', req.body.call?.call_id);
                    break;
                    
                case 'call_ended':
                    console.log('Call ended:', req.body.call?.call_id);
                    break;
                    
                case 'call_analyzed':
                    console.log('Call analyzed:', req.body.call?.call_id);
                    const callData = req.body.call;
                    console.log('\nExtracting patient data...');
                    const patientData = extractPatientData(callData);
                    console.log('Extracted Data:', JSON.stringify(patientData.toJSON(), null, 2));

                    if (process.env.ENABLE_DATA_STORAGE === 'true') {
                        console.log('\nAttempting to store data in Google Sheets...');
                        try {
                            await storePatientData(patientData);
                            console.log('Successfully stored data in Google Sheets');
                        } catch (error) {
                            console.error('Failed to store data in Google Sheets:', error);
                        }
                    } else {
                        console.log('Data storage is disabled (ENABLE_DATA_STORAGE != true)');
                    }
                    break;
                    
                default:
                    console.log(`Unknown event type: ${req.body.event}`);
            }
            
            return res.json({ status: 'ok', event: req.body.event });
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
        console.error('Webhook Error:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    } finally {
        console.log('==================== WEBHOOK REQUEST END ====================\n');
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

    // Extract analysis data
    if (callData.call_analysis) {
        patientData.analysis = {
            summary: callData.call_analysis.call_summary,
            sentiment: callData.call_analysis.user_sentiment,
            successful: callData.call_analysis.call_successful,
            customData: callData.call_analysis.custom_analysis_data || {},
            taskCompletion: callData.call_analysis.agent_task_completion_rating
        };
    }

    return patientData;
}

async function storePatientData(patientData) {
    try {
        await sheetsService.appendPatientData(patientData);
        console.log('Patient data stored in Google Sheets');
    } catch (error) {
        console.error('Error storing patient data:', error);
    }
}

// Add this route to test Google Sheets integration
router.get('/test-sheets', async (req, res) => {
    console.log('Testing Google Sheets integration');
    
    try {
        const testData = new PatientData();
        testData.callDetails = {
            callId: 'test_' + Date.now(),
            timestamp: Date.now(),
            duration: 0
        };
        testData.phoneNumber = '+1234567890';
        testData.symptoms.primaryCondition = 'test_condition';
        
        await storePatientData(testData);
        res.json({ status: 'success', message: 'Test data written to sheets' });
    } catch (error) {
        console.error('Test failed:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Add this route to manually test the full flow
router.post('/test-webhook', async (req, res) => {
    console.log('Testing webhook flow with sample data');
    
    const sampleCall = {
        call_id: 'test_' + Date.now(),
        start_timestamp: Date.now(),
        duration_ms: 60000,
        from_number: '+1234567890',
        transcript_object: [
            {
                role: 'user',
                content: 'I have a severe headache in the back of my head, about 8 out of 10 pain, for 2 days'
            }
        ],
        call_analysis: {
            call_summary: 'Patient reported severe headache',
            user_sentiment: 'Negative',
            call_successful: true,
            custom_analysis_data: {
                pain_level: 8,
                duration_days: 2,
                primary_symptom: 'headache'
            },
            agent_task_completion_rating: 'Complete'
        }
    };

    try {
        const patientData = extractPatientData(sampleCall);
        console.log('Extracted patient data:', JSON.stringify(patientData, null, 2));
        await storePatientData(patientData);
        res.json({ 
            status: 'success', 
            message: 'Test data processed and stored',
            data: patientData 
        });
    } catch (error) {
        console.error('Test failed:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// Add this near the top of the file, after the router definition
router.post('/debug', (req, res) => {
    console.log('Debug webhook received:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        headers: req.headers,
        body: req.body
    });
    res.json({ status: 'received' });
});

module.exports = router; 