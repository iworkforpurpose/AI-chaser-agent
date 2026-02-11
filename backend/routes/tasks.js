/**
 * Task Routes — /api/tasks
 */

const express = require('express');
const router = express.Router();
const db = require('../db/bolticClient');
const chaserEngine = require('../services/chaserEngine');
const dayjs = require('dayjs');
const scalar = (value) => (Array.isArray(value) ? value[0] : value);
const normalizeStatus = (value) => String(scalar(value) || '').toLowerCase();
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const normalizeTask = (task = {}) => ({
  ...task,
  status: normalizeStatus(task.status),
  priority: scalar(task.priority),
  assignee_email: scalar(task.assignee_email),
  assignee_name: scalar(task.assignee_name),
  due_date: scalar(task.due_date),
  completed_at: scalar(task.completed_at),
});
const isClosedStatus = (status) => ['done', 'cancelled'].includes(String(status || '').toLowerCase());

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

const parseDateParam = (value, boundary) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const parsed = DATE_ONLY_RE.test(raw)
    ? dayjs(boundary === 'start' ? `${raw}T00:00:00.000` : `${raw}T23:59:59.999`)
    : dayjs(raw);
  if (!parsed.isValid()) return null;
  return parsed.toISOString();
};

// ─── GET /api/tasks ─────────────────────────────────────────────────────────
// List all tasks with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, priority, assignee_email, overdue, due_today } = req.query;
    const filters = [];
    const now = dayjs();

    if (assignee_email) filters.push({ field: 'assignee_email', operator: 'eq', value: assignee_email });

    if (overdue === 'true') {
      filters.push({ field: 'due_date', operator: 'lt',  value: now.toISOString() });
    }

    if (due_today === 'true') {
      filters.push({ field: 'due_date', operator: 'gte', value: now.startOf('day').toISOString() });
      filters.push({ field: 'due_date', operator: 'lte', value: now.endOf('day').toISOString() });
    }

    let tasks = (await db.find('tasks', { filters, sort: 'due_date', limit: 200 }))
      .map(normalizeTask);

    if (status) {
      tasks = tasks.filter((task) => task.status === status);
    }

    if (priority) {
      tasks = tasks.filter((task) => task.priority === priority);
    }

    if (overdue === 'true') {
      tasks = tasks.filter((task) =>
        !isClosedStatus(task.status) && task.due_date && dayjs(task.due_date).isBefore(now)
      );
    }

    if (due_today === 'true') {
      tasks = tasks.filter((task) => task.due_date && dayjs(task.due_date).isSame(now, 'day'));
    }

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

    const tasks = (await db.find('tasks', {
      filters: [
        { field: 'chaser_enabled', operator: 'eq',  value: true },
        { field: 'due_date',       operator: 'gte', value: now.toISOString() },
        { field: 'due_date',       operator: 'lte', value: cutoff.toISOString() },
      ],
    }))
      .map(normalizeTask)
      .filter((task) => !isClosedStatus(task.status));

    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/overdue ───────────────────────────────────────────────
router.get('/overdue', async (req, res) => {
  try {
    const tasks = (await db.find('tasks', {
      filters: [
        { field: 'due_date',       operator: 'lt',  value: dayjs().toISOString() },
      ],
      sort: 'due_date',
    }))
      .map(normalizeTask)
      .filter((task) => !isClosedStatus(task.status));
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tasks/weekly-digest ─────────────────────────────────────────
// Used by Boltic's Monday cron workflow
router.get('/weekly-digest', async (req, res) => {
  try {
    const tasks = (await db.find('tasks', {
      limit: 500,
    }))
      .map(normalizeTask)
      .filter((task) => task.status !== 'done');

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

// ─── GET /api/tasks/completed ───────────────────────────────────────────────
// List completed tasks with optional member/date filters
router.get('/completed', async (req, res) => {
  try {
    const { assignee_email, date_from, date_to } = req.query;
    const normalizedAssigneeEmail = String(assignee_email || '').trim().toLowerCase();
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 50;

    const fromIso = parseDateParam(date_from, 'start');
    const toIso = parseDateParam(date_to, 'end');

    if (date_from && !fromIso) {
      return res.status(400).json({ success: false, error: 'Invalid date_from. Use ISO timestamp or YYYY-MM-DD' });
    }
    if (date_to && !toIso) {
      return res.status(400).json({ success: false, error: 'Invalid date_to. Use ISO timestamp or YYYY-MM-DD' });
    }
    if (fromIso && toIso && dayjs(fromIso).isAfter(dayjs(toIso))) {
      return res.status(400).json({ success: false, error: 'date_from must be before or equal to date_to' });
    }

    // Some Boltic filter combinations on newly-added date fields can behave inconsistently.
    // Fetch in pages and apply deterministic filtering in code.
    const pageSize = 200;
    const maxScan = 2000;
    let offset = 0;
    const rawTasks = [];
    while (rawTasks.length < maxScan) {
      const batch = await db.find('tasks', {
        sort: '-completed_at',
        limit: pageSize,
        offset,
      });
      if (!batch.length) break;
      rawTasks.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    const completedTasks = rawTasks
      .map(normalizeTask)
      .filter((task) => task.status === 'done' && task.completed_at && dayjs(task.completed_at).isValid())
      .filter((task) => (
        !normalizedAssigneeEmail
        || String(task.assignee_email || '').trim().toLowerCase() === normalizedAssigneeEmail
      ))
      .filter((task) => !fromIso || !dayjs(task.completed_at).isBefore(dayjs(fromIso)))
      .filter((task) => !toIso || !dayjs(task.completed_at).isAfter(dayjs(toIso)))
      .sort((a, b) => dayjs(b.completed_at).valueOf() - dayjs(a.completed_at).valueOf());

    const sliced = completedTasks.slice(0, limit);
    res.json({ success: true, data: sliced, count: sliced.length });
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
    if (normalizeStatus(payload.status) === 'done') {
      payload.completed_at = new Date().toISOString();
    }

    const task = await db.insert('tasks', payload);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/tasks/:id ─────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const updatedData = pickTaskFields(req.body);

    if (Object.keys(updatedData).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid task fields provided for update' });
    }

    // Status transitions own completed_at lifecycle on the server.
    if (Object.prototype.hasOwnProperty.call(updatedData, 'status')) {
      const task = await db.findById('tasks', req.params.id);
      const prevStatus = normalizeStatus(task?.status);
      const nextStatus = normalizeStatus(updatedData.status);
      updatedData.status = nextStatus;

      if (prevStatus !== 'done' && nextStatus === 'done') {
        updatedData.completed_at = new Date().toISOString();
        // Fire acknowledgment workflow async (don't await)
        chaserEngine.acknowledgeTask(req.params.id, req.body.updated_by || 'system').catch(console.error);
      } else if (prevStatus === 'done' && nextStatus !== 'done') {
        updatedData.completed_at = null;
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
