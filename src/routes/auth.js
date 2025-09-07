// src/routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const loginValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('grade_level')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Grade level must be between 1 and 12'),
  body('preferred_subjects')
    .optional()
    .isArray()
    .withMessage('Preferred subjects must be an array')
];

const updateProfileValidation = [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('grade_level')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Grade level must be between 1 and 12'),
  body('preferred_subjects')
    .optional()
    .isArray()
    .withMessage('Preferred subjects must be an array')
];

const changePasswordValidation = [
  body('current_password')
    .notEmpty()
    .withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
];

// Routes
router.post('/login', loginValidation, authController.login);
router.post('/register', registerValidation, authController.register);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticateToken, authController.logout);
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, updateProfileValidation, authController.updateProfile);
router.put('/change-password', authenticateToken, changePasswordValidation, authController.changePassword);
router.get('/validate-token', authenticateToken, authController.validateToken);

module.exports = router;