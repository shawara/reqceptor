import React, { useState, useEffect } from 'react';
import { PlusCircle, ExternalLink, Copy, Trash2, Github, Star, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useWebhooks } from '../hooks/useWebhooks';
import { config } from '../config';

const API_BASE_URL = config.apiUrl;

// GitHub Star Banner Component
const GitHubStarBanner = () => {
  const [isVisible, setIsVisible] = useState(true);
  
  // Check if banner was previously dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('generate-page-github-star-banner-dismissed');
    if (dismissed === 'true') {
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    // Store dismissal in localStorage
    localStorage.setItem('generate-page-github-star-banner-dismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-lg shadow-md mb-8 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full text-white hover:bg-indigo-600 transition-all duration-200"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-col md:flex-row items-center justify-between">
        <div className="mb-4 md:mb-0">
          <h2 className="text-xl font-bold">Support Reqceptor!</h2>
          <p className="text-indigo-100">If you find this tool useful, please consider giving it a star on GitHub</p>
        </div>
        <a
          href="https://github.com/shawara/reqceptor"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-white text-indigo-700 rounded-md font-medium hover:bg-indigo-50 transition-all duration-200 transform hover:scale-105"
        >
          <Github className="h-5 w-5 mr-2" />
          <Star className="h-4 w-4 mr-2 fill-current" />
          Star on GitHub
        </a>
      </div>
    </div>
  );
};

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">Reqceptor</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
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

        {/* GitHub Star Banner */}
        <GitHubStarBanner />

        {webhooks.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Webhooks</h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Active
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {webhook.requests.length} requests
                        </span>
                      </div>
                      
                      {/* Webhook URL */}
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-3 mb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Webhook URL
                            </label>
                            <code className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all">
                              {getWebhookUrl(webhook.id)}
                            </code>
                          </div>
                          <button
                            onClick={() => copyToClipboard(getWebhookUrl(webhook.id))}
                            className="ml-2 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title="Copy Webhook URL"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Share URL */}
                      <div className="bg-blue-50 dark:bg-blue-900 rounded-md p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-blue-700 dark:text-blue-200 mb-1">
                              Share URL (View-only)
                            </label>
                            <code className="text-sm font-mono text-blue-800 dark:text-blue-200 break-all">
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

                      <p className="text-sm text-gray-600 dark:text-gray-300">
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
            <p className="text-gray-500 dark:text-gray-400">No webhooks created yet. Generate your first webhook to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}