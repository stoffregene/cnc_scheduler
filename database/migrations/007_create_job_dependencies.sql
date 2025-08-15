-- Job Dependencies for Assembly Jobs
-- This migration adds support for parent-child job relationships where assembly jobs (12345) 
-- depend on completion of component jobs (12345-1, 12345-2, etc.)

-- Add assembly-related fields to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(20) DEFAULT 'standard';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assembly_sequence INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_assembly_parent BOOLEAN DEFAULT FALSE;

-- Add comments for clarity
COMMENT ON COLUMN jobs.job_type IS 'Type of job: standard, assembly_parent, assembly_component';
COMMENT ON COLUMN jobs.parent_job_id IS 'References parent assembly job for component jobs';
COMMENT ON COLUMN jobs.assembly_sequence IS 'Order sequence for assembly components';
COMMENT ON COLUMN jobs.is_assembly_parent IS 'TRUE if this job is an assembly that depends on child jobs';

-- Create job_dependencies table for explicit dependency tracking
CREATE TABLE IF NOT EXISTS job_dependencies (
    id SERIAL PRIMARY KEY,
    dependent_job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    prerequisite_job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    dependency_type VARCHAR(20) DEFAULT 'assembly', -- 'assembly', 'sequence', 'resource', 'custom'
    is_hard_dependency BOOLEAN DEFAULT TRUE, -- FALSE for soft dependencies that are preferred but not required
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure a job can't depend on itself
    CONSTRAINT no_self_dependency CHECK (dependent_job_id != prerequisite_job_id),
    
    -- Unique constraint to prevent duplicate dependencies
    CONSTRAINT unique_job_dependency UNIQUE (dependent_job_id, prerequisite_job_id)
);

