import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, ArrowLeft, Settings, Trash2, RefreshCw, Send, ExternalLink } from 'lucide-react';
import { useWebhooks } from '../hooks/useWebhooks';
import { WebhookRequest } from '../types';
import { io, Socket } from 'socket.io-client';
import { config } from '../config';

export default function WebhookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getWebhook, updateWebhook, deleteWebhook } = useWebhooks();
  const [requests, setRequests] = useState<WebhookRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRequest | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [forwardUrl, setForwardUrl] = useState('');
  const [isForwardingEnabled, setIsForwardingEnabled] = useState(false);
  const [showForwardingConfig, setShowForwardingConfig] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const forwardUrlRef = useRef<string>('');
  const isSocketSetupRef = useRef(false);

  const webhook = id ? getWebhook(id) : null;
  const webhookUrl = `${config.apiUrl}/webhook/${id}`;

  // Handle webhook state changes
  useEffect(() => {
    if (!webhook || !id) return;

    console.log('Webhook data loaded:', {
      webhook,
      isForwardingEnabled: webhook.isForwardingEnabled,
      forwardUrl: webhook.forwardUrl
    });

    // Initialize requests and forwarding config from stored webhook
    setRequests(webhook.requests);
    setForwardUrl(webhook.forwardUrl || '');
    setIsForwardingEnabled(webhook.isForwardingEnabled || false);
    forwardUrlRef.current = webhook.forwardUrl || '';
  }, [webhook, id]);

  // Update forwardUrlRef when forwarding state changes
  useEffect(() => {
    if (isForwardingEnabled) {
      forwardUrlRef.current = forwardUrl;
    } else {
      forwardUrlRef.current = '';
    }
  }, [isForwardingEnabled, forwardUrl]);

  // Handle WebSocket connection
  useEffect(() => {
    if (!id || isSocketSetupRef.current) return;

    // Connect to WebSocket with reconnection options
    const socket = io(config.socketUrl, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'],
      forceNew: false
    });
    socketRef.current = socket;
    isSocketSetupRef.current = true;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-webhook', id);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('Connection error:', error.message);
      setIsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.on('webhook-request', (request: WebhookRequest) => {
      console.log('Received webhook request:', request);
      setRequests(prev => [request, ...prev]);
      if (id) {
        updateWebhook(id, { requests: [request, ...(webhook?.requests || [])] });
      }
      
      // Forward the request if enabled
      forwardWebhookRequest(request);
    });

    socket.on('requests-cleared', () => {
      setRequests([]);
      if (id) {
        updateWebhook(id, { requests: [] });
      }
    });

    // Load existing requests from server
    fetch(`${config.apiUrl}/api/webhook/${id}/requests`)
      .then(res => res.json())
      .then(data => {
        if (data.requests) {
          setRequests(data.requests);
          if (id) {
            updateWebhook(id, { requests: data.requests });
          }
        }
      })
      .catch((err: Error) => {
        console.error('Could not load existing requests:', err.message);
      });

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('connect_error');
        socketRef.current.off('disconnect');
        socketRef.current.off('webhook-request');
        socketRef.current.off('requests-cleared');
        socketRef.current.disconnect();
        socketRef.current = null;
        isSocketSetupRef.current = false;
      }
    };
  }, [id]); // Only depend on id

  // Function to forward webhook request
  const forwardWebhookRequest = async (request: WebhookRequest) => {
    if (!isForwardingEnabled || !forwardUrlRef.current || !id) {
      console.log('Forwarding skipped:', {
        isForwardingEnabled,
        forwardUrl: forwardUrlRef.current,
        id
      });
      return;
    }

    try {
      console.log('Forwarding webhook to:', forwardUrlRef.current);
      
      // Prepare headers for forwarding (exclude some internal headers)
      const forwardHeaders = { ...request.headers };
      delete forwardHeaders.host;
      delete forwardHeaders['content-length'];
      
      // Add forwarding headers
      forwardHeaders['X-Forwarded-By'] = 'Webhook-Interceptor';
      forwardHeaders['X-Original-Webhook-Id'] = id;
      forwardHeaders['X-Original-Timestamp'] = request.timestamp.toString();

      const response = await fetch(forwardUrlRef.current, {
        method: request.method,
        headers: forwardHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? 
          JSON.stringify(request.body) : undefined
      });

      if (!response.ok) {
        throw new Error(`Forward request failed with status: ${response.status}`);
      }
    } catch (err) {
      console.error('Failed to forward webhook:', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDeleteWebhook = () => {
    if (id && window.confirm('Are you sure you want to delete this webhook?')) {
      deleteWebhook(id);
      navigate('/');
    }
  };

  const clearRequests = async () => {
    if (window.confirm('Are you sure you want to clear all requests?')) {
      try {
        await fetch(`${config.apiUrl}/api/webhook/${id}/requests`, {
          method: 'DELETE'
        });
        setRequests([]);
        if (id) {
          updateWebhook(id, { requests: [] });
        }
      } catch (error) {
        console.error('Failed to clear requests:', error);
        // Fallback to local clear
        setRequests([]);
        if (id) {
          updateWebhook(id, { requests: [] });
        }
      }
    }
  };

  const handleForwardingToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    console.log('Forwarding toggle:', {
      newValue,
      currentWebhook: webhook,
      id
    });
    setIsForwardingEnabled(newValue);
    
    // Update the webhook state immediately
    if (id) {
      updateWebhook(id, {
        isForwardingEnabled: newValue,
        forwardUrl: newValue ? forwardUrl : ''
      });
    }
  };

  const saveForwardingConfig = async () => {
    if (!id) return;

    // Update both local state and webhook state
    setIsForwardingEnabled(true);
    forwardUrlRef.current = forwardUrl;
    
    // Update webhook state
    updateWebhook(id, {
      forwardUrl,
      isForwardingEnabled: true
    });

    setShowForwardingConfig(false);
  };

  const testForwardUrl = async () => {
    if (!forwardUrl) return;

    try {
      const response = await fetch(forwardUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Test': 'true'
        },
        body: JSON.stringify({
          test: true,
          message: 'Test webhook from Webhook Interceptor',
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        alert('Test request sent successfully!');
      } else {
        alert(`Test failed with status: ${response.status}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Test forward URL failed:', errorMessage);
      alert(`Test failed: ${errorMessage}`);
    }
  };

  if (!webhook) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Webhook Not Found</h2>
          <p className="text-gray-600 mb-6">The webhook you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow-sm rounded-lg mb-6">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to Webhooks
              </button>
              <div className="flex items-center space-x-2">
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                  isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <button
                  onClick={() => setShowForwardingConfig(!showForwardingConfig)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Forward
                </button>
                <button
                  onClick={clearRequests}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Clear
                </button>
                <button
                  onClick={handleDeleteWebhook}
                  className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </button>
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Webhook Inspector</h1>
            
            <div className="bg-gray-100 rounded-md p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Webhook URL
                  </label>
                  <code className="block text-sm font-mono text-gray-800 bg-white px-3 py-2 rounded border break-all">
                    {webhookUrl}
                  </code>
                </div>
                <button
                  onClick={() => copyToClipboard(webhookUrl)}
                  className="ml-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Copy URL"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                This URL accepts GET, POST, PUT, DELETE, and all other HTTP methods
              </p>
              {webhook.forwardUrl && (
                <div className="mt-3 p-3 bg-blue-50 rounded-md">
                  <div className="flex items-center">
                    <ExternalLink className="h-4 w-4 text-blue-600 mr-2" />
                    <span className="text-sm text-blue-800">
                      Forwarding to: <code className="font-mono">{webhook.forwardUrl}</code>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Forwarding Configuration */}
            {showForwardingConfig && (
              <div className="mt-4 bg-blue-50 rounded-md p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Forwarding Configuration</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="enableForwarding"
                      checked={isForwardingEnabled}
                      onChange={handleForwardingToggle}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                    />
                    <label 
                      htmlFor="enableForwarding" 
                      className="ml-2 block text-sm text-gray-900 cursor-pointer select-none"
                    >
                      Enable automatic forwarding
                    </label>
                  </div>

                  {isForwardingEnabled && (
                    <div>
                      <label htmlFor="forwardUrl" className="block text-sm font-medium text-gray-700 mb-2">
                        Forward URL
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="url"
                          id="forwardUrl"
                          value={forwardUrl}
                          onChange={(e) => {
                            const newUrl = e.target.value;
                            setForwardUrl(newUrl);
                            if (id && isForwardingEnabled) {
                              updateWebhook(id, { forwardUrl: newUrl });
                            }
                          }}
                          placeholder="https://your-api.com/webhook or http://localhost:3000/webhook"
                          className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                        <button
                          onClick={testForwardUrl}
                          disabled={!forwardUrl}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Test
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        All incoming webhook requests will be automatically forwarded to this URL with the same method, headers, and body.
                        Localhost URLs are supported for local development.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setShowForwardingConfig(false);
                        // Reset to saved values when canceling
                        setForwardUrl(webhook?.forwardUrl || '');
                        setIsForwardingEnabled(webhook?.isForwardingEnabled || false);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveForwardingConfig}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Requests List */}
          <div className="bg-white shadow-sm rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Requests ({requests.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {requests.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <Settings className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p>No requests received yet</p>
                  <p className="text-sm mt-1">Send a request to your webhook URL to see it here</p>
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    onClick={() => setSelectedRequest(request)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedRequest?.id === request.id ? 'bg-indigo-50 border-r-4 border-indigo-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        request.method === 'GET' ? 'bg-green-100 text-green-800' :
                        request.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                        request.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                        request.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {request.method}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(request.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {Object.keys(request.headers).length} headers
                      {request.body && ' • Has body'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Request Details */}
          <div className="bg-white shadow-sm rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Request Details</h2>
                {selectedRequest && (
                  <button
                    onClick={() => {
                      const newRequest = {
                        ...selectedRequest,
                        id: crypto.randomUUID(),
                        timestamp: Date.now()
                      };
                      forwardWebhookRequest(newRequest);
                    }}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Replay Request
                  </button>
                )}
              </div>
            </div>
            <div className="p-6">
              {selectedRequest ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Method & Timestamp</h3>
                    <div className="bg-gray-50 rounded-md p-3">
                      <p className="text-sm"><strong>Method:</strong> {selectedRequest.method}</p>
                      <p className="text-sm"><strong>Time:</strong> {new Date(selectedRequest.timestamp).toLocaleString()}</p>
                      <p className="text-sm"><strong>URL:</strong> {selectedRequest.url}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Headers</h3>
                    <div className="bg-gray-50 rounded-md p-3 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                        {JSON.stringify(selectedRequest.headers, null, 2)}
                      </pre>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Body</h3>
                    <div className="bg-gray-50 rounded-md p-3 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                        {selectedRequest.body ? 
                          (typeof selectedRequest.body === 'string' ? 
                            selectedRequest.body : 
                            JSON.stringify(selectedRequest.body, null, 2)
                          ) : 
                          'No body'
                        }
                      </pre>
                    </div>
                  </div>

                  {selectedRequest.query && Object.keys(selectedRequest.query).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-2">Query Parameters</h3>
                      <div className="bg-gray-50 rounded-md p-3">
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(selectedRequest.query, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
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
  );
}