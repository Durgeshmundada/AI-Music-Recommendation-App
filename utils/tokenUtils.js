// ===============================
// Token Utilities
// ===============================

const jwt = require('jsonwebtoken');

/**
 * Generate access and refresh tokens for a user
 * @param {String} userId - The user's MongoDB ID
 * @returns {Object} - { accessToken, refreshToken }
 */
function generateTokens(userId) {
  const accessToken = jwt.sign(
    {
      id: userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '15m',
      issuer: 'music-recommender',
      audience: 'web',
      algorithm: 'HS256',
    }
  );

  const refreshToken = jwt.sign(
    {
      id: userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
      issuer: 'music-recommender',
      audience: 'web',
      algorithm: 'HS256',
    }
  );

  return { accessToken, refreshToken };
}

/**
 * Verify and decode JWT token
 * @param {String} token - JWT token
 * @param {String} secret - Secret key
 * @returns {Object} - Decoded token payload
 * @throws {Error} - If token is invalid
 */
function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret, {
      issuer: 'music-recommender',
      audience: 'web',
    });
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

module.exports = {
  generateTokens,
  verifyToken,
};
