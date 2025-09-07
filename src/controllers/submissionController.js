// src/controllers/submissionController.js
const { Submission, Answer, Quiz, Question, User } = require('../models');
const aiService = require('../services/aiService');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');

class SubmissionController {
  /**
   * Start a new quiz attempt
   */
  async startQuiz(req, res) {
    try {
      const { quiz_id } = req.params;
      const userId = req.user.id;

      // Find quiz
      const quiz = await Quiz.findByPk(quiz_id, {
        include: [{
          model: Question,
          as: 'questions',
          order: [['question_order', 'ASC']]
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
        return res.status(400).json({
          success: false,
          message: 'Quiz is not available',
          error: 'QUIZ_INACTIVE'
        });
      }

      // Check attempt limit
      const existingAttempts = await Submission.count({
        where: {
          user_id: userId,
          quiz_id,
          status: { [Op.in]: ['completed', 'in_progress'] }
        }
      });

      if (existingAttempts >= quiz.max_attempts) {
        return res.status(400).json({
          success: false,
          message: `Maximum attempts (${quiz.max_attempts}) reached for this quiz`,
          error: 'MAX_ATTEMPTS_REACHED'
        });
      }

      // Check for existing in-progress submission
      const inProgressSubmission = await Submission.findOne({
        where: {
          user_id: userId,
          quiz_id,
          status: 'in_progress'
        }
      });

      if (inProgressSubmission) {
        return res.json({
          success: true,
          message: 'Quiz already in progress',
          data: {
            submission_id: inProgressSubmission.id,
            started_at: inProgressSubmission.started_at,
            time_limit: quiz.time_limit_minutes
          }
        });
      }

      // Create new submission
      const submission = await Submission.create({
        user_id: userId,
        quiz_id,
        attempt_number: existingAttempts + 1,
        total_questions: quiz.questions.length,
        total_points_possible: quiz.questions.reduce((sum, q) => sum + q.points, 0),
        status: 'in_progress'
      });

      res.status(201).json({
        success: true,
        message: 'Quiz started successfully',
        data: {
          submission_id: submission.id,
          quiz_title: quiz.title,
          total_questions: quiz.total_questions,
          time_limit_minutes: quiz.time_limit_minutes,
          started_at: submission.started_at,
          attempt_number: submission.attempt_number
        }
      });

    } catch (error) {
      console.error('Start quiz error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start quiz',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Submit quiz answers and get evaluated score
   */
  async submitQuiz(req, res) {
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

      const { submission_id } = req.params;
      const { answers } = req.body; // Array of {question_id, answer, time_taken}
      const userId = req.user.id;

      // Find submission
      const submission = await Submission.findOne({
        where: {
          id: submission_id,
          user_id: userId
        },
        include: [{
          model: Quiz,
          as: 'quiz',
          include: [{
            model: Question,
            as: 'questions',
            order: [['question_order', 'ASC']]
          }]
        }]
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: 'Submission not found',
          error: 'SUBMISSION_NOT_FOUND'
        });
      }

      if (submission.status !== 'in_progress') {
        return res.status(400).json({
          success: false,
          message: 'Quiz is not in progress',
          error: 'QUIZ_NOT_IN_PROGRESS'
        });
      }

      // Check time limit
      if (submission.quiz.time_limit_minutes) {
        const timeElapsed = (new Date() - submission.started_at) / (1000 * 60);
        if (timeElapsed > submission.quiz.time_limit_minutes) {
          await submission.update({ status: 'expired' });
          return res.status(400).json({
            success: false,
            message: 'Quiz time limit exceeded',
            error: 'TIME_LIMIT_EXCEEDED'
          });
        }
      }

      // Process answers
      const answerResults = [];
      let totalPointsEarned = 0;
      let correctAnswers = 0;

      for (const userAnswer of answers) {
        const question = submission.quiz.questions.find(q => q.id === userAnswer.question_id);
        if (!question) continue;

        let isCorrect = false;
        let pointsEarned = 0;
        let aiExplanation = null;

        // Evaluate answer based on question type
        if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
          isCorrect = userAnswer.answer.toLowerCase() === question.correct_answer.toLowerCase();
          pointsEarned = isCorrect ? question.points : 0;
        } else if (question.question_type === 'short_answer' || question.question_type === 'essay') {
          // Use AI to evaluate open-ended answers
          try {
            const evaluation = await aiService.evaluateAnswer(
              question.question_text,
              userAnswer.answer,
              question.correct_answer,
              submission.quiz.subject,
              submission.quiz.grade_level
            );
            isCorrect = evaluation.isCorrect;
            pointsEarned = Math.round(question.points * evaluation.partialCredit);
            aiExplanation = evaluation.feedback;
          } catch (aiError) {
            console.error('AI evaluation failed:', aiError);
            // Fallback: simple text matching
            const similarity = this.calculateSimilarity(
              userAnswer.answer.toLowerCase(),
              question.correct_answer.toLowerCase()
            );
            isCorrect = similarity > 0.7;
            pointsEarned = isCorrect ? question.points : Math.round(question.points * similarity);
          }
        }

        if (isCorrect) correctAnswers++;
        totalPointsEarned += pointsEarned;

        // Create answer record
        const answerRecord = await Answer.create({
          submission_id: submission.id,
          question_id: question.id,
          user_answer: userAnswer.answer,
          is_correct: isCorrect,
          points_earned: pointsEarned,
          time_taken_seconds: userAnswer.time_taken || null,
          hint_used: userAnswer.hint_used || false,
          ai_explanation: aiExplanation
        });

        answerResults.push({
          question_id: question.id,
          question_text: question.question_text,
          user_answer: userAnswer.answer,
          correct_answer: question.correct_answer,
          is_correct: isCorrect,
          points_earned: pointsEarned,
          points_possible: question.points,
          explanation: question.explanation,
          ai_explanation: aiExplanation
        });
      }

      // Update submission
      await submission.update({
        correct_answers: correctAnswers,
        total_points_earned: totalPointsEarned,
        status: 'completed'
      });

      await submission.completeSubmission();

      // Update user statistics
      await req.user.updateStats(submission.score_percentage);

      // Get incorrect questions for AI suggestions
      const incorrectQuestions = answerResults
        .filter(result => !result.is_correct)
        .map(result => ({ question_text: result.question_text }));

      // Generate AI improvement suggestions
      let improvementSuggestions = [];
      try {
        if (incorrectQuestions.length > 0) {
          improvementSuggestions = await aiService.generateImprovementSuggestions(
            submission.quiz,
            {
              correctCount: correctAnswers,
              totalQuestions: submission.total_questions,
              scorePercentage: submission.score_percentage
            },
            incorrectQuestions
          );
        }
      } catch (aiError) {
        console.error('AI suggestions failed:', aiError);
        improvementSuggestions = [
          'Review the questions you got wrong and study the explanations.',
          'Practice more problems in areas where you struggled.'
        ];
      }

      // Update submission with AI feedback
      await submission.update({
        improvement_suggestions: improvementSuggestions,
        performance_analysis: {
          strengths: answerResults.filter(r => r.is_correct).map(r => r.question_id),
          weaknesses: answerResults.filter(r => !r.is_correct).map(r => r.question_id),
          average_time_per_question: answerResults.reduce((sum, r) => sum + (r.time_taken_seconds || 0), 0) / answerResults.length
        }
      });

      res.json({
        success: true,
        message: 'Quiz submitted successfully',
        data: {
          submission: {
            id: submission.id,
            score_percentage: submission.score_percentage,
            correct_answers: correctAnswers,
            total_questions: submission.total_questions,
            total_points_earned: totalPointsEarned,
            total_points_possible: submission.total_points_possible,
            time_taken_minutes: submission.time_taken_minutes,
            completed_at: submission.completed_at
          },
          results: answerResults,
          improvement_suggestions: improvementSuggestions,
          grade: this.getGrade(submission.score_percentage),
          can_retry: submission.attempt_number < submission.quiz.max_attempts
        }
      });

    } catch (error) {
      console.error('Submit quiz error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit quiz',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get quiz history with filters
   */
  async getQuizHistory(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        grade,
        subject,
        marks_min,
        marks_max,
        from_date,
        to_date,
        status = 'completed'
      } = req.query;

      const userId = req.user.id;

      // Build where clause
      const whereClause = {
        user_id: userId,
        status
      };

      // Score filtering
      if (marks_min !== undefined || marks_max !== undefined) {
        whereClause.score_percentage = {};
        if (marks_min !== undefined) {
          whereClause.score_percentage[Op.gte] = parseFloat(marks_min);
        }
        if (marks_max !== undefined) {
          whereClause.score_percentage[Op.lte] = parseFloat(marks_max);
        }
      }

      // Date filtering
      if (from_date || to_date) {
        whereClause.completed_at = {};
        if (from_date) {
          whereClause.completed_at[Op.gte] = new Date(from_date);
        }
        if (to_date) {
          whereClause.completed_at[Op.lte] = new Date(to_date + 'T23:59:59');
        }
      }

      // Quiz filters
      const quizWhere = {};
      if (grade) {
        quizWhere.grade_level = parseInt(grade);
      }
      if (subject) {
        quizWhere.subject = subject;
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { rows: submissions, count: totalCount } = await Submission.findAndCountAll({
        where: whereClause,
        include: [{
          model: Quiz,
          as: 'quiz',
          where: Object.keys(quizWhere).length > 0 ? quizWhere : undefined,
          attributes: ['id', 'title', 'subject', 'grade_level', 'difficulty_level', 'total_questions']
        }],
        order: [['completed_at', 'DESC']],
        limit: parseInt(limit),
        offset
      });

      res.json({
        success: true,
        message: 'Quiz history retrieved successfully',
        data: {
          submissions: submissions.map(sub => ({
            id: sub.id,
            quiz: sub.quiz,
            attempt_number: sub.attempt_number,
            score_percentage: sub.score_percentage,
            correct_answers: sub.correct_answers,
            total_questions: sub.total_questions,
            time_taken_minutes: sub.time_taken_minutes,
            completed_at: sub.completed_at,
            grade: this.getGrade(sub.score_percentage),
            improvement_suggestions: sub.improvement_suggestions
          })),
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
      console.error('Get quiz history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve quiz history',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get specific submission details
   */
  async getSubmission(req, res) {
    try {
      const { submission_id } = req.params;
      const userId = req.user.id;

      const submission = await Submission.findOne({
        where: {
          id: submission_id,
          user_id: userId
        },
        include: [{
          model: Quiz,
          as: 'quiz',
          include: [{
            model: Question,
            as: 'questions',
            order: [['question_order', 'ASC']]
          }]
        }, {
          model: Answer,
          as: 'answers',
          include: [{
            model: Question,
            as: 'question'
          }]
        }]
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: 'Submission not found',
          error: 'SUBMISSION_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        message: 'Submission retrieved successfully',
        data: {
          submission: {
            id: submission.id,
            quiz: submission.quiz,
            attempt_number: submission.attempt_number,
            score_percentage: submission.score_percentage,
            correct_answers: submission.correct_answers,
            total_questions: submission.total_questions,
            total_points_earned: submission.total_points_earned,
            total_points_possible: submission.total_points_possible,
            time_taken_minutes: submission.time_taken_minutes,
            started_at: submission.started_at,
            completed_at: submission.completed_at,
            status: submission.status,
            improvement_suggestions: submission.improvement_suggestions,
            performance_analysis: submission.performance_analysis,
            grade: this.getGrade(submission.score_percentage)
          },
          answers: submission.answers.map(answer => ({
            question_id: answer.question.id,
            question_text: answer.question.question_text,
            question_type: answer.question.question_type,
            options: answer.question.options,
            user_answer: answer.user_answer,
            correct_answer: answer.question.correct_answer,
            is_correct: answer.is_correct,
            points_earned: answer.points_earned,
            points_possible: answer.question.points,
            explanation: answer.question.explanation,
            ai_explanation: answer.ai_explanation,
            hint_used: answer.hint_used,
            time_taken_seconds: answer.time_taken_seconds
          }))
        }
      });

    } catch (error) {
      console.error('Get submission error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve submission',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Retry quiz (create new attempt)
   */
  async retryQuiz(req, res) {
    try {
      const { quiz_id } = req.params;
      const userId = req.user.id;

      // Find quiz
      const quiz = await Quiz.findByPk(quiz_id);

      if (!quiz) {
        return res.status(404).json({
          success: false,
          message: 'Quiz not found',
          error: 'QUIZ_NOT_FOUND'
        });
      }

      if (!quiz.is_active) {
        return res.status(400).json({
          success: false,
          message: 'Quiz is not available',
          error: 'QUIZ_INACTIVE'
        });
      }

      // Check attempt limit
      const existingAttempts = await Submission.count({
        where: {
          user_id: userId,
          quiz_id,
          status: { [Op.in]: ['completed', 'in_progress'] }
        }
      });

      if (existingAttempts >= quiz.max_attempts) {
        return res.status(400).json({
          success: false,
          message: `Maximum attempts (${quiz.max_attempts}) reached for this quiz`,
          error: 'MAX_ATTEMPTS_REACHED'
        });
      }

      // Get previous attempts for analysis
      const previousAttempts = await Submission.findAll({
        where: {
          user_id: userId,
          quiz_id,
          status: 'completed'
        },
        order: [['completed_at', 'DESC']],
        limit: 3
      });

      res.json({
        success: true,
        message: 'Quiz retry available',
        data: {
          quiz_id: quiz.id,
          quiz_title: quiz.title,
          current_attempts: existingAttempts,
          max_attempts: quiz.max_attempts,
          remaining_attempts: quiz.max_attempts - existingAttempts,
          previous_attempts: previousAttempts.map(attempt => ({
            attempt_number: attempt.attempt_number,
            score_percentage: attempt.score_percentage,
            completed_at: attempt.completed_at,
            grade: this.getGrade(attempt.score_percentage)
          }))
        }
      });

    } catch (error) {
      console.error('Retry quiz error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check retry availability',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get user performance summary
   */
  async getPerformanceSummary(req, res) {
    try {
      const userId = req.user.id;

      // Get all completed submissions
      const submissions = await Submission.findAll({
        where: {
          user_id: userId,
          status: 'completed'
        },
        include: [{
          model: Quiz,
          as: 'quiz',
          attributes: ['subject', 'grade_level', 'difficulty_level']
        }],
        order: [['completed_at', 'DESC']]
      });

      if (submissions.length === 0) {
        return res.json({
          success: true,
          message: 'Performance summary retrieved successfully',
          data: {
            total_quizzes: 0,
            average_score: 0,
            best_score: 0,
            recent_performance: [],
            subject_performance: {},
            improvement_trend: 'no_data'
          }
        });
      }

      // Calculate statistics
      const scores = submissions.map(s => s.score_percentage);
      const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const bestScore = Math.max(...scores);

      // Subject performance
      const subjectPerformance = {};
      submissions.forEach(sub => {
        const subject = sub.quiz.subject;
        if (!subjectPerformance[subject]) {
          subjectPerformance[subject] = {
            count: 0,
            total_score: 0,
            best_score: 0,
            average_score: 0
          };
        }
        subjectPerformance[subject].count++;
        subjectPerformance[subject].total_score += sub.score_percentage;
        subjectPerformance[subject].best_score = Math.max(
          subjectPerformance[subject].best_score,
          sub.score_percentage
        );
      });

      // Calculate averages for subjects
      Object.keys(subjectPerformance).forEach(subject => {
        subjectPerformance[subject].average_score = 
          subjectPerformance[subject].total_score / subjectPerformance[subject].count;
      });

      // Recent performance trend (last 5 quizzes)
      const recentSubmissions = submissions.slice(0, 5);
      const trend = this.calculateTrend(recentSubmissions.map(s => s.score_percentage));

      res.json({
        success: true,
        message: 'Performance summary retrieved successfully',
        data: {
          total_quizzes: submissions.length,
          average_score: Math.round(averageScore * 100) / 100,
          best_score: bestScore,
          recent_performance: recentSubmissions.map(sub => ({
            quiz_title: sub.quiz.title || `${sub.quiz.subject} Quiz`,
            subject: sub.quiz.subject,
            score_percentage: sub.score_percentage,
            completed_at: sub.completed_at,
            grade: this.getGrade(sub.score_percentage)
          })),
          subject_performance: subjectPerformance,
          improvement_trend: trend > 5 ? 'improving' : trend < -5 ? 'declining' : 'stable'
        }
      });

    } catch (error) {
      console.error('Get performance summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve performance summary',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Helper methods
  calculateSimilarity(text1, text2) {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  calculateTrend(scores) {
    if (scores.length < 2) return 0;
    
    const firstHalf = scores.slice(Math.floor(scores.length / 2));
    const secondHalf = scores.slice(0, Math.floor(scores.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    return firstAvg - secondAvg; // Positive means improvement (recent scores higher)
  }

  getGrade(scorePercentage) {
    if (scorePercentage >= 90) return 'A+';
    if (scorePercentage >= 85) return 'A';
    if (scorePercentage >= 80) return 'A-';
    if (scorePercentage >= 75) return 'B+';
    if (scorePercentage >= 70) return 'B';
    if (scorePercentage >= 65) return 'B-';
    if (scorePercentage >= 60) return 'C+';
    if (scorePercentage >= 55) return 'C';
    if (scorePercentage >= 50) return 'C-';
    return 'F';
  }
}

module.exports = new SubmissionController();