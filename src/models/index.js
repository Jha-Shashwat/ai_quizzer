// src/models/index.js
const { sequelize } = require('../config/database');
const UserModel = require('./User');
const { QuizModel, QuestionModel } = require('./Quiz');
const { SubmissionModel, AnswerModel } = require('./Submission');

// Initialize models
const User = UserModel(sequelize);
const Quiz = QuizModel(sequelize);
const Question = QuestionModel(sequelize);
const Submission = SubmissionModel(sequelize);
const Answer = AnswerModel(sequelize);

// Define associations
const models = {
  User,
  Quiz,
  Question,
  Submission,
  Answer
};

// Set up associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

module.exports = {
  sequelize,
  ...models
};