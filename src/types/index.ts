export interface WebhookRequest {
  id: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
  url: string;
  originalUrl: string;
  query: Record<string, string>;
  params: Record<string, string>;
}

export interface Webhook {
  id: string;
  forwardUrl: string;
  isForwardingEnabled: boolean;
  requests: WebhookRequest[];
  createdAt?: number;
}