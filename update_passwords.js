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

async function updatePasswords() {
    try {
        await sql.connect(sqlConfig);
        
        // Hash the new passwords
        const managerPassword = await bcrypt.hash('manager123', 10);
        const employeePassword = await bcrypt.hash('employee123', 10);
        
        console.log('Updating passwords...');
        
        // Update manager password
        const managerResult = await sql.query`
            UPDATE users 
            SET password = ${managerPassword}, updated_at = GETDATE()
            WHERE username = 'manager1'
        `;
        
        // Update employee password
        const employeeResult = await sql.query`
            UPDATE users 
            SET password = ${employeePassword}, updated_at = GETDATE()
            WHERE username = 'employee1'
        `;
        
        console.log('Passwords updated successfully!');
        console.log('\nUpdated Login Credentials:');
        console.log('Manager - Username: manager1, Password: manager123');
        console.log('Employee - Username: employee1, Password: employee123');
        
    } catch (err) {
        console.error('Error updating passwords:', err);
    } finally {
        await sql.close();
    }
}

updatePasswords(); 