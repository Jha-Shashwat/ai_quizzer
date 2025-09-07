// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const submissionRoutes = require('./routes/submission');

// Import middleware
const { authenticateToken } = require('./middleware/auth');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CORS_ORIGIN || 'http://localhost:3001',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3001'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(logFormat));

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    error: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all requests
app.use(globalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI Quizzer API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    message: 'AI Quizzer Backend API',
    version: '1.0.0',
    description: 'AI-powered Quiz Application with authentication, quiz management, AI-based evaluation, and score tracking',
    author: 'Your Name',
    endpoints: {
      auth: '/api/auth',
      quizzes: '/api/quiz',
      submissions: '/api/submission',
      health: '/health'
    },
    features: [
      'JWT Authentication',
      'AI-powered Quiz Generation (Groq)',
      'Adaptive Difficulty',
      'Performance Analytics',
      'Hint Generation',
      'Improvement Suggestions',
      'Quiz History & Filtering',
      'Retry Mechanism'
    ]
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/submission', submissionRoutes);

// Test AI connection endpoint (protected)
app.get('/api/test/ai', authenticateToken, async (req, res) => {
  try {
    const aiService = require('./services/aiService');
    const testResult = await aiService.testConnection();
    res.json({
      success: true,
      message: 'AI service connection test',
      data: testResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'AI service connection failed',
      error: error.message
    });
  }
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: 'ROUTE_NOT_FOUND',
    requested_url: req.originalUrl,
    method: req.method,
    available_routes: {
      auth: '/api/auth',
      quizzes: '/api/quiz',
      submissions: '/api/submission',
      health: '/health',
      info: '/api/info'
    }
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // CORS error
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      error: 'CORS_ERROR'
    });
  }

  // JSON parsing error
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      error: 'INVALID_JSON'
    });
  }

  // Validation error
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: 'VALIDATION_ERROR',
      details: error.message
    });
  }

  // Database error
  if (error.name === 'SequelizeError' || error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Database operation failed',
      error: 'DATABASE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please check your request data'
    });
  }

  // JWT error
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: 'INVALID_TOKEN'
    });
  }

  // Default error
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    error: error.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

module.exports = app;