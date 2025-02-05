class PatientData {
    constructor() {
        this.callDetails = {
            callId: null,
            timestamp: null,
            duration: null
        };
        
        this.personalInfo = {
            firstName: null,
            lastName: null,
            phoneNumber: null,
            email: null,
            address: null,
            city: null
        };
        
        this.symptoms = {
            primaryCondition: null,
            severity: null,
            duration: null,
            location: null,
            additionalSymptoms: [],
            medicationsTaken: []
        };

        this.consultation = {
            reasonForCall: null,
            minorAilment: null
        };
        
        this.analysis = {
            summary: null,
            sentiment: null,
            successful: null,
            customData: {}
        };
    }

    toJSON() {
        return {
            callDetails: this.callDetails,
            personalInfo: this.personalInfo,
            symptoms: this.symptoms,
            consultation: this.consultation,
            analysis: this.analysis
        };
    }
}

module.exports = PatientData; 