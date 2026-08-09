import React from 'react';
import { PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useWebhooks } from '../hooks/useWebhooks';
import RequestItem from '../components/RequestItem';

export default function GeneratePage() {
  const navigate = useNavigate();
  const { webhooks, addWebhook, deleteWebhook, updateWebhook } = useWebhooks();

  const generateWebhook = () => {
    const webhookId = uuidv4();
    const newWebhook = {
      id: webhookId,
      name: undefined,
      forwardUrl: '',
      requests: [],
      createdAt: Date.now()
    };

    addWebhook(newWebhook);

    setTimeout(() => {
      navigate(`/v/${webhookId}`);
    }, 0);
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
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">Hooki</h1>
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

        {webhooks.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Your Webhooks</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {webhooks.map((webhook) => (
                <RequestItem
                  key={webhook.id}
                  webhook={webhook}
                  onDelete={handleDeleteWebhook}
                  onUpdate={updateWebhook}
                />
              ))}
            </div>
          </div>
        )}

        {webhooks.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <PlusCircle className="mx-auto h-12 w-12" />
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              No webhooks created yet. Generate your first webhook to get started!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
