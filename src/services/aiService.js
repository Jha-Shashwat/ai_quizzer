// src/services/aiService.js
const Groq = require('groq-sdk');
const axios = require('axios');

class AIService {
  constructor() {
    this.groq = null;
    this.model = process.env.GROQ_MODEL || 'llama3-8b-8192';
    this.initializeGroq();
  }

  /**
   * Initialize Groq client
   */
  initializeGroq() {
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️  GROQ_API_KEY not found in environment variables');
      console.warn('⚠️  AI features will be disabled');
      return;
    }

    try {
      this.groq = new Groq({
        apiKey: apiKey
      });
      console.log('✅ Groq AI service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Groq:', error.message);
      this.groq = null;
    }
  }

  /**
   * Check if AI service is available
   */
  isAvailable() {
    return this.groq !== null;
  }

  /**
   * Generate quiz questions using AI
   */
  async generateQuizQuestions(subject, gradeLevel, difficulty, numQuestions, topics = []) {
    if (!this.isAvailable()) {
      console.warn('⚠️  AI service not available, returning sample questions');
      return this.generateSampleQuestions(subject, gradeLevel, difficulty, numQuestions);
    }

    try {
      const topicsText = topics.length > 0 ? `focusing on: ${topics.join(', ')}` : '';
      
      const prompt = `Generate ${numQuestions} ${difficulty} level multiple-choice quiz questions for ${subject}, grade ${gradeLevel} ${topicsText}.

For each question, provide:
1. Question text (clear and age-appropriate)
2. 4 multiple choice options (A, B, C, D)
3. Correct answer (letter)
4. Brief explanation
5. A helpful hint
6. Difficulty level (easy/medium/hard)

Format as JSON array with this structure:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "A",
    "explanation": "Explanation here",
    "hint": "Helpful hint here",
    "difficulty": "medium",
    "points": 1
  }
]

Make sure questions are:
- Age-appropriate for grade ${gradeLevel}
- Educational and engaging
- Free from bias
- Varied in difficulty within the ${difficulty} range`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an expert educational content creator. Generate high-quality, accurate quiz questions that are appropriate for the specified grade level and subject. Always respond with valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.7,
        max_tokens: 4000
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from AI service');
      }

      // Parse the JSON response
      const questions = JSON.parse(response.trim());
      
      if (!Array.isArray(questions)) {
        throw new Error('AI response is not a valid array');
      }

      return questions.map((q, index) => ({
        question_text: q.question,
        question_type: 'multiple_choice',
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
        hint: q.hint,
        difficulty: q.difficulty || difficulty,
        points: q.points || 1,
        question_order: index + 1
      }));

    } catch (error) {
      console.error('AI Question Generation Error:', error);
      console.warn('Falling back to sample questions...');
      return this.generateSampleQuestions(subject, gradeLevel, difficulty, numQuestions);
    }
  }

  /**
   * Generate sample questions when AI is not available
   */
  generateSampleQuestions(subject, gradeLevel, difficulty, numQuestions) {
    const sampleQuestions = {
      mathematics: [
        {
          question: "What is 15 + 27?",
          options: ["40", "42", "45", "48"],
          correctAnswer: "B",
          explanation: "15 + 27 = 42",
          hint: "Break it down: 15 + 20 + 7 = 35 + 7 = 42",
          difficulty: "easy"
        },
        {
          question: "If a rectangle has length 8 cm and width 5 cm, what is its area?",
          options: ["13 cm²", "26 cm²", "40 cm²", "45 cm²"],
          correctAnswer: "C",
          explanation: "Area = length × width = 8 × 5 = 40 cm²",
          hint: "Remember: Area of rectangle = length × width",
          difficulty: "medium"
        },
        {
          question: "What is the value of x in the equation 2x + 6 = 14?",
          options: ["2", "4", "6", "8"],
          correctAnswer: "B",
          explanation: "2x + 6 = 14, so 2x = 8, therefore x = 4",
          hint: "Subtract 6 from both sides first",
          difficulty: "medium"
        }
      ],
      science: [
        {
          question: "What is the chemical symbol for water?",
          options: ["H2O", "CO2", "NaCl", "O2"],
          correctAnswer: "A",
          explanation: "Water is composed of 2 hydrogen atoms and 1 oxygen atom: H2O",
          hint: "Think about hydrogen and oxygen",
          difficulty: "easy"
        },
        {
          question: "Which planet is closest to the Sun?",
          options: ["Venus", "Mercury", "Earth", "Mars"],
          correctAnswer: "B",
          explanation: "Mercury is the closest planet to the Sun in our solar system",
          hint: "Think about the order of planets from the Sun",
          difficulty: "easy"
        }
      ]
    };

    const subjectQuestions = sampleQuestions[subject] || sampleQuestions.mathematics;
    const questions = [];
    
    for (let i = 0; i < Math.min(numQuestions, 10); i++) {
      const baseQuestion = subjectQuestions[i % subjectQuestions.length];
      questions.push({
        question_text: baseQuestion.question,
        question_type: 'multiple_choice',
        options: baseQuestion.options,
        correct_answer: baseQuestion.correctAnswer,
        explanation: baseQuestion.explanation,
        hint: baseQuestion.hint,
        difficulty: baseQuestion.difficulty,
        points: 1,
        question_order: i + 1
      });
    }

    return questions;
  }

  /**
   * Generate hint for a specific question
   */
  async generateHint(questionText, subject, gradeLevel) {
    if (!this.isAvailable()) {
      return 'Think about what you learned in class about this topic. What key concepts might apply here?';
    }

    try {
      const prompt = `For this ${subject} question at grade ${gradeLevel} level:
"${questionText}"

Provide a helpful hint that:
- Guides the student toward the correct answer without giving it away
- Uses age-appropriate language for grade ${gradeLevel}
- Encourages thinking and reasoning
- Is educational and supportive

Respond with just the hint text, nothing else.`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful tutor who provides educational hints to students. Your hints should guide learning without giving away answers.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.6,
        max_tokens: 200
      });

      return completion.choices[0]?.message?.content?.trim();
    } catch (error) {
      console.error('Hint Generation Error:', error);
      return 'Think about what you learned in class about this topic. What key concepts might apply here?';
    }
  }

  /**
   * Generate improvement suggestions based on quiz performance
   */
  async generateImprovementSuggestions(quizData, userAnswers, incorrectQuestions) {
    if (!this.isAvailable()) {
      return [
        'Review the questions you got wrong and study the explanations provided.',
        'Practice more questions on the topics you found challenging.'
      ];
    }

    try {
      const incorrectTopics = incorrectQuestions.map(q => q.question_text.substring(0, 50) + '...').join('\n');
      
      const prompt = `A grade ${quizData.grade_level} student took a ${quizData.subject} quiz and got ${userAnswers.correctCount}/${userAnswers.totalQuestions} correct (${userAnswers.scorePercentage}%).

Questions they got wrong:
${incorrectTopics}

Provide exactly 2 specific, actionable improvement suggestions that:
- Are encouraging and supportive
- Focus on study strategies and learning techniques
- Are appropriate for grade ${quizData.grade_level}
- Address the specific subject area (${quizData.subject})
- Help improve understanding of the missed concepts

Format as a JSON array of 2 strings:
["Suggestion 1 text", "Suggestion 2 text"]`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an encouraging educational advisor who helps students improve their learning. Provide specific, actionable advice that builds confidence while addressing learning gaps.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.7,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content?.trim();
      const suggestions = JSON.parse(response);
      
      return Array.isArray(suggestions) ? suggestions : [
        'Review the concepts you missed and try practicing similar problems.',
        'Consider asking your teacher for extra help on the topics you found challenging.'
      ];
    } catch (error) {
      console.error('Improvement Suggestions Error:', error);
      return [
        'Review your incorrect answers and study the explanations provided.',
        'Practice more questions on the topics you found challenging.'
      ];
    }
  }

  /**
   * Analyze user performance and determine next quiz difficulty
   */
  async adaptQuizDifficulty(userHistory, subject, gradeLevel) {
    try {
      if (!userHistory || userHistory.length === 0) {
        return 'mixed'; // Default for new users
      }

      const recentQuizzes = userHistory.slice(-5); // Last 5 quizzes
      const averageScore = recentQuizzes.reduce((sum, quiz) => sum + quiz.score_percentage, 0) / recentQuizzes.length;
      const trend = this.calculateTrend(recentQuizzes.map(q => q.score_percentage));

      let recommendedDifficulty;

      if (averageScore >= 85 && trend >= 0) {
        recommendedDifficulty = 'hard';
      } else if (averageScore >= 70) {
        recommendedDifficulty = 'medium';
      } else if (averageScore < 60) {
        recommendedDifficulty = 'easy';
      } else {
        recommendedDifficulty = 'mixed';
      }

      return {
        difficulty: recommendedDifficulty,
        reasoning: this.getDifficultyReasoning(averageScore, trend),
        averageScore: Math.round(averageScore * 100) / 100,
        trend: trend > 0 ? 'improving' : trend < 0 ? 'declining' : 'stable'
      };
    } catch (error) {
      console.error('Difficulty Adaptation Error:', error);
      return {
        difficulty: 'mixed',
        reasoning: 'Using balanced difficulty due to insufficient data.',
        averageScore: 0,
        trend: 'unknown'
      };
    }
  }

  /**
   * Calculate performance trend
   */
  calculateTrend(scores) {
    if (scores.length < 2) return 0;
    
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    return secondAvg - firstAvg;
  }

  /**
   * Get reasoning for difficulty recommendation
   */
  getDifficultyReasoning(averageScore, trend) {
    if (averageScore >= 85 && trend >= 0) {
      return 'You\'re doing great! Ready for more challenging questions.';
    } else if (averageScore >= 70) {
      return 'Good progress! Continuing with moderate difficulty.';
    } else if (averageScore < 60) {
      return 'Let\'s focus on building confidence with easier questions.';
    } else {
      return 'Mixed difficulty to help you improve gradually.';
    }
  }

  /**
   * Evaluate user's answer for short answer/essay questions
   */
  async evaluateAnswer(question, userAnswer, correctAnswer, subject, gradeLevel) {
    if (!this.isAvailable()) {
      // Simple fallback evaluation
      const similarity = this.calculateSimilarity(userAnswer.toLowerCase(), correctAnswer.toLowerCase());
      return {
        isCorrect: similarity > 0.7,
        score: Math.round(similarity * 100),
        feedback: similarity > 0.7 ? 'Good answer!' : 'Please review the correct answer and try to understand the key concepts.',
        partialCredit: similarity
      };
    }

    try {
      const prompt = `Evaluate this student's answer for a grade ${gradeLevel} ${subject} question:

Question: ${question}
Correct Answer: ${correctAnswer}
Student's Answer: ${userAnswer}

Provide evaluation as JSON:
{
  "isCorrect": boolean,
  "score": number (0-100),
  "feedback": "constructive feedback string",
  "partialCredit": number (0-1 for partial credit)
}

Consider:
- Grade level appropriateness
- Key concepts covered
- Partial credit for partially correct answers
- Encouraging but honest feedback`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a fair and encouraging teacher evaluating student answers. Provide constructive feedback that helps students learn.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.3,
        max_tokens: 300
      });

      const response = completion.choices[0]?.message?.content?.trim();
      return JSON.parse(response);
    } catch (error) {
      console.error('Answer Evaluation Error:', error);
      // Simple fallback evaluation
      const similarity = this.calculateSimilarity(userAnswer.toLowerCase(), correctAnswer.toLowerCase());
      return {
        isCorrect: similarity > 0.7,
        score: Math.round(similarity * 100),
        feedback: similarity > 0.7 ? 'Good answer!' : 'Please review the correct answer and try to understand the key concepts.',
        partialCredit: similarity
      };
    }
  }

  /**
   * Simple text similarity calculation
   */
  calculateSimilarity(text1, text2) {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  /**
   * Test AI service connection
   */
  async testConnection() {
    if (!this.isAvailable()) {
      return {
        status: 'disabled',
        message: 'AI service not configured. Please set GROQ_API_KEY environment variable.',
        fallback: 'Using sample questions and basic functionality'
      };
    }

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: 'Hello, are you working?'
          }
        ],
        model: this.model,
        max_tokens: 50
      });

      return {
        status: 'connected',
        model: this.model,
        response: completion.choices[0]?.message?.content
      };
    } catch (error) {
      console.error('AI Service Test Failed:', error);
      throw new Error(`AI service connection failed: ${error.message}`);
    }
  }
}

module.exports = new AIService();