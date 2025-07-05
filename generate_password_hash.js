const bcrypt = require('bcrypt');

async function generateHashes() {
  console.log('Generating password hashes...\n');
  
  const managerPassword = 'manager123';
  const employeePassword = 'employee123';
  
  const managerHash = await bcrypt.hash(managerPassword, 10);
  const employeeHash = await bcrypt.hash(employeePassword, 10);
  
  console.log('=== PASSWORD HASHES FOR YOUR DATABASE ===');
  console.log('\nManager (username: manager1):');
  console.log(`Password: ${managerPassword}`);
  console.log(`Hash: ${managerHash}`);
  
  console.log('\nEmployee (username: employee1):');
  console.log(`Password: ${employeePassword}`);
  console.log(`Hash: ${employeeHash}`);
  
  console.log('\n=== SQL UPDATE COMMANDS ===');
  console.log('\n-- Update manager password');
  console.log(`UPDATE users SET password_hash = '${managerHash}' WHERE username = 'manager1';`);
  
  console.log('\n-- Update employee password');
  console.log(`UPDATE users SET password_hash = '${employeeHash}' WHERE username = 'employee1';`);
  
  console.log('\n=== VERIFICATION ===');
  console.log('\nTesting password verification...');
  
  const testManager = await bcrypt.compare(managerPassword, managerHash);
  const testEmployee = await bcrypt.compare(employeePassword, employeeHash);
  
  console.log(`Manager password verification: ${testManager ? 'PASS' : 'FAIL'}`);
  console.log(`Employee password verification: ${testEmployee ? 'PASS' : 'FAIL'}`);
}

generateHashes(); 