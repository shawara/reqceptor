import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = createServer(app);

// Get configuration from environment variables
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'];

console.log('🔧 Configuration:');
console.log('   Frontend URL:', FRONTEND_URL);
console.log('   Allowed Origins:', ALLOWED_ORIGINS);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true
  }
});

// Store webhook requests in memory (in production, use a database)
const webhookRequests = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-webhook', (webhookId) => {
    socket.join(`webhook-${webhookId}`);
    console.log(`Client joined webhook room: webhook-${webhookId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// CORS middleware for webhook endpoints - allow all origins and headers
app.use('/webhook', cors({
  origin: true, // Allow all origins for webhooks
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  allowedHeaders: '*', // Allow all headers for webhooks
  credentials: false // Don't require credentials for webhooks
}));

// CORS middleware for API endpoints - restrict to allowed origins
app.use('/api', cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('⚠️  CORS blocked API request from:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Add request logging middleware for webhooks
app.use('/webhook', (req, res, next) => {
  console.log(`🔗 Webhook request: ${req.method} ${req.url}`);
  console.log(`   Origin: ${req.headers.origin || 'none'}`);
  console.log(`   User-Agent: ${req.headers['user-agent'] || 'none'}`);
  console.log(`   Content-Type: ${req.headers['content-type'] || 'none'}`);
  next();
});

// Custom middleware to capture raw body for webhooks
app.use('/webhook', (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  
  req.on('data', (chunk) => {
    data += chunk;
  });
  
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

// Body parsing middleware for API routes only
app.use('/api', bodyParser.json({ limit: '10mb' }));
app.use('/api', bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Webhook endpoint - accepts all HTTP methods
app.all('/webhook/:id', async (req, res) => {
  const webhookId = req.params.id;
  const requestId = uuidv4();
  
  console.log(`📨 Processing webhook ${webhookId} - ${req.method} request`);
  
  // Use raw body captured by our custom middleware
  let body = req.rawBody || null;
  
  // If no raw body but we have a parsed body from other middleware, use that
  if (!body && req.body !== undefined) {
    if (typeof req.body === 'object') {
      body = JSON.stringify(req.body);
    } else {
      body = String(req.body);
    }
  }
  
  const webhookRequest = {
    id: requestId,
    method: req.method,
    headers: req.headers,
    body: body, // Always a string or null
    query: req.query,
    params: req.params,
    timestamp: Date.now(),
    url: req.url,
    originalUrl: req.originalUrl,
    contentType: req.headers['content-type'] || 'unknown'
  };
  
  // Store the request
  if (!webhookRequests.has(webhookId)) {
    webhookRequests.set(webhookId, []);
  }
  
  const requests = webhookRequests.get(webhookId);
  requests.unshift(webhookRequest); // Add to beginning
  
  // Keep only last 100 requests per webhook
  if (requests.length > 100) {
    requests.splice(100);
  }
  
  // Emit to connected clients for this webhook
  io.to(`webhook-${webhookId}`).emit('webhook-request', webhookRequest);
  
  console.log(`✅ Webhook ${webhookId} processed successfully - Body length: ${body ? body.length : 0}`);
  
  // Send response with CORS headers
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': '*'
  });
  
  res.status(200).json({
    success: true,
    message: 'Webhook received successfully',
    requestId: requestId,
    timestamp: webhookRequest.timestamp,
    method: req.method,
    bodyLength: body ? body.length : 0
  });
});

// API endpoint to get webhook requests
app.get('/api/webhook/:id/requests', (req, res) => {
  const webhookId = req.params.id;
  const requests = webhookRequests.get(webhookId) || [];
  
  res.json({
    webhookId,
    requests,
    count: requests.length
  });
});

// API endpoint to clear webhook requests
app.delete('/api/webhook/:id/requests', (req, res) => {
  const webhookId = req.params.id;
  webhookRequests.set(webhookId, []);
  
  // Notify connected clients
  io.to(`webhook-${webhookId}`).emit('requests-cleared');
  
  res.json({
    success: true,
    message: 'Requests cleared successfully'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeWebhooks: webhookRequests.size,
    config: {
      frontendUrl: FRONTEND_URL,
      allowedOrigins: ALLOWED_ORIGINS
    }
  });
});

// Catch-all for webhook testing
app.get('/webhook-test', (req, res) => {
  res.json({
    message: 'Webhook server is running',
    timestamp: new Date().toISOString(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    note: 'Use /webhook/{id} for actual webhook endpoints'
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Webhook Interceptor Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook/{id}`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/webhook-test`);
  console.log(`💊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});