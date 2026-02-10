/**
 * Webhook Routes — /api/webhooks
 * Receives callbacks FROM Boltic workflows
 */
const express = require('express');
const router = express.Router();
const db = require('../db/bolticClient');
const chaserEngine = require('../services/chaserEngine');

// Debounce Boltic cron hits so we don't run scans every minute if Boltic is scheduled that often
const BOLTIC_CRON_COOLDOWN_MINUTES = parseInt(process.env.BOLTIC_CRON_COOLDOWN_MINUTES || '10', 10);
let lastBolticCronRun = 0;

// ─── POST /api/webhooks/boltic/delivery-confirm ──────────────────────────
// Boltic calls this after successfully sending a notification
router.post('/boltic/delivery-confirm', async (req, res) => {
  try {
    const { task_id, log_id, status, channel } = req.body;
    console.log(`[Webhook] Delivery confirmation for task ${task_id}: ${status}`);

    if (log_id) {
      await db.update('chaser_logs', log_id, { status: status || 'delivered' });
    }
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/webhooks/boltic/task-updated ──────────────────────────────
// Boltic fires this when it detects a task status change via its own monitoring
router.post('/boltic/task-updated', async (req, res) => {
  try {
    const { task_id, new_status, updated_by } = req.body;
    console.log(`[Webhook] Task ${task_id} updated to ${new_status}`);

    if (new_status === 'done') {
      // Persist status change so future scans skip the task
      await db.update('tasks', task_id, { status: new_status });
      await chaserEngine.acknowledgeTask(task_id, updated_by);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/webhooks/boltic/cron-trigger ──────────────────────────────
// Boltic's scheduled workflow pings this to run the chaser scan
router.post('/boltic/cron-trigger', async (req, res) => {
  try {
    console.log('[Webhook] Boltic cron trigger received');
    const now = Date.now();
    const minutesSinceLast = lastBolticCronRun ? (now - lastBolticCronRun) / 60000 : null;

    if (minutesSinceLast !== null && minutesSinceLast < BOLTIC_CRON_COOLDOWN_MINUTES) {
      console.log(`[Webhook] Skipping Boltic cron run; last run ${minutesSinceLast.toFixed(2)}m ago (cooldown ${BOLTIC_CRON_COOLDOWN_MINUTES}m)`);
      return res.json({
        received: true,
        skipped: true,
        reason: 'debounced',
        minutes_since_last: parseFloat(minutesSinceLast.toFixed(2)),
      });
    }

    lastBolticCronRun = now;
    // Run async — respond immediately so Boltic doesn't time out
    chaserEngine.runAutomatedChaser({ source: 'boltic' }).catch(console.error);
    res.json({ received: true, message: 'Chaser scan initiated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/webhooks/manual-chase ─────────────────────────────
router.post('/manual-chase', async (req, res) => {
  try {
    const { task_id } = req.body;
    await chaserEngine.runManualChase(task_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/webhooks/boltic/snooze ─────────────────────────────────────
// Handles snooze links clicked from emails
router.get('/snooze', async (req, res) => {
  try {
    const { task_id, hours = 4 } = req.query;
    await chaserEngine.snoozeTask(task_id, parseInt(hours));
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>✅ Got it!</h2>
      <p>Task chaser snoozed for ${hours} hours. We'll check back in later.</p>
    </body></html>`);
  } catch (err) {
    res.status(500).send('Error snoozing task');
  }
});

module.exports = router;

// ═══════════════════════════════════════════════════════════════════════════
// Chaser Logs Routes — /api/chaser-logs
// ═══════════════════════════════════════════════════════════════════════════
const logsRouter = express.Router();

logsRouter.get('/', async (req, res) => {
  try {
    const { task_id, type, limit = 100 } = req.query;
    const filters = [];
    if (task_id) filters.push({ field: 'task_id', operator: 'eq', value: task_id });
    if (type)    filters.push({ field: 'type',    operator: 'eq', value: type });

    const logs = await db.find('chaser_logs', {
      filters,
      sort: '-sent_at',
      limit: parseInt(limit),
    });
    res.json({ success: true, data: logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports.logsRouter = logsRouter;

// ═══════════════════════════════════════════════════════════════════════════
// Notifications Routes — /api/notifications
// ═══════════════════════════════════════════════════════════════════════════
const notifRouter = express.Router();

notifRouter.get('/', async (req, res) => {
  try {
    const { user_email, unread } = req.query;
    const filters = [];
    if (user_email) filters.push({ field: 'user_email', operator: 'eq', value: user_email });
    if (unread === 'true') filters.push({ field: 'read', operator: 'eq', value: false });

    const notifs = await db.find('notifications', {
      filters,
      sort: '-created_at',
      limit: 50,
    });
    res.json({ success: true, data: notifs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notifRouter.patch('/:id/read', async (req, res) => {
  try {
    await db.update('notifications', req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports.notifRouter = notifRouter;
