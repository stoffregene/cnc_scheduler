const { Pool } = require('pg');
require('dotenv').config();

async function checkJobsSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('📋 Current Jobs Table Schema:\n');
    
    // Get table structure
    const schemaQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'jobs' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    const schema = await pool.query(schemaQuery);
    
    console.log('Jobs Table Columns:');
    console.log('='.repeat(80));
    schema.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      const maxLength = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      
      console.log(`${col.column_name.padEnd(25)} | ${col.data_type}${maxLength} ${nullable}${defaultVal}`);
    });
    
    // Sample jobs to understand current job numbering
    console.log('\n📊 Sample Jobs for Assembly Analysis:');
    console.log('='.repeat(80));
    
    const sampleQuery = `
      SELECT 
        id,
        job_number,
        part_name,
        part_number,
        status,
        created_at
      FROM jobs 
      ORDER BY job_number 
      LIMIT 10;
    `;
    
    const samples = await pool.query(sampleQuery);
    
    if (samples.rows.length === 0) {
      console.log('No jobs found in database.');
    } else {
      console.log('Current Jobs:');
      console.log('-'.repeat(80));
      samples.rows.forEach(job => {
        console.log(`ID: ${job.id.toString().padEnd(5)} | Job Number: ${job.job_number.padEnd(15)} | Part: ${job.part_name || 'N/A'} | Status: ${job.status}`);
      });
    }
    
    // Check for potential assembly patterns
    console.log('\n🔍 Analyzing for Potential Assembly Patterns:');
    console.log('='.repeat(80));
    
    const assemblyPatternQuery = `
      SELECT 
        LEFT(job_number, position('-' in job_number) - 1) as base_job_number,
        COUNT(*) as child_count,
        array_agg(job_number ORDER BY job_number) as child_jobs
      FROM jobs 
      WHERE job_number ~ '^[0-9]+-[0-9]+$' -- Pattern like 12345-1, 12345-2
      GROUP BY LEFT(job_number, position('-' in job_number) - 1)
      HAVING COUNT(*) > 1
      ORDER BY LEFT(job_number, position('-' in job_number) - 1);
    `;
    
    const patterns = await pool.query(assemblyPatternQuery);
    
    if (patterns.rows.length === 0) {
      console.log('No assembly patterns found (format: XXXXX-Y)');
    } else {
      console.log('Potential Assembly Groups:');
      console.log('-'.repeat(80));
      patterns.rows.forEach(pattern => {
        console.log(`Base Job: ${pattern.base_job_number} | Child Jobs Found: ${pattern.child_count}`);
        console.log(`  Child Jobs: ${pattern.child_jobs.join(', ')}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  } finally {
    await pool.end();
  }
}

checkJobsSchema();