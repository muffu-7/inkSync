const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');

// Function to get local IP address
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

// Express setup for serving static files
const app = express();
app.use(express.static('public'));

// Create HTTP server
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, HOST, () => {
    const localIp = getLocalIpAddress();
    console.log(`HTTP Server running on http://localhost:${PORT}`);
    console.log(`Access from mobile device using: http://${localIp}:${PORT}`);
});

// WebSocket server setup
const wss = new WebSocketServer({ server });

// Track connected clients
const clients = new Set();

wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    ws.id = clientId;
    clients.add(ws);
    console.log(`[WebSocket] Client ${clientId} connected from ${req.socket.remoteAddress}. Total clients: ${clients.size}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`[WebSocket] Client ${clientId} sent ${data.action} action`);
            
            // Broadcast to all other clients
            let broadcast = 0;
            clients.forEach(client => {
                if (client !== ws && client.readyState === ws.OPEN) {
                    try {
                        client.send(message.toString());
                        broadcast++;
                        console.log(`[WebSocket] Message forwarded to client ${client.id}`);
                    } catch (err) {
                        console.error(`[WebSocket] Error sending to client ${client.id}:`, err);
                        clients.delete(client);
                    }
                }
            });
            console.log(`[WebSocket] Broadcasted message to ${broadcast} other clients`);
        } catch (e) {
            console.error('[WebSocket] Error processing message:', e);
            console.error('[WebSocket] Raw message:', message.toString());
        }
    });

    ws.on('error', (error) => {
        console.error(`[WebSocket] Error from client ${clientId}:`, error);
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`[WebSocket] Client ${clientId} disconnected. Total clients: ${clients.size}`);
    });

    // Send initial connection acknowledgment
    try {
        ws.send(JSON.stringify({ action: 'connected', clientId }));
    } catch (err) {
        console.error('[WebSocket] Error sending connection acknowledgment:', err);
    }
});

// Periodic check for stale connections
setInterval(() => {
    clients.forEach(client => {
        if (client.readyState === WebSocketServer.CLOSING || client.readyState === WebSocketServer.CLOSED) {
            console.log(`[WebSocket] Removing stale client ${client.id}`);
            clients.delete(client);
        }
    });
}, 30000);