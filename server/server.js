/**
 * ==========================================================================
 * CivicFix — Stage 3: Minimal Backend Introduction (server.js)
 * ==========================================================================
 * This file creates our first Node.js HTTP web server using Express.
 * It listens for incoming web requests on port 3000 and responds with JSON.
 */

// 1. Import the Express library
// Express gives us ready-to-use functions to create a web server and define routes.


require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dns = require('dns');
const multer = require('multer');

const Issue = require('./Issue');


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

// 4. Built-in Middleware
// This tells Express to automatically parse incoming requests that carry JSON data.
app.use(cors());
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


// 7. Start the Server and Listen on Port 3000
// This keeps the server running and waiting for incoming connections.
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`🚀 CivicFix Server is running!`);
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log(`🧪 Test Endpoint:   GET  http://localhost:${PORT}/api/test`);
  console.log(`📝 Issues Endpoint: POST http://localhost:${PORT}/api/issues`);
  console.log(`===========================================`);
});
