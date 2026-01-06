# VideoX Client

Web-based management interface for the VideoX recording engine. This client lets administrators and integrators manage Axis cameras, monitor status, and browse recordings stored on an existing VideoX server.

**Important**: VideoX is a recording engine, not a full VMS. This repository contains only the client to manage the server. It does not provide video playback. A VideoX server must already be installed and reachable before deploying this client.   

VideoX Server: https://github.com/pandosme/videox

A singel client can be used to manage several VideoX Servers. Server access info is added when logging in.

## Audience

This document targets:

- System administrators deploying the VideoX client in production environments.
- Integrators installing and configuring the client for customers.

## Prerequisites

- Existing VideoX server installation with a reachable HTTP/HTTPS endpoint.
- Node.js v16 or higher (for building the client).
- npm or yarn.
- A web server for static files (Nginx, Apache, or container platform such as Docker).
- Network connectivity from client users’ browsers to the VideoX server.

## Quick Start (Local Testing)

For evaluation or lab setups:

```
git clone https://github.com/pandosme/videox-client
cd videox-client

# Install dependencies
npm install

# Start development server
npm run dev
```

By default the development server listens on `http://localhost:5173`. Configure connections to your existing VideoX server inside the running client (see “Server Connections” below). 

> Use this mode only for testing and development, not for production.

## Production Installation

### Architecture Overview

The VideoX client is a static web application that runs in users' browsers and can connect to VideoX backend servers in two ways:

### Option 1: Direct Connection (Multiple Servers)

Best for: Managing multiple independent VideoX servers with different domains/IPs

- **Frontend (this client)**: Served on port 3302 (e.g., `client.example.com:3302`)
- **VideoX Backend(s)**: Each server on port 3002 (e.g., `server1.example.com:3002`, `server2.example.com:3002`)
- **Communication**: Browser → VideoX servers (direct HTTP/HTTPS connections)
- **CORS**: Required on each backend server

```
┌─────────────────────────────────────────┐
│  Client Browser                         │
│  (Accesses client.example.com:3302)    │
└──────────────┬──────────────────────────┘
               │
               ├─→ server1.example.com:3002
               ├─→ server2.example.com:3002
               └─→ server3.example.com:3002
```

**Setup Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

### Option 2: Nginx Reverse Proxy (Same Domain)

Best for: Single domain serving both frontend and backend through nginx

- **Frontend and Backend**: Both accessed through same domain (e.g., `videox.app`)
- **Nginx routes**: `/api/` and `/hls/` → Backend, `/` → Frontend
- **Communication**: Browser → Nginx → Backend (same-origin, no CORS needed)
- **Benefits**: Simplified SSL, centralized access control, no CORS issues

```
┌──────────────────────────────┐
│      User Browser            │
│  (https://videox.app)        │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│   Nginx Reverse Proxy        │
│      (videox.app)            │
├──────────────────────────────┤
│ /api/ → Backend:3002        │
│ /     → Frontend:3302        │
└──────────────────────────────┘
```

**Setup Guide**: See [DEPLOYMENT-NGINX-PROXY.md](DEPLOYMENT-NGINX-PROXY.md) for detailed instructions.

## Quick Build Instructions

For either deployment option:

```bash
# Clone and build
git clone https://github.com/pandosme/videox-client
cd videox-client
npm install
npm run build  # Production build → dist/

# Or run development server
npm run dev    # Runs on port 3302
```

Choose your deployment architecture and follow the appropriate guide:
- **Multiple servers with different domains**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Single domain with nginx reverse proxy**: [DEPLOYMENT-NGINX-PROXY.md](DEPLOYMENT-NGINX-PROXY.md)

## Security and Network Notes

### CORS Configuration

**For Direct Connection (Option 1):**

Each VideoX backend must be configured to allow CORS requests from the client's domain:

```
Access-Control-Allow-Origin: https://client.example.com:3302
```

**Important:**
- Protocol, domain, and port must match exactly
- Never use wildcards (`*`) in production
- Each VideoX server needs CORS configured independently

**For Nginx Reverse Proxy (Option 2):**

No CORS configuration needed! Since frontend and backend are served from the same domain, all requests are same-origin.

**Development Environment:**

When running `npm run dev`:
```
Access-Control-Allow-Origin: http://localhost:3302
```

### General Security

- Deploy the client over HTTPS in production
- Use TLS certificates from a trusted CA
- Restrict access to the client and VideoX servers to trusted networks or via VPN/reverse proxy
- Do not expose the VideoX server or client directly to the internet without proper access control
- Ensure all VideoX servers are also using HTTPS when the client uses HTTPS
- Configure firewall rules to allow traffic only on ports 3302 (client) and 3002 (VideoX servers)

## Basic Usage (For Admins/Integrators)

After connecting to an existing VideoX server:

- Log in using credentials configured on that server.
- Use the client to:
  - Add and configure Axis cameras.
  - Enable/disable recording.
  - Browse and playback recordings stored on the VideoX server.
  - Inspect storage usage and recording retention information.

The exact capabilities available depend on the VideoX server configuration.

## Troubleshooting (Client-Side)

### Cannot Reach VideoX Server

- Confirm the VideoX server is running and reachable from the client network.
- Check that the server address and port in the client match the actual deployment.
- Verify firewalls and reverse proxies allow traffic from user browsers to the VideoX server.

### CORS / Browser Errors

**Symptom:** Browser console shows errors like:
- "Access to fetch at '...' from origin '...' has been blocked by CORS policy"
- "No 'Access-Control-Allow-Origin' header is present"

**Solution:**
1. Check the exact client URL in your browser (including protocol and port)
2. Configure each VideoX server to allow that exact origin
3. Verify the CORS configuration on the VideoX server side
4. Ensure the origin matches exactly (protocol, domain, and port)
5. Restart the VideoX server after changing CORS settings
6. Clear browser cache and reload

**Example:** If your client is at `https://client.example.com:3302`, the VideoX server CORS config must specify exactly that URL, not `http://...` or a different port.

### Login Fails

- Verify credentials against the VideoX server configuration.
- Confirm the VideoX server authentication settings and user accounts.
- When deplying HTTPS, both client and server must use HTTPS

