require('dotenv').config();

const Retell = require('retell-sdk');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

module.exports = client; 