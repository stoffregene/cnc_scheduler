-- Customer Tiers Management System
-- Migration to add customer tier tracking and priority scoring

-- Create customer tiers table
CREATE TABLE IF NOT EXISTS customer_tiers (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(20) NOT NULL DEFAULT 'standard',
  priority_weight INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_tier CHECK (tier IN ('top', 'mid', 'standard'))
);

-- Create index for fast lookups
CREATE INDEX idx_customer_tiers_name ON customer_tiers(customer_name);
CREATE INDEX idx_customer_tiers_tier ON customer_tiers(tier);

-- Insert initial customer tiers based on business rules
INSERT INTO customer_tiers (customer_name, tier, priority_weight) VALUES
  ('MAREL', 'top', 400),
  ('POUL', 'top', 400),
  ('NCS', 'top', 400),
  ('ACCU MOLD', 'mid', 200),
  ('GRIPTITE', 'mid', 200),
  ('KATECHO', 'mid', 200)
ON CONFLICT (customer_name) DO UPDATE 
SET tier = EXCLUDED.tier,
    priority_weight = EXCLUDED.priority_weight,
    updated_at = CURRENT_TIMESTAMP;

-- Add priority-related columns to jobs table (check each individually)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'priority_score') THEN
    ALTER TABLE jobs ADD COLUMN priority_score INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'is_expedite') THEN
    ALTER TABLE jobs ADD COLUMN is_expedite BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'has_outsourcing') THEN
    ALTER TABLE jobs ADD COLUMN has_outsourcing BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'outsourcing_lead_days') THEN
    ALTER TABLE jobs ADD COLUMN outsourcing_lead_days INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'order_date') THEN
    ALTER TABLE jobs ADD COLUMN order_date DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'schedule_locked') THEN
    ALTER TABLE jobs ADD COLUMN schedule_locked BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'lock_reason') THEN
    ALTER TABLE jobs ADD COLUMN lock_reason VARCHAR(255);
  END IF;
END $$;

-- Add lock column to schedule_slots
ALTER TABLE schedule_slots
ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

-- Function to calculate priority score
CREATE OR REPLACE FUNCTION calculate_priority_score(job_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  job_record RECORD;
  customer_tier_record RECORD;
  calculated_score INTEGER := 0;
  days_until_promised INTEGER;
  days_between_order_promise INTEGER;
  parent_priority INTEGER;
BEGIN
  -- Get job details
  SELECT * INTO job_record FROM jobs WHERE id = job_id;
  
  IF job_record IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get customer tier
  SELECT * INTO customer_tier_record 
  FROM customer_tiers 
  WHERE UPPER(customer_name) = UPPER(job_record.customer_name);
  
  -- 1. Customer Tier (0-400 points)
  IF customer_tier_record IS NOT NULL THEN
    calculated_score := calculated_score + customer_tier_record.priority_weight;
  END IF;
  
  -- 2. Already Late (250 points)
  IF job_record.promised_date IS NOT NULL AND CURRENT_DATE > job_record.promised_date THEN
    calculated_score := calculated_score + 250;
  END IF;
  
  -- 3. Expedite Flag (200 points)
  -- Check if order-to-promise is less than 28 days
  IF job_record.order_date IS NOT NULL AND job_record.promised_date IS NOT NULL THEN
    days_between_order_promise := DATE_PART('day', job_record.promised_date - job_record.order_date);
    IF days_between_order_promise < 28 THEN
      calculated_score := calculated_score + 200;
      -- Also update the expedite flag
      UPDATE jobs SET is_expedite = TRUE WHERE id = job_id;
    END IF;
  ELSIF job_record.is_expedite THEN
    calculated_score := calculated_score + 200;
  END IF;
  
  -- 4. Days to Promised (0-150 points)
  IF job_record.promised_date IS NOT NULL THEN
    days_until_promised := DATE_PART('day', job_record.promised_date - CURRENT_DATE);
    
    IF days_until_promised <= 7 THEN
      calculated_score := calculated_score + 150;
    ELSIF days_until_promised <= 14 THEN
      calculated_score := calculated_score + 100;
    ELSIF days_until_promised <= 21 THEN
      calculated_score := calculated_score + 50;
    END IF;
  END IF;
  
  -- 5. Job Type (50 points for assembly parents)
  IF job_record.is_assembly_parent THEN
    calculated_score := calculated_score + 50;
  END IF;
  
  -- 6. Assembly Children inherit parent priority + 50
  IF job_record.parent_job_id IS NOT NULL THEN
    SELECT jobs.priority_score INTO parent_priority 
    FROM jobs 
    WHERE jobs.id = job_record.parent_job_id;
    
    IF parent_priority IS NOT NULL AND parent_priority + 50 > calculated_score THEN
      calculated_score := parent_priority + 50;
    END IF;
  END IF;
  
  -- 7. Outsourcing Lead Time (0-100 points, 5 points per day)
  IF job_record.has_outsourcing AND job_record.outsourcing_lead_days > 0 THEN
    calculated_score := calculated_score + LEAST(job_record.outsourcing_lead_days * 5, 100);
  END IF;
  
  -- Cap at 1000
  calculated_score := LEAST(calculated_score, 1000);
  
  -- Update the job's priority score
  UPDATE jobs SET priority_score = calculated_score WHERE id = job_id;
  
  RETURN calculated_score;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-lock started operations
CREATE OR REPLACE FUNCTION auto_lock_started_operations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('started', 'in_progress', 'completed') THEN
    NEW.locked := TRUE;
    
    -- Also update job lock status if all operations are started
    UPDATE jobs 
    SET schedule_locked = TRUE, 
        lock_reason = 'Operation started/in progress'
    WHERE id = NEW.job_id
    AND NOT EXISTS (
      SELECT 1 FROM schedule_slots 
      WHERE job_id = NEW.job_id 
      AND status NOT IN ('started', 'in_progress', 'completed')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-locking
DROP TRIGGER IF EXISTS trigger_auto_lock_operations ON schedule_slots;
CREATE TRIGGER trigger_auto_lock_operations
  BEFORE INSERT OR UPDATE OF status ON schedule_slots
  FOR EACH ROW
  EXECUTE FUNCTION auto_lock_started_operations();

-- Function to auto-add new customers from CSV imports
CREATE OR REPLACE FUNCTION auto_add_customer_tier()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if customer exists in tiers table
  IF NOT EXISTS (
    SELECT 1 FROM customer_tiers 
    WHERE UPPER(customer_name) = UPPER(NEW.customer_name)
  ) THEN
    -- Auto-add as standard tier
    INSERT INTO customer_tiers (customer_name, tier, priority_weight)
    VALUES (NEW.customer_name, 'standard', 0)
    ON CONFLICT (customer_name) DO NOTHING;
  END IF;
  
  -- Calculate priority score for new job
  PERFORM calculate_priority_score(NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-adding customers
DROP TRIGGER IF EXISTS trigger_auto_add_customer ON jobs;
CREATE TRIGGER trigger_auto_add_customer
  AFTER INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_customer_tier();

-- Update existing jobs with priority scores will be done separately to avoid trigger conflicts

-- Add function to recalculate all priority scores (useful for daily updates)
CREATE OR REPLACE FUNCTION recalculate_all_priorities()
RETURNS void AS $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN SELECT id FROM jobs WHERE status != 'completed'
  LOOP
    PERFORM calculate_priority_score(job_record.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;