const client = require('./config');

// Function to get agent details
async function getAgent(agentId) {
  try {
    const agent = await client.agent.retrieve(agentId);
    console.log('Agent retrieved:', agent);
    return agent;
  } catch (error) {
    console.error('Error retrieving agent:', error);
    throw error;
  }
}

// Function to list all agents
async function listAgents() {
  try {
    const agents = await client.agent.list();
    console.log('Agents:', agents);
    return agents;
  } catch (error) {
    console.error('Error listing agents:', error);
    throw error;
  }
}

module.exports = {
  getAgent,
  listAgents
}; 