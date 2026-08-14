import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import { createStore, defaultForwardingConfig } from './store.js';

const app = express();
const server = createServer(app);

// Get configuration from environment variables
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'];

console.log('🔧 Configuration:');
console.log('   Frontend URL:', FRONTEND_URL);
console.log('   Allowed Origins:', ALLOWED_ORIGINS);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  },
  // Fewer heartbeats / prefer websocket to cut Render egress on free tier
  transports: ['websocket', 'polling'],
  pingInterval: 60000,
  pingTimeout: 30000,
  maxHttpBufferSize: 1e5
});

const MAX_FORWARD_URLS = Math.min(
  50,
  Math.max(1, Number.parseInt(process.env.MAX_FORWARD_URLS || '50', 10) || 50)
);
const MAX_HEADER_VALUE_CHARS = 2048;
const SKIP_FORWARD_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'keep-alive',
  'proxy-connection',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-extensions'
]);

/** @type {Awaited<ReturnType<typeof createStore>> | null} */
let store = null;

function slimHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const raw = Array.isArray(value) ? value.join(', ') : String(value);
    out[key] =
      raw.length > MAX_HEADER_VALUE_CHARS
        ? `${raw.slice(0, MAX_HEADER_VALUE_CHARS)}…[truncated]`
        : raw;
  }
  return out;
}

function isBlockedServerForwardHost(hostname) {
  const host = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  return host.endsWith('.local');

}

function validateForwardingConfig(body) {
  const serverEnabled = Boolean(body?.serverEnabled ?? body?.enabled);
  const urls = Array.isArray(body?.urls)
    ? body.urls.map((u) => String(u).trim()).filter(Boolean)
    : [];

  if (urls.length > MAX_FORWARD_URLS) {
    return { error: `Maximum ${MAX_FORWARD_URLS} forward URLs allowed` };
  }

  const normalized = [];
  for (const url of urls) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { error: `Invalid URL: ${url}` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: `Only http/https allowed: ${url}` };
    }
    if (isBlockedServerForwardHost(parsed.hostname)) {
      return { error: `Server destinations cannot use localhost/private host: ${url}` };
    }
    normalized.push(parsed.toString());
  }

  return {
    config: {
      serverEnabled,
      urls: normalized
    }
  };
}

function buildForwardHeaders(headers, webhookId, request) {
  const out = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (SKIP_FORWARD_HEADERS.has(String(key).toLowerCase())) return;
    out[key] = Array.isArray(value) ? value[0] : String(value);
  });
  out['X-Forwarded-By'] = 'Webhook-Interceptor';
  out['X-Original-Webhook-Id'] = webhookId;
  out['X-Original-Timestamp'] = String(request.timestamp);
  out['X-Original-Method'] = request.method;
  return out;
}

async function forwardToUrl(targetUrl, request, webhookId) {
  const headers = buildForwardHeaders(request.headers, webhookId, request);
  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body != null) {
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  const res = await fetch(targetUrl, init);
  console.log(`↪️  Forward ${request.method} → ${targetUrl} status=${res.status}`);
}

async function scheduleServerForwards(webhookId, request) {
  const config = (await store.getForwarding(webhookId)) || defaultForwardingConfig();
  if (!config.serverEnabled || !config.urls.length) return;

  for (const url of config.urls) {
    forwardToUrl(url, request, webhookId).catch((err) => {
      console.error(`❌ Forward failed → ${url}:`, err?.message || err);
    });
  }
}

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

app.use('/webhook', cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: '*',
  credentials: false
}));

