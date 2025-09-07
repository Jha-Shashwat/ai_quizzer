// src/routes/quiz.js
const express = require('express');
const { body, query, param } = require('express-validator');
const quizController = require('../controllers/quizController');
const { authenticateToken, rateLimitByUser } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const generateQuizValidation = [
  body('subject')
    .trim()
    .isIn(['mathematics', 'science', 'english', 'history', 'geography', 'physics', 'chemistry', 'biology', 'computer_science', 'general_knowledge'])
    .withMessage('Please provide a valid subject'),
  body('grade_level')
    .isInt({ min: 1, max: 12 })
    .withMessage('Grade level must be between 1 and 12'),
  body('total_questions')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Total questions must be between 1 and 50'),
  body('difficulty_level')
    .optional()
    .isIn(['easy', 'medium', 'hard', 'mixed', 'adaptive'])
    .withMessage('Invalid difficulty level'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('topics')
    .optional()
    .isArray()
    .withMessage('Topics must be an array'),
  body('time_limit_minutes')
    .optional()
    .isInt({ min: 1, max: 180 })
    .withMessage('Time limit must be between 1 and 180 minutes')
];

const updateQuizValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('time_limit_minutes')
    .optional()
    .isInt({ min: 1, max: 180 })
    .withMessage('Time limit must be between 1 and 180 minutes'),
  body('max_attempts')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max attempts must be between 1 and 10'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

const quizParamValidation = [
  param('id').isUUID().withMessage('Invalid quiz ID format')
];

const getQuizzesValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('subject')
    .optional()
    .isIn(['mathematics', 'science', 'english', 'history', 'geography', 'physics', 'chemistry', 'biology', 'computer_science', 'general_knowledge'])
    .withMessage('Invalid subject'),
  query('grade_level')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Grade level must be between 1 and 12'),
  query('difficulty_level')
    .optional()
    .isIn(['easy', 'medium', 'hard', 'mixed'])
    .withMessage('Invalid difficulty level'),
  query('sort_by')
    .optional()
    .isIn(['created_at', 'title', 'grade_level', 'subject', 'difficulty_level'])
    .withMessage('Invalid sort field'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Sort order must be ASC or DESC')
];

// Apply authentication to all routes
router.use(authenticateToken);

// Apply rate limiting to generation endpoint
router.use('/generate', rateLimitByUser(5, 60 * 1000)); // 5 generations per minute

// Routes
router.post('/generate', generateQuizValidation, quizController.generateQuiz);
router.get('/', getQuizzesValidation, quizController.getQuizzes);
router.get('/:id', quizParamValidation, quizController.getQuiz);
router.put('/:id', quizParamValidation, updateQuizValidation, quizController.updateQuiz);
router.delete('/:id', quizParamValidation, quizController.deleteQuiz);
router.get('/:id/stats', quizParamValidation, quizController.getQuizStats);

// Hint endpoint
router.get('/:quiz_id/questions/:question_id/hint', [
  param('quiz_id').isUUID().withMessage('Invalid quiz ID format'),
  param('question_id').isUUID().withMessage('Invalid question ID format')
], quizController.getHint);

module.exports = router;