# Reqceptor

[![GitHub stars](https://img.shields.io/github/stars/shawara/reqceptor?style=social)](https://github.com/shawara/reqceptor)
[![GitHub](https://img.shields.io/github/license/shawara/reqceptor)](https://github.com/shawara/reqceptor/blob/main/LICENSE)
[![Website](https://img.shields.io/badge/website-reqceptor.site-blue)](https://reqceptor.site)

A powerful webhook inspection and debugging tool that allows you to capture, inspect, and forward HTTP requests in real-time.

> ⭐ If you find Reqceptor useful, please consider [giving it a star on GitHub](https://github.com/shawara/reqceptor)!

## Features

- 🔍 **Real-time Webhook Inspection** - View incoming requests instantly
- 🔄 **Request Forwarding** - Automatically forward requests to your development server
- 📤 **Shareable URLs** - Share webhook inspection pages with team members
- 🎯 **Multi-method Support** - Handles GET, POST, PUT, DELETE, and all HTTP methods
- 💾 **Request History** - Keep track of all incoming requests
- 🌐 **Cross-domain Support** - Deploy frontend and backend on different domains

## Quick Start

### Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start both frontend and backend:**
   ```bash
   npm run dev
   ```

3. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

### Production Deployment

#### Backend Configuration

Set these environment variables for your backend:

```bash
# Required
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com

# Optional - Multiple origins separated by commas
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://another-domain.com
```

#### Frontend Configuration

Set this environment variable for your frontend:

```bash
VITE_API_URL=https://your-backend-domain.com
```

#### Example Deployment Scenarios

**Scenario 1: Same Domain**
```bash
# Backend (.env)
PORT=3001
FRONTEND_URL=https://webhook-tool.com
ALLOWED_ORIGINS=https://webhook-tool.com

# Frontend (.env)
VITE_API_URL=https://webhook-tool.com
```

**Scenario 2: Different Domains**
```bash
# Backend (.env)
PORT=3001
FRONTEND_URL=https://webhook-frontend.com
ALLOWED_ORIGINS=https://webhook-frontend.com

# Frontend (.env)
VITE_API_URL=https://webhook-api.com
```

**Scenario 3: Multiple Environments**
```bash
# Backend (.env)
PORT=3001
FRONTEND_URL=https://webhook-prod.com
ALLOWED_ORIGINS=https://webhook-prod.com,https://webhook-staging.com,http://localhost:5173

# Frontend (.env)
VITE_API_URL=https://webhook-api.com
```

## Usage

### Creating a Webhook

1. Visit the application homepage
2. Click "Generate New Webhook"
3. Copy the generated webhook URL
4. Use this URL in your applications or services

### Sharing Webhooks

Each webhook has two URLs:
- **Webhook URL**: For receiving HTTP requests
- **Share URL**: For viewing the webhook inspector (read-only)

### Request Forwarding

1. Open a webhook inspector page
2. Click the "Forward" button
3. Enable forwarding and enter your target URL
4. All incoming requests will be automatically forwarded

## API Endpoints

### Webhook Endpoint
```
ALL /webhook/:id
```
Accepts any HTTP method and captures the request.

### Get Requests
```
GET /api/webhook/:id/requests
```
Returns all captured requests for a webhook.

### Clear Requests
```
DELETE /api/webhook/:id/requests
```
Clears all requests for a webhook.

### Health Check
```
GET /health
```
Returns server status and configuration.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + Socket.IO
- **Real-time**: WebSocket connections for live updates
- **Storage**: In-memory (localStorage for frontend, RAM for backend)

## Security Considerations

- CORS is properly configured to prevent unauthorized access
- No sensitive data is logged or stored permanently
- Webhook URLs are UUID-based for security through obscurity
- Request forwarding happens client-side to maintain privacy

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.