app.use('/api', cors({
  origin: function (origin, callback) {
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

app.use('/api', bodyParser.json({ limit: '10mb' }));
app.use('/api', bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.all('/webhook/:id', async (req, res) => {
  const webhookId = req.params.id;
  const requestId = uuidv4();

  let body = req.rawBody || null;

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
    headers: slimHeaders(req.headers),
    body,
    query: req.query,
    timestamp: Date.now(),
    url: req.url,
    contentType: req.headers['content-type'] || 'unknown'
  };

  await store.prependRequest(webhookId, webhookRequest);

  io.to(`webhook-${webhookId}`).emit('webhook-request', webhookRequest);

  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': '*'
  });

  res.status(200).json({
    success: true,
    message: 'Webhook received successfully',
    requestId,
    timestamp: webhookRequest.timestamp,
    method: req.method,
    bodyLength: body ? Buffer.byteLength(body, 'utf8') : 0,
    viewUrl: `${FRONTEND_URL}/v/${webhookId}`
  });

  scheduleServerForwards(webhookId, webhookRequest).catch((err) => {
    console.error('Server forward scheduling failed:', err?.message || err);
  });
});

app.get('/api/webhook/:id/requests', async (req, res) => {
  const webhookId = req.params.id;
  const requests = await store.getRequests(webhookId);

  res.json({
    webhookId,
    requests,
    count: requests.length,
    viewUrl: `${FRONTEND_URL}/v/${webhookId}`
  });
});

app.get('/api/webhook/:id/forwarding', async (req, res) => {
  const config = await store.getForwarding(req.params.id);
  res.json({ webhookId: req.params.id, ...config });
});

app.put('/api/webhook/:id/forwarding', async (req, res) => {
  const result = validateForwardingConfig(req.body);
  if (result.error) {
    return res.status(400).json({ success: false, error: result.error });
  }
  await store.setForwarding(req.params.id, result.config);
  res.json({ success: true, webhookId: req.params.id, ...result.config });
});

app.post('/api/webhook/:id/forwarding/replay', async (req, res) => {
  const webhookId = req.params.id;
  const config = await store.getForwarding(webhookId);

  if (!config.urls.length) {
    return res.status(400).json({
      success: false,
      error: 'No server forward URLs configured for this webhook'
    });
  }

  const requests = await store.getRequests(webhookId);
  const request = req.body?.request || requests.find((r) => r.id === req.body?.requestId);
  if (!request) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  for (const url of config.urls) {
    forwardToUrl(url, request, webhookId).catch((err) => {
      console.error(`❌ Replay forward failed → ${url}:`, err?.message || err);
    });
  }

  res.json({ success: true, forwardedTo: config.urls.length });
});

app.delete('/api/webhook/:id/requests', async (req, res) => {
  const webhookId = req.params.id;
  await store.clearRequests(webhookId);

  io.to(`webhook-${webhookId}`).emit('requests-cleared');

  res.json({
    success: true,
    message: 'Requests cleared successfully',
    viewUrl: `${FRONTEND_URL}/v/${webhookId}`
  });
});

app.get('/health', async (req, res) => {
  const stats = await store.stats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    storage: store.type,
    activeWebhooks: stats.activeWebhooks,
    forwardingConfigs: stats.forwardingConfigs,
    config: {
      frontendUrl: FRONTEND_URL,
      allowedOrigins: ALLOWED_ORIGINS,
      redisConfigured: Boolean(process.env.REDIS_URL?.trim()),
      requestsRedis: /^(true|1|yes)$/i.test(process.env.REQUESTS_REDIS?.trim() || ''),
      forwardingRedis: /^(true|1|yes)$/i.test(process.env.FORWARDING_REDIS?.trim() || '')
    }
  });
});

app.get('/webhook-test', (req, res) => {
  res.json({
    message: 'Webhook server is running',
    timestamp: new Date().toISOString(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    note: 'Use /webhook/{id} for actual webhook endpoints'
  });
});

async function start() {
  store = await createStore();

  server.listen(PORT, () => {
    console.log(`🚀 Webhook Interceptor Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready for connections`);
    console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook/{id}`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/webhook-test`);
    console.log(`💊 Health check: http://localhost:${PORT}/health`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  try {
    if (store) await store.close();
  } finally {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  }
});
