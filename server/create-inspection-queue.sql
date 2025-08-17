-- Create inspection queue table for QMS manager
CREATE TABLE IF NOT EXISTS inspection_queue (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_number VARCHAR(50) NOT NULL,
  routing_id INTEGER NOT NULL REFERENCES job_routings(id) ON DELETE CASCADE,
  operation_number INTEGER NOT NULL,
  operation_name VARCHAR(100) NOT NULL,
  customer_name VARCHAR(100),
  priority_score DECIMAL(10,2),
  previous_operation_completed_at TIMESTAMP,
  entered_queue_at TIMESTAMP DEFAULT NOW(),
  inspection_started_at TIMESTAMP,
  inspection_completed_at TIMESTAMP,
  inspector_notes TEXT,
  status VARCHAR(20) DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'in_progress', 'completed', 'hold')),
  
  -- Index for efficient querying
  INDEX idx_inspection_queue_status (status),
  INDEX idx_inspection_queue_priority (priority_score DESC),
  INDEX idx_inspection_queue_entered (entered_queue_at),
  
  -- Ensure no duplicates
  UNIQUE(job_id, routing_id)
);

-- Add comments for documentation
COMMENT ON TABLE inspection_queue IS 'Queue for tracking jobs awaiting inspection - used by QMS manager';
COMMENT ON COLUMN inspection_queue.status IS 'awaiting: ready for inspection, in_progress: currently being inspected, completed: inspection done, hold: inspection on hold';
COMMENT ON COLUMN inspection_queue.previous_operation_completed_at IS 'When the previous operation was completed, making this job ready for inspection';
COMMENT ON COLUMN inspection_queue.entered_queue_at IS 'When this job entered the inspection queue';

-- Create function to automatically add jobs to inspection queue when previous operations complete
CREATE OR REPLACE FUNCTION add_to_inspection_queue()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a status change to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Check if the next operation in sequence is an INSPECT operation
    INSERT INTO inspection_queue (
      job_id, job_number, routing_id, operation_number, operation_name,
      customer_name, priority_score, previous_operation_completed_at
    )
    SELECT 
      jr.job_id,
      j.job_number,
      jr.id,
      jr.operation_number,
      jr.operation_name,
      j.customer_name,
      j.priority_score::decimal,
      NEW.actual_end_time
    FROM job_routings jr
    JOIN jobs j ON jr.job_id = j.id
    WHERE jr.job_id = (
      -- Get the job_id from the completed slot
      SELECT ss_jr.job_id 
      FROM job_routings ss_jr 
      WHERE ss_jr.id = NEW.job_routing_id
    )
    AND jr.sequence_order = (
      -- Find the next operation in sequence
      SELECT completed_jr.sequence_order + 1
      FROM job_routings completed_jr
      WHERE completed_jr.id = NEW.job_routing_id
    )
    AND jr.operation_name ILIKE '%INSPECT%'
    -- Don't add duplicates
    AND NOT EXISTS (
      SELECT 1 FROM inspection_queue iq 
      WHERE iq.job_id = jr.job_id AND iq.routing_id = jr.id
    );
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically populate inspection queue
DROP TRIGGER IF EXISTS trigger_add_to_inspection_queue ON schedule_slots;
CREATE TRIGGER trigger_add_to_inspection_queue
  AFTER UPDATE ON schedule_slots
  FOR EACH ROW
  EXECUTE FUNCTION add_to_inspection_queue();

-- Create view for QMS manager dashboard
CREATE OR REPLACE VIEW inspection_dashboard AS
SELECT 
  iq.id,
  iq.job_number,
  iq.operation_number,
  iq.operation_name,
  iq.customer_name,
  iq.priority_score,
  iq.status,
  iq.entered_queue_at,
  iq.inspection_started_at,
  iq.inspection_completed_at,
  iq.inspector_notes,
  -- Calculate time in queue
  CASE 
    WHEN iq.status = 'awaiting' THEN 
      EXTRACT(EPOCH FROM (NOW() - iq.entered_queue_at))/3600
    WHEN iq.status = 'in_progress' THEN 
      EXTRACT(EPOCH FROM (COALESCE(iq.inspection_started_at, NOW()) - iq.entered_queue_at))/3600
    ELSE 
      EXTRACT(EPOCH FROM (COALESCE(iq.inspection_completed_at, iq.inspection_started_at, NOW()) - iq.entered_queue_at))/3600
  END as hours_in_queue,
  
  -- Next operation info (what happens after inspection)
  next_jr.operation_name as next_operation,
  next_m.name as next_machine
FROM inspection_queue iq
LEFT JOIN job_routings next_jr ON (
  next_jr.job_id = iq.job_id 
  AND next_jr.sequence_order = (
    SELECT jr.sequence_order + 1 
    FROM job_routings jr 
    WHERE jr.id = iq.routing_id
  )
)
LEFT JOIN machines next_m ON next_jr.machine_id = next_m.id
ORDER BY 
  CASE iq.status 
    WHEN 'in_progress' THEN 1
    WHEN 'awaiting' THEN 2  
    WHEN 'hold' THEN 3
    WHEN 'completed' THEN 4
  END,
  iq.priority_score DESC,
  iq.entered_queue_at ASC;

COMMENT ON VIEW inspection_dashboard IS 'QMS manager dashboard view showing inspection queue with priorities and timing';