const winston = require('winston');
const path = require('path');
const crypto = require('crypto');

/**
 * Mask PII (Email) for GDPR compliance
 * Example: john.doe@example.com -> j***e@example.com (or hash it)
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return 'anonymous';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `***@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
};

/**
 * Hash user identifier for internal tracking without exposing PII
 */
const hashIdentifier = (id) => {
  if (!id) return 'unknown';
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
};

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'chaser-auth-service' },
  transports: [
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/combined.log') 
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/error.log'), 
      level: 'error' 
    }),
    // Write auth-specific logs to auth.log
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/auth.log'),
      label: 'auth'
    })
  ],
});

// If we're not in production then log to the `console`
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

/**
 * Specialized Auth Logger helper
 */
const authLogger = {
  logFailure: (req, type, error, identifier = null) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const path = req.originalUrl || req.url;
    
    // Identifier could be an email or a user ID
    // If it's an email, we mask it. If it's a ID, we hash it or keep as is if it's not PII.
    let maskedIdentifier = 'anonymous';
    if (identifier) {
      maskedIdentifier = identifier.includes('@') ? maskEmail(identifier) : hashIdentifier(identifier);
    }

    logger.warn({
      category: 'auth_failure',
      type,
      ip,
      path,
      identifier: maskedIdentifier,
      error: error instanceof Error ? error.message : error,
      userAgent,
      timestamp: new Date().toISOString()
    });
  },

  logSuccess: (req, type, identifier = null) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const path = req.originalUrl || req.url;
    
    let maskedIdentifier = 'anonymous';
    if (identifier) {
      maskedIdentifier = identifier.includes('@') ? maskEmail(identifier) : hashIdentifier(identifier);
    }

    logger.info({
      category: 'auth_success',
      type,
      ip,
      path,
      identifier: maskedIdentifier,
      timestamp: new Date().toISOString()
    });
  },

  error: (message, meta = {}) => {
    logger.error(message, meta);
  },

  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },

  info: (message, meta = {}) => {
    logger.info(message, meta);
  }
};

module.exports = authLogger;
