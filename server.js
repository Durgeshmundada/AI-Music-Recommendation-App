// ===============================
// Music Recommendation System Backend Server
// Production-Ready Version
// ===============================

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('mongo-sanitize');

// Load environment variables FIRST
dotenv.config();

// ===============================
// CONFIGURATION VALIDATION
// ===============================

const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'NODE_ENV',
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
});

// ===============================
// LOGGING SETUP
// ===============================

const logger = require('./utils/logger');
const cache = require('./utils/cache');

// ===============================
// DATABASE CONNECTION
// ===============================

const connectDB = require('./config/db');

// ===============================
// EXPRESS APP INITIALIZATION
// ===============================

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
app.set('trust proxy', 1);

// ===============================
// SECURITY MIDDLEWARE
// ===============================

// Helmet.js - Set security headers
app.use(helmet({ referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, contentSecurityPolicy: { directives: {
  scriptSrc: ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
  frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
  mediaSrc: ["'self'", 'https://incompetech.com', 'https://*.incompetech.com', 'https://*.mzstatic.com', 'https://audio-ssl.itunes.apple.com'],
  imgSrc: ["'self'", 'data:', 'https:'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
} } }));

// CORS - Whitelist specific origins
function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().replace(/\/$/, '');
}

function buildAllowedOrigins() {
  const source = [
    process.env.FRONTEND_URL,
    process.env.ALLOWED_ORIGINS,
    'http://localhost:5173',
  ]
    .filter(Boolean)
    .join(',');

  const set = new Set();
  source
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
    .forEach((origin) => {
      set.add(origin);
      if (origin.includes('localhost')) {
        set.add(origin.replace('localhost', '127.0.0.1'));
      }
      if (origin.includes('127.0.0.1')) {
        set.add(origin.replace('127.0.0.1', 'localhost'));
      }
    });

  return set;
}

const allowedOrigins = buildAllowedOrigins();

app.use(cors((req, done) => done(null, {
  origin: (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);
    let sameOrigin = false;
    try {
      const url = new URL(normalizedOrigin);
      sameOrigin = ['http:', 'https:'].includes(url.protocol) && url.host === req.get('host');
    } catch { /* An absent or invalid Origin is handled below. */ }
    if (!normalizedOrigin || sameOrigin || allowedOrigins.has(normalizedOrigin)) {
      callback(null, true);
    } else {
      callback(Object.assign(new Error('Not allowed by CORS'), { statusCode: 403 }));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
})));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Data sanitization against NoSQL injection (if mongoSanitize is available)
app.use((req, _res, next) => {
  req.body = mongoSanitize(req.body);
  req.query = mongoSanitize(req.query);
  next();
});

// Strict content-length validation
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (req.path === '/api/songs/upload' && req.method === 'POST' && req.is('multipart/form-data')) return next();
  if (contentLength > 1024 * 1024) { // 1MB max
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds maximum allowed size'
    });
  }
  next();
});

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: {
    success: false,
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Too many attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

const challengeClaimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: {
    success: false,
    code: 'TOO_MANY_CLAIMS',
    message: 'Too many claim attempts. Please retry shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id || req.ip,
});

const authRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: {
    success: false,
    code: 'TOO_MANY_RECOVERY_ATTEMPTS',
    message: 'Too many recovery attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

const registerLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // 3 registrations per day
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip,
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 searches per minute
  keyGenerator: (req) => req.user?._id || req.ip,
});

// ===============================
// REQUEST LOGGING
// ===============================

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?._id,
      ip: req.ip,
    });
  });

  next();
});

// ===============================
// ENFORCE HTTPS IN PRODUCTION
// ===============================

if (NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });

  // HSTS header
  app.use((req, res, next) => {
    res.header('Strict-Transport-Security',
      'max-age=31536000; includeSubDomains');
    next();
  });
}

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Serve frontend build when available (single-binary sharing mode)
const clientDistPath = path.join(__dirname, 'client', 'dist');
const hasClientDist = fs.existsSync(clientDistPath);
if (hasClientDist) {
  app.use(express.static(clientDistPath));
}

// ===============================
// ROUTES
// ===============================

try {
  const authRoutes = require('./routes/authRoutes');
  const songRoutes = require('./routes/songRoutes');
  const recommendationRoutes = require('./routes/recommendationRoutes');
  const playlistRoutes = require('./routes/playlistRoutes');

  app.use('/api/auth/register', registerLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
  app.use('/api/auth/forgot-password', authRecoveryLimiter);
  app.use('/api/auth/reset-password', authRecoveryLimiter);
  app.use('/api/auth/verify-email/request', authRecoveryLimiter);
  app.use('/api/auth/challenge/claim', challengeClaimLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/songs', searchLimiter, songRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/playlists', playlistRoutes);

  logger.info('All routes loaded successfully');
} catch (err) {
  logger.error('Failed to load routes:', err.message);
  throw err;
}

// ===============================
// HEALTH CHECK
// ===============================

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: 'unknown',
  };

  try {
    const mongoose = require('mongoose');
    const dbStatus = mongoose.connection.readyState;
    health.database = dbStatus === 1 ? 'ok' : 'disconnected';
    if (dbStatus !== 1) {
      health.status = 'degraded';
    }
  } catch (error) {
    health.status = 'degraded';
    health.database = 'error';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API Routes List
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Music Recommendation API',
    version: '1.0.0',
    status: 'online',
  });
});

// ===============================
// 404 HANDLER
// ===============================

if (hasClientDist) {
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Route ${req.originalUrl} not found`,
  });
});

// ===============================
// GLOBAL ERROR HANDLER
// ===============================

app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't expose error details in production
  const message = NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(err.statusCode || 500).json({
    success: false,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ===============================
// SERVER START
// ===============================

let server = null;

async function startServer() {
  await connectDB();
  await cache.init();

  server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (${NODE_ENV})`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
  });

  return server;
}

// ===============================
// GRACEFUL SHUTDOWN
// ===============================

const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(async () => {
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      await cache.close();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown - timeout reached');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  gracefulShutdown();
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  gracefulShutdown();
});

if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Database connection failed:', err);
    process.exit(1);
  });
}

module.exports = app;
