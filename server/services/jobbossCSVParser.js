const fs = require('fs');
const csv = require('csv-parser');

class JobBossCSVParser {
  constructor(pool) {
    this.pool = pool;
    this.jobs = new Map(); // job_number -> job data
    this.routings = []; // All routing lines
    this.vendors = new Map(); // vendor -> lead_days
    this.assemblyGroups = new Map(); // base_job_number -> { parent: job, children: [jobs] }
  }

  /**
   * Parse JobBoss CSV format where each row is a routing line
   * Multiple rows with same Job number = different operations for that job
   */
  async parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const rawData = [];
      
      fs.createReadStream(filePath)
        .pipe(csv({
          // Map CSV columns to our field names
          mapHeaders: ({ header, index }) => {
            const columnMap = {
              0: 'job_number',              // A - Job
              1: 'customer_name',           // B - Customer  
              2: 'part_description',        // C - Part Description
              3: 'est_required_qty',        // D - Est_Required_Qty
              4: 'amt_workcenter_vendor',   // E - AMT Workcenter & Vendor
              5: 'sequence',                // F - Sequence
              6: 'vendor',                  // G - Vendor
              7: 'lead_days',               // H - Lead_Days
              8: 'order_date',              // I - Order_Date
              9: 'promised_date',           // J - Promised_Date
              10: 'est_total_hours',        // K - Est Total Hours
              11: 'link_material',          // L - Link_Material
              12: 'status',                 // M - Status
              13: 'material',               // N - Material
              14: 'material_lead_days',     // O - Material Lead Days
              15: 'material_due_date',      // P - Material Due_Date
              16: 'material_req',           // Q - Material_Req
              17: 'routing_status'          // R - Status (routing level)
            };
            return columnMap[index] || header;
          }
        }))
        .on('data', (row) => {
          // Clean and validate the row
          const cleanedRow = this.cleanRow(row);
          if (cleanedRow.job_number && cleanedRow.sequence >= 0) {
            rawData.push(cleanedRow);
          }
        })
        .on('end', () => {
          try {
            this.processRawData(rawData);
            resolve({
              jobs: Array.from(this.jobs.values()),
              routings: this.routings,
              vendors: Array.from(this.vendors.entries()),
              assemblyGroups: Array.from(this.assemblyGroups.entries())
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Clean and normalize row data
   */
  cleanRow(row) {
    return {
      job_number: String(row.job_number || '').trim(),
      customer_name: String(row.customer_name || '').trim(),
      part_description: String(row.part_description || '').trim(),
      est_required_qty: parseInt(row.est_required_qty) || 1,
      amt_workcenter_vendor: String(row.amt_workcenter_vendor || '').trim(),
      sequence: parseInt(row.sequence) || 0,
      vendor: String(row.vendor || '').trim(),
      lead_days: parseInt(row.lead_days) || 0,
      order_date: this.parseDate(row.order_date),
      promised_date: this.parseDate(row.promised_date),
      est_total_hours: parseFloat(row.est_total_hours) || 0,
      link_material: this.parseBoolean(row.link_material),
      status: String(row.status || '').toUpperCase().trim(),
      material: String(row.material || '').trim(),
      material_lead_days: parseInt(row.material_lead_days) || 0,
      material_due_date: this.parseDate(row.material_due_date),
      material_req: String(row.material_req || '').trim(),
      routing_status: String(row.routing_status || 'O').toUpperCase().trim()
    };
  }

  /**
   * Process raw routing data into jobs and routings
   */
  processRawData(rawData) {
    console.log(`Processing ${rawData.length} routing lines...`);
    
    // Group routing lines by job number
    const jobGroups = new Map();
    for (const row of rawData) {
      if (!jobGroups.has(row.job_number)) {
        jobGroups.set(row.job_number, []);
      }
      jobGroups.get(row.job_number).push(row);
    }
    
    console.log(`Found ${jobGroups.size} unique jobs`);
    
    // Process each job
    for (const [jobNumber, routingLines] of jobGroups) {
      this.processJob(jobNumber, routingLines);
    }
    
    // Detect assembly relationships
    this.detectAssemblyRelationships();
    
    // Collect vendor lead times
    this.collectVendorData();
  }

  /**
   * Process a single job with its routing lines
   */
  processJob(jobNumber, routingLines) {
    // Sort routing lines by sequence
    routingLines.sort((a, b) => a.sequence - b.sequence);
    
    // Use first routing line for job-level data (they should all be the same)
    const firstLine = routingLines[0];
    
    // Determine job type and relationships
    const { jobType, parentJobNumber, assemblySequence, isStockJob, stockNumber } = this.analyzeJobNumber(jobNumber);
    
    // Create job object
    const job = {
      job_number: jobNumber,
      customer_name: firstLine.customer_name,
      part_name: firstLine.part_description,
      part_number: jobNumber, // Using job number as part number
      quantity: firstLine.est_required_qty,
      priority: this.calculatePriority(firstLine, isStockJob),
      estimated_hours: routingLines.reduce((sum, line) => sum + line.est_total_hours, 0),
      due_date: firstLine.promised_date,
      promised_date: firstLine.promised_date,
      order_date: firstLine.order_date, // For expedite calculation
      start_date: firstLine.order_date,
      status: this.mapJobStatus(firstLine.status),
      material: firstLine.material,
      special_instructions: isStockJob ? 'Stock Job - Lower Priority' : '',
      job_boss_data: firstLine,
      
      // Assembly fields
      job_type: jobType,
      parent_job_id: null, // Will be set later when we have IDs
      assembly_sequence: assemblySequence,
      is_assembly_parent: jobType === 'assembly_parent',
      
      // Material tracking
      link_material: firstLine.link_material,
      material_lead_days: firstLine.material_lead_days,
      material_due_date: firstLine.material_due_date,
      material_req: firstLine.material_req,
      
      // Stock job fields
      is_stock_job: isStockJob || false,
      stock_number: stockNumber || null,
      
      // Store for assembly grouping
      _parent_job_number: parentJobNumber
    };
    
    this.jobs.set(jobNumber, job);
    
    // Process routing lines
    for (const line of routingLines) {
      this.processRoutingLine(jobNumber, line);
    }
  }

  /**
   * Process a single routing line
   */
  processRoutingLine(jobNumber, line) {
    // Enhanced outsourcing detection
    const isOutsourced = this.detectOutsourcing(line);
    
    // Track if job has outsourcing for priority calculation
    if (isOutsourced && this.jobs.has(jobNumber)) {
      const job = this.jobs.get(jobNumber);
      job.has_outsourcing = true;
      job.outsourcing_lead_days = Math.max(job.outsourcing_lead_days || 0, line.lead_days || 0);
    }
    
    // Map to machine or machine group
    const { machineId, machineGroupId, isExternal } = this.mapWorkCenter(line.amt_workcenter_vendor, isOutsourced);
    
    const routing = {
      job_number: jobNumber,
      operation_number: line.sequence,
      operation_name: isOutsourced ? `Outsource to ${line.vendor}` : line.amt_workcenter_vendor,
      machine_id: machineId,
      machine_group_id: machineGroupId,
      sequence_order: line.sequence,
      estimated_hours: line.est_total_hours,
      notes: isOutsourced ? `Vendor: ${line.vendor}, Lead Days: ${line.lead_days}` : '',
      
      // Outsourcing fields
      is_outsourced: isOutsourced,
      vendor_name: isOutsourced ? line.vendor : null,
      vendor_lead_days: isOutsourced ? line.lead_days : 0,
      routing_status: line.routing_status,
      
      // Raw data
      raw_data: line
    };
    
    this.routings.push(routing);
    
    // Track vendor lead times
    if (isOutsourced && line.vendor) {
      this.vendors.set(line.vendor, line.lead_days);
    }
  }

  /**
   * Analyze job number for job type and relationships
   */
  analyzeJobNumber(jobNumber) {
    // Check if this is a stock job (format: S12345)
    const stockMatch = jobNumber.match(/^S(\d+)$/);
    if (stockMatch) {
      return {
        jobType: 'stock',
        parentJobNumber: null,
        assemblySequence: null,
        isStockJob: true,
        stockNumber: stockMatch[1]
      };
    }
    
    // Check if this is a component job (format: XXXXX-Y)
    const componentMatch = jobNumber.match(/^(\d+)-(\d+)$/);
    if (componentMatch) {
      return {
        jobType: 'assembly_component',
        parentJobNumber: componentMatch[1],
        assemblySequence: parseInt(componentMatch[2]),
        isStockJob: false
      };
    }
    
    // Check if this could be a parent assembly job
    // We'll determine this after processing all jobs
    return {
      jobType: 'standard',
      parentJobNumber: null,
      assemblySequence: null,
      isStockJob: false
    };
  }

  /**
   * Detect assembly relationships after all jobs are processed
   */
  detectAssemblyRelationships() {
    const allJobNumbers = Array.from(this.jobs.keys());
    
    // Find potential parent assemblies
    for (const [jobNumber, job] of this.jobs) {
      if (job.job_type === 'standard') {
        // Check if there are child jobs with this base number
        const hasChildren = allJobNumbers.some(jn => jn.startsWith(jobNumber + '-'));
        if (hasChildren) {
          job.job_type = 'assembly_parent';
          job.is_assembly_parent = true;
        }
      }
    }
    
    // Group assembly relationships
    for (const [jobNumber, job] of this.jobs) {
      if (job.job_type === 'assembly_component') {
        const baseJobNumber = job._parent_job_number;
        
        if (!this.assemblyGroups.has(baseJobNumber)) {
          this.assemblyGroups.set(baseJobNumber, { parent: null, children: [] });
        }
        
        this.assemblyGroups.get(baseJobNumber).children.push(job);
      } else if (job.job_type === 'assembly_parent') {
        if (!this.assemblyGroups.has(jobNumber)) {
          this.assemblyGroups.set(jobNumber, { parent: null, children: [] });
        }
        
        this.assemblyGroups.get(jobNumber).parent = job;
      }
    }
  }

  /**
   * Detect if an operation is outsourced based on multiple criteria
   */
  detectOutsourcing(line) {
    // Method 1: Vendor in both workcenter and vendor columns
    const vendorInBoth = line.amt_workcenter_vendor === line.vendor && line.vendor !== '';
    
    // Method 2: Check if workcenter looks like a vendor name (contains common vendor indicators)
    const vendorKeywords = ['LLC', 'INC', 'CORP', 'CO', '&', 'MACHINE', 'SHOP', 'MFG', 'MANUFACTURING'];
    const workenterLooksLikeVendor = vendorKeywords.some(keyword => 
      line.amt_workcenter_vendor.toUpperCase().includes(keyword)
    );
    
    // Method 3: Check if there's a lead time specified (usually indicates outsourcing)
    const hasLeadTime = line.lead_days && parseInt(line.lead_days) > 0;
    
    // Method 4: Check for common outsourced operation names
    const outsourcedOps = ['OUTSOURCE', 'OUTSIDE', 'VENDOR', 'SUBCONTRACT', 'EXTERNAL'];
    const operationIsOutsourced = outsourcedOps.some(op => 
      line.amt_workcenter_vendor.toUpperCase().includes(op)
    );
    
    return vendorInBoth || workenterLooksLikeVendor || operationIsOutsourced || 
           (hasLeadTime && line.vendor !== '');
  }

  /**
   * Map workcenter to machine or machine group
   */
  mapWorkCenter(workcenter, isOutsourced) {
    if (isOutsourced) {
      return { machineId: null, machineGroupId: null, isExternal: true };
    }
    
    // This will need to be customized based on your actual machine/group names
    // For now, returning null to let the system handle it
    return { machineId: null, machineGroupId: null, isExternal: false };
  }

  /**
   * Calculate job priority based on due date and status
   */
  calculatePriority(line, isStockJob = false) {
    // Stock jobs get lower priority (higher numbers = lower priority)
    const stockJobPenalty = isStockJob ? 2 : 0;
    
    if (!line.promised_date) return 5 + stockJobPenalty;
    
    const today = new Date();
    const dueDate = new Date(line.promised_date);
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    let basePriority;
    if (daysUntilDue < 0) basePriority = 1; // Overdue - highest priority
    else if (daysUntilDue <= 7) basePriority = 2; // Due within a week
    else if (daysUntilDue <= 14) basePriority = 3; // Due within two weeks
    else if (daysUntilDue <= 30) basePriority = 4; // Due within a month
    else basePriority = 5; // Normal priority
    
    // Apply stock job penalty, but cap at priority 10
    return Math.min(basePriority + stockJobPenalty, 10);
  }

  /**
   * Map JobBoss status to our system status
   */
  mapJobStatus(status) {
    switch (status) {
      case 'ACTIVE': return 'pending';
      case 'CLOSED': return 'completed';
      case 'HOLD': return 'on_hold';
      default: return 'pending';
    }
  }

  /**
   * Collect vendor data for lead time tracking
   */
  collectVendorData() {
    // This data will be used to create/update vendor records
    console.log(`Collected ${this.vendors.size} vendors with lead times`);
  }

  /**
   * Parse date strings to proper Date objects
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
  }

  /**
   * Parse boolean values from various formats
   */
  parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    const str = String(value).toLowerCase().trim();
    return ['true', '1', 'yes', 'y', 'on'].includes(str);
  }
}

module.exports = JobBossCSVParser;