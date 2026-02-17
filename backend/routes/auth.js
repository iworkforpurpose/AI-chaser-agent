const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/bolticClient');
const { authMiddleware } = require('../services/authMiddleware');
const authLogger = require('../services/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'chaser-secret-key-123';
const JWT_EXPIRES_IN = '7d';

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 */
router.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  try {
    if (!email || !name || !password) {
      authLogger.logFailure(req, 'register_missing_fields', 'Missing required fields', email);
      return res.status(400).json({ success: false, error: 'Please provide email, name, and password' });
    }

    // Check if user already exists
    const existing = await db.find('users', {
      filters: [{ field: 'email', operator: 'eq', value: email.toLowerCase() }]
    });

    if (existing.length > 0) {
      authLogger.logFailure(req, 'register_duplicate_email', 'User already exists', email);
      return res.status(400).json({ success: false, error: 'User with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user in Boltic DB
    const newUser = await db.insert('users', {
      email: email.toLowerCase(),
      name,
      password_hash,
      role: 'user',
      active: true,
      timezone: 'UTC'
    });

    authLogger.logSuccess(req, 'register_success', email);
    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (err) {
    authLogger.logFailure(req, 'register_error', err.message, email);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      authLogger.logFailure(req, 'login_missing_fields', 'Missing credentials', email);
      return res.status(400).json({ success: false, error: 'Please provide email and password' });
    }

    // Find user
    const users = await db.find('users', {
      filters: [{ field: 'email', operator: 'eq', value: email.toLowerCase() }]
    });

    if (users.length === 0) {
      authLogger.logFailure(req, 'login_invalid_email', 'Invalid credentials', email);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = users[0];
    const passwordHash = Array.isArray(user.password_hash) ? user.password_hash[0] : user.password_hash;

    if (!passwordHash) {
      authLogger.logFailure(req, 'login_no_password', 'Account not set up for password login', email);
      return res.status(401).json({ success: false, error: 'Account not set up for password login' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, passwordHash);
    if (!isMatch) {
      authLogger.logFailure(req, 'login_invalid_password', 'Invalid credentials', email);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Create JWT
    const payload = {
      id: user.id,
      email: Array.isArray(user.email) ? user.email[0] : user.email
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'
    });

    authLogger.logSuccess(req, 'login_success', email);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: Array.isArray(user.email) ? user.email[0] : user.email,
        name: Array.isArray(user.name) ? user.name[0] : user.name,
        role: Array.isArray(user.role) ? user.role[0] : user.role,
      }
    });
  } catch (err) {
    authLogger.logFailure(req, 'login_error', err.message, email);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 */
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user & clear cookie
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
