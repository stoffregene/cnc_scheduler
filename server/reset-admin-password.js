const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function resetAdminPassword() {
  try {
    console.log('🔄 Resetting admin password...');
    
    // New password - change this to whatever you want
    const newPassword = 'admin123';
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update admin user password
    const result = await pool.query(`
      UPDATE users 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE username = 'admin' OR email = 'admin@company.com'
      RETURNING id, username, email, first_name, last_name
    `, [hashedPassword]);
    
    if (result.rows.length > 0) {
      console.log('✅ Admin password reset successfully!');
      console.log('📋 Admin user details:');
      console.log(`   Username: ${result.rows[0].username}`);
      console.log(`   Email: ${result.rows[0].email}`);
      console.log(`   Name: ${result.rows[0].first_name} ${result.rows[0].last_name}`);
      console.log(`   New Password: ${newPassword}`);
      console.log('');
      console.log('🔐 You can now login with these credentials');
    } else {
      console.log('❌ No admin user found');
    }
    
  } catch (error) {
    console.error('❌ Error resetting admin password:', error);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();