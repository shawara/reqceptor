import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Copy, ArrowLeft, Settings, Send, AlertCircle, CheckCircle, Key } from 'lucide-react';
import { useWebhooks } from '../hooks/useWebhooks';
import { WebhookRequest, Webhook } from '../types';
import io, { Socket } from 'socket.io-client';
import { config } from '../config';
import { WebhookConfigProvider } from '../context/WebhookConfigContext';
import { useState as useModalState } from 'react';
import Header from './Header';
import { useContext } from 'react';
import { WebhookConfigContext } from '../context/WebhookConfigContext';
import { JsonViewer } from '@textea/json-viewer';
import { buildShareUrl, decodeShareConfig, LocalShareConfig } from '../utils/shareConfig';
import { isFormUrlEncodedBody, parseFormUrlEncoded } from '../utils/formBody';

const API_BASE_URL = config.apiUrl;
const MAX_SERVER_FORWARD_URLS = 50;

export default function WebhookDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { getWebhook, updateWebhook, addWebhook, deleteWebhook } = useWebhooks();
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [requests, setRequests] = useState<WebhookRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRequest | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [forwardUrl, setForwardUrl] = useState('');
  const [browserForwardEnabled, setBrowserForwardEnabled] = useState(false);
  const [serverForwardEnabled, setServerForwardEnabled] = useState(false);
  const [serverForwardUrls, setServerForwardUrls] = useState<string[]>([]);
  const [serverUrlDraft, setServerUrlDraft] = useState('');
  const [forwardConfigError, setForwardConfigError] = useState<string | null>(null);
  const browserForwardEnabledRef = useRef(false);
  const [showForwardingConfig, setShowForwardingConfig] = useState(false);
  const [forwardingStats, setForwardingStats] = useState({ success: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [isOwned, setIsOwned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testingUrl, setTestingUrl] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Modal state for config
  const [isConfigModalOpen, setConfigModalOpen] = useModalState(false);
  const openConfigModal = () => {
    setForwardConfigError(null);
    setConfigModalOpen(true);
  };
  const closeConfigModal = () => setConfigModalOpen(false);
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'query'>('body');
  const [bodyView, setBodyView] = useState<'formatted' | 'raw'>('formatted');
  // Detect dark mode for JsonViewer
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  // State for webhook name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  // State for share URL notification
  const [showShareNotification, setShowShareNotification] = useState(false);
  const shareAppliedRef = useRef(false);
  const [shareFromUrl] = useState<LocalShareConfig | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromEncoded = decodeShareConfig(params.get('c'));
    const legacyName = params.has('name')
      ? decodeURIComponent(params.get('name') || '')
      : null;
    if (!fromEncoded && !legacyName) return null;
    return {
      ...(fromEncoded || {}),
      name: fromEncoded?.name || legacyName || undefined
    };
  });
  const nameFromUrl = shareFromUrl?.name || null;

  useEffect(() => {
    browserForwardEnabledRef.current = browserForwardEnabled;
  }, [browserForwardEnabled]);

  const webhookUrl = `${API_BASE_URL}/webhook/${id}`;
  const formatRequestBody = (body: unknown): string => {
    if (body === null || body === undefined) {
      return 'No body';
    }
    
    if (typeof body === 'string') {
      // Try to parse as JSON for better formatting
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // If not valid JSON, return as-is
        return body;
      }
    }
    
    if (typeof body === 'object') {
      return JSON.stringify(body, null, 2);
    }
    
    // For other types (number, boolean, etc.)
    return String(body);
  };

  // Helper function to get the original body as string for copying
  const getOriginalBody = (body: unknown): string => {
    if (body === null || body === undefined) {
      return '';
    }
    
    if (typeof body === 'string') {
      return body;
    }
    
    if (typeof body === 'object') {
      return JSON.stringify(body);
    }
    
    return String(body);
  };

  // Helper function to get content type for syntax highlighting hint
  const getContentType = (headers: Record<string, string>, body?: unknown): string => {
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    if (contentType.includes('application/json')) return 'json';
    if (contentType.includes('application/xml') || contentType.includes('text/xml')) return 'xml';
    if (contentType.includes('text/html')) return 'html';
    if (contentType.includes('application/x-www-form-urlencoded') || isFormUrlEncodedBody(body, headers)) {
      return 'form';
    }
    return 'text';
  };

  const resolveStructuredBody = (
    body: unknown,
    headers?: Record<string, string>
  ): { value: unknown; kind: 'json' | 'form' } | null => {
    if (body && typeof body === 'object') {
      return { value: body, kind: 'json' };
    }
    if (typeof body !== 'string' || !body.trim()) return null;
    try {
      return { value: JSON.parse(body), kind: 'json' };
    } catch {
      // not JSON
    }
    if (isFormUrlEncodedBody(body, headers)) {
      const form = parseFormUrlEncoded(body);
      if (form) return { value: form, kind: 'form' };
    }
    return null;
  };

  // Helper function to build share URL with local browser configs (single encoded `c` param)
  const getShareUrl = (webhookId: string, webhookName?: string) => {
    const localConfig: LocalShareConfig = {
      name: webhookName || webhook?.name,
      forwardUrl: forwardUrl || webhook?.forwardUrl || undefined,
      forwardEnabled: Boolean(
        browserForwardEnabled && (forwardUrl || webhook?.forwardUrl)
      )
    };
    return buildShareUrl(window.location.origin, webhookId, localConfig);
  };

  const mergeShareIntoWebhook = useCallback((base: Webhook): Webhook => {
    if (!shareFromUrl) return base;
    return {
      ...base,
      name: shareFromUrl.name || base.name,
      forwardUrl: shareFromUrl.forwardUrl ?? base.forwardUrl
    };
  }, [shareFromUrl]);

  // Functions for webhook name editing
  const handleNameEdit = () => {
    setIsEditingName(true);
  };

  const handleNameSave = () => {
    if (!id || !isOwned) return;
    
    const trimmedName = nameValue.trim();
    updateWebhook(id, { name: trimmedName || undefined });
    
    // Update local state
    if (webhook) {
      setWebhook({
        ...webhook,
        name: trimmedName || undefined
      });
    }
    
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setNameValue(webhook?.name || '');
      setIsEditingName(false);
    }
  };

  // Memoized forward request function
  const forwardRequest = useCallback(async (request: WebhookRequest, targetUrl: string) => {
    try {
      console.log('🔄 Starting request forwarding:', {
        targetUrl,
        requestId: request.id,
        method: request.method,
        timestamp: new Date(request.timestamp).toISOString()
      });
      
      console.log('📦 Original request details:', {
        method: request.method,
        headers: request.headers,
        bodyType: typeof request.body,
        bodyLength: request.body ? request.body.length : 0,
        query: request.query
      });
      
      // Create a clean copy of headers, preserving original casing and values
      const forwardHeaders: Record<string, string> = {};
      
      // Copy ALL original headers exactly as they were received
      Object.entries(request.headers).forEach(([key, value]) => {
        // Skip headers that browsers/fetch will set automatically or that could cause issues
        const lowerKey = key.toLowerCase();
        if (!['host', 'content-length', 'connection', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions'].includes(lowerKey)) {
          // Preserve original header name casing and value
          forwardHeaders[key] = Array.isArray(value) ? value[0] : String(value);
        }
      });

      // Add forwarding identification headers
      forwardHeaders['X-Forwarded-By'] = 'Webhook-Interceptor';
      forwardHeaders['X-Original-Webhook-Id'] = id || '';
      forwardHeaders['X-Original-Timestamp'] = request.timestamp.toString();
      forwardHeaders['X-Original-Method'] = request.method;

      console.log('📤 Forwarding headers:', forwardHeaders);

      // Prepare the body - use the raw body exactly as received
      let forwardBody: string | undefined = undefined;
      
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (request.body !== null && request.body !== undefined) {
          // The body should already be a string from the server
          // Don't modify it at all - forward exactly as received
          forwardBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
          console.log('📦 Forwarding body:', {
            length: forwardBody.length,
            preview: forwardBody.substring(0, 200) + (forwardBody.length > 200 ? '...' : '')
          });
        }
      }

      console.log('🚀 Sending forward request:', {
        method: request.method,
        url: targetUrl,
        headers: forwardHeaders,
        bodyLength: forwardBody ? forwardBody.length : 0
      });

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: forwardBody,
        mode: 'cors'
      });

      console.log('📥 Forward response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (response.ok) {
        setForwardingStats(prev => ({ ...prev, success: prev.success + 1 }));
        console.log(`✅ Successfully forwarded to ${targetUrl} - Status: ${response.status}`);
      } else {
        setForwardingStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        console.warn(`⚠️ Forward completed with non-2xx status: ${response.status}`);
      }
    } catch (error: unknown) {
      setForwardingStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      console.error(`❌ Failed to forward request:`, error);
      
      // Log more details about the error
      if (error instanceof TypeError) {
        console.error('This might be a CORS or network connectivity issue');
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
    }
  }, [id]);

  // Load webhook data - runs only once when component mounts or id changes
  useEffect(() => {
    if (!id) return;

    const loadWebhook = async () => {
      setLoading(true);

      const localWebhook = getWebhook(id);
      console.log('🔍 Checking webhook ownership:', {
        webhookId: id,
        foundInLocalStorage: !!localWebhook,
        isOwned: !!localWebhook
      });

      if (localWebhook) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/webhook/${id}/requests`);
          if (response.ok) {
            const data = await response.json();
            const updatedWebhook = mergeShareIntoWebhook({
              ...localWebhook,
              requests: data.requests || []
            });
            updateWebhook(id, updatedWebhook);
            setWebhook(updatedWebhook);
            setIsOwned(true);
            setRequests(data.requests || []);
            setNameValue(updatedWebhook.name || '');
            setForwardUrl(updatedWebhook.forwardUrl || '');
          } else {
            const merged = mergeShareIntoWebhook(localWebhook);
            updateWebhook(id, merged);
            setWebhook(merged);
            setIsOwned(true);
            setRequests(merged.requests || []);
            setNameValue(merged.name || '');
            setForwardUrl(merged.forwardUrl || '');
          }
        } catch (err: unknown) {
          console.error('❌ Failed to fetch current requests:', err);
          const merged = mergeShareIntoWebhook(localWebhook);
          updateWebhook(id, merged);
          setWebhook(merged);
          setIsOwned(true);
          setRequests(merged.requests || []);
          setNameValue(merged.name || '');
          setForwardUrl(merged.forwardUrl || '');
        }
        setLoading(false);
      } else {
        try {
          const requestsResponse = await fetch(`${API_BASE_URL}/api/webhook/${id}/requests`);

          if (requestsResponse.ok) {
            const data = await requestsResponse.json();
            const serverWebhook = mergeShareIntoWebhook({
              id,
              name: nameFromUrl || undefined,
              forwardUrl: '',
              requests: data.requests || [],
              createdAt: Date.now()
            });

            if (serverWebhook.name) setNameValue(serverWebhook.name);

            // Share links apply name/forward UI for this session only.
            // Do not auto-add to localStorage — that would create a home-page card.
            // User must Claim Ownership to persist.
            setIsOwned(false);

            setWebhook(serverWebhook);
            setRequests(data.requests || []);
            setForwardUrl(serverWebhook.forwardUrl || '');
          } else {
            setError('Webhook not found');
          }
        } catch (err: unknown) {
          console.error('❌ Failed to fetch webhook:', err);
          setError('Failed to load webhook');
        }
        setLoading(false);
      }
    };

    loadWebhook();
    // Intentionally depend only on `id`: getWebhook/updateWebhook/addWebhook from
    // useWebhooks are new each render and would re-trigger this effect forever
    // (stuck on "Loading webhook..."). shareFromUrl is captured once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hydrateForwardingFromServer = useCallback(async () => {
    if (!id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/webhook/${id}/forwarding`);
      if (!response.ok) return;
      const data = await response.json();
      const urls = Array.isArray(data.urls) ? data.urls : [];
      setServerForwardUrls(urls);
      setServerForwardEnabled(Boolean(data.serverEnabled));

      let localWebhook: Webhook | undefined;
      try {
        const stored = localStorage.getItem('webhooks');
        const list = stored ? JSON.parse(stored) : [];
        localWebhook = Array.isArray(list)
          ? list.find((w: Webhook) => w.id === id)
          : undefined;
      } catch {
        localWebhook = undefined;
      }

      const localUrl = shareFromUrl?.forwardUrl || localWebhook?.forwardUrl || '';
      if (localUrl) setForwardUrl(localUrl);

      if (shareFromUrl?.forwardEnabled !== undefined) {
        setBrowserForwardEnabled(Boolean(shareFromUrl.forwardEnabled && localUrl));
      } else if (localWebhook?.browserForwardEnabled !== undefined) {
        setBrowserForwardEnabled(Boolean(localWebhook.browserForwardEnabled && localUrl));
      } else {
        setBrowserForwardEnabled(Boolean(localUrl));
      }
    } catch (err) {
      console.error('Failed to load forwarding config:', err);
    }
  }, [id, shareFromUrl]);

  useEffect(() => {
    if (!id) return;
    void hydrateForwardingFromServer();
  }, [id, hydrateForwardingFromServer]);

  useEffect(() => {
    if (!isConfigModalOpen || !id) return;
    void hydrateForwardingFromServer();
  }, [isConfigModalOpen, id, hydrateForwardingFromServer]);

  // Strip share query after apply
  useEffect(() => {
    if (!shareFromUrl || shareAppliedRef.current || loading) return;
    shareAppliedRef.current = true;
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [shareFromUrl, loading]);

  // Setup WebSocket connection - runs only when webhook is loaded
  useEffect(() => {
    if (!id) return;

    // Only create socket if it doesn't exist
    if (!socketRef.current) {
      console.log('🔌 Setting up WebSocket connection...');
      // Connect to WebSocket
      const newSocket = io(API_BASE_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
      });
      socketRef.current = newSocket;

      newSocket.on('connect', () => {
        console.log('✅ Connected to webhook server');
        setIsConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('❌ Disconnected from webhook server');
        setIsConnected(false);
      });

      newSocket.on('webhook-request', (request: WebhookRequest) => {
        console.log('📨 Received webhook request:', {
          id: request.id,
          method: request.method,
          timestamp: new Date(request.timestamp).toISOString()
        });
        
        // Update requests state using functional update to ensure we have the latest state
        setRequests(prevRequests => {
          console.log('📊 Previous requests:', prevRequests.length);
          // Check if request already exists to avoid duplicates
          const exists = prevRequests.some(r => r.id === request.id);
          if (exists) {
            console.log('⚠️ Request already exists, skipping');
            return prevRequests;
          }
          const newRequests = [request, ...prevRequests];
          console.log('📈 New requests count:', newRequests.length);
          
          // Get the current webhook from local storage
          const currentWebhook = getWebhook(id);
          console.log('🔍 Current webhook state:', {
            webhookId: id,
            isOwned: !!currentWebhook,
            hasForwardUrl: !!currentWebhook?.forwardUrl,
            forwardUrl: currentWebhook?.forwardUrl
          });
          
          // Update local storage with the new requests array
          if (currentWebhook) {
            const updatedWebhook = {
              ...currentWebhook,
              requests: newRequests
            };
            updateWebhook(id, updatedWebhook);
            
            if (browserForwardEnabledRef.current && currentWebhook.forwardUrl) {
              console.log('🚀 Browser forwarding enabled, initiating forward...');
              forwardRequest(request, currentWebhook.forwardUrl);
            } else {
              console.log('ℹ️ Skipping browser forward (disabled or URL not set)');
            }
          } else {
            console.log('ℹ️ Webhook not found in local storage, skipping forward');
          }
          
          return newRequests;
        });
      });

      newSocket.on('requests-cleared', () => {
        console.log('Requests cleared event received');
        setRequests([]);
        if (isOwned && id) updateWebhook(id, { requests: [] });
      });

      // Handle reconnection
      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Attempting to reconnect (${attemptNumber})...`);
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        // Re-join the webhook room after reconnection
        socketRef.current?.emit('join-webhook', id);
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('Reconnection error:', error);
      });

      newSocket.on('reconnect_failed', () => {
        console.error('Failed to reconnect');
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []); // Empty dependency array since we only want to set up the socket once

  // Effect to handle webhook room joining when id changes
  useEffect(() => {
    if (socketRef.current && id) {
      socketRef.current.emit('join-webhook', id);
    }
  }, [id]);

  // Debug effect to monitor requests state
  useEffect(() => {
    console.log('Requests state updated:', requests);
  }, [requests]);

  // Reset body view when selecting another request
  useEffect(() => {
    setBodyView('formatted');
  }, [selectedRequest?.id]);

  // Detect dark mode for JsonViewer
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const copyShareUrl = () => {
    if (!id) return;
    const shareUrl = getShareUrl(id, webhook?.name);
    navigator.clipboard.writeText(shareUrl);
    
    // Show notification
    setShowShareNotification(true);
    setTimeout(() => {
      setShowShareNotification(false);
    }, 2000);
  };

  const copyFormattedBody = (body: unknown) => {
    const formatted = formatRequestBody(body);
    navigator.clipboard.writeText(formatted);
  };

  const saveForwardingConfig = async () => {
    if (!id) return;

    setIsSaving(true);
    setSaveSuccess(false);
    setForwardConfigError(null);

    try {
      if (browserForwardEnabled && !isOwned) {
        setForwardConfigError('Claim ownership to configure browser forwarding (uses this browser).');
        setIsSaving(false);
        return;
      }

      const trimmedUrl = forwardUrl.trim();
      const finalForwardUrl = trimmedUrl;
      if (isOwned) {
        updateWebhook(id, {
          forwardUrl: finalForwardUrl,
          browserForwardEnabled: Boolean(browserForwardEnabled && finalForwardUrl)
        });
        setWebhook((prev) =>
          prev
            ? {
                ...prev,
                forwardUrl: finalForwardUrl,
                browserForwardEnabled: Boolean(browserForwardEnabled && finalForwardUrl)
              }
            : prev
        );
        if (browserForwardEnabled && !finalForwardUrl) {
          setForwardConfigError('Browser forwarding needs a forward URL');
          setIsSaving(false);
          return;
        }
        setBrowserForwardEnabled(Boolean(browserForwardEnabled && finalForwardUrl));
      }

      if (serverForwardEnabled && serverForwardUrls.length === 0) {
        setForwardConfigError('Server forwarding needs at least one destination URL');
        setIsSaving(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/webhook/${id}/forwarding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverEnabled: serverForwardEnabled,
          urls: serverForwardUrls
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setForwardConfigError(data.error || 'Failed to save server forwarding');
        setIsSaving(false);
        return;
      }

      setServerForwardUrls(data.urls || []);
      setServerForwardEnabled(Boolean(data.serverEnabled));
      setForwardingStats({ success: 0, failed: 0 });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        closeConfigModal();
        setShowForwardingConfig(false);
      }, 1500);
    } catch (err) {
      setForwardConfigError(err instanceof Error ? err.message : 'Failed to save forwarding config');
    } finally {
      setIsSaving(false);
    }
  };

  const addServerForwardUrl = () => {
    const next = serverUrlDraft.trim();
    setForwardConfigError(null);
    if (!next) return;
    if (serverForwardUrls.length >= MAX_SERVER_FORWARD_URLS) {
      setForwardConfigError(`Maximum ${MAX_SERVER_FORWARD_URLS} URLs allowed`);
      return;
    }
    try {
      const parsed = new URL(next);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setForwardConfigError('Only http/https URLs are allowed');
        return;
      }
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) {
        setForwardConfigError('Server mode cannot use localhost or .local hosts');
        return;
      }
    } catch {
      setForwardConfigError('Invalid URL');
      return;
    }
    if (serverForwardUrls.includes(next)) {
      setForwardConfigError('URL already added');
      return;
    }
    setServerForwardUrls((prev) => [...prev, next]);
    setServerUrlDraft('');
  };

  const removeServerForwardUrl = (url: string) => {
    setServerForwardUrls((prev) => prev.filter((u) => u !== url));
  };

  const canReplayBrowser = Boolean(forwardUrl || webhook?.forwardUrl);
  const canReplayServer = serverForwardUrls.length > 0;

  const replaySelectedRequest = async (via: 'browser' | 'server') => {
    if (!selectedRequest || !id) return;

    if (via === 'server') {
      if (!canReplayServer) {
        alert('No server forward URLs configured. Add them in Forwarding settings.');
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/webhook/${id}/forwarding/replay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: selectedRequest.id })
        });
        const data = await response.json();
        if (!response.ok) {
          alert(data.error || 'Server replay failed');
          return;
        }
        alert(`Replayed via server to ${data.forwardedTo} destination(s)`);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Server replay failed');
      }
      return;
    }

    const target = forwardUrl || webhook?.forwardUrl;
    if (!target) {
      alert('No browser forward URL configured. Set one in Forwarding settings (Browser mode).');
      return;
    }
    await forwardRequest(selectedRequest, target);
  };

  const testForwardUrl = async () => {
    if (!forwardUrl) return;

    setTestingUrl(true);

    try {
      const testPayload = {
        test: true,
        message: 'Test webhook from Webhook Interceptor',
        timestamp: new Date().toISOString(),
        webhookId: id
      };

      const response = await fetch(forwardUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Test': 'true',
          'X-Forwarded-By': 'Webhook-Interceptor'
        },
        body: JSON.stringify(testPayload),
        mode: 'cors'
      });

      if (response.ok) {
        alert(`✅ Test successful! Response status: ${response.status}`);
      } else {
        alert(`⚠️ Test completed with status: ${response.status}\n\nThis might still work for actual webhooks.`);
      }
    } catch (error: unknown) {
      if (error instanceof TypeError && error.message.includes('CORS')) {
        alert(`🔒 CORS Error: The target server doesn't allow cross-origin requests from the browser.\n\nThis is normal for many APIs. Your webhooks will still be forwarded, but testing from the browser may not work.`);
      } else {
        alert(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check the URL and try again.`);
      }
    } finally {
      setTestingUrl(false);
    }
  };

  // Handler for Forward button
  const handleForwardClick = () => setShowForwardingConfig((v) => !v);
  // Handler for Clear button
  const handleClear = async () => {
    if (!isOwned) {
      alert('You can only clear requests for webhooks you own.');
      return;
    }
    if (window.confirm('Are you sure you want to clear all requests?')) {
      try {
        await fetch(`${API_BASE_URL}/api/webhook/${id}/requests`, { method: 'DELETE' });
        setRequests([]);
        if (id) updateWebhook(id, { requests: [] });
      } catch (error) {
        setRequests([]);
        if (id) updateWebhook(id, { requests: [] });
      }
    }
  };
  // Handler for Delete button
  const handleDelete = () => {
    if (id && isOwned && window.confirm('Are you sure you want to delete this webhook?')) {
      deleteWebhook(id);
      navigate('/');
    }
  };

  // Add a function to claim ownership of a webhook
  const claimOwnership = () => {
    if (!id || !webhook) return;
    
    if (window.confirm('Do you want to claim ownership of this webhook? This will allow you to configure forwarding and manage this webhook.')) {
      const webhookName = nameFromUrl || webhook.name;
      const claimedForwardUrl = forwardUrl || shareFromUrl?.forwardUrl || webhook.forwardUrl || '';
      const claimedBrowserEnabled =
        browserForwardEnabled ||
        Boolean(shareFromUrl?.forwardEnabled && claimedForwardUrl);

      const claimedWebhook: Webhook = {
        id,
        name: webhookName,
        forwardUrl: claimedForwardUrl,
        browserForwardEnabled: Boolean(claimedBrowserEnabled && claimedForwardUrl),
        requests,
        createdAt: Date.now()
      };
      
      addWebhook(claimedWebhook);
      
      setWebhook(claimedWebhook);
      setIsOwned(true);
      setNameValue(webhookName || '');
      setForwardUrl(claimedForwardUrl);
      setBrowserForwardEnabled(Boolean(claimedBrowserEnabled && claimedForwardUrl));
      
      console.log('🔑 Webhook claimed:', {
        webhookId: id,
        webhookName,
        nameFromUrl,
        originalName: webhook.name,
        isOwned: true
      });
    }
  };

  // Show Forward for any viewer; Clear/Delete still gated by ownership in handlers
  const showConfigButtons = Boolean(webhook);

  // Provide context values for Header and modal
  const configContextValue = {
    showConfigButtons,
    isOwned,
    isConnected,
    isForwardingEnabled:
      Boolean(browserForwardEnabled && forwardUrl) ||
      Boolean(serverForwardEnabled && serverForwardUrls.length > 0),
    onForwardClick: openConfigModal,
    onClear: handleClear,
    onDelete: handleDelete,
    isConfigModalOpen,
    openConfigModal,
    closeConfigModal,
    forwardUrl,
    setForwardUrl,
    saveForwardingConfig,
    testForwardUrl,
    isSaving,
    testingUrl,
    // Add webhook name editing functionality
    webhookName: webhook?.name || '',
    isEditingName,
    nameValue,
    setNameValue,
    handleNameEdit,
    handleNameSave,
    handleNameKeyDown,
    // Share URL
    copyShareUrl
  };

  // Debug logging
  console.log('WebhookDetail configContextValue:', {
    webhookName: webhook?.name,
    webhook: webhook ? {
      id: webhook.id,
      name: webhook.name,
      hasName: !!webhook.name
    } : null,
    isEditingName,
    nameValue
  });

  if (loading) {
    return (
      <WebhookConfigProvider value={{ showConfigButtons: false }}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading webhook...</p>
          </div>
        </div>
      </WebhookConfigProvider>
    );
  }

  if (error) {
    return (
      <WebhookConfigProvider value={{ showConfigButtons: false }}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Webhook Not Found</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">The webhook you're looking for doesn't exist or is no longer available.</p>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </button>
          </div>
        </div>
      </WebhookConfigProvider>
    );
  }

  if (!webhook) {
    return <WebhookConfigProvider value={{ showConfigButtons: false }}><></></WebhookConfigProvider>;
  }

  return (
    <WebhookConfigProvider value={configContextValue}>
      <div className="h-screen overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-900">
        <div className="shrink-0">
          <Header webhookUrl={webhookUrl} webhookName={webhook?.name || undefined} />

          {/* Share URL copied notification */}
          {showShareNotification && (
            <div className="fixed top-16 left-1/2 transform -translate-x-1/2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-4 py-2 rounded-md shadow-md flex items-center z-50 animate-fade-in">
              <CheckCircle className="h-4 w-4 mr-2" />
              Share URL copied to clipboard!
            </div>
          )}

          {/* Add Claim Ownership button when viewing a webhook that's not owned */}
          {webhook && !isOwned && (
            <div className="bg-yellow-50 dark:bg-yellow-900 p-3 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  You're viewing a shared webhook. Claim ownership to enable forwarding and configuration.
                </p>
              </div>
              <button
                onClick={claimOwnership}
                className="ml-4 inline-flex items-center px-3 py-2 border border-yellow-300 shadow-sm text-sm leading-4 font-medium rounded-md text-yellow-700 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-900 hover:bg-yellow-100 dark:hover:bg-yellow-800 transition-all duration-200"
              >
                <Key className="h-4 w-4 mr-1" />
                Claim Ownership
              </button>
            </div>
          )}

        </div>

        {/* Forwarding Config Modal */}
        {isConfigModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-xl w-full p-6 relative animate-fade-in">
              <button
                onClick={closeConfigModal}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xl font-bold"
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Forwarding Configuration</h2>
              <div className="space-y-6">
                {/* Browser section */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Browser forwarding</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Uses this open tab (good for localhost). CORS may apply.
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id="enableBrowserForwarding"
                      checked={browserForwardEnabled}
                      onChange={(e) => setBrowserForwardEnabled(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mt-1"
                    />
                    <label htmlFor="enableBrowserForwarding" className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                      Enable browser auto-forward
                    </label>
                  </div>
                  <div>
                    <label htmlFor="forwardUrlModal" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Forward URL
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="url"
                        id="forwardUrlModal"
                        value={forwardUrl}
                        onChange={(e) => setForwardUrl(e.target.value)}
                        placeholder="https://your-api.com/webhook or http://localhost:3000/webhook"
                        className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                      <button
                        onClick={testForwardUrl}
                        disabled={!forwardUrl || testingUrl}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testingUrl ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-1"></div>
                        ) : (
                          <Send className="h-4 w-4 mr-1" />
                        )}
                        {testingUrl ? 'Testing...' : 'Test'}
                      </button>
                    </div>
                    {!isOwned && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Claim ownership to save browser forwarding for this browser.
                      </p>
                    )}
                  </div>
                </div>

                {/* Server section */}
                <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Server forwarding</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Forwards even when this tab is closed. Localhost URLs are not allowed. Up to {MAX_SERVER_FORWARD_URLS} destinations.
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id="enableServerForwarding"
                      checked={serverForwardEnabled}
                      onChange={(e) => setServerForwardEnabled(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mt-1"
                    />
                    <label htmlFor="enableServerForwarding" className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                      Enable server auto-forward
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Destination URLs ({serverForwardUrls.length}/{MAX_SERVER_FORWARD_URLS})
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="url"
                        value={serverUrlDraft}
                        onChange={(e) => setServerUrlDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addServerForwardUrl(); } }}
                        placeholder="https://api.example.com/webhook"
                        className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        onClick={addServerForwardUrl}
                        disabled={serverForwardUrls.length >= MAX_SERVER_FORWARD_URLS}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    {serverForwardUrls.length > 0 && (
                      <ul className="max-h-40 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-md">
                        {serverForwardUrls.map((url) => (
                          <li key={url} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span className="truncate font-mono text-gray-800 dark:text-gray-200">{url}</span>
                            <button
                              type="button"
                              onClick={() => removeServerForwardUrl(url)}
                              className="text-red-600 dark:text-red-400 text-xs shrink-0"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {forwardConfigError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{forwardConfigError}</p>
                )}
                {saveSuccess && (
                  <p className="text-sm text-green-600 dark:text-green-400">Saved</p>
                )}

                <div className="p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md">
                  <div className="flex">
                    <AlertCircle className="h-4 w-4 text-green-400 dark:text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-green-800 dark:text-green-300">
                      <p className="font-medium mb-1">Raw Request Forwarding Features</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li><strong>Preserves original body exactly</strong> - no JSON parsing or modification</li>
                        <li><strong>Forwards all original headers</strong> - maintains exact header names and values</li>
                        <li><strong>Preserves HTTP method</strong> - GET, POST, PUT, DELETE, etc.</li>
                        <li>Adds X-Forwarded-By headers for identification</li>
                        <li>Browser and server forwarding can run at the same time</li>
                        <li>Server fan-out is fire-and-forget (webhook returns 200 immediately)</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-2 border-t border-blue-200 mt-4">
                  <button
                    onClick={closeConfigModal}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveForwardingConfig}
                    disabled={isSaving}
                    className="px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
                  >
                    {isSaving ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </div>
                    ) : (
                      'Save Configuration'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 w-full px-4 py-4 overflow-y-auto lg:overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[30%_70%] gap-2 w-full lg:h-full min-h-0 lg:overflow-hidden">
            {/* Requests List */}
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg flex flex-col min-h-0 h-full overflow-hidden max-h-[40vh] lg:max-h-none">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Requests ({requests.length})
                </h2>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700 flex-1 min-h-0 overflow-y-auto">
                {requests.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <Settings className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
                    <p>No requests received yet</p>
                    <p className="text-sm mt-1">Send a request to your webhook URL to see it here</p>
                  </div>
                ) : (
                  requests.map((request) => (
                    <div
                      key={`${request.id}-${request.timestamp}`}
                      onClick={() => setSelectedRequest(request)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 ${
                        selectedRequest?.id === request.id ? 'bg-indigo-50 dark:bg-indigo-900 border-r-4 border-indigo-500 dark:border-indigo-400' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-all duration-200 ${
                          request.method === 'GET' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          request.method === 'POST' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          request.method === 'PUT' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          request.method === 'DELETE' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}>
                          {request.method}
                        </span>
                        <span className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            {new Date(request.timestamp).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: 'numeric',
                              second: 'numeric',
                              hour12: true
                            })}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                            {new Date(request.timestamp).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                        {Object.keys(request.headers).length} headers
                        {request.body && ' • Has body'}
                        {getContentType(request.headers, request.body) !== 'text' && (
                          <span className="ml-1 text-xs text-blue-600 dark:text-blue-300">
                            ({getContentType(request.headers, request.body)})
                          </span>
                        )}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Request Details */}
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg flex flex-col min-h-0 h-full overflow-hidden max-h-[60vh] lg:max-h-none">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Request Details</h2>
                  {selectedRequest && (canReplayBrowser || canReplayServer) && (
                    <div className="inline-flex rounded-md shadow-sm overflow-hidden border border-indigo-300 dark:border-indigo-700">
                      {canReplayBrowser && (
                        <button
                          onClick={() => replaySelectedRequest('browser')}
                          className="inline-flex items-center px-3 py-2 text-sm leading-4 font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-200 transition-all duration-200"
                          title={`Replay via browser to ${forwardUrl || webhook?.forwardUrl}`}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Replay Browser
                        </button>
                      )}
                      {canReplayBrowser && canReplayServer && (
                        <span className="w-px bg-indigo-300 dark:bg-indigo-700" aria-hidden />
                      )}
                      {canReplayServer && (
                        <button
                          onClick={() => replaySelectedRequest('server')}
                          className="inline-flex items-center px-3 py-2 text-sm leading-4 font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-200 transition-all duration-200"
                          title={`Replay via server to ${serverForwardUrls.length} destination(s)`}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Replay Server
                        </button>
                      )}
                    </div>
                  )}
                  {/* Tabs */}
                  {selectedRequest && (
                    <div className="flex border-b border-gray-200 ml-6">
                      <button
                        className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors duration-200 focus:outline-none ${
                          activeTab === 'body'
                            ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-200'
                        }`}
                        onClick={() => setActiveTab('body')}
                      >
                        Body
                      </button>
                      <button
                        className={`ml-2 px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors duration-200 focus:outline-none ${
                          activeTab === 'headers'
                            ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-200'
                        }`}
                        onClick={() => setActiveTab('headers')}
                      >
                        Headers
                      </button>
                      {selectedRequest.query && Object.keys(selectedRequest.query).length > 0 && (
                        <button
                          className={`ml-2 px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors duration-200 focus:outline-none ${
                            activeTab === 'query'
                              ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-200'
                          }`}
                          onClick={() => setActiveTab('query' as any)}
                        >
                          Query
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6 flex-1 min-h-0 overflow-y-auto">
                {selectedRequest ? (
                  <>
                    {/* Tab Content */}
                    {activeTab === 'body' && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Body</span>
                          <div className="flex items-center space-x-2">
                            {selectedRequest.body && (
                              <span className="text-xs text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {getContentType(selectedRequest.headers, selectedRequest.body)}
                              </span>
                            )}
                            {(() => {
                              const structured = resolveStructuredBody(
                                selectedRequest.body,
                                selectedRequest.headers
                              );
                              if (!structured) return null;
                              return (
                                <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setBodyView('formatted')}
                                    className={`px-2 py-1 ${
                                      bodyView === 'formatted'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                                    }`}
                                  >
                                    Formatted
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setBodyView('raw')}
                                    className={`px-2 py-1 border-l border-gray-300 dark:border-gray-600 ${
                                      bodyView === 'raw'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                                    }`}
                                  >
                                    Raw
                                  </button>
                                </div>
                              );
                            })()}
                            {selectedRequest.body && (
                              <button
                                onClick={() => copyToClipboard(getOriginalBody(selectedRequest.body))}
                                className="inline-flex items-center px-2 py-1 border border-gray-300 shadow-sm text-xs leading-4 font-medium rounded text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 hover:scale-105"
                                title="Copy original body as text"
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy Raw
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
                          {(() => {
                            const structured = resolveStructuredBody(
                              selectedRequest.body,
                              selectedRequest.headers
                            );
                            if (structured && bodyView === 'formatted') {
                              return (
                                <JsonViewer
                                  value={structured.value}
                                  defaultInspectDepth={2}
                                  theme={isDarkMode ? 'dark' : 'light'}
                                />
                              );
                            }
                            return (
                              <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                {formatRequestBody(selectedRequest.body)}
                              </pre>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    {activeTab === 'headers' && (
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">Headers</span>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
                          <JsonViewer value={selectedRequest.headers} defaultInspectDepth={2} theme={isDarkMode ? 'dark' : 'light'} />
                        </div>
                      </div>
                    )}
                    {activeTab === 'query' && selectedRequest.query && Object.keys(selectedRequest.query).length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">Query Parameters</span>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
                          <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                            {JSON.stringify(selectedRequest.query, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    <p>Select a request to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </WebhookConfigProvider>
  );
}