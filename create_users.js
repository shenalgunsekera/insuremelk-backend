require('dotenv').config();
const sql = require('mssql');
const bcrypt = require('bcrypt');

const sqlConfig = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE,
    server: process.env.SQL_SERVER,
    options: {
        encrypt: true,
        trustServerCertificate: false,
    },
};

async function createUsers() {
    try {
        await sql.connect(sqlConfig);
        
        // Create users table
        console.log('Creating users table...');
        await sql.query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
            CREATE TABLE users (
                id INT IDENTITY(1,1) PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL CHECK (role IN ('manager', 'employee')),
                full_name VARCHAR(100),
                email VARCHAR(100),
                created_at DATETIME2 DEFAULT GETDATE(),
                updated_at DATETIME2 DEFAULT GETDATE()
            )
        `);
        
        // Hash passwords
        const managerPassword = await bcrypt.hash('manager123', 10);
        const employeePassword = await bcrypt.hash('employee123', 10);
        
        // Insert users
        console.log('Inserting users...');
        
        // Check if users already exist
        const existingUsers = await sql.query`SELECT username FROM users WHERE username IN ('manager1', 'employee1')`;
        
        if (existingUsers.recordset.length === 0) {
            await sql.query`
                INSERT INTO users (username, password, role, full_name, email) VALUES
                ('manager1', ${managerPassword}, 'manager', 'Manager One', 'manager1@insureme.com'),
                ('employee1', ${employeePassword}, 'employee', 'Employee One', 'employee1@insureme.com')
            `;
            console.log('Users created successfully!');
        } else {
            console.log('Users already exist, skipping...');
        }
        
        console.log('\nLogin Credentials:');
        console.log('Manager - Username: manager1, Password: manager123');
        console.log('Employee - Username: employee1, Password: employee123');
        
    } catch (err) {
        console.error('Error creating users:', err);
    } finally {
        await sql.close();
    }
}

createUsers(); 