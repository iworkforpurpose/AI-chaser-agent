/**
 * Chaser Rules Routes — /api/chaser-rules
 */
const express = require('express');
const router = express.Router();
const db = require('../db/bolticClient');

router.get('/', async (req, res) => {
  try {
    const rules = await db.find('chaser_rules', { sort: 'created_at' });
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const rule = await db.insert('chaser_rules', req.body);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const rule = await db.update('chaser_rules', req.params.id, req.body);
    res.json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.delete('chaser_rules', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
