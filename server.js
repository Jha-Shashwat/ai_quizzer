// server.js
const app = require('./src/app');
const { testConnection, syncDatabase } = require('./src/config/database');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n📊 Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('✅ Server closed successfully');
    console.log('👋 AI Quizzer Backend shutdown complete');
    process.exit(0);
  });
};

// Start server function
const startServer = async () => {
  try {
    console.log('🚀 Starting AI Quizzer Backend...\n');

    // Test database connection
    console.log('📊 Testing database connection...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Sync database models
    console.log('🔄 Synchronizing database models...');
    const syncOptions = process.env.NODE_ENV === 'development' ? { alter: true } : {};
    const dbSynced = await syncDatabase(syncOptions);
    
    if (!dbSynced) {
      console.error('❌ Failed to sync database. Exiting...');
      process.exit(1);
    }

    // Start the server
    const server = app.listen(PORT, HOST, () => {
      console.log('\n✅ AI Quizzer Backend started successfully!');
      console.log(`📍 Server running on: http://${HOST}:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📚 API Documentation: http://${HOST}:${PORT}/api/info`);
      console.log(`💚 Health Check: http://${HOST}:${PORT}/health`);
      console.log('\n📋 Available Endpoints:');
      console.log(`   🔐 Authentication: http://${HOST}:${PORT}/api/auth`);
      console.log(`   📝 Quizzes: http://${HOST}:${PORT}/api/quiz`);
      console.log(`   📊 Submissions: http://${HOST}:${PORT}/api/submission`);
      console.log('\n🤖 AI Features:');
      console.log(`   ✨ Quiz Generation with ${process.env.GROQ_MODEL || 'llama3-8b-8192'}`);
      console.log(`   💡 Intelligent Hints`);
      console.log(`   🎯 Adaptive Difficulty`);
      console.log(`   📈 Performance Analytics`);
      console.log('\n💬 Ready to accept connections...\n');
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;

      switch (error.code) {
        case 'EACCES':
          console.error(` ${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(` ${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;

  } catch (error) {
    console.error('Failed to start server:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  console.error(error.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
const server = startServer();

module.exports = server;