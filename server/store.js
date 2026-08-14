import { createClient } from 'redis';

// Keep history small — each stored/fetched request is full egress (API, Redis, Socket.IO)
const MAX_REQUESTS_PER_WEBHOOK = Math.min(
  100,
  Math.max(1, Number.parseInt(process.env.MAX_REQUESTS_PER_WEBHOOK || '25', 10) || 25)
);
const REQUESTS_KEY_PREFIX = 'hooki:requests:';
const FORWARDING_KEY_PREFIX = 'hooki:forwarding:';

export function defaultForwardingConfig() {
  return { serverEnabled: false, urls: [] };
}

/** Normalize stored/legacy forwarding configs to { serverEnabled, urls }. */
export function normalizeForwardingConfig(raw) {
  if (!raw || typeof raw !== 'object') return defaultForwardingConfig();
  const urls = Array.isArray(raw.urls) ? raw.urls.filter(Boolean) : [];
  let serverEnabled = Boolean(raw.serverEnabled);
  // Legacy: { mode, enabled, urls }
  if (raw.serverEnabled === undefined && (raw.mode !== undefined || raw.enabled !== undefined)) {
    serverEnabled = raw.mode === 'server' && Boolean(raw.enabled);
  }
  return { serverEnabled, urls };
}

function envFlagEnabled(name) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function createMemoryRequests() {
  const webhookRequests = new Map();

  return {
    type: 'memory',
    async getRequests(webhookId) {
      return webhookRequests.get(webhookId) || [];
    },
    async prependRequest(webhookId, request) {
      if (!webhookRequests.has(webhookId)) {
        webhookRequests.set(webhookId, []);
      }
      const requests = webhookRequests.get(webhookId);
      requests.unshift(request);
      if (requests.length > MAX_REQUESTS_PER_WEBHOOK) {
        requests.splice(MAX_REQUESTS_PER_WEBHOOK);
      }
      return requests;
    },
    async clearRequests(webhookId) {
      webhookRequests.set(webhookId, []);
    },
    async stats() {
      return webhookRequests.size;
    }
  };
}

/** Redis list per webhook: LPUSH + LTRIM (no read-before-write). */
function createRedisRequests(client) {
  return {
    type: 'redis',
    async getRequests(webhookId) {
      const raw = await client.lRange(`${REQUESTS_KEY_PREFIX}${webhookId}`, 0, -1);
      const requests = [];
      for (const item of raw) {
        try {
          requests.push(JSON.parse(item));
        } catch {
          // skip corrupt entries
        }
      }
      return requests;
    },
    async prependRequest(webhookId, request) {
      const key = `${REQUESTS_KEY_PREFIX}${webhookId}`;
      await client
        .multi()
        .lPush(key, JSON.stringify(request))
        .lTrim(key, 0, MAX_REQUESTS_PER_WEBHOOK - 1)
        .exec();
      return [];
    },
    async clearRequests(webhookId) {
      await client.del(`${REQUESTS_KEY_PREFIX}${webhookId}`);
    },
    // Avoid Redis commands on /health (free-tier friendly)
    async stats() {
      return null;
    }
  };
}

function createMemoryForwarding() {
  const forwardingConfigs = new Map();

  return {
    type: 'memory',
    async getForwarding(webhookId) {
      return normalizeForwardingConfig(
        forwardingConfigs.get(webhookId) || defaultForwardingConfig()
      );
    },
    async setForwarding(webhookId, config) {
      const normalized = normalizeForwardingConfig(config);
      forwardingConfigs.set(webhookId, normalized);
      return normalized;
    },
    async stats() {
      return forwardingConfigs.size;
    }
  };
}

/** Write-through process cache so webhook traffic does not GET Redis every time. */
function createRedisForwarding(client) {
  const cache = new Map();

  return {
    type: 'redis',
    async getForwarding(webhookId) {
      if (cache.has(webhookId)) {
        return cache.get(webhookId);
      }
      const raw = await client.get(`${FORWARDING_KEY_PREFIX}${webhookId}`);
      let config = defaultForwardingConfig();
      if (raw) {
        try {
          config = normalizeForwardingConfig(JSON.parse(raw));
        } catch {
          config = defaultForwardingConfig();
        }
      }
      cache.set(webhookId, config);
      return config;
    },
    async setForwarding(webhookId, config) {
      const normalized = normalizeForwardingConfig(config);
      await client.set(`${FORWARDING_KEY_PREFIX}${webhookId}`, JSON.stringify(normalized));
      cache.set(webhookId, normalized);
      return normalized;
    },
    async stats() {
      return null;
    }
  };
}

function composeStore(requests, forwarding, redisClient) {
  return {
    type: {
      requests: requests.type,
      forwarding: forwarding.type
    },
    getRequests: (webhookId) => requests.getRequests(webhookId),
    prependRequest: (webhookId, request) => requests.prependRequest(webhookId, request),
    clearRequests: (webhookId) => requests.clearRequests(webhookId),
    getForwarding: (webhookId) => forwarding.getForwarding(webhookId),
    setForwarding: (webhookId, config) => forwarding.setForwarding(webhookId, config),
    async stats() {
      const [activeWebhooks, forwardingConfigs] = await Promise.all([
        requests.stats(),
        forwarding.stats()
      ]);
      return { activeWebhooks, forwardingConfigs };
    },
    async close() {
      if (!redisClient) return;
      try {
        await redisClient.quit();
      } catch {
        // ignore
      }
    }
  };
}

async function connectRedis(redisUrl) {
  const client = createClient({ url: redisUrl });
  client.on('error', (err) => {
    console.error('Redis client error:', err?.message || err);
  });

  try {
    await client.connect();
    return client;
  } catch (err) {
    console.warn('⚠️  Redis unavailable, falling back to memory:', err?.message || err);
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
    return null;
  }
}

export async function createStore() {
  const redisUrl = process.env.REDIS_URL?.trim();
  const requestsRedisWanted = envFlagEnabled('REQUESTS_REDIS');
  const forwardingRedisWanted = envFlagEnabled('FORWARDING_REDIS');
  const wantsRedis = requestsRedisWanted || forwardingRedisWanted;

  let redisClient = null;
  if (wantsRedis && redisUrl) {
    redisClient = await connectRedis(redisUrl);
  } else if (wantsRedis && !redisUrl) {
    console.log('💾 Redis flags set but REDIS_URL not configured — using memory');
  }

  const redisReady = Boolean(redisClient);
  const useRequestsRedis = requestsRedisWanted && redisReady;
  const useForwardingRedis = forwardingRedisWanted && redisReady;

  const requests = useRequestsRedis
    ? createRedisRequests(redisClient)
    : createMemoryRequests();
  const forwarding = useForwardingRedis
    ? createRedisForwarding(redisClient)
    : createMemoryForwarding();

  console.log(
    `💾 Storage: requests=${requests.type}, forwarding=${forwarding.type}` +
      (redisUrl ? ` (REDIS_URL set, REQUESTS_REDIS=${requestsRedisWanted}, FORWARDING_REDIS=${forwardingRedisWanted})` : '')
  );

  return composeStore(requests, forwarding, redisClient);
}
