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

async function testLogin() {
    try {
        console.log('Testing login process...');
        console.log('Server:', process.env.SQL_SERVER);
        console.log('Database:', process.env.SQL_DATABASE);
        console.log('User:', process.env.SQL_USER);
        
        await sql.connect(sqlConfig);
        console.log('✅ Database connection successful!');
        
        // Test with manager1 credentials
        const username = 'manager1';
        const password = 'manager123';
        
        console.log(`\nTesting login for: ${username}`);
        
        // Check if user exists
        const result = await sql.query`SELECT * FROM users WHERE username = ${username} AND is_active = 1`;
        
        if (result.recordset.length === 0) {
            console.log('❌ User not found or not active');
            return;
        }
        
        const user = result.recordset[0];
        console.log('✅ User found:', user.username, 'Role:', user.role);
        
        // Test password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (validPassword) {
            console.log('✅ Password is valid!');
            console.log('✅ Login should work!');
        } else {
            console.log('❌ Password is invalid!');
            console.log('Expected password:', password);
            console.log('Stored hash:', user.password_hash);
        }
        
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Error details:', err);
    } finally {
        try {
            await sql.close();
        } catch (e) {
            // Ignore close errors
        }
    }
}

testLogin(); 