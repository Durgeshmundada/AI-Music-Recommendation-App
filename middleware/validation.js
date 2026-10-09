// ===============================
// Input Validation Middleware
// ===============================

const { body, query, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Constants
const CONSTRAINTS = {
  PASSWORD_MIN_LENGTH: 12,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 255,
  MAX_LIMIT: 100,
  MAX_SKIP: 500000,
  VALID_GENRES: ['pop', 'rock', 'hip-hop', 'jazz', 'classical', 'electronic', 'country', 'r&b'],
  VALID_MOODS: ['happy', 'sad', 'energetic', 'calm', 'party', 'romantic', 'workout', 'focus'],
};

// Validation rules for registration
exports.validateRegister = () => [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),

  body('password')
    .isLength({ min: CONSTRAINTS.PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${CONSTRAINTS.PASSWORD_MIN_LENGTH} characters`)
    .matches(/[A-Z]/)
    .withMessage('Password must contain uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain special character'),

  body('name')
    .trim()
    .isLength({ min: CONSTRAINTS.NAME_MIN_LENGTH, max: CONSTRAINTS.NAME_MAX_LENGTH })
    .withMessage(`Name must be ${CONSTRAINTS.NAME_MIN_LENGTH}-${CONSTRAINTS.NAME_MAX_LENGTH} characters`)
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage('Name contains invalid characters'),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Invalid phone format'),
];

// Validation rules for login
exports.validateLogin = () => [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),

  body('password')
    .isLength({ min: 1 })
    .withMessage('Password required'),
];

// Validation rules for password change
exports.validatePasswordChange = () => [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password required'),

  body('newPassword')
    .isLength({ min: CONSTRAINTS.PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${CONSTRAINTS.PASSWORD_MIN_LENGTH} characters`)
    .matches(/[A-Z]/)
    .withMessage('Password must contain uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain special character'),

  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
];

// Validation rules for pagination
exports.validatePagination = () => [
  query('limit')
    .optional()
    .isInt({ min: 1, max: CONSTRAINTS.MAX_LIMIT })
    .toInt()
    .withMessage(`Limit must be between 1 and ${CONSTRAINTS.MAX_LIMIT}`),

  query('skip')
    .optional()
    .isInt({ min: 0, max: CONSTRAINTS.MAX_SKIP })
    .toInt()
    .withMessage(`Skip must be between 0 and ${CONSTRAINTS.MAX_SKIP}`),
];

// Validation rules for filtering
exports.validateSongFilters = () => [
  query('genre')
    .optional()
    .isIn(CONSTRAINTS.VALID_GENRES)
    .withMessage('Invalid genre'),

  query('mood')
    .optional()
    .isIn(CONSTRAINTS.VALID_MOODS)
    .withMessage('Invalid mood'),
];

// Validation rules for search
exports.validateSearch = () => [
  query('q')
    .trim()
    .isLength({ min: 1, max: 100 })
    .escape()
    .withMessage('Search query must be 1-100 characters'),
];

// Validation rules for mongo ID
exports.validateMongoId = (paramName = 'id') => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`),
];

// Middleware to handle validation errors
exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    logger.warn('Validation error', {
      path: req.path,
      errors: errors.array(),
    });

    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }

  next();
};

module.exports.CONSTRAINTS = CONSTRAINTS;
