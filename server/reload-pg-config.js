const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler',
  ssl: false
});

async function reloadConfig() {
  try {
    console.log('Reloading PostgreSQL configuration...');
    const result = await pool.query('SELECT pg_reload_conf()');
    console.log('✅ Configuration reloaded successfully:', result.rows[0]);
    
    // Test the new configuration by showing current settings
    const listenResult = await pool.query("SHOW listen_addresses");
    console.log('Current listen_addresses:', listenResult.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error reloading configuration:', error.message);
    process.exit(1);
  }
}

reloadConfig();