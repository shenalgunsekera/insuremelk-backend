require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');
const sql = require('mssql');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

// Disable CORS entirely - allow all requests
app.use((req, res, next) => {
  // Add CORS headers to ALL responses
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Login endpoint
app.post('/login', async (req, res) => {
  // Add CORS headers specifically for login
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    await sql.connect(sqlConfig);
    const result = await sql.query`SELECT * FROM users WHERE username = ${username} AND is_active = 1`;
    
    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const user = result.recordset[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    // Return user data (without password_hash) and token
    const { password_hash: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      token
    });
    
  } catch (err) {
    console.error('Login error:', err);
    if (err.code === 'ETIMEOUT' || err.code === 'ESOCKET') {
      res.status(500).json({ error: 'Database connection failed. Please try again.' });
    } else {
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
});

// Azure SQL config
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

// Azure Blob Storage setup
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_BLOB_CONTAINER);

// Map of doc+text fields
const docTextFields = [
  { doc: 'policyholder_doc_url', text: 'policyholder_text' },
  { doc: 'proposal_form_doc_url', text: 'proposal_form_text' },
  { doc: 'quotation_doc_url', text: 'quotation_text' },
  { doc: 'cr_copy_doc_url', text: 'cr_copy_text' },
  { doc: 'schedule_doc_url', text: 'schedule_text' },
  { doc: 'invoice_doc_url', text: 'invoice_text' },
  { doc: 'payment_receipt_doc_url', text: 'payment_receipt_text' },
  { doc: 'nic_br_doc_url', text: 'nic_br_text' }
];

// Helper: Generate SAS URL for a blob
function getBlobSasUrl(blobName) {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const sasToken = generateBlobSASQueryParameters({
        containerName: process.env.AZURE_BLOB_CONTAINER,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
    }, sharedKeyCredential).toString();
    return `https://${accountName}.blob.core.windows.net/${process.env.AZURE_BLOB_CONTAINER}/${blobName}?${sasToken}`;
}

// Helper: Upload file to Azure Blob Storage in a specific folder and return SAS URL
async function uploadToBlobInFolder(file, folder, filename) {
    const blobName = `${folder}/${filename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const fs = require('fs');
    const stream = fs.createReadStream(file.path);
    const contentType = file.mimetype || 'application/octet-stream';
    try {
        await blockBlobClient.uploadStream(stream, file.size, undefined, {
            blobHTTPHeaders: {
                blobContentType: contentType,
                blobContentDisposition: 'inline'
            }
        });
    } finally {
        // Always remove the local file, even if upload fails
        try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    }
    return getBlobSasUrl(blobName);
}

// Helper: Upload all doc files for a client
async function uploadAllDocs(files, folder) {
  const docUrls = {};
  for (const field of docTextFields) {
    const file = files.find(f => f.fieldname === field.doc);
    if (file) {
      docUrls[field.doc] = await uploadToBlobInFolder(file, folder, `${field.doc}-${Date.now()}-${file.originalname}`);
    }
  }
  return docUrls;
}

// Create client (all fields, all docs) or batch CSV import
app.post('/clients', authenticateToken, upload.any(), async (req, res) => {
  try {
    // CSV import mode: _csv_import flag and req.body.clients is an array
    if (req.body._csv_import && Array.isArray(req.body.clients)) {
      const requiredFields = ['customer_type', 'product', 'insurance_provider', 'client_name', 'mobile_no'];
      let imported = 0;
      let failed = 0;
      let errors = [];
      let results = [];
      await sql.connect(sqlConfig);
      for (let i = 0; i < req.body.clients.length; i++) {
        const client = req.body.clients[i];
        // Validate required fields
        const missing = requiredFields.filter(f => !client[f]);
        if (missing.length > 0) {
          failed++;
          errors.push({ row: i + 1, error: `Missing required fields: ${missing.join(', ')}` });
          continue;
        }
        try {
          // Insert client (text fields only, no docs)
          let textFields = [
            'id','ceilao_ib_file_no','vehicle_number','main_class','insurer','introducer_code','customer_type','product','policy_','insurance_provider','branch','client_name','street1','street2','city','district','province','telephone','mobile_no','contact_person','email','social_media','nic_proof','dob_proof','business_registration','svat_proof','vat_proof','policy_type','policy_no','policy_period_from','policy_period_to','coverage','sum_insured','basic_premium','srcc_premium','tc_premium','net_premium','stamp_duty','admin_fees','road_safety_fee','policy_fee','vat_fee','total_invoice','commission_type','commission_basic','commission_srcc','commission_tc','sales_rep_id'
          ];
          // Remove id if not provided
          let insertFields = [...textFields, ...docTextFields.map(f => f.text)];
          let insertValues = insertFields.map(f => client[f] || null);
          if (!client.id) {
            const idIdx = insertFields.indexOf('id');
            if (idIdx !== -1) {
              insertFields.splice(idIdx, 1);
              insertValues.splice(idIdx, 1);
            }
          }
          const placeholders = insertFields.map((_, j) => `@p${j}`).join(',');
          const request = new sql.Request();
          insertFields.forEach((f, j) => request.input(`p${j}`, insertValues[j]));
          const insertSql = `INSERT INTO clients (${insertFields.join(',')}) OUTPUT INSERTED.* VALUES (${placeholders})`;
          const insertResult = await request.query(insertSql);
          imported++;
          results.push(insertResult.recordset[0]);
        } catch (err) {
          failed++;
          errors.push({ row: i + 1, error: err.message });
        }
      }
      return res.status(200).json({ imported, failed, errors, results });
    }
    // Normal single client creation (with docs)
    const body = req.body;
    // Required text fields
    const requiredFields = ['customer_type', 'product', 'insurance_provider', 'client_name', 'mobile_no'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return res.status(400).json({ error: `${field.replace(/_/g, ' ')} is required` });
      }
    }
    // Required document uploads
    for (const field of docTextFields) {
      if (!(req.files && req.files.find(f => f.fieldname === field.doc))) {
        return res.status(400).json({ error: `${field.doc} document is required` });
      }
    }
    await sql.connect(sqlConfig);
    // Insert client with text fields only first
    let textFields = [
      'id','ceilao_ib_file_no','vehicle_number','main_class','insurer','introducer_code','customer_type','product','policy_','insurance_provider','branch','client_name','street1','street2','city','district','province','telephone','mobile_no','contact_person','email','social_media','nic_proof','dob_proof','business_registration','svat_proof','vat_proof','policy_type','policy_no','policy_period_from','policy_period_to','coverage','sum_insured','basic_premium','srcc_premium','tc_premium','net_premium','stamp_duty','admin_fees','road_safety_fee','policy_fee','vat_fee','total_invoice','commission_type','commission_basic','commission_srcc','commission_tc','sales_rep_id'
    ];
    // Remove id if not provided (let SQL Server use NEWID())
    let insertFields = [...textFields, ...docTextFields.map(f => f.text)];
    let insertValues = insertFields.map(f => body[f] || null);
    if (!body.id) {
      const idIdx = insertFields.indexOf('id');
      if (idIdx !== -1) {
        insertFields.splice(idIdx, 1);
        insertValues.splice(idIdx, 1);
      }
    }
    const placeholders = insertFields.map((_, i) => `@p${i}`).join(',');
    const request = new sql.Request();
    insertFields.forEach((f, i) => request.input(`p${i}`, insertValues[i]));
    const insertSql = `INSERT INTO clients (${insertFields.join(',')}) OUTPUT INSERTED.* VALUES (${placeholders})`;
    const insertResult = await request.query(insertSql);
    const client = insertResult.recordset[0];
    const folder = `clients/${client.id}`;
    // Upload all doc files
    const docUrls = await uploadAllDocs(req.files || [], folder);
    // Update client with doc URLs
    if (Object.keys(docUrls).length > 0) {
      const setClause = Object.keys(docUrls).map(f => `${f} = @${f}`).join(', ');
      const updateReq = new sql.Request();
      Object.entries(docUrls).forEach(([k, v]) => updateReq.input(k, v));
      updateReq.input('id', client.id);
      await updateReq.query(`UPDATE clients SET ${setClause} WHERE id = @id`);
    }
    // Return full client
    const finalResult = await sql.query`SELECT * FROM clients WHERE id = ${client.id}`;
    res.status(201).json(finalResult.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all clients (summary)
app.get('/clients', authenticateToken, async (req, res) => {
  try {
    await sql.connect(sqlConfig);
    const result = await sql.query`SELECT id, client_name, mobile_no, product, policy_no, created_at FROM clients ORDER BY created_at DESC, id DESC`;
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get single client (details)
app.get('/clients/:id', authenticateToken, async (req, res) => {
  try {
    await sql.connect(sqlConfig);
    const result = await sql.query`SELECT * FROM clients WHERE id = ${req.params.id}`;
    if (!result.recordset[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update client (all fields, all docs)
app.put('/clients/:id', authenticateToken, upload.any(), async (req, res) => {
  try {
    const body = req.body;
    await sql.connect(sqlConfig);
    // Get current client
    const current = await sql.query`SELECT * FROM clients WHERE id = ${req.params.id}`;
    if (!current.recordset[0]) return res.status(404).json({ error: 'Not found' });
    const folder = `clients/${req.params.id}`;
    // Upload all doc files
    const docUrls = await uploadAllDocs(req.files || [], folder);
    // Update client with doc URLs
    if (Object.keys(docUrls).length > 0) {
      const setClause = Object.keys(docUrls).map(f => `${f} = @${f}`).join(', ');
      const updateReq = new sql.Request();
      Object.entries(docUrls).forEach(([k, v]) => updateReq.input(k, v));
      updateReq.input('id', req.params.id);
      await updateReq.query(`UPDATE clients SET ${setClause} WHERE id = @id`);
    }
    // Return full client
    const finalResult = await sql.query`SELECT * FROM clients WHERE id = ${req.params.id}`;
    res.status(200).json(finalResult.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete client
app.delete('/clients/:id', authenticateToken, async (req, res) => {
  try {
    await sql.connect(sqlConfig);
    const result = await sql.query`DELETE FROM clients WHERE id = ${req.params.id}`;
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete all clients (manager only)
app.delete('/clients', authenticateToken, async (req, res) => {
  try {
    // Check if user is manager
    if (req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Only managers can delete all clients' });
    }
    
    // Check confirmation header
    const confirmDelete = req.headers['x-confirm-delete'];
    if (confirmDelete !== 'true') {
      return res.status(400).json({ 
        error: 'Confirmation required. Add header: x-confirm-delete: true' 
      });
    }
    
    await sql.connect(sqlConfig);
    const result = await sql.query`DELETE FROM clients`;
    const deletedCount = result.rowsAffected[0];
    res.json({ 
      message: `Successfully deleted ${deletedCount} clients`,
      deletedCount 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Test endpoint to verify service is working
app.get('/test', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  res.json({ 
    message: 'Service is working!', 
    timestamp: new Date().toISOString(),
    cors: 'enabled'
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Login endpoint: http://localhost:${PORT}/login`);
  console.log(`API base URL: http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});