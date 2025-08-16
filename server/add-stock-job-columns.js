const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function addStockJobColumns() {
  try {
    console.log('=== ADDING STOCK JOB COLUMNS ===\n');
    
    // Check if columns already exist
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'jobs' 
      AND column_name IN ('is_stock_job', 'stock_number')
    `);
    
    const existingColumns = checkResult.rows.map(row => row.column_name);
    console.log('Existing stock columns:', existingColumns);
    
    // Add is_stock_job column if it doesn't exist
    if (!existingColumns.includes('is_stock_job')) {
      console.log('Adding is_stock_job column...');
      await pool.query(`
        ALTER TABLE jobs 
        ADD COLUMN is_stock_job BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Added is_stock_job column');
    } else {
      console.log('⏭️  is_stock_job column already exists');
    }
    
    // Add stock_number column if it doesn't exist
    if (!existingColumns.includes('stock_number')) {
      console.log('Adding stock_number column...');
      await pool.query(`
        ALTER TABLE jobs 
        ADD COLUMN stock_number VARCHAR(50) NULL
      `);
      console.log('✅ Added stock_number column');
    } else {
      console.log('⏭️  stock_number column already exists');
    }
    
    // Create index on stock_number for performance
    console.log('Creating index on stock_number...');
    try {
      await pool.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_stock_number 
        ON jobs(stock_number) 
        WHERE stock_number IS NOT NULL
      `);
      console.log('✅ Created index on stock_number');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⏭️  Index on stock_number already exists');
      } else {
        throw error;
      }
    }
    
    // Verify the changes
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'jobs' 
      AND column_name IN ('is_stock_job', 'stock_number')
      ORDER BY column_name
    `);
    
    console.log('\n=== VERIFICATION ===');
    verifyResult.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    });
    
    console.log('\n✅ Stock job columns setup completed successfully!');
    
  } catch (error) {
    console.error('Error adding stock job columns:', error);
  } finally {
    await pool.end();
  }
}

addStockJobColumns();