-- Add comments
COMMENT ON TABLE job_dependencies IS 'Explicit job dependency relationships for assembly and sequencing';
COMMENT ON COLUMN job_dependencies.dependent_job_id IS 'The job that depends on another (assembly parent)';
COMMENT ON COLUMN job_dependencies.prerequisite_job_id IS 'The job that must complete first (component)';
COMMENT ON COLUMN job_dependencies.dependency_type IS 'Type of dependency: assembly, sequence, resource, custom';
COMMENT ON COLUMN job_dependencies.is_hard_dependency IS 'TRUE = must complete first, FALSE = preferred order';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id ON jobs(parent_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_is_assembly_parent ON jobs(is_assembly_parent);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_dependent ON job_dependencies(dependent_job_id);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_prerequisite ON job_dependencies(prerequisite_job_id);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_type ON job_dependencies(dependency_type);

-- Function to detect assembly job patterns and create dependencies
CREATE OR REPLACE FUNCTION create_assembly_dependencies(base_job_number VARCHAR(50))
RETURNS TABLE (
    parent_job_id INTEGER,
    child_jobs_created INTEGER,
    dependencies_created INTEGER
) AS $$
DECLARE
    parent_job_record RECORD;
    child_job_record RECORD;
    dependency_count INTEGER := 0;
    child_count INTEGER := 0;
BEGIN
    -- Find or create parent assembly job
    SELECT * INTO parent_job_record FROM jobs WHERE job_number = base_job_number;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent job % not found', base_job_number;
    END IF;
    
    -- Mark parent as assembly parent
    UPDATE jobs 
    SET is_assembly_parent = TRUE, job_type = 'assembly_parent' 
    WHERE id = parent_job_record.id;
    
    -- Find all component jobs (base_job_number-X pattern)
    FOR child_job_record IN 
        SELECT * FROM jobs 
        WHERE job_number ~ ('^' || base_job_number || '-[0-9]+$')
        ORDER BY job_number
    LOOP
        child_count := child_count + 1;
        
        -- Update child job properties
        UPDATE jobs 
        SET 
            parent_job_id = parent_job_record.id,
            job_type = 'assembly_component',
            assembly_sequence = child_count
        WHERE id = child_job_record.id;
        
        -- Create dependency relationship
        INSERT INTO job_dependencies (dependent_job_id, prerequisite_job_id, dependency_type)
        VALUES (parent_job_record.id, child_job_record.id, 'assembly')
        ON CONFLICT (dependent_job_id, prerequisite_job_id) DO NOTHING;
        
        GET DIAGNOSTICS dependency_count = ROW_COUNT;
        IF dependency_count > 0 THEN
            dependencies_created := dependencies_created + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT parent_job_record.id, child_count, dependencies_created;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a job can be scheduled (all dependencies met)
CREATE OR REPLACE FUNCTION can_job_be_scheduled(target_job_id INTEGER)
RETURNS TABLE (
    can_schedule BOOLEAN,
    blocking_jobs INTEGER[],
    blocking_job_numbers TEXT[]
) AS $$
DECLARE
    blocking_job_ids INTEGER[] := '{}';
    blocking_numbers TEXT[] := '{}';
    prereq_record RECORD;
BEGIN
    -- Check all hard dependencies for this job
    FOR prereq_record IN
        SELECT 
            jd.prerequisite_job_id,
            j.job_number,
            j.status
        FROM job_dependencies jd
        JOIN jobs j ON jd.prerequisite_job_id = j.id
        WHERE jd.dependent_job_id = target_job_id
        AND jd.is_hard_dependency = TRUE
        AND j.status NOT IN ('completed', 'shipped')
    LOOP
        blocking_job_ids := array_append(blocking_job_ids, prereq_record.prerequisite_job_id);
        blocking_numbers := array_append(blocking_numbers, prereq_record.job_number);
    END LOOP;
    
    RETURN QUERY SELECT 
        array_length(blocking_job_ids, 1) IS NULL OR array_length(blocking_job_ids, 1) = 0,
        blocking_job_ids,
        blocking_numbers;
END;
$$ LANGUAGE plpgsql;

-- Function to get job dependency tree
CREATE OR REPLACE FUNCTION get_job_dependency_tree(target_job_id INTEGER)
RETURNS TABLE (
    job_id INTEGER,
    job_number VARCHAR(50),
    job_type VARCHAR(20),
    parent_job_id INTEGER,
    dependency_level INTEGER,
    can_schedule BOOLEAN,
    status VARCHAR(20)
) AS $$
WITH RECURSIVE dependency_tree AS (
    -- Base case: the target job
    SELECT 
        j.id as job_id,
        j.job_number,
        j.job_type,
        j.parent_job_id,
        0 as dependency_level,
        j.status
    FROM jobs j
    WHERE j.id = target_job_id
    
    UNION ALL
    
    -- Recursive case: find prerequisite jobs
    SELECT 
        j.id as job_id,
        j.job_number,
        j.job_type,
        j.parent_job_id,
        dt.dependency_level + 1,
        j.status
    FROM jobs j
    JOIN job_dependencies jd ON j.id = jd.prerequisite_job_id
    JOIN dependency_tree dt ON jd.dependent_job_id = dt.job_id
    WHERE dt.dependency_level < 10 -- Prevent infinite recursion
)
SELECT 
    dt.job_id,
    dt.job_number,
    dt.job_type,
    dt.parent_job_id,
    dt.dependency_level,
    dt.status NOT IN ('completed', 'shipped') as can_schedule,
    dt.status
FROM dependency_tree dt
ORDER BY dt.dependency_level DESC, dt.job_number;
$$ LANGUAGE sql;

-- Create a view for easy assembly job management
CREATE OR REPLACE VIEW assembly_jobs_view AS
SELECT 
    parent.id as assembly_id,
    parent.job_number as assembly_job_number,
    parent.part_name as assembly_part_name,
    parent.status as assembly_status,
    parent.due_date as assembly_due_date,
    
    -- Child job details
    json_agg(
        json_build_object(
            'id', child.id,
            'job_number', child.job_number,
            'part_name', child.part_name,
            'status', child.status,
            'assembly_sequence', child.assembly_sequence,
            'completion_percentage', CASE 
                WHEN child.status = 'completed' THEN 100
                WHEN child.status = 'in_progress' THEN 50  
                ELSE 0
            END
        ) ORDER BY child.assembly_sequence
    ) as component_jobs,
    
    -- Assembly progress metrics
    COUNT(child.id) as total_components,
    COUNT(CASE WHEN child.status = 'completed' THEN 1 END) as completed_components,
    ROUND(
        (COUNT(CASE WHEN child.status = 'completed' THEN 1 END)::DECIMAL / 
         NULLIF(COUNT(child.id), 0)) * 100, 1
    ) as completion_percentage,
    
    -- Can the assembly be scheduled?
    (COUNT(CASE WHEN child.status = 'completed' THEN 1 END) = COUNT(child.id)) as ready_for_assembly
    
FROM jobs parent
LEFT JOIN jobs child ON parent.id = child.parent_job_id
WHERE parent.is_assembly_parent = TRUE
GROUP BY parent.id, parent.job_number, parent.part_name, parent.status, parent.due_date
ORDER BY parent.job_number;

-- Sample data for testing (commented out - uncomment to create test data)
/*
-- Create test assembly jobs
INSERT INTO jobs (job_number, part_name, quantity, job_type, is_assembly_parent) 
VALUES ('12345', 'Test Assembly', 1, 'assembly_parent', TRUE);

INSERT INTO jobs (job_number, part_name, quantity, job_type, parent_job_id) 
VALUES 
    ('12345-1', 'Component 1', 1, 'assembly_component', (SELECT id FROM jobs WHERE job_number = '12345')),
    ('12345-2', 'Component 2', 1, 'assembly_component', (SELECT id FROM jobs WHERE job_number = '12345'));

-- Create dependencies
INSERT INTO job_dependencies (dependent_job_id, prerequisite_job_id, dependency_type)
SELECT 
    parent.id,
    child.id,
    'assembly'
FROM jobs parent, jobs child
WHERE parent.job_number = '12345' 
AND child.job_number IN ('12345-1', '12345-2');
*/