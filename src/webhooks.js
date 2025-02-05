const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const PatientData = require('./models/PatientData');
const sheetsService = require('./services/sheets');
const util = require('util');

// Re-enable webhook verification with support for both formats
const verifyWebhook = (req, res, next) => {
    // Only log minimal info for verification
    console.log(`[${new Date().toISOString()}] Verifying webhook request: ${req.method} ${req.originalUrl}`);
    next();
};

// At the top of the file
console.log('Webhook router loaded');

// Initialize sheets service when the server starts
sheetsService.init().catch(console.error);

// Webhook handler for both agent interactions and Retell events
router.post('/agent-webhook', verifyWebhook, async (req, res) => {
    const event = req.body?.event;
    const callId = req.body?.call?.call_id;
    
    console.log(`\n[${new Date().toISOString()}] Received ${event || 'unknown'} event for call ${callId || 'unknown'}`);

    try {
        if (req.body.event) {
            switch (req.body.event) {
                case 'call_started':
                    console.log(`Call started: ${callId}`);
                    break;
                    
                case 'call_ended':
                    console.log(`Call ended: ${callId}`);
                    // Log only relevant call details
                    if (req.body.call) {
                        console.log('Call Summary:', {
                            duration: req.body.call.duration_ms,
                            from: req.body.call.from_number,
                            status: req.body.call.call_status
                        });
                    }
                    break;
                    
                case 'call_analyzed':
                    console.log(`Processing analysis for call: ${callId}`);
                    const callData = req.body.call;
                    const patientData = extractPatientData(callData);
                    
                    // Log only the extracted data
                    console.log('Extracted Data:', {
                        primaryCondition: patientData.symptoms.primaryCondition,
                        severity: patientData.symptoms.severity,
                        duration: patientData.symptoms.duration,
                        symptoms: patientData.symptoms.additionalSymptoms
                    });

                    if (process.env.ENABLE_DATA_STORAGE === 'true') {
                        await storePatientData(patientData);
                        console.log('Data stored in Google Sheets');
                    }
                    break;
                    
                default:
                    console.log(`Unhandled event type: ${event}`);
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
        console.error('Error processing webhook:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function extractPatientData(callData) {
    console.log('Extracting data from:', {
        hasCallAnalysis: Boolean(callData.call_analysis),
        hasTranscript: Boolean(callData.transcript_object),
        callId: callData.call_id
    });

    const patientData = new PatientData();
    
    // Extract call details
    patientData.callDetails = {
        callId: callData.call_id,
        timestamp: callData.start_timestamp,
        duration: callData.duration_ms
    };

    // Extract phone number
    patientData.phoneNumber = callData.from_number;

    // Extract analysis data first (this is important data)
    if (callData.call_analysis) {
        patientData.analysis = {
            summary: callData.call_analysis.call_summary || '',
            sentiment: callData.call_analysis.user_sentiment || 'Neutral',
            successful: callData.call_analysis.call_successful || false,
            customData: callData.call_analysis.custom_analysis_data || {},
            taskCompletion: callData.call_analysis.agent_task_completion_rating || ''
        };

        // Try to extract primary condition from custom data
        if (callData.call_analysis.custom_analysis_data?.primary_symptom) {
            patientData.symptoms.primaryCondition = callData.call_analysis.custom_analysis_data.primary_symptom;
        }
    }

    // Parse transcript for additional information
    if (callData.transcript_object && Array.isArray(callData.transcript_object)) {
        for (const message of callData.transcript_object) {
            if (message.role === 'user') {
                const text = message.content.toLowerCase();
                
                // Extract severity
                const severityMatch = text.match(/(\d+)(?:\s+)?(?:out\s+of|\/)\s*10/);
                if (severityMatch && !patientData.symptoms.severity) {
                    patientData.symptoms.severity = parseInt(severityMatch[1]);
                }

                // Extract duration
                const durationMatch = text.match(/(\d+)\s*(day|days|week|weeks|hour|hours)/);
                if (durationMatch && !patientData.symptoms.duration) {
                    patientData.symptoms.duration = `${durationMatch[1]} ${durationMatch[2]}`;
                }

                // Extract symptoms
                const symptomKeywords = ['acne', 'headache', 'pain', 'nausea', 'dizzy', 'vomiting'];
                for (const keyword of symptomKeywords) {
                    if (text.includes(keyword) && !patientData.symptoms.additionalSymptoms.includes(keyword)) {
                        patientData.symptoms.additionalSymptoms.push(keyword);
                    }
                }
            }
        }
    }

    console.log('Extracted patient data:', {
        callId: patientData.callDetails.callId,
        condition: patientData.symptoms.primaryCondition,
        severity: patientData.symptoms.severity,
        duration: patientData.symptoms.duration,
        symptoms: patientData.symptoms.additionalSymptoms,
        sentiment: patientData.analysis?.sentiment,
        success: patientData.analysis?.successful
    });

    return patientData;
}

async function storePatientData(patientData) {
    try {
        console.log('Preparing to store data:', {
            callId: patientData.callDetails.callId,
            timestamp: new Date(patientData.callDetails.timestamp).toISOString()
        });

        // Ensure we have valid data before storing
        const dataToStore = [
            new Date(patientData.callDetails.timestamp).toISOString(),  // Timestamp
            patientData.callDetails.callId,                            // Call ID
            patientData.phoneNumber || '',                             // Phone Number
            patientData.symptoms.primaryCondition || '',               // Primary Condition
            patientData.symptoms.severity || '',                       // Severity
            patientData.symptoms.duration || '',                       // Duration
            patientData.symptoms.location || '',                       // Location
            patientData.symptoms.additionalSymptoms.join(', ') || '', // Additional Symptoms
            '',                                                        // Medications (not implemented yet)
            patientData.analysis?.sentiment || '',                     // Sentiment
            patientData.analysis?.successful || '',                    // Success
            patientData.analysis?.summary || '',                       // Summary
            JSON.stringify(patientData.analysis?.customData || {})     // Custom Data
        ];

        console.log('Storing row data:', dataToStore);
        await sheetsService.appendPatientData(dataToStore);
        console.log('Successfully stored data in Google Sheets');
    } catch (error) {
        console.error('Failed to store patient data:', error);
        throw error;  // Re-throw to handle in the calling function
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