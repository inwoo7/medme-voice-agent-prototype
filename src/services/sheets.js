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
        // Only the fields we want from custom data
        const headers = [
            'Timestamp',
            'Call ID',
            'Reason for Call',
            'Minor Ailment',
            'First Name',
            'Last Name',
            'Address',
            'Phone',
            'Email',
            'City'
        ];

        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'A1:J1',  // Updated range to match new columns
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

    async appendPatientData(dataToStore) {
        try {
            console.log('Attempting to append data to sheets:', dataToStore);
            
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'A2:S2',  // Updated to match new column count
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [dataToStore]
                }
            });

            console.log('Successfully appended data to Google Sheets');
        } catch (error) {
            console.error('Failed to append data:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                status: error.status
            });
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService(); 