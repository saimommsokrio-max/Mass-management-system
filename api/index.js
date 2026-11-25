const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const apiRoutes = require('../server/routes');
const { initSchema } = require('../server/db');

// Initialize schema on serverless invocation
initSchema();

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Handle both /api/... and /...
app.use('/api', apiRoutes);
app.use('/', apiRoutes);

// Generic error handler
app.use((err, req, res, next) => {
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

module.exports = app;
