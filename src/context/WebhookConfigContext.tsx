import { createContext } from 'react';

export interface WebhookConfigContextType {
  showConfigButtons: boolean;
  isConnected: boolean;
  isForwardingEnabled: boolean;
  onForwardClick: () => void;
  onClear: () => void;
  onDelete: () => void;
  // Modal state and forwarding config
  isConfigModalOpen: boolean;
  openConfigModal: () => void;
  closeConfigModal: () => void;
  forwardUrl: string;
  setForwardUrl: (url: string) => void;
  saveForwardingConfig: () => Promise<void>;
  testForwardUrl: () => Promise<void>;
  isSaving: boolean;
  testingUrl: boolean;
  // Webhook name editing
  webhookName?: string;
  isEditingName?: boolean;
  nameValue?: string;
  setNameValue?: (value: string) => void;
  handleNameEdit?: () => void;
  handleNameSave?: () => void;
  handleNameKeyDown?: (e: React.KeyboardEvent) => void;
}

export const WebhookConfigContext = createContext<Partial<WebhookConfigContextType>>({});

export const WebhookConfigProvider = WebhookConfigContext.Provider; 