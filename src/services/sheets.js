const { google } = require('googleapis');

class GoogleSheetsService {
    constructor() {
        // Will initialize with credentials from env
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    }

    async init() {
        try {
            const auth = new google.auth.GoogleAuth({
                credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const client = await auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: client });
            
            // Create headers if they don't exist
            await this.initializeHeaders();
        } catch (error) {
            console.error('Failed to initialize Google Sheets:', error);
            throw error;
        }
    }

    async initializeHeaders() {
        const headers = [
            'Timestamp',
            'Call ID',
            'Phone Number',
            'Primary Condition',
            'Severity',
            'Duration',
            'Location',
            'Additional Symptoms',
            'Medications',
            'Sentiment',
            'Success',
            'Summary',
            'Custom Data'
        ];

        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'A1:M1',
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