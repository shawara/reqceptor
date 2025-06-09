const isDevelopment = process.env.NODE_ENV === 'development';

export const config = {
  apiUrl: isDevelopment ? 'http://localhost:3001' : 'https://webhook-interceptor.onrender.com',
  socketUrl: isDevelopment ? 'http://localhost:3001' : 'https://webhook-interceptor.onrender.com',
  basePath: '' // Removed basePath since we're using a custom domain
}; 