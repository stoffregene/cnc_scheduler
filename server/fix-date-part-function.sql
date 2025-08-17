-- Fix date_part function error in calculate_priority_score
-- The issue is that promised_date and order_date fields are stored as text/varchar
-- We need to cast them to DATE type in calculations

-- Update the calculate_priority_score function to handle date casting
CREATE OR REPLACE FUNCTION calculate_priority_score(job_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  job_record RECORD;
  customer_tier_record RECORD;
  calculated_score INTEGER := 0;
  days_until_promised INTEGER;
  days_between_order_promise INTEGER;
  parent_priority INTEGER;
  promised_date_parsed DATE;
  order_date_parsed DATE;
BEGIN
  -- Get job details
  SELECT * INTO job_record FROM jobs WHERE id = job_id;
  
  IF job_record IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Parse dates safely (handle NULL and invalid dates)
  BEGIN
    promised_date_parsed := job_record.promised_date::DATE;
  EXCEPTION WHEN OTHERS THEN
    promised_date_parsed := NULL;
  END;
  
  BEGIN
    order_date_parsed := job_record.order_date::DATE;
  EXCEPTION WHEN OTHERS THEN
    order_date_parsed := NULL;
  END;
  
  -- Get customer tier
  SELECT * INTO customer_tier_record 
  FROM customer_tiers 
  WHERE UPPER(customer_name) = UPPER(job_record.customer_name);
  
  -- 1. Customer Tier (0-400 points)
  IF customer_tier_record IS NOT NULL THEN
    calculated_score := calculated_score + customer_tier_record.priority_weight;
  END IF;
  
  -- 2. Already Late (250 points)
  IF promised_date_parsed IS NOT NULL AND CURRENT_DATE > promised_date_parsed THEN
    calculated_score := calculated_score + 250;
  END IF;
  
  -- 3. Expedite Flag (200 points)
  -- Check if order-to-promise is less than 28 days
  IF order_date_parsed IS NOT NULL AND promised_date_parsed IS NOT NULL THEN
    days_between_order_promise := DATE_PART('day', promised_date_parsed - order_date_parsed);
    IF days_between_order_promise < 28 THEN
      calculated_score := calculated_score + 200;
      -- Also update the expedite flag
      UPDATE jobs SET is_expedite = TRUE WHERE id = job_id;
    END IF;
  ELSIF job_record.is_expedite THEN
    calculated_score := calculated_score + 200;
  END IF;
  
  -- 4. Days to Promised (0-150 points)
  IF promised_date_parsed IS NOT NULL THEN
    days_until_promised := DATE_PART('day', promised_date_parsed - CURRENT_DATE);
    
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