// src/models/Quiz.js
const { DataTypes } = require('sequelize');

const QuizModel = (sequelize) => {
  const Quiz = sequelize.define('Quiz', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        len: [5, 200],
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    subject: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        isIn: [['mathematics', 'science', 'english', 'history', 'geography', 'physics', 'chemistry', 'biology', 'computer_science', 'general_knowledge']]
      }
    },
    grade_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 12
      }
    },
    difficulty_level: {
      type: DataTypes.ENUM('easy', 'medium', 'hard', 'mixed'),
      defaultValue: 'mixed'
    },
    total_questions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 50
      }
    },
    time_limit_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 180
      }
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      validate: {
        min: 1,
        max: 10
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    ai_generated: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    generation_prompt: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'quizzes',
    indexes: [
      {
        fields: ['subject', 'grade_level']
      },
      {
        fields: ['created_by']
      },
      {
        fields: ['difficulty_level']
      }
    ]
  });

  Quiz.associate = (models) => {
    Quiz.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    });
    
    Quiz.hasMany(models.Question, {
      foreignKey: 'quiz_id',
      as: 'questions',
      onDelete: 'CASCADE'
    });
    
    Quiz.hasMany(models.Submission, {
      foreignKey: 'quiz_id',
      as: 'submissions'
    });
  };

  return Quiz;
};

// src/models/Question.js
const QuestionModel = (sequelize) => {
  const Question = sequelize.define('Question', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    quiz_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'quizzes',
        key: 'id'
      }
    },
    question_text: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [10, 1000]
      }
    },
    question_type: {
      type: DataTypes.ENUM('multiple_choice', 'true_false', 'short_answer', 'essay'),
      defaultValue: 'multiple_choice'
    },
    options: {
      type: DataTypes.JSONB,
      allowNull: true,
      validate: {
        isValidOptions(value) {
          if (this.question_type === 'multiple_choice' && (!value || !Array.isArray(value) || value.length < 2)) {
            throw new Error('Multiple choice questions must have at least 2 options');
          }
        }
      }
    },
    correct_answer: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    explanation: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    difficulty: {
      type: DataTypes.ENUM('easy', 'medium', 'hard'),
      defaultValue: 'medium'
    },
    points: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      validate: {
        min: 1,
        max: 10
      }
    },
    question_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    hint: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ai_generated_hint: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    }
  }, {
    tableName: 'questions',
    indexes: [
      {
        fields: ['quiz_id', 'question_order']
      },
      {
        fields: ['difficulty']
      }
    ]
  });

  Question.associate = (models) => {
    Question.belongsTo(models.Quiz, {
      foreignKey: 'quiz_id',
      as: 'quiz'
    });
    
    Question.hasMany(models.Answer, {
      foreignKey: 'question_id',
      as: 'userAnswers'
    });
  };

  return Question;
};

module.exports = {
  QuizModel,
  QuestionModel
};