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

    validatePhoneNumber(phone) {
        try {
            // Remove all non-digits
            const cleaned = phone.toString().replace(/\D/g, '');
            
            // Log the cleaning process
            console.log('Phone number cleaning:', {
                original: phone,
                cleaned: cleaned,
                length: cleaned.length
            });

            // For North American numbers (10 digits)
            if (cleaned.length === 10) {
                return `+1${cleaned}`;
            }
            
            // If it's already 11 digits with country code
            if (cleaned.length === 11 && cleaned.startsWith('1')) {
                return `+${cleaned}`;
            }
            
            // If it already has the plus and country code
            if (phone.startsWith('+1') && phone.length === 12) {
                return phone;
            }

            throw new Error(`Invalid phone number format: ${phone}. Must be 10 digits (7785127530) or include country code (+17785127530)`);
        } catch (error) {
            console.error('Phone validation failed:', {
                input: phone,
                error: error.message
            });
            throw error;
        }
    }

    async sendSMS(phoneNumber, message) {
        try {
            // Validate phone number first
            const validatedPhone = this.validatePhoneNumber(phoneNumber);
            console.log('Validated phone number:', {
                original: phoneNumber,
                validated: validatedPhone
            });

            const params = {
                Message: message,
                PhoneNumber: validatedPhone,
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
                phone: validatedPhone
            });
            
            return response;
        } catch (error) {
            console.error('SMS send failed:', {
                phone: phoneNumber,
                error: error.message,
                code: error.Code
            });
            throw error;
        }
    }

    generateAppointmentMessage(data) {
        return `
Hi ${data.name},

Your appointment is confirmed at:
${data.location}
Date & Time: ${data.date}

Please bring:
- Government ID
- MSP Card (${data.mspNumber || 'if available'})
- List of current medications

Questions? Call ${data.pharmacyPhone}

Appointment Reference: ${data.callId}
- MedMe Health
`.trim();
    }

    async checkDeliveryStatus(messageId) {
        // Simple status check without CloudWatch
        return {
            messageId,
            status: 'sent',
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new SMSService(); 