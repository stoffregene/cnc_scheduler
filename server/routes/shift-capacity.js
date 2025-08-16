const express = require('express');
const router = express.Router();

/**
 * Get shift capacity data with efficiency modifiers
 * 1st shift: 85% efficiency
 * 2nd shift: 60% efficiency
 */
router.get('/capacity', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { date, period = 'day' } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    let startDate, endDate;
    const baseDate = new Date(targetDate);
    
    // Calculate date range based on period
    switch (period) {
      case 'week':
        // Start of week (Monday)
        const startOfWeek = new Date(baseDate);
        startOfWeek.setDate(baseDate.getDate() - baseDate.getDay() + 1);
        startDate = startOfWeek.toISOString().split('T')[0];
        
        // End of week (Sunday)
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endDate = endOfWeek.toISOString().split('T')[0];
        break;
        
      case 'month':
        // Start of month
        const startOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        startDate = startOfMonth.toISOString().split('T')[0];
        
        // End of month
        const endOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
        endDate = endOfMonth.toISOString().split('T')[0];
        break;
        
      default: // 'day'
        startDate = endDate = targetDate;
    }
    
    // Get all employees with their work schedules and scheduled job hours for the date range
    const capacityQuery = `
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.position,
        e.shift_type,
        e.start_time,
        e.end_time,
        COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes,
        COUNT(DISTINCT ss.slot_date) as working_days
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.numeric_id = ss.employee_id
        AND ss.slot_date BETWEEN $1::date AND $2::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active'
      GROUP BY e.employee_id, e.first_name, e.last_name, e.position, e.shift_type, e.start_time, e.end_time
      ORDER BY e.first_name, e.last_name
    `;
    
    const result = await pool.query(capacityQuery, [startDate, endDate]);
    
    // Process the data to calculate shift capacities and consumption
    let firstShiftHours = 0;
    let secondShiftHours = 0;
    let firstShiftOperators = 0;
    let secondShiftOperators = 0;
    let firstShiftScheduledHours = 0;
    let secondShiftScheduledHours = 0;
    
    const operators = [];
    
    // Calculate number of days in the period
    const periodDays = period === 'day' ? 1 : 
                      period === 'week' ? 7 : 
                      Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
    
    result.rows.forEach(employee => {
      if (!employee.start_time || !employee.end_time) {
        return; // Skip employees without work schedules
      }
      
      // Parse shift times
      const startHour = parseInt(employee.start_time.split(':')[0]);
      const endHour = parseInt(employee.end_time.split(':')[0]);
      
      // Calculate daily shift duration (handle overnight shifts)
      let dailyShiftDuration;
      if (endHour > startHour) {
        dailyShiftDuration = endHour - startHour;
      } else {
        // Overnight shift
        dailyShiftDuration = (24 - startHour) + endHour;
      }
      
      // Calculate total capacity for the period (assuming 5 working days per week)
      let totalCapacityHours;
      if (period === 'day') {
        totalCapacityHours = dailyShiftDuration;
      } else if (period === 'week') {
        totalCapacityHours = dailyShiftDuration * 5; // 5 working days
      } else { // month
        const workingDaysInPeriod = Math.floor(periodDays * (5/7)); // Approximate working days
        totalCapacityHours = dailyShiftDuration * workingDaysInPeriod;
      }
      
      // Convert scheduled minutes to hours
      const scheduledHours = employee.total_scheduled_minutes / 60;
      
      // Use the actual shift_type field from employee record
      let shiftType;
      if (employee.shift_type === 'day') {
        shiftType = '1st';
        firstShiftHours += totalCapacityHours;
        firstShiftScheduledHours += scheduledHours;
        firstShiftOperators++;
      } else if (employee.shift_type === 'night') {
        shiftType = '2nd';
        secondShiftHours += totalCapacityHours;
        secondShiftScheduledHours += scheduledHours;
        secondShiftOperators++;
      } else {
        // Default fallback if shift_type is null - classify by start time
        if (startHour >= 4 && startHour <= 15) {
          shiftType = '1st';
          firstShiftHours += totalCapacityHours;
          firstShiftScheduledHours += scheduledHours;
          firstShiftOperators++;
        } else {
          shiftType = '2nd';
          secondShiftHours += totalCapacityHours;
          secondShiftScheduledHours += scheduledHours;
          secondShiftOperators++;
        }
      }
      
      const utilizationPercent = totalCapacityHours > 0 ? (scheduledHours / totalCapacityHours) * 100 : 0;
      
      operators.push({
        employee_id: employee.employee_id,
        name: `${employee.first_name} ${employee.last_name}`,
        position: employee.position,
        shift_start: employee.start_time,
        shift_end: employee.end_time,
        daily_shift_duration: dailyShiftDuration,
        total_capacity_hours: totalCapacityHours,
        scheduled_hours: scheduledHours,
        utilization_percent: Math.round(utilizationPercent * 10) / 10,
        shift_type: shiftType,
        working_days: employee.working_days || 0
      });
    });
    
    // Apply efficiency modifiers
    const firstShiftCapacity = firstShiftHours * 0.85; // 85% efficiency
    const secondShiftCapacity = secondShiftHours * 0.60; // 60% efficiency
    
    // Calculate utilization percentages
    const firstShiftUtilization = firstShiftCapacity > 0 ? (firstShiftScheduledHours / firstShiftCapacity) * 100 : 0;
    const secondShiftUtilization = secondShiftCapacity > 0 ? (secondShiftScheduledHours / secondShiftCapacity) * 100 : 0;
    const totalUtilization = (firstShiftCapacity + secondShiftCapacity) > 0 ? 
      ((firstShiftScheduledHours + secondShiftScheduledHours) / (firstShiftCapacity + secondShiftCapacity)) * 100 : 0;
    
    const shiftCapacity = {
      period: period,
      start_date: startDate,
      end_date: endDate,
      period_days: periodDays,
      first_shift: {
        operators: firstShiftOperators,
        total_hours: firstShiftHours,
        scheduled_hours: firstShiftScheduledHours,
        efficiency_modifier: 0.85,
        usable_capacity: firstShiftCapacity,
        usable_capacity_formatted: `${Math.round(firstShiftCapacity * 10) / 10}h`,
        scheduled_hours_formatted: `${Math.round(firstShiftScheduledHours * 10) / 10}h`,
        utilization_percent: Math.round(firstShiftUtilization * 10) / 10,
        remaining_capacity: firstShiftCapacity - firstShiftScheduledHours,
        remaining_capacity_formatted: `${Math.round((firstShiftCapacity - firstShiftScheduledHours) * 10) / 10}h`
      },
      second_shift: {
        operators: secondShiftOperators,
        total_hours: secondShiftHours,
        scheduled_hours: secondShiftScheduledHours,
        efficiency_modifier: 0.60,
        usable_capacity: secondShiftCapacity,
        usable_capacity_formatted: `${Math.round(secondShiftCapacity * 10) / 10}h`,
        scheduled_hours_formatted: `${Math.round(secondShiftScheduledHours * 10) / 10}h`,
        utilization_percent: Math.round(secondShiftUtilization * 10) / 10,
        remaining_capacity: secondShiftCapacity - secondShiftScheduledHours,
        remaining_capacity_formatted: `${Math.round((secondShiftCapacity - secondShiftScheduledHours) * 10) / 10}h`
      },
      total_capacity: {
        operators: firstShiftOperators + secondShiftOperators,
        total_hours: firstShiftHours + secondShiftHours,
        scheduled_hours: firstShiftScheduledHours + secondShiftScheduledHours,
        usable_capacity: firstShiftCapacity + secondShiftCapacity,
        usable_capacity_formatted: `${Math.round((firstShiftCapacity + secondShiftCapacity) * 10) / 10}h`,
        scheduled_hours_formatted: `${Math.round((firstShiftScheduledHours + secondShiftScheduledHours) * 10) / 10}h`,
        utilization_percent: Math.round(totalUtilization * 10) / 10,
        remaining_capacity: (firstShiftCapacity + secondShiftCapacity) - (firstShiftScheduledHours + secondShiftScheduledHours),
        remaining_capacity_formatted: `${Math.round(((firstShiftCapacity + secondShiftCapacity) - (firstShiftScheduledHours + secondShiftScheduledHours)) * 10) / 10}h`
      },
      operators_detail: operators
    };
    
    res.json(shiftCapacity);
    
  } catch (error) {
    console.error('Error fetching shift capacity:', error);
    res.status(500).json({ error: 'Failed to fetch shift capacity data' });
  }
});

module.exports = router;