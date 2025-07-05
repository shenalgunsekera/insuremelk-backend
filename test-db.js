require('dotenv').config();
const sql = require('mssql');

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

async function testDatabase() {
    try {
        console.log('Testing database connection...');
        console.log('Server:', process.env.SQL_SERVER);
        console.log('Database:', process.env.SQL_DATABASE);
        console.log('User:', process.env.SQL_USER);
        
        await sql.connect(sqlConfig);
        console.log('✅ Database connection successful!');
        
        // Check if users table exists
        const tableResult = await sql.query`SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'users'`;
        if (tableResult.recordset[0].count > 0) {
            console.log('✅ Users table exists');
            
            // Check if users exist
            const usersResult = await sql.query`SELECT COUNT(*) as count FROM users`;
            console.log(`✅ Found ${usersResult.recordset[0].count} users in the database`);
            
            // List all users
            const allUsers = await sql.query`SELECT id, username, role, is_active FROM users`;
            console.log('Users in database:');
            allUsers.recordset.forEach(user => {
                console.log(`  - ${user.username} (${user.role}) - Active: ${user.is_active}`);
            });
        } else {
            console.log('❌ Users table does not exist!');
        }
        
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('Error details:', err);
    } finally {
        try {
            await sql.close();
        } catch (e) {
            // Ignore close errors
        }
    }
}

testDatabase(); 