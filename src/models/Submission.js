// src/models/Submission.js
const { DataTypes } = require('sequelize');

const SubmissionModel = (sequelize) => {
  const Submission = sequelize.define('Submission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    quiz_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'quizzes',
        key: 'id'
      }
    },
    attempt_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    total_questions: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    correct_answers: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    score_percentage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: {
        min: 0,
        max: 100
      }
    },
    total_points_earned: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    total_points_possible: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    time_taken_minutes: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('in_progress', 'completed', 'abandoned', 'expired'),
      defaultValue: 'in_progress'
    },
    ai_feedback: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    improvement_suggestions: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: []
    },
    performance_analysis: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    tableName: 'submissions',
    indexes: [
      {
        fields: ['user_id', 'quiz_id']
      },
      {
        fields: ['completed_at']
      },
      {
        fields: ['score_percentage']
      },
      {
        unique: true,
        fields: ['user_id', 'quiz_id', 'attempt_number']
      }
    ]
  });

  // Instance methods
  Submission.prototype.calculateScore = function() {
    if (this.total_points_possible === 0) return 0;
    return Math.round((this.total_points_earned / this.total_points_possible) * 100 * 100) / 100;
  };

  Submission.prototype.completeSubmission = async function() {
    const completedAt = new Date();
    const timeTaken = this.started_at ? 
      (completedAt - this.started_at) / (1000 * 60) : null; // Convert to minutes

    await this.update({
      completed_at: completedAt,
      time_taken_minutes: timeTaken,
      status: 'completed',
      score_percentage: this.calculateScore()
    });
  };

  Submission.associate = (models) => {
    Submission.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    
    Submission.belongsTo(models.Quiz, {
      foreignKey: 'quiz_id',
      as: 'quiz'
    });
    
    Submission.hasMany(models.Answer, {
      foreignKey: 'submission_id',
      as: 'answers'
    });
  };

  return Submission;
};

// src/models/Answer.js
const AnswerModel = (sequelize) => {
  const Answer = sequelize.define('Answer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    submission_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'submissions',
        key: 'id'
      }
    },
    question_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'questions',
        key: 'id'
      }
    },
    user_answer: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_correct: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    points_earned: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    time_taken_seconds: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    hint_used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ai_explanation: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'answers',
    indexes: [
      {
        fields: ['submission_id']
      },
      {
        fields: ['question_id']
      },
      {
        unique: true,
        fields: ['submission_id', 'question_id']
      }
    ]
  });

  Answer.associate = (models) => {
    Answer.belongsTo(models.Submission, {
      foreignKey: 'submission_id',
      as: 'submission'
    });
    
    Answer.belongsTo(models.Question, {
      foreignKey: 'question_id',
      as: 'question'
    });
  };

  return Answer;
};

module.exports = {
  SubmissionModel,
  AnswerModel
};