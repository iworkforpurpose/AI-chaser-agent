/**
 * Chaser Agent — Express.js Server
 * Main entry point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const taskRoutes = require('./routes/tasks');
const chaserRulesRoutes = require('./routes/chaserRules');
const webhookRoutes = require('./routes/webhooks');
const { logsRouter } = require('./routes/webhooks');
const chaserEngine = require('./services/chaserEngine');
const db = require('./db/bolticClient');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/tasks',         taskRoutes);
app.use('/api/chaser-rules',  chaserRulesRoutes);
app.use('/api/webhooks',      webhookRoutes);
app.use('/api/chaser-logs',   logsRouter);

// Optional: projects are not part of minimal schema; endpoint disabled for hackathon scope

// Users endpoint
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.find('users');
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  const dbStatus = await db.ping();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'Chaser Agent API',
    db: dbStatus,
  });
});

// Manual cron trigger (useful for testing)
app.post('/api/run-chaser', async (req, res) => {
  try {
    const results = await chaserEngine.runAutomatedChaser();
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
const CRON_SCHEDULE = process.env.CHASER_CRON_SCHEDULE || '0 * * * *'; // Every hour

if (process.env.NODE_ENV !== 'test') {
  cron.schedule(CRON_SCHEDULE, async () => {
    console.log('\n⏰ [CRON] Hourly chaser scan triggered');
    try {
      await chaserEngine.runAutomatedChaser();
    } catch (err) {
      console.error('[CRON] Chaser scan failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Weekly digest every Monday at 9 AM
  cron.schedule('0 9 * * 1', async () => {
    console.log('\n📬 [CRON] Sending weekly digest...');
    try {
      const res = await fetch(`http://localhost:${PORT}/api/tasks/weekly-digest`);
      const data = await res.json();
      const bolticWorkflow = require('./services/bolticWorkflow');
      await bolticWorkflow.triggerWeeklyDigest(data.data);
    } catch (err) {
      console.error('[CRON] Weekly digest failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log(`\n⏰ Cron jobs scheduled:`);
  console.log(`   Hourly Chaser: ${CRON_SCHEDULE}`);
  console.log(`   Weekly Digest: Every Monday 9 AM IST`);
}

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Chaser Agent API running on http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📡 Available endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/tasks`);
  console.log(`   GET  /api/tasks/due-soon`);
  console.log(`   GET  /api/tasks/overdue`);
  console.log(`   GET  /api/tasks/stats`);
  console.log(`   POST /api/tasks/:id/chase`);
  console.log(`   POST /api/tasks/:id/snooze`);
  console.log(`   GET  /api/chaser-rules`);
  console.log(`   GET  /api/chaser-logs`);
  console.log(`   POST /api/webhooks/boltic/*`);
  console.log(`   POST /api/run-chaser  (manual trigger)\n`);
});

module.exports = app;
