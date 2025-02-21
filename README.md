# medme-voice-agent-prototype

# Healthcare Voice Agent

A voice agent built with Retell AI to help patients navigate healthcare services.

## Webhook Configuration

The agent uses a webhook to handle dynamic responses:

- **Webhook URL**: `https://medme-voice-agent-prototype.onrender.com/api/agent-webhook`
- **Environment**: Production
- **Authentication**: HMAC SHA-256 signature verification

### Supported Intents

The webhook handles the following intents:

- `ASSESS_SYMPTOMS`: Initial symptom assessment
- `BOOK_PHARMACY`: Pharmacy appointment booking
- `MEDICATION_REMINDER`: Medication reminder setup
- `FOLLOW_UP`: Post-visit follow-up

### Testing

To test the webhook locally:

## Environment Variables

The following environment variables must be set:

- `GOOGLE_SHEETS_SPREADSHEET_ID`: The ID of your Google Sheet (from the URL)
- `GOOGLE_SHEETS_CREDENTIALS`: The service account credentials JSON
- `ENABLE_DATA_STORAGE`: Set to "true" to enable storing data in Google Sheets

To verify your setup:
1. Check that all environment variables are set in Render
2. Share your Google Sheet with the service account email
3. Make a test call to verify data storage

## SMS Notifications

The application uses AWS SNS to send appointment confirmation SMS messages. To set up:

1. Create an AWS account if you don't have one
2. Create an IAM user with SNS permissions
3. Add the following environment variables:
   - AWS_ACCESS_KEY_ID
   - AWS_SECRET_ACCESS_KEY
   - AWS_REGION

The SMS service will automatically format phone numbers and handle error cases.

## Testing SMS

To test SMS functionality:
1. Visit: `https://medme-voice-agent-prototype.onrender.com/api/test-sms`
2. Check the logs in Render dashboard
3. You should receive a test message at the configured number
