const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

class SMSService {
    constructor() {
        this.sns = new SNSClient({
            region: process.env.AWS_REGION || 'us-west-2',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
    }

    async sendSMS(phoneNumber, message) {
        try {
            // Format phone number (ensure it includes country code)
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            const params = {
                Message: message,
                PhoneNumber: formattedPhone,
                MessageAttributes: {
                    'AWS.SNS.SMS.SMSType': {
                        DataType: 'String',
                        StringValue: 'Transactional'
                    }
                }
            };

            const command = new PublishCommand(params);
            const response = await this.sns.send(command);
            
            console.log('SMS sent successfully:', {
                messageId: response.MessageId,
                phone: formattedPhone
            });
            
            return response;
        } catch (error) {
            console.error('Failed to send SMS:', error);
            throw error;
        }
    }

    formatPhoneNumber(phone) {
        // Remove any non-digit characters
        const digits = phone.toString().replace(/\D/g, '');
        
        // Add '+1' prefix if it's a 10-digit number (North American)
        if (digits.length === 10) {
            return `+1${digits}`;
        }
        
        // If it already has a country code (>10 digits), add '+'
        return `+${digits}`;
    }

    generateAppointmentMessage(data) {
        return `
Hi ${data.name},

Your pharmacy appointment is confirmed for ${data.date}.
Location: ${data.location}

Please bring:
- Government ID
- MSP Card
- Medication list

Questions? Call ${data.pharmacyPhone}

- MedMe Health
`.trim();
    }
}

module.exports = new SMSService(); 