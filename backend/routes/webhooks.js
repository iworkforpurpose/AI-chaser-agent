/**
 * Webhook Routes — /api/webhooks
 * Receives callbacks FROM Boltic workflows
 */
const express = require('express');
const router = express.Router();
const db = require('../db/bolticClient');
const chaserEngine = require('../services/chaserEngine');
const scalar = (value) => (Array.isArray(value) ? value[0] : value);
const normalizeStatus = (value) => String(scalar(value) || '').toLowerCase();
const missingTaskIdsSeen = new Set();

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
    if (!task_id) {
      return res.status(400).json({ error: 'task_id is required' });
    }

    const existingTask = await db.findById('tasks', task_id);
    if (!existingTask) {
      return res.status(404).json({ error: `Task ${task_id} not found` });
    }

    const prevStatus = normalizeStatus(existingTask.status);
    const nextStatus = normalizeStatus(new_status);
    if (!nextStatus) {
      return res.status(400).json({ error: 'new_status is required' });
    }
    const isDoneTransition = prevStatus !== 'done' && nextStatus === 'done';
    const isReopenTransition = prevStatus === 'done' && nextStatus !== 'done';

    const updatePayload = { status: nextStatus };
    if (isDoneTransition) updatePayload.completed_at = new Date().toISOString();
    if (isReopenTransition) updatePayload.completed_at = null;

    // Persist status change so future scans reflect the latest lifecycle state.
    await db.update('tasks', task_id, updatePayload);

    if (isDoneTransition) {
      await chaserEngine.acknowledgeTask(task_id, updated_by);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Note: we rely on Boltic's monitoring for task updates, but if desired we could also add a generic /task-updated webhook that Boltic workflows can call from any step to trigger an immediate scan (e.g. after a manual chase or snooze action).
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
    await chaserEngine.manualChase(task_id, 'webhook_manual');
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
    const { task_id, type, status, limit = 100 } = req.query;
    const requestedLimit = Number.parseInt(limit, 10) || 100;
    const filters = [];
    if (task_id) filters.push({ field: 'task_id', operator: 'eq', value: task_id });

    const normalizeLog = (log) => ({
      ...log,
      task_id: scalar(log.task_id),
      rule_id: scalar(log.rule_id),
      type: scalar(log.type),
      status: scalar(log.status),
      channel: scalar(log.channel),
      sent_at: scalar(log.sent_at),
      acknowledged_at: scalar(log.acknowledged_at),
    });

    const matchesFilters = (log) => {
      if (type && log.type !== type) return false;
      if (status && log.status !== status) return false;
      return true;
    };

    let logs = [];
    if (type || status) {
      // Type/status are dropdown fields in Boltic and may be returned as arrays.
      // Fetch pages, normalize to scalars, then filter deterministically.
      const pageSize = 200;
      let offset = 0;
      let keepFetching = true;

      while (keepFetching && logs.length < requestedLimit) {
        const batch = await db.find('chaser_logs', {
          filters,
          sort: '-sent_at',
          limit: pageSize,
          offset,
        });

        if (!batch.length) break;

        const matchedBatch = batch.map(normalizeLog).filter(matchesFilters);
        logs.push(...matchedBatch);

        keepFetching = batch.length === pageSize;
        offset += pageSize;
      }
    } else {
      const rawLogs = await db.find('chaser_logs', {
        filters,
        sort: '-sent_at',
        limit: requestedLimit,
      });
      logs = rawLogs.map(normalizeLog);
    }

    logs = logs.slice(0, requestedLimit);

    // Enrich each log with task data without N+1 lookups.
    const uniqueTaskIds = [...new Set(logs.map((log) => String(log.task_id || '')).filter(Boolean))];
    const tasksById = new Map();

    // Keep chunks modest so "id IN (...)" doesn't become too large.
    const chunkSize = 50;
    for (let i = 0; i < uniqueTaskIds.length; i += chunkSize) {
      const chunk = uniqueTaskIds.slice(i, i + chunkSize);
      try {
        const taskBatch = await db.find('tasks', {
          filters: [{ field: 'id', operator: 'in', value: chunk }],
          limit: chunk.length,
        });
        taskBatch.forEach((task) => {
          const taskId = String(scalar(task.id) || '');
          if (taskId) tasksById.set(taskId, task);
        });
      } catch (err) {
        console.error('[ChaserLogs] Failed to fetch task batch:', err.message);
      }
    }

    const enrichedLogs = logs.map((log) => {
      const taskId = String(log.task_id || '');
      const task = tasksById.get(taskId);
      if (!task && taskId && !missingTaskIdsSeen.has(taskId)) {
        missingTaskIdsSeen.add(taskId);
        console.warn(`[ChaserLogs] Missing task for log task_id=${taskId}; returning fallback fields`);
      }

      return {
        ...log,
        task_title: scalar(task?.title) || 'Unknown Task',
        assignee_name: scalar(task?.assignee_name) || null,
        recipient_email: scalar(task?.assignee_email) || null,
        triggered_by: log.type === 'manual' ? 'manual_user' : 'system',
      };
    });

    res.json({ success: true, data: enrichedLogs, count: enrichedLogs.length });
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
