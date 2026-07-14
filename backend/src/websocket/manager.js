/**
 * WebSocket Connection Manager
 * 
 * Manages WebSocket client connections, handles heartbeat (ping/pong),
 * and provides broadcast functionality for pushing real-time updates.
 */
const WebSocket = require('ws');

class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.heartbeatInterval = null;
  }

  /**
   * Initialize the WebSocket server on the given HTTP server.
   * @param {http.Server} server - The HTTP server to attach to.
   * @param {string} path - The WebSocket path (default: '/ws').
   */
  init(server, path = '/ws') {
    this.wss = new WebSocket.Server({ server, path });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`[WS] Client connected from ${clientIp} — Total: ${this.clients.size + 1}`);

      ws.isAlive = true;
      this.clients.add(ws);

      // Handle pong responses for heartbeat
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming messages from clients (not used heavily but good to have)
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          console.log(`[WS] Received message from client:`, msg);
        } catch (e) {
          console.log(`[WS] Received non-JSON message:`, data.toString());
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[WS] Client disconnected — Total: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        this.clients.delete(ws);
      });

      // Send a welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        data: { message: 'Connected to Code Review Dashboard', timestamp: new Date().toISOString() }
      }));
    });

    // Start heartbeat interval to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          console.log('[WS] Terminating dead connection');
          this.clients.delete(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(this.heartbeatInterval);
    });

    console.log(`[WS] WebSocket server initialized on path "${path}"`);
  }

  /**
   * Broadcast a message to all connected clients.
   * @param {string} message - The stringified JSON message to send.
   */
  broadcast(message) {
    let sent = 0;
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sent++;
      }
    });
    console.log(`[WS] Broadcast message to ${sent}/${this.clients.size} client(s)`);
  }

  /**
   * Get the count of connected clients.
   */
  getClientCount() {
    return this.clients.size;
  }
}

module.exports = new WebSocketManager();
