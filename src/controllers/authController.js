// src/controllers/authController.js
const { User } = require('../models');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwtUtils');
const { validationResult } = require('express-validator');

class AuthController {
  /**
   * Mock login - accepts any username/password combination
   * In production, this would validate against actual credentials
   */
  async login(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { username, password, email } = req.body;

      // Mock authentication - accept any credentials
      let user = await User.findOne({ where: { username } });

      // If user doesn't exist, create a new one (mock scenario)
      if (!user) {
        user = await User.create({
          username,
          email: email || `${username}@example.com`,
          password, // Will be hashed by model hook
          grade_level: 8, // Default grade level
          is_active: true
        });
      } else {
        // Update last login
        await user.update({ last_login: new Date() });
      }

      // Generate tokens
      const accessToken = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      // Return success response
      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: user.toJSON(),
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer',
            expires_in: process.env.JWT_EXPIRES_IN || '7d'
          }
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Register new user
   */
  async register(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { username, email, password, grade_level, preferred_subjects } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        where: { username }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists',
          error: 'USERNAME_EXISTS'
        });
      }

      // Check if email already exists (if provided)
      if (email) {
        const existingEmail = await User.findOne({
          where: { email }
        });

        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: 'Email already exists',
            error: 'EMAIL_EXISTS'
          });
        }
      }

      // Create new user
      const user = await User.create({
        username,
        email,
        password, // Will be hashed by model hook
        grade_level: grade_level || 8,
        preferred_subjects: preferred_subjects || [],
        is_active: true
      });

      // Generate tokens
      const accessToken = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: user.toJSON(),
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer',
            expires_in: process.env.JWT_EXPIRES_IN || '7d'
          }
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(req, res) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
          error: 'NO_REFRESH_TOKEN'
        });
      }

      // Verify refresh token
      const decoded = verifyRefreshToken(refresh_token);
      
      // Find user
      const user = await User.findByPk(decoded.id);
      if (!user || !user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive',
          error: 'USER_NOT_FOUND'
        });
      }

      // Generate new access token
      const newAccessToken = generateToken(user);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: process.env.JWT_EXPIRES_IN || '7d'
        }
      });

    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
        error: 'INVALID_REFRESH_TOKEN'
      });
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req, res) {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        message: 'Profile retrieved successfully',
        data: { user: user.toJSON() }
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve profile',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, grade_level, preferred_subjects } = req.body;
      const userId = req.user.id;

      // Check if email is being updated and if it already exists
      if (email && email !== req.user.email) {
        const existingUser = await User.findOne({
          where: { 
            email,
            id: { [require('sequelize').Op.ne]: userId }
          }
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email already exists',
            error: 'EMAIL_EXISTS'
          });
        }
      }

      // Update user profile
      const [updatedRowsCount] = await User.update({
        email,
        grade_level,
        preferred_subjects
      }, {
        where: { id: userId },
        returning: true
      });

      if (updatedRowsCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      // Fetch updated user
      const updatedUser = await User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user: updatedUser.toJSON() }
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Change user password
   */
  async changePassword(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { current_password, new_password } = req.body;
      const userId = req.user.id;

      // Find user with password
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      // Verify current password (in mock mode, skip verification)
      if (process.env.NODE_ENV !== 'development') {
        const isCurrentPasswordValid = await user.validatePassword(current_password);
        if (!isCurrentPasswordValid) {
          return res.status(400).json({
            success: false,
            message: 'Current password is incorrect',
            error: 'INVALID_CURRENT_PASSWORD'
          });
        }
      }

      // Update password
      await user.update({ password: new_password });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change password',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Logout user (in a real app, you might blacklist the token)
   */
  async logout(req, res) {
    try {
      // Update last login time
      await User.update(
        { last_login: new Date() },
        { where: { id: req.user.id } }
      );

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Validate token endpoint
   */
  async validateToken(req, res) {
    try {
      // If we reach here, token is valid (middleware passed)
      res.json({
        success: true,
        message: 'Token is valid',
        data: {
          user: req.user.toJSON(),
          token_expires_at: req.tokenExpiresAt || null
        }
      });

    } catch (error) {
      console.error('Token validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Token validation failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

module.exports = new AuthController();