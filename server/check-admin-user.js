const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

// Load environment variables from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAndResetAdmin() {
  try {
    console.log('🔍 Checking for admin users...');
    
    // First, let's see what users exist
    const allUsers = await pool.query('SELECT id, username, email, first_name, last_name, role FROM users ORDER BY id');
    
    console.log('📋 Current users in database:');
    allUsers.rows.forEach(user => {
      console.log(`   ID: ${user.id} | Username: ${user.username} | Email: ${user.email} | Role: ${user.role}`);
    });
    
    // Look for admin users
    const adminUsers = await pool.query(`
      SELECT id, username, email, first_name, last_name, role 
      FROM users 
      WHERE role = 'admin'
      ORDER BY id
    `);
    
    if (adminUsers.rows.length === 0) {
      console.log('❌ No admin users found!');
      return;
    }
    
    console.log('\n🔐 Admin users found:');
    adminUsers.rows.forEach(user => {
      console.log(`   ID: ${user.id} | Username: ${user.username} | Email: ${user.email}`);
    });
    
    // Reset password for the first admin user
    const adminToReset = adminUsers.rows[0];
    const newPassword = 'admin123';
    
    console.log(`\n🔄 Resetting password for admin user: ${adminToReset.username}`);
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update the password
    await pool.query(`
      UPDATE users 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [hashedPassword, adminToReset.id]);
    
    console.log('✅ Admin password reset successfully!');
    console.log('\n📝 Login credentials:');
    console.log(`   Username: ${adminToReset.username}`);
    console.log(`   Password: ${newPassword}`);
    console.log('\n🌐 You can now login at http://localhost:3000');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAndResetAdmin();