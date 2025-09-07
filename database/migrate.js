// database/migrate.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ai_quizzer',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '2094',
});

const migrationFiles = [
  '001-create-users.sql',
  '002-create-quizzes.sql',
  '003-create-questions.sql',
  '004-create-submissions.sql',
  '005-create-answers.sql'
];

async function runMigrations() {
  try {
    console.log('🔄 Connecting to PostgreSQL database...');
    await client.connect();
    console.log('✅ Connected to database successfully!');

    for (const filename of migrationFiles) {
      const filePath = path.join(__dirname, 'migrations', filename);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Migration file not found: ${filename}`);
        continue;
      }

      console.log(`🔄 Running migration: ${filename}`);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      await client.query(sql);
      console.log(`✅ Completed migration: ${filename}`);
    }

    console.log('🎉 All migrations completed successfully!');
    console.log('\n📊 Database schema created:');
    console.log('   - users table');
    console.log('   - quizzes table');
    console.log('   - questions table');
    console.log('   - submissions table');
    console.log('   - answers table');
    console.log('\n🚀 Ready to start the server!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migrations
runMigrations();