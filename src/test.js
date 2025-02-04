const { getAgent, listAgents } = require('./agent');
const { createWebCall, createPhoneCall, getCallHistory } = require('./calls');

async function test() {
  try {
    // List all agents
    const agents = await listAgents();
    
    // Use the first agent's ID for testing
    if (agents.data && agents.data.length > 0) {
      const agentId = agents.data[0].agent_id;
      
      // Test web call creation
      await createWebCall(agentId);
      
      // Test phone call creation (replace with actual phone number)
      // await createPhoneCall(agentId, '+1234567890');
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test(); 