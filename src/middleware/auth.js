// src/middleware/auth.js
const { verifyToken, extractTokenFromRequest } = require('../utils/jwtUtils');
const { User } = require('../models');

/**
 * Authentication middleware to verify JWT tokens
 */
const authenticateToken = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required',
        error: 'NO_TOKEN'
      });
    }

    // Verify the token
    const decoded = verifyToken(token);
    
    // Find user in database
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated',
        error: 'USER_INACTIVE'
      });
    }

    // Attach user to request object
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    
    let errorMessage = 'Invalid or expired token';
    let errorCode = 'INVALID_TOKEN';
    
    if (error.message.includes('expired')) {
      errorMessage = 'Token has expired';
      errorCode = 'TOKEN_EXPIRED';
    } else if (error.message.includes('malformed')) {
      errorMessage = 'Token is malformed';
      errorCode = 'MALFORMED_TOKEN';
    }
    
    return res.status(401).json({
      success: false,
      message: errorMessage,
      error: errorCode
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    
    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findByPk(decoded.id);
      
      if (user && user.is_active) {
        req.user = user;
        req.token = token;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Role-based authorization middleware
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'NO_AUTH'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

/**
 * Check if user owns resource or is admin
 */
const authorizeOwnership = (resourceUserField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'NO_AUTH'
      });
    }

    // Admin can access all resources
    if (req.user.role === 'admin') {
      return next();
    }

    // Check ownership based on resource
    const resourceUserId = req.resource && req.resource[resourceUserField];
    const userIdParam = req.params.userId;
    const userIdFromPath = req.params.id; // For routes like /users/:id

    if (resourceUserId && resourceUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own resources',
        error: 'OWNERSHIP_REQUIRED'
      });
    }

    if (userIdParam && userIdParam !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own resources',
        error: 'OWNERSHIP_REQUIRED'
      });
    }

    if (userIdFromPath && userIdFromPath !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own resources',
        error: 'OWNERSHIP_REQUIRED'
      });
    }

    next();
  };
};

/**
 * Rate limiting for authenticated users
 */
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get user's request history
    let userHistory = userRequests.get(userId) || [];
    
    // Remove old requests outside the window
    userHistory = userHistory.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (userHistory.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    // Add current request
    userHistory.push(now);
    userRequests.set(userId, userHistory);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - userHistory.length),
      'X-RateLimit-Reset': new Date(windowStart + windowMs).toISOString()
    });

    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  authorizeRoles,
  authorizeOwnership,
  rateLimitByUser
};