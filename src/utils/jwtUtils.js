// src/utils/jwtUtils.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
const generateToken = (user) => {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    grade_level: user.grade_level
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'ai-quizzer-backend',
    audience: 'ai-quizzer-users'
  });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'ai-quizzer-backend',
      audience: 'ai-quizzer-users'
    });
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Decode JWT token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token payload
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    throw new Error('Invalid token format');
  }
};

/**
 * Get token from request headers
 * @param {Object} req - Express request object
 * @returns {string|null} - JWT token or null
 */
const extractTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Check for Bearer token format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check for simple token format
  return authHeader;
};

/**
 * Check if token is expired
 * @param {Object} decodedToken - Decoded JWT token
 * @returns {boolean} - True if expired
 */
const isTokenExpired = (decodedToken) => {
  if (!decodedToken.exp) {
    return true;
  }
  
  const currentTime = Math.floor(Date.now() / 1000);
  return decodedToken.exp < currentTime;
};

/**
 * Generate refresh token (longer expiry)
 * @param {Object} user - User object
 * @returns {string} - Refresh token
 */
const generateRefreshToken = (user) => {
  const payload = {
    id: user.id,
    username: user.username,
    type: 'refresh'
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '30d',
    issuer: 'ai-quizzer-backend',
    audience: 'ai-quizzer-refresh'
  });
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object} - Decoded token payload
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'ai-quizzer-backend',
      audience: 'ai-quizzer-refresh'
    });

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
  extractTokenFromRequest,
  isTokenExpired,
  generateRefreshToken,
  verifyRefreshToken
};