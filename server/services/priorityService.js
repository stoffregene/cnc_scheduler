const { Pool } = require('pg');

class PriorityService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Calculate priority score for a job
   * Calls the database function and returns the score
   */
  async calculatePriorityScore(jobId) {
    try {
      const result = await this.pool.query(
        'SELECT calculate_priority_score($1) as score',
        [jobId]
      );
      return result.rows[0].score;
    } catch (error) {
      console.error('Error calculating priority score:', error);
      return 0;
    }
  }

  /**
   * Update priority scores for all active jobs
   * Useful for daily recalculation
   */
  async recalculateAllPriorities() {
    try {
      await this.pool.query('SELECT recalculate_all_priorities()');
      console.log('✅ Recalculated all job priorities');
    } catch (error) {
      console.error('Error recalculating priorities:', error);
    }
  }

  /**
   * Get priority color based on score
   */
  getPriorityColor(score) {
    if (score >= 800) return '#ef4444'; // red - critical
    if (score >= 600) return '#f97316'; // orange - high
    if (score >= 300) return '#eab308'; // yellow - medium
    return '#22c55e'; // green - standard
  }

  /**
   * Get priority label based on score
   */
  getPriorityLabel(score) {
    if (score >= 800) return 'CRITICAL';
    if (score >= 600) return 'HIGH';
    if (score >= 300) return 'MEDIUM';
    return 'STANDARD';
  }

  /**
   * Check if job has outsourcing and update flags
   * Called during CSV import parsing
   */
  async checkAndUpdateOutsourcing(jobId, routings) {
    try {
      let hasOutsourcing = false;
      let maxLeadDays = 0;

      // Check each routing for outsourcing
      for (const routing of routings) {
        // Operation is outsourced if vendor exists but workcenter doesn't
        if (routing.vendor && !routing.workcenter) {
          hasOutsourcing = true;
          // Parse lead days from vendor info if available
          const leadDays = this.parseLeadDays(routing.vendor_lead_time || routing.notes);
          maxLeadDays = Math.max(maxLeadDays, leadDays);
        }
      }

      // Update job with outsourcing info
      if (hasOutsourcing) {
        await this.pool.query(
          `UPDATE jobs 
           SET has_outsourcing = $1, 
               outsourcing_lead_days = $2 
           WHERE id = $3`,
          [hasOutsourcing, maxLeadDays, jobId]
        );
        
        console.log(`📦 Job ${jobId} has outsourcing with ${maxLeadDays} day lead time`);
      }

      return { hasOutsourcing, maxLeadDays };
    } catch (error) {
      console.error('Error checking outsourcing:', error);
      return { hasOutsourcing: false, maxLeadDays: 0 };
    }
  }

  /**
   * Parse lead days from vendor string or notes
   */
  parseLeadDays(text) {
    if (!text) return 0;
    
    // Look for patterns like "10 days", "2 weeks", etc.
    const dayMatch = text.match(/(\d+)\s*days?/i);
    if (dayMatch) return parseInt(dayMatch[1]);
    
    const weekMatch = text.match(/(\d+)\s*weeks?/i);
    if (weekMatch) return parseInt(weekMatch[1]) * 7;
    
    // Default lead time if no pattern found
    return 5; // Default 5 days for outsourcing
  }

  /**
   * Auto-add or update customer tier
   */
  async ensureCustomerTier(customerName) {
    try {
      // Check if customer exists
      const existingResult = await this.pool.query(
        'SELECT * FROM customer_tiers WHERE UPPER(customer_name) = UPPER($1)',
        [customerName]
      );

      if (existingResult.rows.length === 0) {
        // Auto-add as standard tier
        await this.pool.query(
          `INSERT INTO customer_tiers (customer_name, tier, priority_weight)
           VALUES ($1, 'standard', 0)
           ON CONFLICT (customer_name) DO NOTHING`,
          [customerName]
        );
        
        console.log(`➕ Added new customer "${customerName}" as standard tier`);
      }
    } catch (error) {
      console.error('Error ensuring customer tier:', error);
    }
  }

  /**
   * Get all customer tiers for management UI
   */
  async getAllCustomerTiers() {
    try {
      const result = await this.pool.query(
        'SELECT * FROM customer_tiers ORDER BY tier DESC, customer_name'
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching customer tiers:', error);
      return [];
    }
  }

  /**
   * Update customer tier
   */
  async updateCustomerTier(customerName, tier) {
    try {
      const tierWeights = {
        'top': 400,
        'mid': 200,
        'standard': 0
      };

      await this.pool.query(
        `UPDATE customer_tiers 
         SET tier = $1, 
             priority_weight = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE customer_name = $3`,
        [tier, tierWeights[tier] || 0, customerName]
      );

      // Recalculate priorities for this customer's jobs
      await this.pool.query(
        `UPDATE jobs 
         SET priority_score = calculate_priority_score(id)
         WHERE customer_name = $1`,
        [customerName]
      );

      console.log(`✅ Updated ${customerName} to ${tier} tier`);
      return true;
    } catch (error) {
      console.error('Error updating customer tier:', error);
      return false;
    }
  }

  /**
   * Check if job should be expedited based on order-to-promise gap
   */
  checkExpediteStatus(orderDate, promisedDate) {
    if (!orderDate || !promisedDate) return false;
    
    const order = new Date(orderDate);
    const promised = new Date(promisedDate);
    const daysBetween = Math.ceil((promised - order) / (1000 * 60 * 60 * 24));
    
    return daysBetween < 28;
  }
}

module.exports = PriorityService;