/**
 * Webhook and Log Routes — /api
 * Consolidates webhooks, logs, and notifications into a single router instance.
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

// ─── Webhook Routes ──────────────────────────────────────────────────────────

// POST /api/webhooks/boltic/delivery-confirm
router.post('/webhooks/boltic/delivery-confirm', async (req, res) => {
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

// POST /api/webhooks/boltic/task-updated
router.post('/webhooks/boltic/task-updated', async (req, res) => {
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

// POST /api/webhooks/boltic/cron-trigger
router.post('/webhooks/boltic/cron-trigger', async (req, res) => {
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

// POST /api/webhooks/manual-chase
router.post('/webhooks/manual-chase', async (req, res) => {
  try {
    const { task_id } = req.body;
    await chaserEngine.manualChase(task_id, 'webhook_manual');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/webhooks/snooze
router.get('/webhooks/snooze', async (req, res) => {
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

// GET /api/webhooks/acknowledge
router.get('/webhooks/acknowledge', async (req, res) => {
  try {
    const { task_id, token, user_email = 'email_link' } = req.query;
    if (!task_id) {
      return res.status(400).send('Missing task_id');
    }

    const task = await db.findById('tasks', task_id);
    if (!task) {
      return res.status(404).send('Task not found');
    }

    const ackToken = scalar(task.ack_token);
    if (ackToken && String(token || '') !== String(ackToken)) {
      return res.status(403).send('Invalid or expired acknowledgment link');
    }

    await chaserEngine.acknowledgeTask(task_id, String(user_email));

    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>✅ Acknowledged</h2>
      <p>Thanks! This task has been marked as acknowledged.</p>
    </body></html>`);
  } catch (err) {
    res.status(500).send('Error acknowledging task');
  }
});

// ─── Chaser Log Routes ───────────────────────────────────────────────────────

const { authMiddleware } = require('../services/authMiddleware');

// GET /api/chaser-logs
router.get('/chaser-logs', authMiddleware, async (req, res) => {
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

    const uniqueTaskIds = [...new Set(logs.map((log) => String(log.task_id || '')).filter(Boolean))];
    const tasksById = new Map();

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

    let enrichedLogs = logs.map((log) => {
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

    // Data Isolation: regular users only see logs for tasks they are assigned to
    if (req.user.role === 'user') {
      enrichedLogs = enrichedLogs.filter(log => 
        String(log.recipient_email || '').trim().toLowerCase() === req.user.email.toLowerCase()
      );
    }

    res.json({ success: true, data: enrichedLogs, count: enrichedLogs.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Notification Routes ─────────────────────────────────────────────────────

// GET /api/notifications
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const { unread } = req.query;
    const filters = [];
    
    // Data Isolation: users only see their own notifications
    const userEmail = req.user.email;
    filters.push({ field: 'user_email', operator: 'eq', value: userEmail });
    
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

// PATCH /api/notifications/:id/read
router.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await db.findById('notifications', req.params.id);
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });

    // Data Isolation
    const notifEmail = scalar(notification.user_email);
    if (String(notifEmail || '').trim().toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access restricted' });
    }

    await db.update('notifications', req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
