const isDevelopment = process.env.NODE_ENV === 'development';

export const config = {
  apiUrl: isDevelopment ? 'http://localhost:3001' : 'https://api.reqceptor.site',
  socketUrl: isDevelopment ? 'http://localhost:3001' : 'https://api.reqceptor.site',
  basePath: '' // Removed basePath since we're using a custom domain
}; 
