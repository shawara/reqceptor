const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.raw({ type: '*/*' }));

// Store received requests
const receivedRequests = [];

// Logging middleware
app.use((req, res, next) => {
  const requestId = Date.now().toString();
  const timestamp = new Date().toISOString();
  
  // Clone headers to remove sensitive information
  const headers = { ...req.headers };
  delete headers['authorization'];
  delete headers['cookie'];
  
  const request = {
    id: requestId,
    method: req.method,
    path: req.path,
    headers: headers,
    query: req.query,
    body: req.body,
    timestamp: timestamp
  };
  
  receivedRequests.unshift(request);
  
  // Keep only last 100 requests
  if (receivedRequests.length > 100) {
    receivedRequests.pop();
  }
  
  console.log('\n=== New Webhook Request ===');
  console.log(`Time: ${timestamp}`);
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.path}`);
  console.log('Headers:', headers);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  console.log('========================\n');
  
  next();
});

// Accept all HTTP methods on all paths
app.all('*', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Request received and logged',
    timestamp: new Date().toISOString()
  });
});

// API endpoint to get all received requests
app.get('/api/requests', (req, res) => {
  res.json({
    requests: receivedRequests,
    count: receivedRequests.length
  });
});

// API endpoint to clear requests
app.delete('/api/requests', (req, res) => {
  receivedRequests.length = 0;
  res.json({
    success: true,
    message: 'All requests cleared'
  });
});

app.listen(port, () => {
  console.log(`Test server listening at http://localhost:${port}`);
  console.log('Ready to receive webhook requests...');
}); 