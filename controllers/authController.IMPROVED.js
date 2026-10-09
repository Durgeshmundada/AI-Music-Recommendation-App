// ===============================
// Authentication Controller
// Production-Ready Version
// ===============================

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { generateTokens } = require('../utils/tokenUtils');

// Register new user
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'This email is already registered'
      });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      phone,
      password,
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Set secure, HttpOnly cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
      domain: process.env.COOKIE_DOMAIN,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh',
      domain: process.env.COOKIE_DOMAIN,
    });

    logger.info(`User registered: ${user._id}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Registration error:', {
      error: error.message,
      email: req.body.email,
    });

    // Handle specific Mongoose errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_EMAIL',
        message: 'Email already in use'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      code: 'REGISTRATION_FAILED',
      message: 'Failed to complete registration'
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user and select password field
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      logger.warn(`Login attempt with non-existent email: ${email}`);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    // Check password
    const passwordMatch = await user.matchPassword(password);
    if (!passwordMatch) {
      logger.warn(`Login attempt with wrong password for: ${email}`);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Set secure, HttpOnly cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
      domain: process.env.COOKIE_DOMAIN,
    });

    logger.info(`User logged in: ${user._id}`);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);

    res.status(500).json({
      success: false,
      code: 'LOGIN_FAILED',
      message: 'Failed to complete login'
    });
  }
};

// Refresh access token
exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        code: 'NO_REFRESH_TOKEN',
        message: 'Refresh token required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    const tokens = generateTokens(user._id);

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });

    res.json({
      success: true,
      message: 'Token refreshed',
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);

    res.status(401).json({
      success: false,
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token'
    });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    // Clear cookies
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      domain: process.env.COOKIE_DOMAIN,
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      domain: process.env.COOKIE_DOMAIN,
    });

    logger.info(`User logged out: ${req.user?._id}`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);

    res.status(500).json({
      success: false,
      code: 'LOGOUT_FAILED',
      message: 'Failed to logout'
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user._id}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);

    res.status(500).json({
      success: false,
      code: 'PASSWORD_CHANGE_FAILED',
      message: 'Failed to change password'
    });
  }
};
