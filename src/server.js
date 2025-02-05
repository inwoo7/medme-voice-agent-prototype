const express = require('express');
const bodyParser = require('body-parser');
const webhookRouter = require('./webhooks');

const app = express();

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

// Routes
app.use('/webhooks', webhookRouter);

const port = process.env.PORT || 10000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app; 