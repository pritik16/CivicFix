/**
 * ==========================================================================
 * CivicFix — Stage 3: Minimal Backend Introduction (server.js)
 * ==========================================================================
 * This file creates our first Node.js HTTP web server using Express.
 * It listens for incoming web requests on port 3000 and responds with JSON.
 */

// 1. Import the Express library
// Express gives us ready-to-use functions to create a web server and define routes.

const express = require('express');
const cors = require('cors');
const multer=require(`multer`);

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
const upload =multer({dest:'uploads/'});
app.use('/uploads',express.static('uploads'));

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
app.post('/api/issues',upload.single('photo'),(req, res) => {
  // Extract the submitted issue fields from req.body
  const { title, category, description, location } = req.body;
  console.log('Uploaded photo:',req.file);
  console.log('Photo path:',req.file.path);
  const photoUrl = req.file
  ? `http://localhost:${PORT}/uploads/${req.file.filename}`
  : null;

  // Log the received issue directly to the server terminal (no database yet)
  console.log('-------------------------------------------');
  console.log('📥 New Civic Issue Report Received:');
  console.log('Title:      ', title);
  console.log('Category:   ', category);
  console.log('Description:', description);
  console.log('Location:   ', location);
  console.log('Received At:', new Date().toLocaleString());
  console.log('-------------------------------------------');

  // Send back an HTTP 201 (Created) response with the received data
  res.status(201).json({
    success: true,
    message: 'CivicFix issue report received successfully!',
    data: {
      title,
      category,
      description,
      location,
      photoUrl,
      receivedAt: new Date().toISOString()
    }
  });
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
