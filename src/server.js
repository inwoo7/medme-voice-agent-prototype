const express = require('express');
const bodyParser = require('body-parser');
const webhookRouter = require('./webhooks');

const app = express();

// Add at the start of your server.js file
console.log('Starting server with configuration:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    ENABLE_DATA_STORAGE: process.env.ENABLE_DATA_STORAGE,
    WEBHOOK_PATH: '/webhooks/agent-webhook',
    SHEETS_CONFIGURED: Boolean(process.env.GOOGLE_SHEETS_CREDENTIALS)
});

// Increase JSON payload limit to 50mb
app.use(bodyParser.json({
    limit: '50mb'
}));

// Increase URL-encoded payload limit as well
app.use(bodyParser.urlencoded({
    limit: '50mb',
    extended: true
}));

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Basic health check route
app.get('/', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Add this after the health check route
app.get('/webhooks/test', (req, res) => {
    console.log('Test endpoint hit');
    res.json({ 
        status: 'webhook endpoint responding',
        timestamp: new Date().toISOString()
    });
});

// Add after your health check route
app.get('/test-webhook', (req, res) => {
    console.log('Test endpoint hit at:', new Date().toISOString());
    res.json({
        status: 'ok',
        message: 'Webhook endpoint is responding',
        env: {
            ENABLE_DATA_STORAGE: process.env.ENABLE_DATA_STORAGE,
            SHEETS_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? 'configured' : 'missing',
            SHEETS_CREDS: process.env.GOOGLE_SHEETS_CREDENTIALS ? 'configured' : 'missing'
        }
    });
});

// Routes
app.use('/webhooks', webhookRouter);

const port = process.env.PORT || 10000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app; 