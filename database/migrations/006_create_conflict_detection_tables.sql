-- Conflict Detection Tables
-- These tables store detected scheduling conflicts and resolution tracking

-- Table to store conflict detection runs
CREATE TABLE IF NOT EXISTS conflict_detection_runs (
    id SERIAL PRIMARY KEY,
    detection_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_conflicts_found INTEGER DEFAULT 0,
    conflicts_data JSONB, -- Store the full conflicts object
    run_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table to store individual detected conflicts
CREATE TABLE IF NOT EXISTS detected_conflicts (
    id SERIAL PRIMARY KEY,
    detection_run_id INTEGER REFERENCES conflict_detection_runs(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL, -- 'machine_double_booking', 'operator_double_booking', etc.
    severity VARCHAR(20) DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
    
    -- Affected resources (arrays to handle multiple IDs)
    affected_job_ids INTEGER[],
    affected_employee_ids INTEGER[],
    affected_machine_ids INTEGER[],
    affected_slot_ids INTEGER[],
    
    conflict_data JSONB, -- Store the full conflict details
    suggested_resolutions JSONB, -- Array of resolution suggestions
    
    -- Resolution tracking
    status VARCHAR(20) DEFAULT 'detected', -- 'detected', 'acknowledged', 'resolving', 'resolved', 'ignored'
    resolution_action VARCHAR(100),
    resolution_notes TEXT,
    resolved_by INTEGER REFERENCES employees(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table to store conflict resolution attempts and outcomes
CREATE TABLE IF NOT EXISTS conflict_resolutions (
    id SERIAL PRIMARY KEY,
    conflict_id INTEGER REFERENCES detected_conflicts(id) ON DELETE CASCADE,
    resolution_type VARCHAR(50) NOT NULL, -- 'reschedule', 'reassign_operator', 'split_operation', etc.
    
    -- Before/after state
    original_schedule_data JSONB,
    new_schedule_data JSONB,
    
    success BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    
    -- Impact metrics
    jobs_affected INTEGER DEFAULT 0,
    operators_affected INTEGER DEFAULT 0,
    machines_affected INTEGER DEFAULT 0,
    total_time_shifted_minutes INTEGER DEFAULT 0,
    
    created_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conflict_detection_runs_date ON conflict_detection_runs(detection_date);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_type ON detected_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_severity ON detected_conflicts(severity);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_status ON detected_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_run_id ON detected_conflicts(detection_run_id);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_affected_jobs ON detected_conflicts USING GIN(affected_job_ids);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_affected_employees ON detected_conflicts USING GIN(affected_employee_ids);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_affected_machines ON detected_conflicts USING GIN(affected_machine_ids);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_conflict_id ON conflict_resolutions(conflict_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_type ON conflict_resolutions(resolution_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_detected_conflicts_updated_at 
    BEFORE UPDATE ON detected_conflicts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Sample view for conflict dashboard
CREATE OR REPLACE VIEW conflict_dashboard AS
SELECT 
    dc.id,
    dc.conflict_type,
    dc.severity,
    dc.status,
    dc.created_at,
    dc.resolved_at,
    
    -- Extract job information
    (SELECT array_agg(j.job_number) FROM jobs j WHERE j.id = ANY(dc.affected_job_ids)) as affected_job_numbers,
    
    -- Extract employee information  
    (SELECT array_agg(e.first_name || ' ' || e.last_name) FROM employees e WHERE e.id = ANY(dc.affected_employee_ids)) as affected_operator_names,
    
    -- Extract machine information
    (SELECT array_agg(m.name) FROM machines m WHERE m.id = ANY(dc.affected_machine_ids)) as affected_machine_names,
    
    -- Count of suggested resolutions
    jsonb_array_length(COALESCE(dc.suggested_resolutions, '[]'::jsonb)) as resolution_options,
    
    -- Resolution summary
    CASE 
        WHEN dc.status = 'resolved' THEN dc.resolution_action
        WHEN dc.status = 'resolving' THEN 'In Progress'
        WHEN dc.status = 'acknowledged' THEN 'Acknowledged'
        WHEN dc.status = 'ignored' THEN 'Ignored'
        ELSE 'Pending'
    END as resolution_status,
    
    -- Time since detection
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - dc.created_at))/3600 as hours_since_detection
    
FROM detected_conflicts dc
ORDER BY 
    CASE dc.severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        ELSE 4 
    END,
    dc.created_at DESC;