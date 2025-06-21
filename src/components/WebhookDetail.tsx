import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, ArrowLeft, Settings, Send, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
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

const API_BASE_URL = config.apiUrl;

export default function WebhookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getWebhook, updateWebhook } = useWebhooks();
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [requests, setRequests] = useState<WebhookRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRequest | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [forwardUrl, setForwardUrl] = useState('');
  const [isForwardingEnabled, setIsForwardingEnabled] = useState(false);
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
  const openConfigModal = () => setConfigModalOpen(true);
  const closeConfigModal = () => setConfigModalOpen(false);
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'query'>('body');
  // Detect dark mode for JsonViewer
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  const webhookUrl = `${API_BASE_URL}/webhook/${id}`;

  // Helper function to format request body for display
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
  const getContentType = (headers: Record<string, string>): string => {
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    if (contentType.includes('application/json')) return 'json';
    if (contentType.includes('application/xml') || contentType.includes('text/xml')) return 'xml';
    if (contentType.includes('text/html')) return 'html';
    if (contentType.includes('application/x-www-form-urlencoded')) return 'form';
    return 'text';
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

      // First, try to get webhook from local storage
      const localWebhook = getWebhook(id);
      console.log('🔍 Checking webhook ownership:', {
        webhookId: id,
        foundInLocalStorage: !!localWebhook,
        isOwned: !!localWebhook
      });
      
      if (localWebhook) {
        // Webhook exists locally - user owns it
        console.log('🔑 Loading owned webhook from local storage:', {
          id: localWebhook.id,
          forwardUrl: localWebhook.forwardUrl,
          isForwardingEnabled: !!localWebhook.forwardUrl,
          requestCount: localWebhook.requests?.length || 0
        });
        
        // Fetch current requests from server to ensure we're in sync
        try {
          const response = await fetch(`${API_BASE_URL}/api/webhook/${id}/requests`);
          if (response.ok) {
            const data = await response.json();
            console.log('📥 Fetched current requests from server:', {
              requestCount: data.requests?.length || 0
            });
            
            // Update local storage with current requests
            const updatedWebhook = {
              ...localWebhook,
              requests: data.requests || []
            };
            updateWebhook(id, updatedWebhook);
            
            // Update state
            setWebhook(updatedWebhook || null);
            setIsOwned(true);
            setRequests(data.requests || []);
            
            // Verify ownership state
            console.log('✅ Ownership state after loading:', {
              isOwned: true,
              webhookId: id,
              forwardUrl: updatedWebhook.forwardUrl
            });
          }
        } catch (err: unknown) {
          console.error('❌ Failed to fetch current requests:', err);
          // Fallback to local storage data
          setWebhook(localWebhook || null);
          setIsOwned(true);
          setRequests(localWebhook.requests || []);
        }
        
        // Load forwarding config ONCE
        setForwardUrl(localWebhook.forwardUrl || '');
        setIsForwardingEnabled(!!localWebhook.forwardUrl);
        console.log('⚙️ Forwarding configuration loaded:', {
          forwardUrl: localWebhook.forwardUrl,
          isEnabled: !!localWebhook.forwardUrl
        });
        setLoading(false);
      } else {
        // Webhook not in local storage - try to fetch from server
        console.log('🔍 Webhook not found in local storage, checking server...');
        try {
          // Check if webhook exists by trying to fetch its requests
          const response = await fetch(`${API_BASE_URL}/api/webhook/${id}/requests`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('📥 Loading shared webhook from server:', {
              requestCount: data.requests?.length || 0
            });
            
            // Create a minimal webhook object for viewing
            const serverWebhook: Webhook = {
              id: id,
              forwardUrl: '',
              requests: data.requests || [],
              createdAt: Date.now() // We don't know the real creation date
            };
            
            setWebhook(serverWebhook);
            setIsOwned(false); // This is a shared webhook, user doesn't own it
            setRequests(data.requests || []);
            setForwardUrl('');
            setIsForwardingEnabled(false);
            
            console.log('ℹ️ Set up as shared webhook:', {
              isOwned: false,
              webhookId: id,
              requestCount: data.requests?.length || 0
            });
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
  }, [id]);

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
            
            // Forward request if enabled
            if (currentWebhook.forwardUrl) {
              console.log('🚀 Forwarding enabled, initiating forward...');
              forwardRequest(request, currentWebhook.forwardUrl);
            } else {
              console.log('⚠️ Forwarding not configured for this webhook');
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
        if (isOwned && id) {
          updateWebhook(id, { requests: [] });
        }
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

  const copyFormattedBody = (body: unknown) => {
    const formatted = formatRequestBody(body);
    navigator.clipboard.writeText(formatted);
  };

  const saveForwardingConfig = async () => {
    if (!id || !isOwned) return;

    setIsSaving(true);
    setSaveSuccess(false);

    // Add a small delay to show the saving state
    await new Promise(resolve => setTimeout(resolve, 300));

    const finalForwardUrl = isForwardingEnabled ? forwardUrl : '';
    
    // Update local storage
    updateWebhook(id, { forwardUrl: finalForwardUrl });
    
    // Reset stats when configuration changes
    setForwardingStats({ success: 0, failed: 0 });
    
    console.log('Forwarding configuration saved:', {
      enabled: isForwardingEnabled,
      url: finalForwardUrl
    });

    setIsSaving(false);
    setSaveSuccess(true);
    
    // Hide success message after 2 seconds
    setTimeout(() => {
      setSaveSuccess(false);
      setShowForwardingConfig(false);
    }, 1500);
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

  // Simple checkbox toggle handler - no complex logic
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    console.log('Checkbox changed to:', newValue);
    setIsForwardingEnabled(newValue);
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
      updateWebhook(id, undefined);
      navigate('/');
    }
  };

  // Only show config buttons if owned and webhook loaded
  const showConfigButtons = Boolean(webhook && isOwned);

  // Provide context values for Header and modal
  const configContextValue = {
    showConfigButtons,
    isConnected,
    isForwardingEnabled,
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
    testingUrl
  };

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
      <Header webhookUrl={webhookUrl} />
      {/* Forwarding Config Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 relative animate-fade-in">
            <button
              onClick={closeConfigModal}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xl font-bold"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Forwarding Configuration</h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="enableForwardingModal"
                  checked={isForwardingEnabled}
                  onChange={handleCheckboxChange}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mt-1"
                />
                <div className="text-sm">
                  <label htmlFor="enableForwardingModal" className="font-medium text-gray-900 cursor-pointer">
                    Enable automatic raw request forwarding
                  </label>
                  <p className="text-gray-600 mt-0.5 text-xs">
                    Forward all incoming webhook requests to your development server in real-time
                  </p>
                </div>
              </div>
              <div>
                <label htmlFor="forwardUrlModal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Forward URL
                </label>
                <div className="flex space-x-2">
                  <input
                    type="url"
                    id="forwardUrlModal"
                    value={forwardUrl}
                    onChange={(e) => setForwardUrl(e.target.value)}
                    placeholder="https://your-api.com/webhook or http://localhost:3000/webhook"
                    className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                  <button
                    onClick={testForwardUrl}
                    disabled={!forwardUrl || testingUrl}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingUrl ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-1"></div>
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    {testingUrl ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>
              <div className="p-2 bg-green-50 border border-green-200 rounded-md">
                <div className="flex">
                  <AlertCircle className="h-4 w-4 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-green-800">
                    <p className="font-medium mb-1">Raw Request Forwarding Features</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><strong>Preserves original body exactly</strong> - no JSON parsing or modification</li>
                      <li><strong>Forwards all original headers</strong> - maintains exact header names and values</li>
                      <li><strong>Preserves HTTP method</strong> - GET, POST, PUT, DELETE, etc.</li>
                      <li>Adds X-Forwarded-By headers for identification</li>
                      <li>CORS policies may still apply for browser-based forwarding</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-2 border-t border-blue-200 mt-4">
                <button
                  onClick={closeConfigModal}
                  className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
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
      <div className="w-full min-h-screen py-6 px-4 bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[30%_70%] gap-2 w-full max-w-full overflow-x-hidden">
          {/* Requests List - full width */}
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Requests ({requests.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
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
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 ${
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
                      {getContentType(request.headers) !== 'text' && (
                        <span className="ml-1 text-xs text-blue-600 dark:text-blue-300">
                          ({getContentType(request.headers)})
                        </span>
                      )}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Request Details - full width */}
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
              <div className="flex items-center justify-between w-full">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Request Details</h2>
                {selectedRequest && isOwned && webhook?.forwardUrl && (
                  <button
                    onClick={() => forwardRequest(selectedRequest, webhook.forwardUrl)}
                    className="inline-flex items-center px-3 py-2 border border-indigo-300 shadow-sm text-sm leading-4 font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all duration-200 hover:scale-105"
                    title="Replay this request to the forwarding URL"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Replay
                  </button>
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
            <div className="p-6">
              {selectedRequest ? (
                <>
                  {/* Tab Content */}
                  {activeTab === 'body' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Body</span>
                        <div className="flex items-center space-x-2">
                          {selectedRequest.body && (
                            <span className="text-xs text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              {getContentType(selectedRequest.headers)}
                            </span>
                          )}
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
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
                        {(() => {
                          let parsed = null;
                          if (selectedRequest.body && typeof selectedRequest.body === 'string') {
                            try {
                              parsed = JSON.parse(selectedRequest.body);
                            } catch {}
                          } else if (selectedRequest.body && typeof selectedRequest.body === 'object') {
                            parsed = selectedRequest.body;
                          }
                          if (parsed) {
                            return <JsonViewer value={parsed} defaultInspectDepth={2} theme={isDarkMode ? 'dark' : 'light'} />;
                          } else {
                            return (
                              <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                {formatRequestBody(selectedRequest.body)}
                              </pre>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  )}
                  {activeTab === 'headers' && (
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">Headers</span>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
                        <JsonViewer value={selectedRequest.headers} defaultInspectDepth={2} theme={isDarkMode ? 'dark' : 'light'} />
                      </div>
                    </div>
                  )}
                  {activeTab === 'query' && selectedRequest.query && Object.keys(selectedRequest.query).length > 0 && (
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">Query Parameters</span>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
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
    </WebhookConfigProvider>
  );
}