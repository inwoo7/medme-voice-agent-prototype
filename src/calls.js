const client = require('./config');

// Function to handle inbound calls
async function createWebCall(agentId) {
  try {
    const webCall = await client.call.createWebCall({
      agent_id: agentId,
      // Add any additional parameters as needed
    });
    console.log('Web call created:', webCall);
    return webCall;
  } catch (error) {
    console.error('Error creating web call:', error);
    throw error;
  }
}

// Function to create outbound calls (for follow-ups)
async function createPhoneCall(agentId, phoneNumber) {
  try {
    const phoneCall = await client.call.createPhoneCall({
      agent_id: agentId,
      customer_number: phoneNumber,
      // Add any additional parameters as needed
    });
    console.log('Phone call created:', phoneCall);
    return phoneCall;
  } catch (error) {
    console.error('Error creating phone call:', error);
    throw error;
  }
}

// Function to retrieve call history
async function getCallHistory(callId) {
  try {
    const call = await client.call.retrieve(callId);
    console.log('Call details:', call);
    return call;
  } catch (error) {
    console.error('Error retrieving call:', error);
    throw error;
  }
}

module.exports = {
  createWebCall,
  createPhoneCall,
  getCallHistory
}; 