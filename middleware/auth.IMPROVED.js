// ===============================
// Authentication Middleware
// Production-Ready Version
// ===============================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Authenticate user from JWT token (HttpOnly cookie)
exports.authenticate = async (req, res, next) => {
  try {
    // Token from HttpOnly cookie
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',
        message: 'No authentication token provided'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Ensure token type is correct
      if (decoded.type !== 'access') {
        return res.status(401).json({
          success: false,
          code: 'INVALID_TOKEN_TYPE',
          message: 'Invalid token type'
        });
      }

      // Get user
      const user = await User.findById(decoded.id);

      if (!user) {
        logger.warn(`Attempt to authenticate non-existent user: ${decoded.id}`);
        return res.status(401).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        });
      }

      // Attach user to request
      req.user = user;
      req.token = token;

      next();
    } catch (tokenError) {
      if (tokenError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired',
          expiredAt: tokenError.expiredAt
        });
      }

      if (tokenError.name === 'JsonWebTokenError') {
        logger.warn(`Invalid token attempted: ${tokenError.message}`);
        return res.status(401).json({
          success: false,
          code: 'INVALID_TOKEN',
          message: 'Invalid or malformed token'
        });
      }

      throw tokenError;
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      code: 'AUTH_ERROR',
      message: 'Authentication failed'
    });
  }
};

// Authorization - check if user has required roles
exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 'NOT_AUTHENTICATED',
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user._id}`);
      return res.status(403).json({
        success: false,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

// Optional authentication - attach user if authenticated, but doesn't fail if not
exports.optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      req.user = user;
    }
  } catch (error) {
    // Log but don't fail - optional middleware
    logger.debug('Optional auth failed (expected):', error.message);
  }

  next();
};
