/**
 * WebSocketManager Class
 * Handles real-time communication between clients for synchronized drawing
 * Manages connection state, reconnection, and message handling
 */
export class WebSocketManager {
    /**
     * @param {Function} onMessage - Callback for handling incoming messages
     * @param {Function} onStatusChange - Callback for connection status updates
     */
    constructor(onMessage, onStatusChange) {
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
        // Track active pointer connections for coordinating multi-device drawing
        this.activeConnections = new Map();
        this.setup();
    }

    /**
     * Initializes WebSocket connection with automatic reconnection
     * Determines WebSocket URL based on current protocol and host
     */
    setup() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '8080';
        const wsUrl = `${protocol}//${host}:${port}`;

        console.log('[WebSocket] Attempting connection to:', wsUrl);
        this.socket = new WebSocket(wsUrl);

        // Connection successful handler
        this.socket.onopen = () => {
            console.log('[WebSocket] Connected successfully');
            this.onStatusChange('Connected', 'rgba(0,128,0,0.7)');
        };

        // Message handler
        this.socket.onmessage = (event) => {
            const message = event.data;
            console.log('[WebSocket] Received message:', message.slice(0, 100) + '...');
            const data = JSON.parse(message);
            this.handleConnection(data);
            this.onMessage(data);
        };

        // Connection close handler with automatic reconnection
        this.socket.onclose = () => {
            console.error('[WebSocket] Connection closed');
            this.onStatusChange('Disconnected', 'rgba(255,0,0,0.7)');
            setTimeout(() => this.setup(), 5000);  // Attempt reconnection after 5 seconds
        };

        // Error handler
        this.socket.onerror = (err) => {
            console.error('[WebSocket] Error:', err);
            this.onStatusChange('Error', 'rgba(255,0,0,0.7)');
        };
    }

    /**
     * Manages pointer connections for multi-device drawing coordination
     * Tracks pointer positions for smooth line drawing between points
     * @param {Object} data - The drawing action data
     */
    handleConnection(data) {
        if (data.action === 'saveDrawing' || data.action === 'openDrawing') {
            this.onMessage(data);
            return;
        }
        
        if (data.action === 'down') {
            this.activeConnections.set(data.pointerId, { lastX: data.x, lastY: data.y });
        }
        if (data.action === 'move' && this.activeConnections.has(data.pointerId)) {
            const conn = this.activeConnections.get(data.pointerId);
            data.prevX = conn.lastX;
            data.prevY = conn.lastY;
            this.activeConnections.set(data.pointerId, { lastX: data.x, lastY: data.y });
        }
        if (data.action === 'up') {
            this.activeConnections.delete(data.pointerId);
        }
    }

    /**
     * Sends a message through the WebSocket connection
     * @param {Object} data - The data to send
     */
    send(data) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocket] Cannot send, connection not open');
            return;
        }
        const message = JSON.stringify(data);
        console.log('[WebSocket] Sending message:', message.slice(0, 100) + '...');
        this.socket.send(message);
    }

    /**
     * Checks if the WebSocket connection is currently open
     * @returns {boolean} True if connection is open
     */
    isConnected() {
        return this.socket.readyState === WebSocket.OPEN;
    }
}