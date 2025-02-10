class DrawingApp {
    constructor() {
        // Canvas & Context
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.containerEl = document.querySelector('.canvas-container');

        // UI Elements
        this.statusEl = document.getElementById('status');

        // Drawing state
        this.isDrawing = false;
        this.isErasing = false;
        this.eraserSize = 20;
        this.drawingOperations = [];

        // View state
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.lastX = 0;
        this.lastY = 0;
        this.isPanning = false;
        this.lastScale = 1;
        this.isPinching = false;
        this.isMousePanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.isSpacebarDown = false;
        this.initialPinchDistance = 0;
        this.lastTouchX = 0;
        this.lastTouchY = 0;

        // History state
        this.undoStack = [];
        this.redoStack = [];
        this.isUndoRedo = false; // prevents saving history while undo/redo

        // WebSocket / Active Connections
        this.activeConnections = new Map();

        // Initialization
        this.setupCanvas();
        this.loadFromLocalStorage();
        this.setupWebSocket();
        this.setupEventListeners();
        this.setupToolbar();
        this.saveToHistory();
    }

    /*=============================
      Canvas & Redraw Methods
    ==============================*/
    setupCanvas() {
        const updateCanvasSize = () => {
            const rect = this.containerEl.getBoundingClientRect();

            // Set display size
            this.canvas.style.width = `${rect.width}px`;
            this.canvas.style.height = `${rect.height}px`;

            // Set buffer size
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;

            // Setup drawing context
            this.ctx.lineJoin = 'round';
            this.ctx.lineCap = 'round';
            this.ctx.strokeStyle = '#000';

            this.redraw();
        };

        window.addEventListener('resize', updateCanvasSize);
        updateCanvasSize();
    }

    redraw() {
        // Reset transform and clear canvas
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply current view transform
        this.ctx.setTransform(
            this.scale, 0,
            0, this.scale,
            -this.offsetX * this.scale,
            -this.offsetY * this.scale
        );

        // Redraw drawing operations
        this.drawingOperations.forEach(op => {
            if (op.action === 'down') {
                this.ctx.beginPath();
                this.ctx.moveTo(op.x, op.y);
                this.ctx.globalCompositeOperation = op.isErasing ? 'destination-out' : 'source-over';
            } else if (op.action === 'move') {
                const lineWidth = (op.isErasing ? op.eraserSize : Math.max(1, op.pressure * 10)) / this.scale;
                this.ctx.lineWidth = lineWidth;
                this.ctx.beginPath();
                this.ctx.moveTo(op.prevX, op.prevY);
                this.ctx.lineTo(op.x, op.y);
                this.ctx.stroke();
            }
        });
    }

    /*=============================
      Input Position Calculation
    ==============================*/
    getPointerPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / this.scale) + this.offsetX;
        const y = ((e.clientY - rect.top) / this.scale) + this.offsetY;
        return {
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100
        };
    }

    /*=============================
      Event Handlers: Pointer
    ==============================*/
    handlePointerDown(e) {
        if (e.pointerType !== 'pen') return;
        e.preventDefault();
        this.isDrawing = true;

        const pos = this.getPointerPosition(e);
        this.lastX = pos.x;
        this.lastY = pos.y;

        const op = {
            action: 'down',
            x: pos.x,
            y: pos.y,
            pressure: e.pressure,
            isErasing: this.isErasing,
            eraserSize: this.eraserSize,
            pointerId: e.pointerId
        };

        this.drawingOperations.push(op);
        this.redraw();
        this.saveToLocalStorage();
        this.sendPointerEvent('down', pos.x, pos.y, e);
    }

    handlePointerMove(e) {
        if (!this.isDrawing || e.pointerType !== 'pen') return;
        e.preventDefault();
        const pos = this.getPointerPosition(e);

        const op = {
            action: 'move',
            x: pos.x,
            y: pos.y,
            prevX: this.lastX,
            prevY: this.lastY,
            pressure: e.pressure,
            isErasing: this.isErasing,
            eraserSize: this.eraserSize,
            pointerId: e.pointerId
        };

        this.drawingOperations.push(op);
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.redraw();
        this.saveToLocalStorage();
        this.sendPointerEvent('move', pos.x, pos.y, e);
    }

    handlePointerUp(e) {
        if (e.pointerType !== 'pen') return;
        this.isDrawing = false;
        const pos = this.getPointerPosition(e);
        this.sendPointerEvent('up', pos.x, pos.y, e);

        if (!this.isUndoRedo) {
            this.saveToHistory();
            this.redoStack = [];
        }
    }

    /*=============================
      Event Handlers: Touch & Gesture
    ==============================*/
    handleTouchStart(e) {
        if (this.isDrawing) return;
        e.preventDefault();

        if (e.touches.length === 2) {
            this.isPinching = true;
            this.initialPinchDistance = 0;
        } else if (e.touches.length === 1) {
            this.isPanning = true;
            this.lastTouchX = e.touches[0].clientX;
            this.lastTouchY = e.touches[0].clientY;
        }
    }

    handleTouchMove(e) {
        if (this.isDrawing) return;
        e.preventDefault();

        if (e.touches.length === 2) {
            // Pinch zoom handling
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            if (this.initialPinchDistance === 0) {
                this.initialPinchDistance = currentDistance;
                return;
            }
            const newScale = Math.min(Math.max(this.scale * (currentDistance / this.initialPinchDistance), 0.1), 10.0);
            const rect = this.canvas.getBoundingClientRect();
            const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
            const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

            this.offsetX = centerX / newScale - (centerX / this.scale - this.offsetX);
            this.offsetY = centerY / newScale - (centerY / this.scale - this.offsetY);
            this.scale = newScale;
            this.initialPinchDistance = currentDistance;
            this.redraw();
        } else if (e.touches.length === 1 && this.isPanning) {
            // Panning handling for touch events
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.lastTouchX;
            const deltaY = touch.clientY - this.lastTouchY;
            this.offsetX -= deltaX / this.scale;
            this.offsetY -= deltaY / this.scale;
            this.lastTouchX = touch.clientX;
            this.lastTouchY = touch.clientY;
            this.redraw();
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        if (this.isPinching) {
            this.isPinching = false;
            this.initialPinchDistance = 0;
        }
        if (this.isPanning) {
            this.isPanning = false;
        }
    }

    handleGestureStart(e) {
        e.preventDefault();
        this.isPinching = true;
        this.lastScale = this.scale;
    }

    handleGestureChange(e) {
        e.preventDefault();
        if (!this.isPinching) return;
        const newScale = Math.min(Math.max(this.lastScale * e.scale, 0.1), 10.0);
        const rect = this.canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        const centerX = rect.width * devicePixelRatio / 2;
        const centerY = rect.height * devicePixelRatio / 2;
        const zoomOriginX = centerX / this.scale + this.offsetX;
        const zoomOriginY = centerY / this.scale + this.offsetY;
        this.scale = newScale;
        this.offsetX = zoomOriginX - centerX / this.scale;
        this.offsetY = zoomOriginY - centerY / this.scale;
        this.redraw();
    }

    handleGestureEnd(e) {
        e.preventDefault();
        this.isPinching = false;
    }

    /*=============================
      Event Handlers: Mouse & Wheel
    ==============================*/
    handleMouseDown(e) {
        // Enable panning with middle button or spacebar+left click
        if (e.pointerType === 'pen' || (e.button !== 1 && !(this.isSpacebarDown && e.button === 0))) return;
        e.preventDefault();
        this.isMousePanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    handleMouseMove(e) {
        if (!this.isMousePanning) return;
        e.preventDefault();
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        this.offsetX -= deltaX / this.scale;
        this.offsetY -= deltaY / this.scale;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.redraw();
    }

    handleMouseUp(e) {
        if (!this.isMousePanning) return;
        e.preventDefault();
        this.isMousePanning = false;
        this.canvas.style.cursor = 'default';
    }

    handleWheel(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const zoomSensitivity = 0.002;
        const delta = 1 - (e.deltaY * zoomSensitivity);
        const newScale = Math.min(Math.max(this.scale * delta, 0.1), 10.0);

        // Adjust offset to zoom relative to mouse position
        this.offsetX = mouseX / newScale - (mouseX / this.scale - this.offsetX);
        this.offsetY = mouseY / newScale - (mouseY / this.scale - this.offsetY);
        this.scale = newScale;
        this.redraw();
    }

    /*=============================
      Keyboard Event Handlers
    ==============================*/
    handleKeyDown(e) {
        if (e.code === 'Space' && !e.repeat) {
            this.isSpacebarDown = true;
            if (!this.isDrawing) {
                this.canvas.style.cursor = 'grab';
            }
        }
    }

    handleKeyUp(e) {
        if (e.code === 'Space') {
            this.isSpacebarDown = false;
            if (!this.isMousePanning) {
                this.canvas.style.cursor = 'default';
            }
        }
    }

    /*=============================
      WebSocket Methods
    ==============================*/
    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '8080';
        const wsUrl = `${protocol}//${host}:${port}`;

        console.log('[WebSocket] Attempting connection to:', wsUrl);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('[WebSocket] Connected successfully');
            this.statusEl.textContent = 'Connected';
            this.statusEl.style.backgroundColor = 'rgba(0,128,0,0.7)';
        };

        this.socket.onmessage = (event) => {
            const message = event.data;
            console.log('[WebSocket] Received message:', message.slice(0, 100) + '...');
            const data = JSON.parse(message);

            // Manage active connections for continuous drawing
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
            this.handleRemoteDrawing(data);
        };

        this.socket.onclose = () => {
            console.error('[WebSocket] Connection closed');
            this.statusEl.textContent = 'Disconnected';
            this.statusEl.style.backgroundColor = 'rgba(255,0,0,0.7)';
            setTimeout(() => this.setupWebSocket(), 5000);
        };

        this.socket.onerror = (err) => {
            console.error('[WebSocket] Error:', err);
            this.statusEl.textContent = 'Error';
            this.statusEl.style.backgroundColor = 'rgba(255,0,0,0.7)';
        };
    }

    sendPointerEvent(action, x, y, e) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocket] Cannot send, connection not open');
            return;
        }
        const pointerData = {
            action,
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            pressure: e.pressure,
            pointerId: e.pointerId,
            isErasing: this.isErasing,
            eraserSize: this.eraserSize,
            prevX: this.lastX !== undefined ? Math.round(this.lastX * 100) / 100 : undefined,
            prevY: this.lastY !== undefined ? Math.round(this.lastY * 100) / 100 : undefined
        };
        const message = JSON.stringify(pointerData);
        console.log('[WebSocket] Sending message:', message.slice(0, 100) + '...');
        this.socket.send(message);
    }

    handleRemoteDrawing(data) {
        if (data.action === 'clear') {
            this.drawingOperations = [];
            this.redraw();
            this.saveToHistory();
            return;
        }
        if (data.action === 'undo') {
            this.performUndo(false);
            return;
        }
        if (data.action === 'redo') {
            this.performRedo(false);
            return;
        }
        const op = {
            ...data,
            x: parseFloat(data.x),
            y: parseFloat(data.y),
            prevX: data.prevX !== undefined ? parseFloat(data.prevX) : undefined,
            prevY: data.prevY !== undefined ? parseFloat(data.prevY) : undefined
        };
        this.drawingOperations.push(op);
        this.redraw();
        this.saveToLocalStorage();

        if (data.action === 'up') {
            this.saveToHistory();
        }
    }

    /*=============================
      Toolbar & Tool Methods
    ==============================*/
    setupToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'toolbar';
        toolbar.innerHTML = `
            <button id="undoTool" disabled>Undo</button>
            <button id="redoTool" disabled>Redo</button>
            <button id="penTool" class="active">Pen</button>
            <button id="eraserTool">Eraser</button>
            <button id="clearTool">Clear All</button>
            <div id="sizeControl" class="size-control hidden">
                <span>Size:</span>
                <input type="range" id="sizeSlider" min="5" max="50" value="20">
                <span id="sizeValue" class="size-value">20</span>
            </div>
        `;
        document.body.appendChild(toolbar);

        this.penButton = document.getElementById('penTool');
        this.eraserButton = document.getElementById('eraserTool');
        this.clearButton = document.getElementById('clearTool');
        this.undoButton = document.getElementById('undoTool');
        this.redoButton = document.getElementById('redoTool');
        this.sizeControl = document.getElementById('sizeControl');
        this.sizeSlider = document.getElementById('sizeSlider');
        this.sizeValue = document.getElementById('sizeValue');

        this.penButton.onclick = () => this.setTool('pen');
        this.eraserButton.onclick = () => this.setTool('eraser');
        this.clearButton.onclick = () => this.clearCanvas();
        this.undoButton.onclick = () => this.undo();
        this.redoButton.onclick = () => this.redo();
        this.sizeSlider.oninput = (e) => {
            this.eraserSize = parseInt(e.target.value);
            this.sizeValue.textContent = this.eraserSize;
        };
    }

    setTool(tool) {
        this.isErasing = tool === 'eraser';
        this.penButton.className = tool === 'pen' ? 'active' : '';
        this.eraserButton.className = tool === 'eraser' ? 'active' : '';
        this.sizeControl.className = `size-control ${tool === 'eraser' ? '' : 'hidden'}`;
        this.ctx.globalCompositeOperation = this.isErasing ? 'destination-out' : 'source-over';
    }

    clearCanvas() {
        this.drawingOperations = [];
        this.redraw();
        this.saveToLocalStorage();
        this.saveToHistory();
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action: 'clear' }));
        }
    }

    /*=============================
      History Methods
    ==============================*/
    saveToHistory() {
        this.undoStack.push([...this.drawingOperations]);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.updateUndoRedoButtons();
    }

    undo() {
        this.performUndo(true);
    }

    redo() {
        this.performRedo(true);
    }

    performUndo(broadcast = true) {
        if (this.undoStack.length > 0) {
            this.redoStack.push([...this.drawingOperations]);
            this.isUndoRedo = true;
            this.drawingOperations = this.undoStack.pop();
            this.redraw();
            this.saveToLocalStorage();
            this.isUndoRedo = false;
            this.updateUndoRedoButtons();
            if (broadcast && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ action: 'undo' }));
            }
        }
    }

    performRedo(broadcast = true) {
        if (this.redoStack.length > 0) {
            this.undoStack.push([...this.drawingOperations]);
            this.isUndoRedo = true;
            this.drawingOperations = this.redoStack.pop();
            this.redraw();
            this.saveToLocalStorage();
            this.isUndoRedo = false;
            this.updateUndoRedoButtons();
            if (broadcast && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ action: 'redo' }));
            }
        }
    }

    updateUndoRedoButtons() {
        this.undoButton.disabled = this.undoStack.length === 0;
        this.redoButton.disabled = this.redoStack.length === 0;
    }

    /*=============================
      Local Storage Methods
    ==============================*/
    saveToLocalStorage() {
        try {
            localStorage.setItem('inkSync_drawing', JSON.stringify(this.drawingOperations));
            console.log('[Storage] Drawing saved');
        } catch (e) {
            console.error('[Storage] Error saving drawing:', e);
        }
    }

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('inkSync_drawing');
            if (saved) {
                this.drawingOperations = JSON.parse(saved);
                console.log('[Storage] Drawing loaded');
                this.redraw();
            }
        } catch (e) {
            console.error('[Storage] Error loading drawing:', e);
        }
    }

    /*=============================
      Global Event Listeners
    ==============================*/
    setupEventListeners() {
        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

        // Pointer events 
        this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
        this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
        this.canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));

        // Mouse events for panning
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Wheel zoom event
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Keyboard events
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));

        // Keyboard shortcuts for undo/redo
        window.addEventListener('keydown', (e) => {
            if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.shiftKey ? this.redo() : this.undo();
            }
        });
    }
}

// Initialize the app when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new DrawingApp();
});