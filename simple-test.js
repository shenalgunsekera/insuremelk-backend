require('dotenv').config();
const sql = require('mssql');

console.log('Environment variables:');
console.log('SQL_SERVER:', process.env.SQL_SERVER);
console.log('SQL_DATABASE:', process.env.SQL_DATABASE);
console.log('SQL_USER:', process.env.SQL_USER);
console.log('SQL_PASSWORD:', process.env.SQL_PASSWORD ? '***SET***' : '***NOT SET***');

const sqlConfig = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE,
    server: process.env.SQL_SERVER,
    options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000, // 30 seconds
        requestTimeout: 30000,
    },
};

async function testConnection() {
    try {
        console.log('\nAttempting to connect...');
        await sql.connect(sqlConfig);
        console.log('✅ Connection successful!');
        
        // Simple query to test
        const result = await sql.query`SELECT GETDATE() AS now`;
        console.log('✅ Query successful:', result.recordset[0].now);
        
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        if (err.code === 'ETIMEOUT') {
            console.error('This is a timeout error. Check your firewall settings.');
        }
    } finally {
        try {
            await sql.close();
        } catch (e) {
            // Ignore close errors
        }
    }
}

testConnection(); 