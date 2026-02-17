const jwt = require('jsonwebtoken');
const db = require('../db/bolticClient');
const authLogger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'chaser-secret-key-123';

/**
 * Auth Middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check cookies
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } 
    // 2. Check Authorization header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      // Don't log failure for every missing token as it could be just a landing page hit, 
      // but you might want to if it's a known protected route.
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      authLogger.logFailure(req, 'token_invalid', err.message);
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }
    
    // Find user in Boltic DB
    // Dropdown fields might be returned as arrays, so we normalize
    const users = await db.find('users', {
      filters: [{ field: 'email', operator: 'eq', value: decoded.email }]
    });

    if (!users || users.length === 0) {
      authLogger.logFailure(req, 'user_not_found', 'User in token no longer exists', decoded.email);
      return res.status(401).json({ success: false, error: 'Unauthorized: User no longer exists' });
    }

    const user = users[0];
    
    // Attach user info to request
    req.user = {
      id: user.id,
      email: Array.isArray(user.email) ? user.email[0] : user.email,
      name: Array.isArray(user.name) ? user.name[0] : user.name,
      role: Array.isArray(user.role) ? user.role[0] : user.role,
    };

    next();
  } catch (err) {
    authLogger.error('AuthMiddleware fatal error', { error: err.message, stack: err.stack });
    return res.status(401).json({ success: false, error: 'Unauthorized: Authentication error' });
  }
};

/**
 * Role-based access control middleware
 */
const authorize = (roles = []) => {
  if (typeof roles === 'string') roles = [roles];

  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      authLogger.logFailure(req, 'insufficient_permissions', `Required roles: ${roles.join(',')}`, req.user?.email);
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authMiddleware, authorize };
