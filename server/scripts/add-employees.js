const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const employees = [
  {
    employee_id: 'AA001',
    first_name: 'Aaron',
    last_name: 'Ackelson',
    email: 'aaron.ackelson@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-01-15',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '15:00:00', // 3:00 PM
    end_time: '13:30:00',   // 1:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'AC002',
    first_name: 'Aaron',
    last_name: 'Chastain',
    email: 'aaron.chastain@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-02-01',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '16:00:00', // 4:00 PM
    end_time: '14:30:00',   // 2:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'AP003',
    first_name: 'Andy',
    last_name: 'Pontier',
    email: 'andy.pontier@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-01-20',
    shift_type: 'night',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '15:00:00', // 3:00 PM
    end_time: '01:30:00',   // 1:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'CL004',
    first_name: 'Calob',
    last_name: 'Lamaster',
    email: 'calob.lamaster@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-03-10',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '17:00:00', // 5:00 PM
    end_time: '15:30:00',   // 3:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'CS005',
    first_name: 'Corey',
    last_name: 'Smith',
    email: 'corey.smith@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-02-15',
    shift_type: 'night',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '15:00:00', // 3:00 PM
    end_time: '01:30:00',   // 1:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'CN006',
    first_name: 'Charles',
    last_name: 'Nguyen',
    email: 'charles.nguyen@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-01-25',
    shift_type: 'night',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '15:00:00', // 3:00 PM
    end_time: '01:30:00',   // 1:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'CJ007',
    first_name: 'Chris',
    last_name: 'Johnson',
    email: 'chris.johnson@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-02-20',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '16:00:00', // 4:00 PM
    end_time: '14:30:00',   // 2:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'DR008',
    first_name: 'Dakota',
    last_name: 'Robertson',
    email: 'dakota.robertson@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-03-05',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '17:00:00', // 5:00 PM
    end_time: '15:30:00',   // 3:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'DD009',
    first_name: 'Drew',
    last_name: 'Darling',
    email: 'drew.darling@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-02-10',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '16:30:00', // 4:30 PM
    end_time: '15:00:00',   // 3:00 AM next day
    status: 'active'
  },
  {
    employee_id: 'JG010',
    first_name: 'Jack',
    last_name: 'Glasgow',
    email: 'jack.glasgow@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-01-30',
    shift_type: 'day',
    work_days: [1, 2, 3, 4, 5], // M/T/W/R/F (special Friday schedule)
    start_time: '18:30:00', // 6:30 PM
    end_time: '16:00:00',   // 4:00 AM next day (M-Th), 12:00 PM (Friday)
    status: 'active'
  },
  {
    employee_id: 'JH011',
    first_name: 'Jiordan',
    last_name: 'Hofert',
    email: 'jiordan.hofert@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-03-15',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '17:30:00', // 5:30 PM
    end_time: '16:00:00',   // 4:00 AM next day
    status: 'active'
  },
  {
    employee_id: 'JS012',
    first_name: 'Joel',
    last_name: 'Stevenson',
    email: 'joel.stevenson@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-02-25',
    shift_type: 'night',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '15:00:00', // 3:00 PM
    end_time: '01:30:00',   // 1:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'KE013',
    first_name: 'Kyle',
    last_name: 'Evers',
    email: 'kyle.evers@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-03-20',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '18:00:00', // 6:00 PM
    end_time: '16:30:00',   // 4:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'MG014',
    first_name: 'Mike',
    last_name: 'Glasgow',
    email: 'mike.glasgow@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-01-10',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '17:00:00', // 5:00 PM
    end_time: '15:30:00',   // 3:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'NJ015',
    first_name: 'Noah',
    last_name: 'Johnson',
    email: 'noah.johnson@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-02-28',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '17:00:00', // 5:00 PM
    end_time: '15:30:00',   // 3:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'ST016',
    first_name: 'Steven',
    last_name: 'Truong',
    email: 'steven.truong@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-03-25',
    shift_type: 'night',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '15:00:00', // 3:00 PM
    end_time: '01:30:00',   // 1:30 AM next day
    status: 'active'
  },
  {
    employee_id: 'TJ017',
    first_name: 'Trevin',
    last_name: 'Jorgenson',
    email: 'trevin.jorgenson@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-02-05',
    shift_type: 'day',
    work_days: [1, 2, 3, 4], // M/T/W/R
    start_time: '19:30:00', // 7:30 PM
    end_time: '18:00:00',   // 6:00 AM next day
    status: 'active'
  },
  {
    employee_id: 'VM018',
    first_name: 'Vilas',
    last_name: 'Morris',
    email: 'vilas.morris@company.com',
    phone: '',
    department: 'Production',
    position: 'Operator',
    hire_date: '2023-01-05',
    shift_type: 'day',
    work_days: [1, 2, 3, 4, 5], // M/T/W/R/F (special Friday schedule)
    start_time: '15:00:00', // 3:00 PM
    end_time: '12:30:00',   // 12:30 AM next day (M-Th), 9:00 AM (Friday)
    status: 'active'
  }
];

async function addEmployees() {
  try {
    console.log('Starting to add employees...');
    
    for (const employee of employees) {
      const query = `
        INSERT INTO employees (
          employee_id, first_name, last_name, email, phone, department, position,
          hire_date, shift_type, work_days, start_time, end_time, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (employee_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          department = EXCLUDED.department,
          position = EXCLUDED.position,
          hire_date = EXCLUDED.hire_date,
          shift_type = EXCLUDED.shift_type,
          work_days = EXCLUDED.work_days,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          status = EXCLUDED.status
        RETURNING id, employee_id, first_name, last_name
      `;
      
      const values = [
        employee.employee_id,
        employee.first_name,
        employee.last_name,
        employee.email,
        employee.phone,
        employee.department,
        employee.position,
        employee.hire_date,
        employee.shift_type,
        `{${employee.work_days.join(',')}}`,
        employee.start_time,
        employee.end_time,
        employee.status
      ];
      
      const result = await pool.query(query, values);
      console.log(`✅ Added/Updated: ${employee.first_name} ${employee.last_name} (${employee.employee_id})`);
    }
    
    console.log('\n🎉 All employees have been successfully added to the database!');
    
    // Show summary
    const countResult = await pool.query('SELECT COUNT(*) FROM employees');
    console.log(`\n📊 Total employees in database: ${countResult.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error adding employees:', error);
  } finally {
    await pool.end();
  }
}

// Run the script
addEmployees();
