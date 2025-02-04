const express = require('express');
const bodyParser = require('body-parser');
const webhookRoutes = require('./webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Middleware
app.use(bodyParser.json());

// Basic health check route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Routes
app.use('/api', webhookRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 