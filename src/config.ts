const isDevelopment = process.env.NODE_ENV === 'development';

export const config = {
  apiUrl: isDevelopment ? 'http://localhost:3001' : 'https://api.hooki.site',
  socketUrl: isDevelopment ? 'http://localhost:3001' : 'https://api.hooki.site',
  basePath: '' // Removed basePath since we're using a custom domain
}; 
