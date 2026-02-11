/**
 * Task Routes — /api/tasks
 */

const express = require('express');
const router = express.Router();
const db = require('../db/bolticClient');
const chaserEngine = require('../services/chaserEngine');
const dayjs = require('dayjs');

const TASK_FIELDS = new Set([
  'title',
  'description',
  'assignee_id',
  'assignee_email',
  'assignee_name',
  'status',
  'priority',
  'due_date',
  'chaser_enabled',
  'times_chased',
  'times_escalated',
  'last_chased_at',
  'snoozed_until',
  'ack_token',
]);

const pickTaskFields = (input = {}) =>
  Object.fromEntries(
    Object.entries(input).filter(([key, value]) => TASK_FIELDS.has(key) && value !== undefined)
  );

// ─── GET /api/tasks ─────────────────────────────────────────────────────────
// List all tasks with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, priority, assignee_email, overdue, due_today } = req.query;
    const filters = [];
    const now = dayjs();

    if (status)         filters.push({ field: 'status',         operator: 'eq', value: status });
    if (priority)       filters.push({ field: 'priority',       operator: 'eq', value: priority });
    if (assignee_email) filters.push({ field: 'assignee_email', operator: 'eq', value: assignee_email });

    if (overdue === 'true') {
      filters.push({ field: 'status',   operator: 'neq', value: 'done' });
      filters.push({ field: 'due_date', operator: 'lt',  value: now.toISOString() });
    }

    if (due_today === 'true') {
      filters.push({ field: 'due_date', operator: 'gte', value: now.startOf('day').toISOString() });
      filters.push({ field: 'due_date', operator: 'lte', value: now.endOf('day').toISOString() });
    }

    const tasks = await db.find('tasks', { filters, sort: 'due_date', limit: 200 });
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await chaserEngine.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/due-soon ──────────────────────────────────────────────
// Used by Boltic's scheduled workflow to fetch tasks
router.get('/due-soon', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const now = dayjs();
    const cutoff = now.add(hours, 'hour');

    const tasks = await db.find('tasks', {
      filters: [
        { field: 'status',         operator: 'neq', value: 'done' },
        { field: 'status',         operator: 'neq', value: 'cancelled' },
        { field: 'chaser_enabled', operator: 'eq',  value: true },
        { field: 'due_date',       operator: 'gte', value: now.toISOString() },
        { field: 'due_date',       operator: 'lte', value: cutoff.toISOString() },
      ],
    });

    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/overdue ───────────────────────────────────────────────
router.get('/overdue', async (req, res) => {
  try {
    const tasks = await db.find('tasks', {
      filters: [
        { field: 'status',         operator: 'neq', value: 'done' },
        { field: 'status',         operator: 'neq', value: 'cancelled' },
        { field: 'due_date',       operator: 'lt',  value: dayjs().toISOString() },
      ],
      sort: 'due_date',
    });
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/weekly-digest ─────────────────────────────────────────
// Used by Boltic's Monday cron workflow
router.get('/weekly-digest', async (req, res) => {
  try {
    const tasks = await db.find('tasks', {
      filters: [{ field: 'status', operator: 'neq', value: 'done' }],
      limit: 500,
    });

    // Group by assignee
    const byAssignee = {};
    for (const task of tasks) {
      const key = task.assignee_email;
      if (!byAssignee[key]) {
        byAssignee[key] = { email: key, name: task.assignee_name, tasks: [] };
      }
      byAssignee[key].tasks.push(task);
    }

    res.json({ success: true, data: Object.values(byAssignee) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const task = await db.findById('tasks', req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const payload = pickTaskFields(req.body);
    payload.times_chased = payload.times_chased ?? 0;
    payload.times_escalated = payload.times_escalated ?? 0;

    const task = await db.insert('tasks', payload);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/tasks/:id ─────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const updatedData = pickTaskFields(req.body);

    if (Object.keys(updatedData).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid task fields provided for update' });
    }

    // If marking as done, fire acknowledgment
    if (status === 'done') {
      const task = await db.findById('tasks', req.params.id);
      if (task && task.status !== 'done') {
        // Fire acknowledgment workflow async (don't await)
        chaserEngine.acknowledgeTask(req.params.id, req.body.updated_by || 'system').catch(console.error);
      }
    }

    const task = await db.update('tasks', req.params.id, updatedData);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.delete('tasks', req.params.id);
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tasks/:id/chase ────────────────────────────────────────────
// Manual chase trigger from UI
router.post('/:id/chase', async (req, res) => {
  try {
    const result = await chaserEngine.manualChase(
      req.params.id,
      req.body.triggered_by || 'manual_user'
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tasks/:id/snooze ───────────────────────────────────────────
router.post('/:id/snooze', async (req, res) => {
  try {
    const hours = parseInt(req.body.hours || req.query.hours) || 4;
    const result = await chaserEngine.snoozeTask(req.params.id, hours);
    res.json({ success: true, data: result, message: `Snoozed for ${hours} hours` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tasks/:id/acknowledge ─────────────────────────────────────
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const result = await chaserEngine.acknowledgeTask(req.params.id, req.body.user_email);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tasks/bulk-chase ───────────────────────────────────────────
router.post('/bulk-chase', async (req, res) => {
  try {
    const { task_ids, triggered_by } = req.body;
    const results = [];

    for (const id of task_ids) {
      try {
        const r = await chaserEngine.manualChase(id, triggered_by || 'bulk_trigger');
        results.push({ id, success: true });
      } catch (e) {
        results.push({ id, success: false, error: e.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    res.json({
      success: true,
      message: `Chased ${successful}/${task_ids.length} tasks`,
      data: results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
