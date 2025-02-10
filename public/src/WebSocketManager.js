export class WebSocketManager {
    constructor(onMessage, onStatusChange) {
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
        this.activeConnections = new Map();
        this.setup();
    }

    setup() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '8080';
        const wsUrl = `${protocol}//${host}:${port}`;

        console.log('[WebSocket] Attempting connection to:', wsUrl);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('[WebSocket] Connected successfully');
            this.onStatusChange('Connected', 'rgba(0,128,0,0.7)');
        };

        this.socket.onmessage = (event) => {
            const message = event.data;
            console.log('[WebSocket] Received message:', message.slice(0, 100) + '...');
            const data = JSON.parse(message);
            this.handleConnection(data);
            this.onMessage(data);
        };

        this.socket.onclose = () => {
            console.error('[WebSocket] Connection closed');
            this.onStatusChange('Disconnected', 'rgba(255,0,0,0.7)');
            setTimeout(() => this.setup(), 5000);
        };

        this.socket.onerror = (err) => {
            console.error('[WebSocket] Error:', err);
            this.onStatusChange('Error', 'rgba(255,0,0,0.7)');
        };
    }

    handleConnection(data) {
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

    send(data) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocket] Cannot send, connection not open');
            return;
        }
        const message = JSON.stringify(data);
        console.log('[WebSocket] Sending message:', message.slice(0, 100) + '...');
        this.socket.send(message);
    }

    isConnected() {
        return this.socket.readyState === WebSocket.OPEN;
    }
}