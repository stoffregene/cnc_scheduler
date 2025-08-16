const fs = require('fs');
const csv = require('csv-parser');

class JobBossCSVParserV2 {
  constructor(pool) {
    this.pool = pool;
    this.jobs = new Map(); // job_number -> job data
    this.routings = []; // All routing lines (deduplicated)
    this.routingMap = new Map(); // job_number-operation_number -> routing (for deduplication)
    this.vendors = new Map(); // vendor -> lead_days
    this.assemblyGroups = new Map(); // base_job_number -> { parent: job, children: [jobs] }
  }

  /**
   * Parse JobBoss CSV format V2 - Updated column structure
   * Headers: Job,Customer,Material,Affects_Schedule,Material Lead Days,Part_Number,Description,Total Est Hours,Status,Operation #,AMT Workcenter,Operation Status,Outsource Vendor,Outsourcing Lead Days,Make Qty,Pick Qty,Order_Date,Promised_Date
   */
  async parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const rawData = [];
      
      fs.createReadStream(filePath)
        .pipe(csv({
          // Map CSV columns to our field names - NEW FORMAT
          mapHeaders: ({ header, index }) => {
            const columnMap = {
              0: 'job_number',              // Job
              1: 'customer_name',           // Customer  
              2: 'material',                // Material
              3: 'affects_schedule',        // Affects_Schedule (boolean)
              4: 'material_lead_days',      // Material Lead Days
              5: 'part_number',             // Part_Number
              6: 'part_description',        // Description
              7: 'est_total_hours',         // Total Est Hours
              8: 'status',                  // Status (job level)
              9: 'operation_number',        // Operation #
              10: 'amt_workcenter',         // AMT Workcenter
              11: 'operation_status',       // Operation Status (O/C/S)
              12: 'outsource_vendor',       // Outsource Vendor
              13: 'outsourcing_lead_days',  // Outsourcing Lead Days
              14: 'make_qty',               // Make Qty
              15: 'pick_qty',               // Pick Qty
              16: 'order_date',             // Order_Date
              17: 'promised_date'           // Promised_Date
            };
            return columnMap[index] || header;
          }
        }))
        .on('data', (row) => {
          // Clean and validate the row
          const cleanedRow = this.cleanRow(row);
          if (cleanedRow.job_number && cleanedRow.operation_number !== undefined) {
            rawData.push(cleanedRow);
          }
        })
        .on('end', async () => {
          try {
            await this.processRawData(rawData);
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
   * Clean and normalize row data for V2 format
   */
  cleanRow(row) {
    return {
      job_number: String(row.job_number || '').trim(),
      customer_name: String(row.customer_name || '').trim(),
      material: String(row.material || '').trim(),
      affects_schedule: this.parseBoolean(row.affects_schedule),
      material_lead_days: parseInt(row.material_lead_days) || 0,
      part_number: String(row.part_number || '').trim(),
      part_description: String(row.part_description || '').trim(),
      est_total_hours: parseFloat(row.est_total_hours) || 0,
      status: String(row.status || '').toUpperCase().trim(),
      operation_number: String(row.operation_number || '').trim(),
      amt_workcenter: String(row.amt_workcenter || '').trim(),
      operation_status: String(row.operation_status || 'O').toUpperCase().trim(),
      outsource_vendor: String(row.outsource_vendor || '').trim(),
      outsourcing_lead_days: parseInt(row.outsourcing_lead_days) || 0,
      make_qty: parseInt(row.make_qty) || 1,
      pick_qty: parseInt(row.pick_qty) || 0,
      order_date: this.parseDate(row.order_date),
      promised_date: this.parseDate(row.promised_date)
    };
  }

  /**
   * Process raw routing data into jobs and routings
   */
  async processRawData(rawData) {
    console.log(`Processing ${rawData.length} routing lines with NEW format...`);
    
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
      await this.processJob(jobNumber, routingLines);
    }
    
    // Detect assembly relationships
    this.detectAssemblyRelationships();
    
    // Collect vendor lead times
    this.collectVendorData();
  }

  /**
   * Process a single job with its routing lines
   */
  async processJob(jobNumber, routingLines) {
    // Sort routing lines by operation number (convert to numeric for proper sorting)
    routingLines.sort((a, b) => {
      const aNum = parseInt(a.operation_number) || 0;
      const bNum = parseInt(b.operation_number) || 0;
      return aNum - bNum;
    });
    
    // Use first routing line for job-level data (they should all be the same)
    const firstLine = routingLines[0];
    
    // Determine job type and relationships
    const { jobType, parentJobNumber, assemblySequence, isStockJob, stockNumber } = this.analyzeJobNumber(jobNumber);
    
    // Check if this is a pick order (pick_qty = make_qty means no manufacturing required)
    const isPickOrder = this.classifyPickOrder(firstLine);
    
    // Check for outsourcing across all operations
    const hasOutsourcing = routingLines.some(line => this.detectOutsourcing(line));
    const maxOutsourcingLeadDays = routingLines.reduce((max, line) => {
      return this.detectOutsourcing(line) ? Math.max(max, line.outsourcing_lead_days || 0) : max;
    }, 0);
    
    // Create job object
    const job = {
      job_number: jobNumber,
      customer_name: firstLine.customer_name,
      part_name: firstLine.part_description,
      part_number: firstLine.part_number,
      quantity: firstLine.make_qty,
      priority: this.calculatePriority(firstLine, isStockJob),
      estimated_hours: routingLines.reduce((sum, line) => sum + line.est_total_hours, 0),
      due_date: firstLine.promised_date,
      promised_date: firstLine.promised_date,
      order_date: firstLine.order_date, // For expedite calculation
      start_date: firstLine.order_date,
      status: this.mapJobStatus(firstLine.status),
      material: firstLine.material,
      special_instructions: isStockJob ? 'Stock Job - Lower Priority' : (isPickOrder ? 'Pick Order - No Manufacturing Required' : ''),
      job_boss_data: firstLine,
      
      // Assembly fields
      job_type: jobType,
      parent_job_id: null, // Will be set later when we have IDs
      assembly_sequence: assemblySequence,
      is_assembly_parent: jobType === 'assembly_parent',
      
      // Material tracking
      link_material: firstLine.affects_schedule, // New: use affects_schedule as material link
      material_lead_days: firstLine.material_lead_days,
      material_due_date: null, // Not available in new format
      material_req: null, // Not available in new format
      
      // Stock job fields
      is_stock_job: isStockJob || false,
      stock_number: stockNumber || null,
      
      // Pick order fields
      is_pick_order: isPickOrder,
      pick_qty: firstLine.pick_qty,
      make_qty: firstLine.make_qty,
      
      // Outsourcing detection
      has_outsourcing: hasOutsourcing,
      outsourcing_lead_days: maxOutsourcingLeadDays,
      
      // Store for assembly grouping
      _parent_job_number: parentJobNumber
    };
    
    this.jobs.set(jobNumber, job);
    
    // Process routing lines
    for (const line of routingLines) {
      await this.processRoutingLine(jobNumber, line);
    }
  }

  /**
   * Process a single routing line
   */
  async processRoutingLine(jobNumber, line) {
    // Create unique key for deduplication
    const routingKey = `${jobNumber}-${line.operation_number}`;
    
    // Skip if we've already processed this job-operation combination
    if (this.routingMap.has(routingKey)) {
      // Could merge/update data here if needed, but for now just skip duplicates
      return;
    }
    
    // Enhanced outsourcing detection for V2 format
    const isOutsourced = this.detectOutsourcing(line);
    
    // Map operation number to sequence order for scheduling
    const sequenceOrder = this.mapOperationToSequence(line.operation_number, line.amt_workcenter);
    
    // Map to machine or machine group
    const { machineId, machineGroupId, isExternal } = await this.mapWorkCenter(line.amt_workcenter, isOutsourced);
    
    const routing = {
      job_number: jobNumber,
      operation_number: line.operation_number,
      operation_name: isOutsourced ? `Outsource to ${line.outsource_vendor}` : line.amt_workcenter,
      machine_id: machineId,
      machine_group_id: machineGroupId,
      sequence_order: sequenceOrder,
      estimated_hours: line.est_total_hours,
      notes: isOutsourced ? `Vendor: ${line.outsource_vendor}, Lead Days: ${line.outsourcing_lead_days}` : '',
      
      // Outsourcing fields
      is_outsourced: isOutsourced,
      vendor_name: isOutsourced ? line.outsource_vendor : null,
      vendor_lead_days: isOutsourced ? line.outsourcing_lead_days : 0,
      routing_status: line.operation_status, // O=Open, S=Started, C=Completed
      
      // Raw data
      raw_data: line
    };
    
    // Store in map for deduplication
    this.routingMap.set(routingKey, routing);
    this.routings.push(routing);
    
    // Track vendor lead times
    if (isOutsourced && line.outsource_vendor) {
      this.vendors.set(line.outsource_vendor, line.outsourcing_lead_days);
    }
  }

  /**
   * Map operation number to sequence order for proper scheduling
   */
  mapOperationToSequence(operationNumber, workcenter) {
    const opNum = parseInt(operationNumber) || 0;
    
    // Standard mapping based on operation number and workcenter type
    if (workcenter.includes('SAW') || workcenter.includes('WJ-')) {
      return 1; // Cutting operations first
    } else if (workcenter.includes('VMC') || workcenter.includes('LATHE') || workcenter.includes('MILL')) {
      return 2; // Machining operations second
    } else if (workcenter.includes('INSPECT')) {
      return 3; // Inspection last
    } else if (workcenter.includes('ASSEMBLE')) {
      return 4; // Assembly after all manufacturing
    } else {
      // Use operation number + 1 to ensure sequence starts at 1
      return opNum + 1;
    }
  }

  /**
   * Classify if a job is a pick order
   * Pick orders have pick_qty = make_qty, meaning no manufacturing is required
   */
  classifyPickOrder(line) {
    const pickQty = parseInt(line.pick_qty) || 0;
    const makeQty = parseInt(line.make_qty) || 0;
    
    // If pick quantity equals make quantity, it's a pick order
    // This means all parts come from existing stock, no manufacturing needed
    return pickQty > 0 && pickQty === makeQty;
  }

  /**
   * Detect if an operation is outsourced based on V2 format
   * Note: Operation Status (O/S/C) indicates completion status, not outsourcing
   * O = Open (not started), S = Started (in progress), C = Closed (completed)
   */
  detectOutsourcing(line) {
    // Method 1: Has outsource vendor specified
    if (line.outsource_vendor && line.outsource_vendor.trim() !== '') {
      return true;
    }
    
    // Method 2: Empty workcenter but has vendor
    if (!line.amt_workcenter && line.outsource_vendor) {
      return true;
    }
    
    // Method 3: Check for common outsourced operation names
    const outsourcedOps = ['OUTSOURCE', 'OUTSIDE', 'VENDOR', 'SUBCONTRACT', 'EXTERNAL'];
    const operationIsOutsourced = outsourcedOps.some(op => 
      line.amt_workcenter.toUpperCase().includes(op)
    );
    
    return operationIsOutsourced;
  }

  /**
   * Analyze job number for job type and relationships
   */
  analyzeJobNumber(jobNumber) {
    // Check if this is a stock job (format: S12345)
    const stockMatch = jobNumber.match(/^S(\\d+)$/);
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
    const componentMatch = jobNumber.match(/^(\\d+)-(\\d+)$/);
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
   * Map workcenter to machine or machine group
   */
  async mapWorkCenter(workcenter, isOutsourced) {
    if (isOutsourced) {
      return { machineId: null, machineGroupId: null, isExternal: true };
    }
    
    if (!workcenter || workcenter.trim() === '') {
      return { machineId: null, machineGroupId: null, isExternal: false };
    }
    
    // Try direct machine name match first
    try {
      const directMatch = await this.pool.query(
        'SELECT id FROM machines WHERE UPPER(name) = UPPER($1)',
        [workcenter.trim()]
      );
      
      if (directMatch.rows.length > 0) {
        console.log(`✅ Direct machine match: ${workcenter} → Machine ID ${directMatch.rows[0].id}`);
        return { machineId: directMatch.rows[0].id, machineGroupId: null, isExternal: false };
      }
      
      // Try partial matches for common patterns
      const partialMatches = await this.pool.query(
        'SELECT id, name FROM machines WHERE UPPER(name) LIKE UPPER($1)',
        [`%${workcenter.trim()}%`]
      );
      
      if (partialMatches.rows.length > 0) {
        console.log(`🔍 Partial machine match: ${workcenter} → ${partialMatches.rows[0].name} (ID ${partialMatches.rows[0].id})`);
        return { machineId: partialMatches.rows[0].id, machineGroupId: null, isExternal: false };
      }
      
      // Try machine type/family mapping for common cases
      const machineType = this.inferMachineType(workcenter);
      if (machineType) {
        const typeMatch = await this.pool.query(
          'SELECT id, name FROM machines WHERE UPPER(name) LIKE UPPER($1) LIMIT 1',
          [`${machineType}%`]
        );
        
        if (typeMatch.rows.length > 0) {
          console.log(`🎯 Machine type match: ${workcenter} → ${typeMatch.rows[0].name} (ID ${typeMatch.rows[0].id}) based on type ${machineType}`);
          return { machineId: typeMatch.rows[0].id, machineGroupId: null, isExternal: false };
        }
      }
      
      console.warn(`❌ No machine match found for workcenter: ${workcenter}`);
      return { machineId: null, machineGroupId: null, isExternal: false };
      
    } catch (error) {
      console.error(`Error mapping workcenter ${workcenter}:`, error.message);
      return { machineId: null, machineGroupId: null, isExternal: false };
    }
  }
  
  /**
   * Infer machine type from workcenter name
   */
  inferMachineType(workcenter) {
    const upper = workcenter.toUpperCase();
    
    if (upper.includes('VMC') || upper.includes('VERTICAL')) return 'VMC';
    if (upper.includes('HMC') || upper.includes('HORIZONTAL')) return 'HMC';
    if (upper.includes('LATHE') || upper.includes('TURN')) return 'LATHE';
    if (upper.includes('SAW') || upper.includes('CUT')) return 'SAW';
    if (upper.includes('WJ') || upper.includes('WATERJET')) return 'WJ';
    if (upper.includes('MILL') || upper.includes('MILLING')) return 'MILL';
    if (upper.includes('GRIND')) return 'GRIND';
    if (upper.includes('DRILL')) return 'DRILL';
    if (upper.includes('BEND')) return 'BENDING';
    if (upper.includes('WELD')) return 'WELD';
    if (upper.includes('ASSEMBLE') || upper.includes('ASSEMBLY')) return 'ASSEMBLE';
    if (upper.includes('INSPECT') || upper.includes('QC')) return 'INSPECT';
    if (upper.includes('DEBURR') || upper.includes('FINISH')) return 'DEBURR';
    if (upper.includes('BLAST')) return 'BLAST';
    if (upper.includes('BROACH')) return 'BROACH';
    
    return null;
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

module.exports = JobBossCSVParserV2;