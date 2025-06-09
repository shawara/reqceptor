import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'development' ? "http://localhost:5173" : "https://reqceptor.shawara.me",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? "http://localhost:5173" : "https://reqceptor.shawara.me",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.raw({ limit: '10mb', type: '*/*' }));

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

// Webhook endpoint - accepts all HTTP methods
app.all('/webhook/:id', async (req, res) => {
  const webhookId = req.params.id;
  const requestId = uuidv4();
  
  // Parse body based on content type
  let body = req.body;
  if (req.headers['content-type']?.includes('application/json')) {
    // Body is already parsed by bodyParser
  } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    // Body is already parsed by bodyParser
  } else {
    // For other content types, convert buffer to string
    body = req.body ? req.body.toString() : null;
  }
  
  const webhookRequest = {
    id: requestId,
    method: req.method,
    headers: req.headers,
    body: body,
    query: req.query,
    params: req.params,
    timestamp: Date.now(),
    url: req.url,
    originalUrl: req.originalUrl
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
  
  console.log(`Webhook ${webhookId} received ${req.method} request`);
  
  // Send response
  res.status(200).json({
    success: true,
    message: 'Webhook received successfully',
    requestId: requestId,
    timestamp: webhookRequest.timestamp
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
    activeWebhooks: webhookRequests.size
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Webhook Interceptor Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook/{id}`);
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