import { createClient } from 'redis';

const MAX_REQUESTS_PER_WEBHOOK = 100;
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

function createMemoryStore() {
  const webhookRequests = new Map();
  const forwardingConfigs = new Map();

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
      return {
        activeWebhooks: webhookRequests.size,
        forwardingConfigs: forwardingConfigs.size
      };
    },
    async close() {}
  };
}

function createRedisStore(client) {
  return {
    type: 'redis',
    async getRequests(webhookId) {
      const raw = await client.get(`${REQUESTS_KEY_PREFIX}${webhookId}`);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async prependRequest(webhookId, request) {
      const key = `${REQUESTS_KEY_PREFIX}${webhookId}`;
      const requests = await this.getRequests(webhookId);
      requests.unshift(request);
      if (requests.length > MAX_REQUESTS_PER_WEBHOOK) {
        requests.splice(MAX_REQUESTS_PER_WEBHOOK);
      }
      await client.set(key, JSON.stringify(requests));
      return requests;
    },
    async clearRequests(webhookId) {
      await client.set(`${REQUESTS_KEY_PREFIX}${webhookId}`, JSON.stringify([]));
    },
    async getForwarding(webhookId) {
      const raw = await client.get(`${FORWARDING_KEY_PREFIX}${webhookId}`);
      if (!raw) return defaultForwardingConfig();
      try {
        return normalizeForwardingConfig(JSON.parse(raw));
      } catch {
        return defaultForwardingConfig();
      }
    },
    async setForwarding(webhookId, config) {
      const normalized = normalizeForwardingConfig(config);
      await client.set(`${FORWARDING_KEY_PREFIX}${webhookId}`, JSON.stringify(normalized));
      return normalized;
    },
    async stats() {
      let activeWebhooks = 0;
      let forwardingConfigs = 0;
      for await (const key of client.scanIterator({ MATCH: `${REQUESTS_KEY_PREFIX}*`, COUNT: 100 })) {
        activeWebhooks += 1;
        void key;
      }
      for await (const key of client.scanIterator({ MATCH: `${FORWARDING_KEY_PREFIX}*`, COUNT: 100 })) {
        forwardingConfigs += 1;
        void key;
      }
      return { activeWebhooks, forwardingConfigs };
    },
    async close() {
      try {
        await client.quit();
      } catch {
        // ignore
      }
    }
  };
}

export async function createStore() {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    console.log('💾 Storage: memory (REDIS_URL not set)');
    return createMemoryStore();
  }

  const client = createClient({ url: redisUrl });
  client.on('error', (err) => {
    console.error('Redis client error:', err?.message || err);
  });

  try {
    await client.connect();
    await client.ping();
    console.log('💾 Storage: redis');
    return createRedisStore(client);
  } catch (err) {
    console.warn('⚠️  Redis unavailable, falling back to memory:', err?.message || err);
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
    return createMemoryStore();
  }
}
