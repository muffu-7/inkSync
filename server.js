/**
 * InkSync Server
 * Handles WebSocket connections for real-time drawing synchronization between clients
 * and serves static files for the web application.
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');

/**
 * Retrieves the local IP address of the machine.
 * Used to display the access URL for mobile devices on the same network.
 * @returns {string} The first non-internal IPv4 address found, or '0.0.0.0' if none found
 */
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '0.0.0.0';
}

// Express server setup
const app = express();
app.use(express.static('public'));

// HTTP server configuration
const HOST = '0.0.0.0';  // Listen on all network interfaces
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, HOST, () => {
    const localIp = getLocalIpAddress();
    console.log(`HTTP Server running on http://localhost:${PORT}`);
    console.log(`Access from mobile device using: http://${localIp}:${PORT}`);
});

// WebSocket server initialization
const wss = new WebSocketServer({ server });

/**
 * Set to track all connected WebSocket clients
 * Each client is assigned a unique ID for logging and management
 */
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    // Generate unique client ID and add to active clients
    const clientId = Math.random().toString(36).substr(2, 9);
    ws.id = clientId;
    clients.add(ws);
    console.log(`[WebSocket] Client ${clientId} connected from ${req.socket.remoteAddress}. Total clients: ${clients.size}`);

    // Handle incoming messages from clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`[WebSocket] Client ${clientId} sent ${data.action} action`);
            
            // Broadcast the message to all other connected clients
            let broadcast = 0;
            clients.forEach(client => {
                if (client !== ws && client.readyState === ws.OPEN) {
                    try {
                        client.send(message.toString());
                        broadcast++;
                        console.log(`[WebSocket] Message forwarded to client ${client.id}`);
                    } catch (err) {
                        console.error(`[WebSocket] Error sending to client ${client.id}:`, err);
                        clients.delete(client);  // Remove client if message fails
                    }
                }
            });
            console.log(`[WebSocket] Broadcasted message to ${broadcast} other clients`);
        } catch (e) {
            console.error('[WebSocket] Error processing message:', e);
            console.error('[WebSocket] Raw message:', message.toString());
        }
    });

    // Error handler for client connections
    ws.on('error', (error) => {
        console.error(`[WebSocket] Error from client ${clientId}:`, error);
    });

    // Cleanup handler when client disconnects
    ws.on('close', () => {
        clients.delete(ws);
        console.log(`[WebSocket] Client ${clientId} disconnected. Total clients: ${clients.size}`);
    });

    // Send initial connection acknowledgment to the client
    try {
        ws.send(JSON.stringify({ action: 'connected', clientId }));
    } catch (err) {
        console.error('[WebSocket] Error sending connection acknowledgment:', err);
    }
});

/**
 * Periodic cleanup of stale connections
 * Runs every 30 seconds to remove any closed or closing connections
 */
setInterval(() => {
    clients.forEach(client => {
        if (client.readyState === WebSocketServer.CLOSING || client.readyState === WebSocketServer.CLOSED) {
            console.log(`[WebSocket] Removing stale client ${client.id}`);
            clients.delete(client);
        }
    });
}, 30000);