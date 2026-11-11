/**
 * ==========================================================================
 * CivicFix — Stage 3: Minimal Backend Introduction (server.js)
 * ==========================================================================
 * This file creates our first Node.js HTTP web server using Express.
 * It listens for incoming web requests on port 3000 and responds with JSON.
 */

// 1. Import the Express library
// Express gives us ready-to-use functions to create a web server and define routes.


const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dns = require('dns');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const Issue = require('./Issue');

// Admin Configuration Validation
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET;

const isAdminConfigured = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD_HASH && JWT_SECRET);

if (!isAdminConfigured) {
  console.warn('⚠️  ADMIN AUTH DISABLED: Required environment variables (ADMIN_USERNAME, ADMIN_PASSWORD_HASH, JWT_SECRET) are missing or incomplete. Admin endpoints will safely respond with HTTP 503.');
}

dns.setServers(['8.8.8.8', '8.8.4.4']);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Atlas connected successfully!'))
  .catch((error) => {
  console.error('MongoDB connection error details:');
  console.error(error.message);

  if (error.reason?.servers) {
    for (const [address, server] of error.reason.servers) {
      console.error('\nServer:', address);
      console.error('Error name:', server.error?.name);
      console.error('Error message:', server.error?.message);
    }
  }
});
  


// 2. Initialize the Express application
// "app" is the central object where we register routes, middleware, and settings.

const app = express();

// 3. Set the Port number
// A port is like an apartment number on your computer where this specific
// application receives incoming network traffic.
const PORT = 3000;

// 4. Built-in Middleware & CORS
// Restrict CORS to local development origins while allowing authorization headers
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests without an Origin header (curl, Postman, local scripts) and explicitly listed local origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static('uploads'));

// 5. Define our first GET Route: /api/test
// When a browser or client makes an HTTP GET request to "http://localhost:3000/api/test",
// this function executes.
// - req (Request): Information sent by the client (browser).
// - res (Response): Tools to send data back to the client.
app.get('/api/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'CivicFix Backend API is running successfully!',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// 6. Define a POST Route: /api/issues
// When a client sends new data to create an issue, it makes an HTTP POST request here.
// The submitted data is automatically parsed by express.json() and made available in "req.body".

app.post('/api/issues', upload.single('photo'), async (req, res) => {
  try {
    const { title, category, description, location } = req.body;

    const photoUrl = req.file
      ? `http://localhost:${PORT}/uploads/${req.file.filename}`
      : null;

    const newIssue = await Issue.create({
      title,
      category,
      description,
      location,
      photoUrl
    });

    console.log('New civic issue saved:', newIssue._id);

    res.status(201).json({
      success: true,
      message: 'CivicFix issue saved successfully!',
      data: newIssue
    });
  } catch (error) {
    console.error('Error saving issue:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to save the issue.',
      error: error.message
    });
  }
});


// GET Route: Fetch all civic issues from MongoDB
app.get('/api/issues', async (req, res) => {
  try {
    const issues = await Issue.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: issues.length,
      data: issues
    });

  } catch (error) {
    console.error('Error fetching issues:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch issues.'
    });
  }
});


// ==========================================================================
// 7. Administrator Authentication & Authorization
// ==========================================================================

// Guard: Ensure admin environment variables are configured
function ensureAdminConfigured(req, res, next) {
  if (!isAdminConfigured) {
    return res.status(503).json({
      success: false,
      message: 'Admin authentication is currently disabled due to missing server configuration.'
    });
  }
  next();
}

// Rate Limiter: Max 5 login attempts per 15 minutes per IP address
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP address. Please try again after 15 minutes.'
  }
});

// Middleware: Verify JWT and ensure administrator role
function authenticateAdmin(req, res, next) {
  if (!isAdminConfigured) {
    return res.status(503).json({
      success: false,
      message: 'Admin authentication is currently disabled due to missing server configuration.'
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden. Administrator role required.'
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session token.'
    });
  }
}

// POST Route: Administrator Login
app.post('/api/admin/login', ensureAdminConfigured, loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate that username and password are non-empty strings with a maximum length of 100 characters
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.trim().length === 0 ||
      password.length === 0 ||
      username.trim().length > 100 ||
      password.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required and must not exceed 100 characters.'
      });
    }

    const isUsernameValid = (username.trim() === ADMIN_USERNAME.trim());
    const isPasswordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

    if (!isUsernameValid || !isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    // Issue JWT valid for 2 hours
    const token = jwt.sign(
      { username: ADMIN_USERNAME, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.status(200).json({
      success: true,
      message: 'Administrator authentication successful.',
      token,
      expiresIn: '2h'
    });

  } catch (error) {
    console.error('Error during admin login:', error.message);
    res.status(500).json({
      success: false,
      message: 'An error occurred during authentication.'
    });
  }
});

// GET Route: Verify Administrator Token
app.get('/api/admin/verify', authenticateAdmin, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Token is valid.',
    admin: {
      username: req.admin.username,
      role: req.admin.role
    }
  });
});

// PATCH Route: Update Complaint Status (Protected by Admin Authentication)
app.patch(['/api/issues/:id', '/api/issues/:id/status'], authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 1. Validate Complaint ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID format.'
      });
    }

    // 2. Validate Status value
    if (typeof status !== 'string' || status.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Status is required and must be a valid string.'
      });
    }

    // Map allowed statuses: Submitted, In Progress, Resolved (plus database enum keys)
    const STATUS_MAP = {
      'submitted': 'pending',
      'in progress': 'approved',
      'in_progress': 'approved',
      'resolved': 'done',
      'pending': 'pending',
      'approved': 'approved',
      'done': 'done'
    };

    const targetStatus = STATUS_MAP[status.trim().toLowerCase()];

    if (!targetStatus) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Allowed statuses are: Submitted, In Progress, Resolved.'
      });
    }

    // 3. Find and update the complaint in MongoDB
    const issue = await Issue.findById(id);

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.'
      });
    }

    issue.status = targetStatus;
    await issue.save();

    console.log(`Complaint ${issue._id} status updated to '${targetStatus}' by admin ${req.admin.username}`);

    res.status(200).json({
      success: true,
      message: 'Complaint status updated successfully.',
      data: issue
    });

  } catch (error) {
    console.error('Error updating complaint status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update complaint status.',
      error: error.message
    });
  }
});

// ==========================================================================
// 8. Start the Server and Listen on Port 3000
// ==========================================================================
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`🚀 CivicFix Server is running!`);
  console.log(`📡 Listening on:    http://localhost:${PORT}`);
  console.log(`🧪 Test Endpoint:   GET  http://localhost:${PORT}/api/test`);
  console.log(`📝 Issues Endpoint: GET/POST http://localhost:${PORT}/api/issues`);
  console.log(`🔐 Admin Login:     POST http://localhost:${PORT}/api/admin/login`);
  console.log(`🛡️ Admin Verify:    GET  http://localhost:${PORT}/api/admin/verify`);
  console.log(`⚙️ Update Status:   PATCH http://localhost:${PORT}/api/issues/:id`);
  console.log(`===========================================`);
});
