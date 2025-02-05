const { google } = require('googleapis');

class GoogleSheetsService {
    constructor() {
        console.log('Initializing Google Sheets Service');
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        console.log('Using spreadsheet ID:', this.spreadsheetId);
    }

    async init() {
        try {
            console.log('Starting Google Sheets initialization...');
            
            if (!process.env.GOOGLE_SHEETS_CREDENTIALS) {
                throw new Error('GOOGLE_SHEETS_CREDENTIALS environment variable is not set');
            }

            const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
            console.log('Parsed credentials for service account:', credentials.client_email);

            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const client = await auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: client });
            
            console.log('Successfully initialized Google Sheets client');
            
            // Test the connection
            await this.testConnection();
            
            // Create headers if they don't exist
            await this.initializeHeaders();
        } catch (error) {
            console.error('Failed to initialize Google Sheets:', error);
            throw error;
        }
    }

    async testConnection() {
        try {
            console.log('Testing Google Sheets connection...');
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            console.log('Successfully connected to sheet:', response.data.properties.title);
        } catch (error) {
            console.error('Failed to connect to Google Sheets:', error);
            throw error;
        }
    }

    async initializeHeaders() {
        const headers = [
            'Timestamp',
            'Call ID',
            'Phone Number',
            'Reason for Call',
            'Minor Ailment',
            'Primary Condition',
            'Severity',
            'Duration',
            'Location',
            'Additional Symptoms',
            'First Name',
            'Last Name',
            'Address',
            'Email',
            'City',
            'Sentiment',
            'Success',
            'Summary',
            'Custom Data'
        ];

        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'A1:S1',
                valueInputOption: 'RAW',
                resource: {
                    values: [headers]
                }
            });
        } catch (error) {
            console.error('Failed to initialize headers:', error);
            throw error;
        }
    }

    async appendPatientData(patientData) {
        try {
            const row = [
                new Date(patientData.callDetails.timestamp).toISOString(),
                patientData.callDetails.callId,
                patientData.phoneNumber,
                patientData.symptoms.primaryCondition,
                patientData.symptoms.severity,
                patientData.symptoms.duration,
                patientData.symptoms.location,
                patientData.symptoms.additionalSymptoms.join(', '),
                patientData.symptoms.medicationsTaken.join(', '),
                patientData.analysis?.sentiment,
                patientData.analysis?.successful,
                patientData.analysis?.summary,
                JSON.stringify(patientData.analysis?.customData)
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'A2:M2',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [row]
                }
            });

            console.log('Patient data appended to Google Sheets');
        } catch (error) {
            console.error('Failed to append patient data:', error);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService(); 