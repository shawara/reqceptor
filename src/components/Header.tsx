import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { Webhook, Settings, Trash2, RefreshCw, Copy, Sun, Moon, Github, Star, ChevronRight, Edit2, Check } from 'lucide-react';
import { WebhookConfigContext } from '../context/WebhookConfigContext';

interface HeaderProps {
  webhookUrl?: string;
  webhookName?: string;
}

export default function Header({ webhookUrl, webhookName }: HeaderProps) {
  const config = useContext(WebhookConfigContext);

  // Dark mode state and effect
  const [darkMode, setDarkMode] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const handleCopy = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
    }
  };

  // Check if we have name editing functionality from context
  const canEditName = !!(config.handleNameEdit && config.handleNameSave && config.isEditingName !== undefined);
  
  // Use name from context if available, otherwise fall back to the prop
  const displayName = config.webhookName !== undefined ? config.webhookName : webhookName;
  
  // Determine the final name to display
  const finalDisplayName = displayName || '';
  const showAsUnnamed = finalDisplayName.trim() === '';

  // Debug logging
  console.log('Header component rendering with:', {
    webhookNameProp: webhookName,
    webhookNameFromContext: config.webhookName,
    displayName,
    finalDisplayName,
    showAsUnnamed,
    canEditName
  });

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm w-full">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <Webhook className="h-8 w-8 text-indigo-600" />
              <span className="ml-2 text-xl font-bold text-gray-900 dark:text-gray-100">
                Reqceptor
              </span>
            </Link>
            {(displayName !== undefined || canEditName) && (
              <div className="flex items-center">
                <ChevronRight className="h-5 w-5 mx-2 text-gray-400 dark:text-gray-500" />
                {canEditName && config.isEditingName ? (
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={config.nameValue || ''}
                      onChange={(e) => config.setNameValue?.(e.target.value)}
                      onKeyDown={config.handleNameKeyDown}
                      placeholder="Enter webhook name"
                      className="block w-40 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                      autoFocus
                    />
                    <button
                      onClick={config.handleNameSave}
                      className="ml-1 p-1 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                      title="Save name"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="text-lg font-medium text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                      {showAsUnnamed ? 'Unnamed Webhook' : finalDisplayName}
                    </span>
                    {canEditName && (
                      <button
                        onClick={config.handleNameEdit}
                        className="ml-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Edit webhook name"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <nav className="flex items-center space-x-2">
            <a 
              href="https://github.com/shawara/reqceptor"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-700 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-105"
              title="Star us on GitHub"
            >
              <Github className="h-4 w-4 mr-1" />
              <Star className="h-3 w-3 mr-1 fill-current" />
              Star
            </a>
            <Link
              to="/"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 px-3 py-2 rounded-md text-sm font-medium"
            >
              Generate New
            </Link>
            {/* Config Buttons from context */}
            {config && config.showConfigButtons && (
              <>
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm transition-all duration-200 ${
                  config.isConnected ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  <div className={`w-2 h-2 rounded-full transition-colors duration-200 ${config.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span>{config.isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <button
                  onClick={config.onForwardClick}
                  className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md transition-all duration-200 hover:scale-105 ${
                    config.isForwardingEnabled 
                      ? 'border-indigo-300 text-indigo-700 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-900 hover:bg-indigo-100 dark:hover:bg-indigo-800' 
                      : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Forward
                  {config.isForwardingEnabled && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 animate-pulse">
                      ON
                    </span>
                  )}
                </button>
                <button
                  onClick={config.onClear}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-700 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-105"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Clear
                </button>
                <button
                  onClick={config.onDelete}
                  className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-700 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 dark:text-red-300 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900 transition-all duration-200 hover:scale-105"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </button>
              </>
            )}
            {webhookUrl && (
              <button
                onClick={handleCopy}
                className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-700 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-105"
                title="Copy Webhook URL"
              >
                <Copy className="h-4 w-4 mr-1" />
                Webhook URL
              </button>
            )}
            {/* Dark mode toggle button */}
            <button
              onClick={toggleDarkMode}
              className="ml-2 p-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <Sun className="h-5 w-5 text-yellow-500" />
              ) : (
                <Moon className="h-5 w-5 text-gray-700" />
              )}
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}