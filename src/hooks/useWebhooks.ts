import { useState, useEffect } from 'react';
import { Webhook } from '../types';

const STORAGE_KEY = 'webhooks';

export function useWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure all webhooks have the required properties
      return parsed.map((webhook: Webhook) => ({
        ...webhook,
        forwardUrl: webhook.forwardUrl || '',
        isForwardingEnabled: webhook.isForwardingEnabled || false,
        requests: webhook.requests || [],
        createdAt: webhook.createdAt || Date.now()
      }));
    }
    return [];
  });

  // Persist webhooks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(webhooks));
  }, [webhooks]);

  const addWebhook = (webhook: Webhook) => {
    setWebhooks(prev => [...prev, webhook]);
  };

  const updateWebhook = (id: string, updates: Partial<Webhook>) => {
    console.log('Updating webhook:', { id, updates });
    setWebhooks(prev => {
      const updated = prev.map(webhook =>
        webhook.id === id ? { ...webhook, ...updates } : webhook
      );
      // Immediately persist to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      console.log('Updated webhooks:', updated);
      return updated;
    });
  };

  const deleteWebhook = (id: string) => {
    setWebhooks(prev => {
      const updated = prev.filter(webhook => webhook.id !== id);
      // Immediately persist to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const getWebhook = (id: string) => {
    // First try to get from state
    let webhook = webhooks.find(webhook => webhook.id === id);
    
    // If not found in state, try to get from localStorage
    if (!webhook) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('Loading webhook from localStorage:', { id, parsed });
        const foundWebhook = parsed.find((w: Webhook) => w.id === id);
        if (foundWebhook) {
          // Update state with the found webhook
          setWebhooks(prev => {
            if (!prev.find(w => w.id === id)) {
              return [...prev, foundWebhook];
            }
            return prev;
          });
          webhook = foundWebhook;
        }
      }
    }
    
    console.log('Getting webhook:', { id, webhook });
    return webhook;
  };

  return {
    webhooks,
    addWebhook,
    updateWebhook,
    deleteWebhook,
    getWebhook,
  };
}