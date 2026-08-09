export interface WebhookRequest {
  id: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
  query?: Record<string, string>;
}

export interface ForwardingConfig {
  serverEnabled: boolean;
  urls: string[];
}

export interface Webhook {
  id: string;
  name?: string;
  forwardUrl: string;
  /** When true, open tab auto-forwards to forwardUrl. Defaults to !!forwardUrl if unset. */
  browserForwardEnabled?: boolean;
  requests: WebhookRequest[];
  createdAt?: number;
}
