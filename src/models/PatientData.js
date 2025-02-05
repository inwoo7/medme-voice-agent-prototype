class PatientData {
    constructor() {
        this.firstName = null;
        this.lastName = null;
        this.phoneNumber = null;
        this.email = null;
        this.address = null;
        this.city = null;
        this.symptoms = {
            primaryCondition: null,
            severity: null,
            duration: null,
            location: null,
            additionalSymptoms: [],
            medicationsTaken: []
        };
        this.callDetails = {
            callId: null,
            timestamp: null,
            duration: null
        };
    }

    toJSON() {
        return {
            personalInfo: {
                firstName: this.firstName,
                lastName: this.lastName,
                phoneNumber: this.phoneNumber,
                email: this.email,
                address: this.address,
                city: this.city
            },
            symptoms: this.symptoms,
            callDetails: this.callDetails
        };
    }
}

module.exports = PatientData; 