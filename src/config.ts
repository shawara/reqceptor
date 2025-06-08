const isDevelopment = process.env.NODE_ENV === 'development';

export const config = {
  apiUrl: isDevelopment ? 'http://localhost:3001' : 'https://your-backend-url.com', // Replace with your actual backend URL
  socketUrl: isDevelopment ? 'http://localhost:3001' : 'https://your-backend-url.com', // Replace with your actual backend URL
  basePath: isDevelopment ? '' : '/webhook-interceptor'
}; 