const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const apiRoutes = require('./routes');
const { initSchema } = require('./db');

// Ensure database schema is ready
initSchema();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1'; // MUST listen on localhost per security standards

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount API routes
app.use('/api', apiRoutes);

// Fallback for Single Page App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Generic safe error handler
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('API Error:', err);
  }
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

let server;
function startServer() {
  server = app.listen(PORT, HOST, () => {
    console.log(`Mess Management System running at http://${HOST}:${PORT}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
