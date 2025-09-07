// src/routes/submission.js
const express = require('express');
const { body, query, param } = require('express-validator');
const submissionController = require('../controllers/submissionController');
const { authenticateToken, rateLimitByUser } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const submitQuizValidation = [
  param('submission_id').isUUID().withMessage('Invalid submission ID format'),
  body('answers')
    .isArray({ min: 1 })
    .withMessage('Answers array is required and must not be empty'),
  body('answers.*.question_id')
    .isUUID()
    .withMessage('Each answer must have a valid question ID'),
  body('answers.*.answer')
    .trim()
    .notEmpty()
    .withMessage('Each answer must have a response'),
  body('answers.*.time_taken')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Time taken must be a non-negative integer'),
  body('answers.*.hint_used')
    .optional()
    .isBoolean()
    .withMessage('Hint used must be a boolean')
];

const quizHistoryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('grade')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Grade must be between 1 and 12'),
  query('subject')
    .optional()
    .isIn(['mathematics', 'science', 'english', 'history', 'geography', 'physics', 'chemistry', 'biology', 'computer_science', 'general_knowledge'])
    .withMessage('Invalid subject'),
  query('marks_min')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Minimum marks must be between 0 and 100'),
  query('marks_max')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Maximum marks must be between 0 and 100'),
  query('from_date')
    .optional()
    .isISO8601()
    .withMessage('From date must be in valid ISO format (YYYY-MM-DD)'),
  query('to_date')
    .optional()
    .isISO8601()
    .withMessage('To date must be in valid ISO format (YYYY-MM-DD)'),
  query('status')
    .optional()
    .isIn(['completed', 'in_progress', 'abandoned', 'expired'])
    .withMessage('Invalid status')
];

const paramValidation = [
  param('quiz_id').isUUID().withMessage('Invalid quiz ID format'),
  param('submission_id').isUUID().withMessage('Invalid submission ID format')
];

// Apply authentication to all routes
router.use(authenticateToken);

// Apply rate limiting to submission endpoint
router.use('/*/submit', rateLimitByUser(10, 60 * 1000)); // 10 submissions per minute

// Routes
router.post('/quiz/:quiz_id/start', 
  param('quiz_id').isUUID().withMessage('Invalid quiz ID format'),
  submissionController.startQuiz
);

router.post('/:submission_id/submit', 
  submitQuizValidation, 
  submissionController.submitQuiz
);

router.get('/history', 
  quizHistoryValidation, 
  submissionController.getQuizHistory
);

router.get('/:submission_id', 
  param('submission_id').isUUID().withMessage('Invalid submission ID format'),
  submissionController.getSubmission
);

router.get('/quiz/:quiz_id/retry', 
  param('quiz_id').isUUID().withMessage('Invalid quiz ID format'),
  submissionController.retryQuiz
);

router.get('/performance/summary', 
  submissionController.getPerformanceSummary
);

module.exports = router;