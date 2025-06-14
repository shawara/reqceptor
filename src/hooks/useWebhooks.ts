import { useState, useEffect } from 'react';
import { Webhook } from '../types';

const STORAGE_KEY = 'webhooks';

export function useWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(webhooks));
  }, [webhooks]);

  const addWebhook = (webhook: Webhook) => {
    setWebhooks(prev => [...prev, webhook]);
  };

  const updateWebhook = (id: string, updates: Partial<Webhook>) => {
    setWebhooks(prev =>
      prev.map(webhook =>
        webhook.id === id ? { ...webhook, ...updates } : webhook
      )
    );
  };

  const deleteWebhook = (id: string) => {
    setWebhooks(prev => prev.filter(webhook => webhook.id !== id));
  };

  const getWebhook = (id: string) => {
    return webhooks.find(webhook => webhook.id === id);
  };

  return {
    webhooks,
    addWebhook,
    updateWebhook,
    deleteWebhook,
    getWebhook,
  };
}