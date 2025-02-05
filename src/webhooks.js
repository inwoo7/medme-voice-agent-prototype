const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const PatientData = require('./models/PatientData');
const sheetsService = require('./services/sheets');
const util = require('util');

// Add at the top after requires
console.log('Environment configuration:', {
    ENABLE_DATA_STORAGE: process.env.ENABLE_DATA_STORAGE,
    SHEETS_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? 'configured' : 'missing',
    NODE_ENV: process.env.NODE_ENV
});

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
                    
                    // Log the complete call analysis
                    console.log('Complete call analysis:', {
                        hasCallAnalysis: Boolean(callData.call_analysis),
                        analysisFields: callData.call_analysis ? Object.keys(callData.call_analysis) : [],
                        customData: callData.call_analysis?.custom_analysis_data,
                        summary: callData.call_analysis?.call_summary,
                        sentiment: callData.call_analysis?.user_sentiment
                    });
                    
                    const patientData = extractPatientData(callData);
                    
                    if (process.env.ENABLE_DATA_STORAGE === 'true') {
                        console.log('Attempting to store data...');
                        try {
                            await storePatientData(patientData);
                            console.log('Successfully stored data in Google Sheets');
                        } catch (error) {
                            console.error('Failed to store data:', error);
                            // Continue processing even if storage fails
                        }
                    } else {
                        console.log('Data storage is disabled (ENABLE_DATA_STORAGE != true)');
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
    console.log('Processing call data:', {
        hasAnalysis: Boolean(callData.call_analysis),
        hasTranscript: Boolean(callData.transcript),
        callId: callData.call_id
    });

    const patientData = new PatientData();
    
    // Basic call details
    patientData.callDetails = {
        callId: callData.call_id,
        timestamp: callData.start_timestamp,
        duration: callData.duration_ms
    };

    // Extract from call analysis
    if (callData.call_analysis) {
        patientData.analysis = {
            summary: callData.call_analysis.call_summary,
            sentiment: callData.call_analysis.user_sentiment,
            successful: callData.call_analysis.call_successful,
            customData: callData.call_analysis.custom_analysis_data || {}
        };

        // Extract custom analysis data
        const customData = callData.call_analysis.custom_analysis_data || {};
        
        // Consultation details
        patientData.consultation.reasonForCall = customData.reason_for_call;
        patientData.consultation.minorAilment = customData.minor_ailment;

        // Personal information
        patientData.personalInfo = {
            firstName: customData.first_name,
            lastName: customData.last_name,
            phoneNumber: callData.from_number, // From call data
            email: customData.email,
            address: customData.address,
            city: customData.city
        };

        // If primary condition is in custom data, use it
        if (customData.primary_condition) {
            patientData.symptoms.primaryCondition = customData.primary_condition;
        }
    }

    // Extract from transcript (Retell provides both string and object formats)
    if (callData.transcript) {
        // Process the full transcript string
        const transcript = callData.transcript;
        const userLines = transcript
            .split('\n')
            .filter(line => line.toLowerCase().startsWith('user:'))
            .map(line => line.replace(/^user:\s*/i, '').toLowerCase());

        console.log('Processing user lines:', userLines);

        for (const line of userLines) {
            // Extract severity (e.g., "8 out of 10")
            const severityMatch = line.match(/(\d+)(?:\s+)?(?:out\s+of|\/)\s*10/);
            if (severityMatch && !patientData.symptoms.severity) {
                patientData.symptoms.severity = parseInt(severityMatch[1]);
            }

            // Extract duration (e.g., "3 months")
            const durationMatch = line.match(/(\d+)\s*(day|days|week|weeks|month|months)/);
            if (durationMatch && !patientData.symptoms.duration) {
                patientData.symptoms.duration = `${durationMatch[1]} ${durationMatch[2]}`;
            }

            // Extract symptoms
            const symptomKeywords = ['acne', 'headache', 'pain', 'nausea', 'dizzy', 'vomiting'];
            for (const keyword of symptomKeywords) {
                if (line.includes(keyword) && !patientData.symptoms.additionalSymptoms.includes(keyword)) {
                    patientData.symptoms.additionalSymptoms.push(keyword);
                    if (!patientData.symptoms.primaryCondition) {
                        patientData.symptoms.primaryCondition = keyword;
                    }
                }
            }

            // Extract location
            const locationKeywords = {
                'back of head': 'posterior head',
                'front of head': 'anterior head',
                'side of head': 'lateral head',
                'face': 'facial',
                'chest': 'chest',
                'back': 'back'
            };
            for (const [keyword, medical] of Object.entries(locationKeywords)) {
                if (line.includes(keyword)) {
                    patientData.symptoms.location = medical;
                    break;
                }
            }
        }
    }

    console.log('Extracted data:', {
        callId: patientData.callDetails.callId,
        personalInfo: {
            name: `${patientData.personalInfo.firstName} ${patientData.personalInfo.lastName}`,
            city: patientData.personalInfo.city
        },
        consultation: {
            reason: patientData.consultation.reasonForCall,
            ailment: patientData.consultation.minorAilment
        },
        symptoms: {
            condition: patientData.symptoms.primaryCondition,
            severity: patientData.symptoms.severity,
            duration: patientData.symptoms.duration,
            location: patientData.symptoms.location,
            additional: patientData.symptoms.additionalSymptoms
        },
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

        const dataToStore = [
            new Date(patientData.callDetails.timestamp).toISOString(),  // Timestamp
            patientData.callDetails.callId,                            // Call ID
            patientData.personalInfo.phoneNumber || '',                // Phone Number
            patientData.consultation.reasonForCall || '',              // Reason for Call
            patientData.consultation.minorAilment || '',              // Minor Ailment
            patientData.symptoms.primaryCondition || '',               // Primary Condition
            patientData.symptoms.severity || '',                       // Severity
            patientData.symptoms.duration || '',                       // Duration
            patientData.symptoms.location || '',                       // Location
            patientData.symptoms.additionalSymptoms.join(', ') || '', // Additional Symptoms
            patientData.personalInfo.firstName || '',                  // First Name
            patientData.personalInfo.lastName || '',                   // Last Name
            patientData.personalInfo.address || '',                    // Address
            patientData.personalInfo.email || '',                      // Email
            patientData.personalInfo.city || '',                      // City
            patientData.analysis?.sentiment || '',                     // Sentiment
            patientData.analysis?.successful || '',                    // Success
            patientData.analysis?.summary || '',                      // Summary
            JSON.stringify(patientData.analysis?.customData || {})     // Custom Data
        ];

        console.log('Storing row data:', dataToStore);
        await sheetsService.appendPatientData(dataToStore);
        console.log('Successfully stored data in Google Sheets');
    } catch (error) {
        console.error('Failed to store patient data:', error);
        throw error;
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