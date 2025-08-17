const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const runUsersMigration = async () => {
  try {
    console.log('🔧 Running users table migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '009_create_users_table.sql'),
      'utf8'
    );
    
    await pool.query(migrationSQL);
    
    console.log('✅ Users table migration completed successfully!');
    console.log('📋 Created:');
    console.log('   - users table');
    console.log('   - indexes for performance');
    console.log('   - default admin user (username: admin, password: admin123)');
    console.log('⚠️  IMPORTANT: Change the default admin password in production!');
    
  } catch (error) {
    console.error('❌ Users migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  runUsersMigration()
    .then(() => {
      console.log('🎉 Users table is ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runUsersMigration };