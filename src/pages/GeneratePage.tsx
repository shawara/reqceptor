import React from 'react';
import { PlusCircle, ExternalLink, Copy, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useWebhooks } from '../hooks/useWebhooks';
import { config } from '../config';

const API_BASE_URL = config.apiUrl;

export default function GeneratePage() {
  const navigate = useNavigate();
  const { webhooks, addWebhook, deleteWebhook } = useWebhooks();

  const generateWebhook = () => {
    const webhookId = uuidv4();
    const newWebhook = { 
      id: webhookId, 
      forwardUrl: '', 
      requests: [],
      createdAt: Date.now()
    };
    
    // Add webhook first, then navigate
    addWebhook(newWebhook);
    
    // Use setTimeout to ensure state update completes before navigation
    setTimeout(() => {
      navigate(`/v/${webhookId}`);
    }, 0);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getWebhookUrl = (id: string) => {
    return `${API_BASE_URL}/webhook/${id}`;
  };

  const getShareUrl = (id: string) => {
    return `${window.location.origin}/v/${id}`;
  };

  const handleDeleteWebhook = (id: string) => {
    if (window.confirm('Are you sure you want to delete this webhook?')) {
      deleteWebhook(id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Webhook Interceptor</h1>
          <p className="text-xl text-gray-600 mb-8">
            Generate unique webhook URLs to inspect and debug HTTP requests
          </p>
          <button
            onClick={generateWebhook}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Generate New Webhook
          </button>
        </div>

        {webhooks.length > 0 && (
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Your Webhooks</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                        <span className="text-sm text-gray-500">
                          {webhook.requests.length} requests
                        </span>
                      </div>
                      
                      {/* Webhook URL */}
                      <div className="bg-gray-100 rounded-md p-3 mb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Webhook URL
                            </label>
                            <code className="text-sm font-mono text-gray-800 break-all">
                              {getWebhookUrl(webhook.id)}
                            </code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(getWebhookUrl(webhook.id))}
                            className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Copy Webhook URL"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Share URL */}
                      <div className="bg-blue-50 rounded-md p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-blue-700 mb-1">
                              Share URL (View-only)
                            </label>
                            <code className="text-sm font-mono text-blue-800 break-all">
                              {getShareUrl(webhook.id)}
                            </code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(getShareUrl(webhook.id))}
                            className="ml-2 p-1 text-blue-400 hover:text-blue-600 transition-colors"
                            title="Copy Share URL"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600">
                        Created {new Date(webhook.createdAt || Date.now()).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => navigate(`/v/${webhook.id}`)}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {webhooks.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <PlusCircle className="mx-auto h-12 w-12" />
            </div>
            <p className="text-gray-500">No webhooks created yet. Generate your first webhook to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}