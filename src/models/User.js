// src/models/User.js
const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 50],
        notEmpty: true
      }
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [6, 100]
      }
    },
    grade_level: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 12
      }
    },
    preferred_subjects: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    total_quizzes_attempted: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    average_score: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'users',
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.password;
    return values;
  };

  User.prototype.updateStats = async function(newScore) {
    const totalAttempts = this.total_quizzes_attempted + 1;
    const newAverage = ((this.average_score * this.total_quizzes_attempted) + newScore) / totalAttempts;
    
    await this.update({
      total_quizzes_attempted: totalAttempts,
      average_score: Math.round(newAverage * 100) / 100
    });
  };

  // Class methods
  User.associate = (models) => {
    User.hasMany(models.Quiz, {
      foreignKey: 'created_by',
      as: 'createdQuizzes'
    });
    
    User.hasMany(models.Submission, {
      foreignKey: 'user_id',
      as: 'submissions'
    });
  };

  return User;
};