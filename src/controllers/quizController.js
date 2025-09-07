// src/controllers/quizController.js
const { Quiz, Question, User, Submission } = require('../models');
const aiService = require('../services/aiService');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');

class QuizController {
  /**
   * Generate new quiz with AI
   */
  async generateQuiz(req, res) {
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

      const {
        subject,
        grade_level,
        total_questions = 10,
        difficulty_level,
        title,
        description,
        topics = [],
        time_limit_minutes
      } = req.body;

      const userId = req.user.id;

      // Get user's quiz history for adaptive difficulty
      const userHistory = await Submission.findAll({
        where: { user_id: userId },
        include: [{
          model: Quiz,
          as: 'quiz',
          where: { subject },
          required: true
        }],
        order: [['completed_at', 'DESC']],
        limit: 10
      });

      // Determine optimal difficulty using AI
      let finalDifficulty = difficulty_level;
      if (!difficulty_level || difficulty_level === 'adaptive') {
        const difficultyAnalysis = await aiService.adaptQuizDifficulty(
          userHistory.map(s => ({
            score_percentage: s.score_percentage,
            difficulty: s.quiz.difficulty_level
          })),
          subject,
          grade_level
        );
        finalDifficulty = difficultyAnalysis.difficulty;
      }

      // Generate AI questions
      console.log(`Generating ${total_questions} ${finalDifficulty} questions for ${subject}, grade ${grade_level}`);
      
      const aiQuestions = await aiService.generateQuizQuestions(
        subject,
        grade_level,
        finalDifficulty,
        parseInt(total_questions),
        topics
      );

      if (!aiQuestions || aiQuestions.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'Failed to generate questions',
          error: 'AI_GENERATION_FAILED'
        });
      }

      // Create quiz
      const quiz = await Quiz.create({
        title: title || `${subject.charAt(0).toUpperCase() + subject.slice(1)} Quiz - Grade ${grade_level}`,
        description: description || `AI-generated ${finalDifficulty} level quiz covering ${subject} topics.`,
        subject,
        grade_level: parseInt(grade_level),
        difficulty_level: finalDifficulty,
        total_questions: aiQuestions.length,
        time_limit_minutes: time_limit_minutes ? parseInt(time_limit_minutes) : null,
        created_by: userId,
        tags: topics,
        ai_generated: true,
        generation_prompt: `Subject: ${subject}, Grade: ${grade_level}, Difficulty: ${finalDifficulty}, Topics: ${topics.join(', ')}`
      });

      // Create questions
      const questions = await Question.bulkCreate(
        aiQuestions.map(q => ({
          ...q,
          quiz_id: quiz.id
        }))
      );

      // Fetch complete quiz with questions
      const completeQuiz = await Quiz.findByPk(quiz.id, {
        include: [{
          model: Question,
          as: 'questions',
          order: [['question_order', 'ASC']]
        }, {
          model: User,
          as: 'creator',
          attributes: ['id', 'username']
        }]
      });

      res.status(201).json({
        success: true,
        message: 'Quiz generated successfully',
        data: {
          quiz: completeQuiz,
          difficulty_analysis: finalDifficulty !== difficulty_level ? {
            recommended_difficulty: finalDifficulty,
            based_on_history: userHistory.length > 0
          } : null
        }
      });

    } catch (error) {
      console.error('Quiz generation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate quiz',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get quiz by ID
   */
  async getQuiz(req, res) {
    try {
      const { id } = req.params;
      const { include_answers = false } = req.query;

      const quiz = await Quiz.findByPk(id, {
        include: [{
          model: Question,
          as: 'questions',
          attributes: include_answers === 'true' ? undefined : {
            exclude: ['correct_answer', 'explanation']
          },
          order: [['question_order', 'ASC']]
        }, {
          model: User,
          as: 'creator',
          attributes: ['id', 'username']
        }]
      });

      if (!quiz) {
        return res.status(404).json({
          success: false,
          message: 'Quiz not found',
          error: 'QUIZ_NOT_FOUND'
        });
      }

      if (!quiz.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Quiz is not available',
          error: 'QUIZ_INACTIVE'
        });
      }

      res.json({
        success: true,
        message: 'Quiz retrieved successfully',
        data: { quiz }
      });

    } catch (error) {
      console.error('Get quiz error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve quiz',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get all quizzes with filters
   */
  async getQuizzes(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        subject,
        grade_level,
        difficulty_level,
        created_by,
        search,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      // Build where clause
      const whereClause = {
        is_active: true
      };

      if (subject) {
        whereClause.subject = subject;
      }

      if (grade_level) {
        whereClause.grade_level = parseInt(grade_level);
      }

      if (difficulty_level) {
        whereClause.difficulty_level = difficulty_level;
      }

      if (created_by) {
        whereClause.created_by = created_by;
      }

      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Calculate offset
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Fetch quizzes
      const { rows: quizzes, count: totalCount } = await Quiz.findAndCountAll({
        where: whereClause,
        include: [{
          model: User,
          as: 'creator',
          attributes: ['id', 'username']
        }],
        order: [[sort_by, sort_order.toUpperCase()]],
        limit: parseInt(limit),
        offset
      });

      res.json({
        success: true,
        message: 'Quizzes retrieved successfully',
        data: {
          quizzes,
          pagination: {
            current_page: parseInt(page),
            total_pages: Math.ceil(totalCount / parseInt(limit)),
            total_count: totalCount,
            per_page: parseInt(limit),
            has_next: parseInt(page) * parseInt(limit) < totalCount,
            has_prev: parseInt(page) > 1
          }
        }
      });

    } catch (error) {
      console.error('Get quizzes error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve quizzes',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Update quiz
   */
  async updateQuiz(req, res) {
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

      const { id } = req.params;
      const {
        title,
        description,
        time_limit_minutes,
        max_attempts,
        is_active,
        tags
      } = req.body;

      // Find quiz
      const quiz = await Quiz.findByPk(id);
      
      if (!quiz) {
        return res.status(404).json({
          success: false,
          message: 'Quiz not found',
          error: 'QUIZ_NOT_FOUND'
        });
      }

      // Check ownership
      if (quiz.created_by !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own quizzes',
          error: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      // Update quiz
      await quiz.update({
        title: title || quiz.title,
        description: description || quiz.description,
        time_limit_minutes: time_limit_minutes !== undefined ? time_limit_minutes : quiz.time_limit_minutes,
        max_attempts: max_attempts !== undefined ? max_attempts : quiz.max_attempts,
        is_active: is_active !== undefined ? is_active : quiz.is_active,
        tags: tags || quiz.tags
      });

      // Fetch updated quiz
      const updatedQuiz = await Quiz.findByPk(id, {
        include: [{
          model: Question,
          as: 'questions',
          order: [['question_order', 'ASC']]
        }, {
          model: User,
          as: 'creator',
          attributes: ['id', 'username']
        }]
      });

      res.json({
        success: true,
        message: 'Quiz updated successfully',
        data: { quiz: updatedQuiz }
      });

    } catch (error) {
      console.error('Update quiz error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update quiz',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Delete quiz
   */
  async deleteQuiz(req, res) {
    try {
      const { id } = req.params;

      // Find quiz
      const quiz = await Quiz.findByPk(id);
      
      if (!quiz) {
        return res.status(404).json({
          success: false,
          message: 'Quiz not found',
          error: 'QUIZ_NOT_FOUND'
        });
      }

      // Check ownership
      if (quiz.created_by !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own quizzes',
          error: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      // Soft delete by setting is_active to false
      await quiz.update({ is_active: false });

      res.json({
        success: true,
        message: 'Quiz deleted successfully'
      });

    } catch (error) {
      console.error('Delete quiz error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete quiz',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get hint for a specific question
   */
  async getHint(req, res) {
    try {
      const { quiz_id, question_id } = req.params;

      // Find question
      const question = await Question.findOne({
        where: {
          id: question_id,
          quiz_id
        },
        include: [{
          model: Quiz,
          as: 'quiz'
        }]
      });

      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found',
          error: 'QUESTION_NOT_FOUND'
        });
      }

      // Return existing hint or generate AI hint
      let hint = question.hint || question.ai_generated_hint;

      if (!hint) {
        try {
          hint = await aiService.generateHint(
            question.question_text,
            question.quiz.subject,
            question.quiz.grade_level
          );

          // Save generated hint
          await question.update({ ai_generated_hint: hint });
        } catch (aiError) {
          console.error('AI hint generation failed:', aiError);
          hint = 'Think about the key concepts related to this topic and what you learned in class.';
        }
      }

      res.json({
        success: true,
        message: 'Hint retrieved successfully',
        data: {
          hint,
          question_id: question.id
        }
      });

    } catch (error) {
      console.error('Get hint error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve hint',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get quiz statistics
   */
  async getQuizStats(req, res) {
    try {
      const { id } = req.params;

      // Get quiz submission statistics
      const submissions = await Submission.findAll({
        where: {
          quiz_id: id,
          status: 'completed'
        },
        attributes: ['score_percentage', 'time_taken_minutes', 'completed_at', 'user_id']
      });

      if (submissions.length === 0) {
        return res.json({
          success: true,
          message: 'Quiz statistics retrieved successfully',
          data: {
            total_attempts: 0,
            average_score: 0,
            highest_score: 0,
            lowest_score: 0,
            average_completion_time: 0,
            unique_participants: 0
          }
        });
      }

      const scores = submissions.map(s => s.score_percentage);
      const times = submissions.filter(s => s.time_taken_minutes).map(s => s.time_taken_minutes);
      const uniqueUsers = [...new Set(submissions.map(s => s.user_id))];

      const stats = {
        total_attempts: submissions.length,
        average_score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        highest_score: Math.max(...scores),
        lowest_score: Math.min(...scores),
        average_completion_time: times.length > 0 ? 
          Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100 : 0,
        unique_participants: uniqueUsers.length,
        score_distribution: {
          excellent: scores.filter(s => s >= 90).length,
          good: scores.filter(s => s >= 70 && s < 90).length,
          fair: scores.filter(s => s >= 50 && s < 70).length,
          poor: scores.filter(s => s < 50).length
        }
      };

      res.json({
        success: true,
        message: 'Quiz statistics retrieved successfully',
        data: stats
      });

    } catch (error) {
      console.error('Get quiz stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve quiz statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

module.exports = new QuizController();