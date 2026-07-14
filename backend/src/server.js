/**
 * Code Review Dashboard — Backend Server
 * 
 * Main entry point for the backend application.
 * Sets up Express with raw body capture for HMAC verification,
 * WebSocket server, Redis pub/sub, and SQLite database.
 */
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');

// Import modules
const { createHmacMiddleware } = require('./middleware/hmac');
const { initDatabase } = require('./db/database');
const { initPublisher } = require('./pubsub/publisher');
const { initSubscriber } = require('./pubsub/subscriber');
const wsManager = require('./websocket/manager');

// Import routes
const webhookRoutes = require('./routes/webhook');
const pullsRoutes = require('./routes/pulls');
const reviewersRoutes = require('./routes/reviewers');

// Configuration
const PORT = process.env.API_PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'default-secret';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize Express
const app = express();

// CORS — allow all origins for dashboard access
app.use(cors());

// JSON body parser with raw body capture for HMAC verification
// The `verify` callback stores the raw buffer on req.rawBody
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

// ─── Health Check ───────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    wsClients: wsManager.getClientCount()
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────
// Webhook endpoint — secured with HMAC middleware
app.use('/api/webhook', createHmacMiddleware(WEBHOOK_SECRET), webhookRoutes);

// Pull requests endpoints — public (for dashboard)
app.use('/api/pulls', pullsRoutes);

// Reviewer load endpoint — public (for dashboard)
app.use('/api/reviewers', reviewersRoutes);

// ─── 404 Handler ────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error Handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[SERVER] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Application ─────────────────────────────────────────────────
async function start() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Code Review Dashboard — Backend Server');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. Initialize SQLite database
  initDatabase();

  // 2. Create HTTP server
  const server = http.createServer(app);

  // 3. Initialize WebSocket server on /ws path
  wsManager.init(server, '/ws');

  // 4. Initialize Redis pub/sub
  initPublisher(REDIS_URL);

  // 5. Subscribe to pr_events channel and bridge to WebSocket
  initSubscriber(REDIS_URL, (channel, message) => {
    if (channel === 'pr_events') {
      wsManager.broadcast(message);
    }
  });

  // 6. Start listening
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] HTTP server listening on port ${PORT}`);
    console.log(`[SERVER] WebSocket server available at ws://0.0.0.0:${PORT}/ws`);
    console.log(`[SERVER] Webhook endpoint: POST /api/webhook`);
    console.log(`[SERVER] Pull requests:    GET  /api/pulls`);
    console.log(`[SERVER] Reviewer load:    GET  /api/reviewers/load`);
    console.log('═══════════════════════════════════════════════════════════');
  });
}

start().catch((err) => {
  console.error('[SERVER] Failed to start:', err);
  process.exit(1);
});
