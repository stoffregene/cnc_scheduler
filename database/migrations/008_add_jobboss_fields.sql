-- Additional fields for JobBoss CSV import
-- Material tracking, vendor management, and routing status

-- Add material tracking fields to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS link_material BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS material_lead_days INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS material_due_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS material_req VARCHAR(100);

-- Add outsourcing fields to job_routings table
ALTER TABLE job_routings ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN DEFAULT FALSE;
ALTER TABLE job_routings ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(100);
ALTER TABLE job_routings ADD COLUMN IF NOT EXISTS vendor_lead_days INTEGER DEFAULT 0;
ALTER TABLE job_routings ADD COLUMN IF NOT EXISTS routing_status VARCHAR(10) DEFAULT 'O';

-- Create vendors table for outsourcing management
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    contact_info JSONB,
    lead_days INTEGER DEFAULT 0,
    vendor_type VARCHAR(20) DEFAULT 'outsource', -- 'outsource', 'material', 'service'
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create material orders table for tracking incoming materials
CREATE TABLE IF NOT EXISTS material_orders (
    id SERIAL PRIMARY KEY,
    material_req VARCHAR(100) UNIQUE NOT NULL,
    job_ids INTEGER[], -- Array of job IDs that need this material
    material_description TEXT,
    vendor_id INTEGER REFERENCES vendors(id),
    order_date DATE,
    due_date DATE,
    received_date DATE,
    status VARCHAR(20) DEFAULT 'ordered', -- 'ordered', 'shipped', 'received', 'cancelled'
    lead_days INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add comments for clarity
COMMENT ON COLUMN jobs.link_material IS 'TRUE if job requires material order before starting';
COMMENT ON COLUMN jobs.material_lead_days IS 'Days required for material delivery';
COMMENT ON COLUMN jobs.material_due_date IS 'Date material order is due to arrive';
COMMENT ON COLUMN jobs.material_req IS 'Material order number reference';

COMMENT ON COLUMN job_routings.is_outsourced IS 'TRUE if this operation is sent to external vendor';
COMMENT ON COLUMN job_routings.vendor_name IS 'Name of outsourcing vendor';
COMMENT ON COLUMN job_routings.vendor_lead_days IS 'Days required for outsourced operation';
COMMENT ON COLUMN job_routings.routing_status IS 'O=Open, S=Started, C=Completed';

COMMENT ON TABLE vendors IS 'External vendors for outsourcing and material supply';
COMMENT ON TABLE material_orders IS 'Material orders awaiting delivery';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_jobs_link_material ON jobs(link_material);
CREATE INDEX IF NOT EXISTS idx_jobs_material_due_date ON jobs(material_due_date);
CREATE INDEX IF NOT EXISTS idx_job_routings_outsourced ON job_routings(is_outsourced);
CREATE INDEX IF NOT EXISTS idx_job_routings_vendor ON job_routings(vendor_name);
CREATE INDEX IF NOT EXISTS idx_job_routings_status ON job_routings(routing_status);
CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(vendor_type);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_material_orders_status ON material_orders(status);
CREATE INDEX IF NOT EXISTS idx_material_orders_due_date ON material_orders(due_date);

-- Function to check if job is ready to start (material received)
CREATE OR REPLACE FUNCTION is_job_ready_for_production(target_job_id INTEGER)
RETURNS TABLE (
    ready_for_production BOOLEAN,
    material_status VARCHAR(20),
    material_due_date DATE,
    blocking_reason TEXT
) AS $$
DECLARE
    job_record RECORD;
    material_order_record RECORD;
BEGIN
    -- Get job details
    SELECT * INTO job_record FROM jobs WHERE id = target_job_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'job_not_found'::VARCHAR(20), NULL::DATE, 'Job not found'::TEXT;
        RETURN;
    END IF;
    
    -- If no material link, job is ready
    IF NOT job_record.link_material THEN
        RETURN QUERY SELECT TRUE, 'no_material_required'::VARCHAR(20), NULL::DATE, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Check material order status
    SELECT * INTO material_order_record 
    FROM material_orders 
    WHERE material_req = job_record.material_req;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'material_not_ordered'::VARCHAR(20), job_record.material_due_date, 'Material order not found'::TEXT;
        RETURN;
    END IF;
    
    -- Check if material has been received
    IF material_order_record.status = 'received' THEN
        RETURN QUERY SELECT TRUE, 'material_received'::VARCHAR(20), material_order_record.due_date, NULL::TEXT;
    ELSIF material_order_record.status = 'shipped' THEN
        RETURN QUERY SELECT FALSE, 'material_shipped'::VARCHAR(20), material_order_record.due_date, 'Material shipped but not received'::TEXT;
    ELSIF material_order_record.status = 'ordered' THEN
        RETURN QUERY SELECT FALSE, 'material_ordered'::VARCHAR(20), material_order_record.due_date, 'Material ordered but not shipped'::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, material_order_record.status, material_order_record.due_date, 'Material order status: ' || material_order_record.status;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- View for jobs awaiting material
CREATE OR REPLACE VIEW jobs_awaiting_material AS
SELECT 
    j.id,
    j.job_number,
    j.customer_name,
    j.part_name,
    j.material,
    j.material_req,
    j.material_due_date,
    j.material_lead_days,
    mo.status as material_order_status,
    mo.order_date,
    mo.due_date as order_due_date,
    mo.received_date,
    CASE 
        WHEN mo.status = 'received' THEN '✅ Ready'
        WHEN mo.status = 'shipped' THEN '🚚 Shipped'
        WHEN mo.status = 'ordered' THEN '📋 Ordered'
        WHEN mo.status IS NULL THEN '❌ No Order'
        ELSE mo.status
    END as material_status_display,
    
    -- Days until due
    CASE 
        WHEN j.material_due_date IS NOT NULL THEN 
            (j.material_due_date - CURRENT_DATE)
        ELSE NULL
    END as days_until_due,
    
    -- Blocking production
    mo.status != 'received' OR mo.status IS NULL as is_blocking_production
    
FROM jobs j
LEFT JOIN material_orders mo ON j.material_req = mo.material_req
WHERE j.link_material = TRUE
ORDER BY 
    CASE 
        WHEN mo.status = 'received' THEN 4
        WHEN mo.status = 'shipped' THEN 3
        WHEN mo.status = 'ordered' THEN 2
        ELSE 1
    END,
    j.material_due_date ASC NULLS LAST;

-- View for outsourced operations tracking
CREATE OR REPLACE VIEW outsourced_operations_view AS
SELECT 
    jr.id as routing_id,
    j.job_number,
    j.customer_name,
    jr.operation_number,
    jr.operation_name,
    jr.vendor_name,
    jr.vendor_lead_days,
    jr.routing_status,
    jr.estimated_hours,
    v.contact_info,
    v.status as vendor_status,
    
    CASE jr.routing_status
        WHEN 'O' THEN '📋 Open'
        WHEN 'S' THEN '🔄 Started'
        WHEN 'C' THEN '✅ Completed'
        ELSE jr.routing_status
    END as status_display,
    
    -- Find related schedule slots
    ss.slot_date,
    ss.start_datetime,
    ss.end_datetime,
    ss.status as schedule_status
    
FROM job_routings jr
JOIN jobs j ON jr.job_id = j.id
LEFT JOIN vendors v ON jr.vendor_name = v.name
LEFT JOIN schedule_slots ss ON ss.job_routing_id = jr.id
WHERE jr.is_outsourced = TRUE
ORDER BY 
    CASE jr.routing_status
        WHEN 'S' THEN 1  -- Started operations first
        WHEN 'O' THEN 2  -- Open operations next
        WHEN 'C' THEN 3  -- Completed last
        ELSE 4
    END,
    j.job_number,
    jr.operation_number;