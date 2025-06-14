export interface WebhookRequest {
  id: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
  query?: Record<string, string>;
}

export interface Webhook {
  id: string;
  forwardUrl: string;
  requests: WebhookRequest[];
  createdAt?: number;
}