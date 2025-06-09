# Webhook Interceptor

A real-time webhook testing and debugging tool that allows you to intercept, inspect, and monitor webhook requests. Built with React, Express, and Socket.IO.

## Features

- 🎯 Create unique webhook endpoints for testing
- 🔍 Real-time webhook request monitoring
- 📝 Detailed request inspection (headers, body, query parameters)
- 🔄 Support for all HTTP methods (GET, POST, PUT, DELETE, PATCH)
- 📊 Request history with up to 100 most recent requests
- 🧹 Clear request history with a single click
- 🚀 Real-time updates using WebSocket
- 🔒 CORS support for secure cross-origin requests
- 🔄 Forward intercepted requests to localhost or any other endpoint

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Vite
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.IO
- **Development**: ESLint, TypeScript, Nodemon

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/webhook-interceptor.git
cd webhook-interceptor
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

This will start both the client (Vite) and server concurrently.

### Usage

1. Access the web interface at `http://localhost:5173`
2. Create a new webhook endpoint
3. Use the provided webhook URL to send requests
4. Monitor incoming requests in real-time
5. Optionally forward requests to your local development server or any other endpoint

### Request Forwarding

The service allows you to forward intercepted webhook requests to your local development server or any other endpoint. This is particularly useful for:

- Testing webhook integrations locally
- Debugging webhook payloads in your development environment
- Simulating production webhook scenarios in a local setup

To forward requests:
1. Configure the target URL in the web interface
2. Enable request forwarding
3. All incoming webhook requests will be automatically forwarded to your specified endpoint

## API Endpoints

- `POST /webhook/:id` - Webhook endpoint for receiving requests
- `GET /api/webhook/:id/requests` - Get webhook request history
- `DELETE /api/webhook/:id/requests` - Clear webhook request history
- `GET /health` - Health check endpoint

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 
