import React, { useState } from 'react';
import { Copy, ExternalLink, Trash2, Clock, Hash, ArrowRight, Edit2, Check } from 'lucide-react';
import { Webhook } from '../types';
import { useNavigate } from 'react-router-dom';
import { config } from '../config';

interface RequestItemProps {
  webhook: Webhook;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Webhook>) => void;
}

const API_BASE_URL = config.apiUrl;

const RequestItem: React.FC<RequestItemProps> = ({ webhook, onDelete, onUpdate }) => {
  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(webhook.name || '');
  
  const getWebhookUrl = (id: string) => {
    return `${API_BASE_URL}/webhook/${id}`;
  };

  const getShareUrl = (id: string) => {
    // Create a URL-friendly version of the name
    const nameParam = webhook.name ? 
      `?name=${encodeURIComponent(webhook.name)}` : '';
    return `${window.location.origin}/v/${id}${nameParam}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Format date to be more readable
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };

  // Get a shortened version of the ID for display
  const getShortId = (id: string) => {
    return id.substring(0, 8);
  };

  const handleNameEdit = () => {
    setIsEditingName(true);
  };

  const handleNameSave = () => {
    onUpdate(webhook.id, { name: nameValue.trim() || undefined });
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setNameValue(webhook.name || '');
      setIsEditingName(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all duration-200 overflow-hidden">
      <div className="p-5">
        {/* Header with ID and stats */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="flex items-center text-gray-500 dark:text-gray-400">
              <Hash className="h-4 w-4 mr-1" />
              <span className="text-sm font-mono">{getShortId(webhook.id)}</span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Active
            </span>
          </div>
          <div className="flex items-center text-gray-500 dark:text-gray-400">
            <Clock className="h-4 w-4 mr-1" />
            <span className="text-sm">{formatDate(webhook.createdAt || Date.now())}</span>
          </div>
        </div>
        
        {/* Webhook Name */}
        <div className="mb-4">
          {isEditingName ? (
            <div className="flex items-center">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={handleNameKeyDown}
                placeholder="Enter webhook name"
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                autoFocus
              />
              <button
                onClick={handleNameSave}
                className="ml-2 p-2 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                title="Save name"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {webhook.name || 'Unnamed Webhook'}
              </h3>
              <button
                onClick={handleNameEdit}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Edit name"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        
        {/* Request count and badge */}
        <div className="mb-4">
          <div className="flex items-center">
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 mr-2">
              {webhook.requests.length}
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              {webhook.requests.length === 1 ? 'request' : 'requests'} received
            </span>
          </div>
        </div>

        {/* Webhook URL */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3 mb-3 group relative">
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => copyToClipboard(getWebhookUrl(webhook.id))}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Copy Webhook URL"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Webhook URL
          </label>
          <div className="flex items-center">
            <code className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all truncate">
              {getWebhookUrl(webhook.id)}
            </code>
          </div>
        </div>

        {/* Forward URL if exists */}
        {webhook.forwardUrl && (
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-md p-3 mb-3">
            <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
              Forwards to
            </label>
            <div className="flex items-center">
              <ArrowRight className="h-4 w-4 text-blue-500 mr-2" />
              <code className="text-sm font-mono text-blue-800 dark:text-blue-200 break-all truncate">
                {webhook.forwardUrl}
              </code>
            </div>
          </div>
        )}
        
        {/* Action buttons */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => copyToClipboard(getShareUrl(webhook.id))}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center"
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy Share URL
          </button>
          
          <div className="flex space-x-2">
            <button
              onClick={() => navigate(`/v/${webhook.id}`)}
              className="px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-800/50 rounded-md flex items-center transition-colors"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              View Details
            </button>
            <button
              onClick={() => onDelete(webhook.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-md transition-colors"
              title="Delete webhook"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestItem;
