import { CanvasView } from './src/CanvasView.js';
import { WebSocketManager } from './src/WebSocketManager.js';
import { DrawingHistory } from './src/DrawingHistory.js';
import { ToolbarManager } from './src/ToolbarManager.js';

/**
 * DrawingApp Class
 * Main application controller that coordinates all components
 * Handles drawing state, event routing, and data persistence
 */
class DrawingApp {
    constructor() {
        // Application state
        this.isDrawing = false;
        this.isErasing = false;
        this.eraserSize = 20;
        this.drawingOperations = [];
        this.lastX = 0;
        this.lastY = 0;

        this.setupComponents();
        this.loadFromLocalStorage();
        this.setupEventListeners();
    }

    /**
     * Initializes all component classes and their interactions
     * Sets up Canvas, WebSocket, History, and Toolbar managers
     */
    setupComponents() {
        const canvas = document.getElementById('drawingCanvas');
        const statusEl = document.getElementById('status');

        // Initialize canvas view
        this.canvasView = new CanvasView(canvas, () => this.redraw());

        // Initialize WebSocket manager
        this.webSocket = new WebSocketManager(
            (data) => this.handleRemoteDrawing(data),
            (text, color) => {
                statusEl.textContent = text;
                statusEl.style.backgroundColor = color;
            }
        );

        // Initialize drawing history
        this.history = new DrawingHistory();

        // Initialize toolbar
        this.toolbar = new ToolbarManager({
            onPenClick: () => this.setTool('pen'),
            onEraserClick: () => this.setTool('eraser'),
            onClearClick: () => this.clearCanvas(),
            onUndoClick: () => this.undo(),
            onRedoClick: () => this.redo(),
            onSizeChange: (size) => this.eraserSize = size
        });
    }

    /**
     * Handles pen/stylus down events to start drawing
     * @param {PointerEvent} e - The pointer event
     */
    handlePointerDown(e) {
        if (e.pointerType !== 'pen') return;
        e.preventDefault();
        this.isDrawing = true;
        this.canvasView.isPenActive = true;
        
        const pos = this.canvasView.getPointerPosition(e);
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

    /**
     * Processes pen/stylus movement for drawing strokes
     * @param {PointerEvent} e - The pointer event
     */
    handlePointerMove(e) {
        if (!this.isDrawing || e.pointerType !== 'pen') return;
        e.preventDefault();
        const pos = this.canvasView.getPointerPosition(e);

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

    /**
     * Handles pen/stylus up events to end drawing
     * @param {PointerEvent} e - The pointer event
     */
    handlePointerUp(e) {
        if (e.pointerType !== 'pen') return;
        this.isDrawing = false;
        this.canvasView.isPenActive = false;
        const pos = this.canvasView.getPointerPosition(e);
        this.sendPointerEvent('up', pos.x, pos.y, e);
        this.history.saveState(this.drawingOperations);
        this.updateUndoRedoButtons();
    }

    /**
     * Processes drawing actions received from other clients
     * Handles synchronization of clear, undo, redo, and drawing operations
     * @param {Object} data - The received WebSocket message data
     */
    handleRemoteDrawing(data) {
        if (data.action === 'clear') {
            this.drawingOperations = [];
            this.redraw();
            this.history.saveState(this.drawingOperations);
            return;
        }

        if (data.action === 'undo') {
            const operations = this.history.undo(this.drawingOperations);
            if (operations) {
                this.drawingOperations = operations;
                this.redraw();
                this.saveToLocalStorage();
            }
            return;
        }

        if (data.action === 'redo') {
            const operations = this.history.redo(this.drawingOperations);
            if (operations) {
                this.drawingOperations = operations;
                this.redraw();
                this.saveToLocalStorage();
            }
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
            this.history.saveState(this.drawingOperations);
            this.updateUndoRedoButtons();
        }
    }

    /**
     * Sends drawing actions to other clients via WebSocket
     * @param {string} action - The type of pointer action (down/move/up)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {PointerEvent} e - The original pointer event
     */
    sendPointerEvent(action, x, y, e) {
        if (!this.webSocket.isConnected()) return;

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

        this.webSocket.send(pointerData);
    }

    /**
     * Switches between pen and eraser tools
     * @param {string} tool - The tool to activate ('pen' or 'eraser')
     */
    setTool(tool) {
        this.isErasing = tool === 'eraser';
        this.toolbar.setTool(tool);
    }

    /**
     * Clears the entire canvas and notifies other clients
     */
    clearCanvas() {
        this.drawingOperations = [];
        this.redraw();
        this.saveToLocalStorage();
        this.history.saveState(this.drawingOperations);
        this.updateUndoRedoButtons();
        
        if (this.webSocket.isConnected()) {
            this.webSocket.send({ action: 'clear' });
        }
    }

    /**
     * Performs undo operation and synchronizes with other clients
     */
    undo() {
        const operations = this.history.undo(this.drawingOperations);
        if (operations) {
            this.drawingOperations = operations;
            this.redraw();
            this.saveToLocalStorage();
            this.updateUndoRedoButtons();
            if (this.webSocket.isConnected()) {
                this.webSocket.send({ action: 'undo' });
            }
        }
    }

    /**
     * Performs redo operation and synchronizes with other clients
     */
    redo() {
        const operations = this.history.redo(this.drawingOperations);
        if (operations) {
            this.drawingOperations = operations;
            this.redraw();
            this.saveToLocalStorage();
            this.updateUndoRedoButtons();
            if (this.webSocket.isConnected()) {
                this.webSocket.send({ action: 'redo' });
            }
        }
    }

    /**
     * Triggers canvas redraw with current operations
     */
    redraw() {
        this.canvasView.redraw(this.drawingOperations);
    }

    /**
     * Updates UI state of undo/redo buttons
     */
    updateUndoRedoButtons() {
        this.toolbar.updateUndoRedoButtons(
            this.history.canUndo(),
            this.history.canRedo()
        );
    }

    /**
     * Persists current drawing state to localStorage
     */
    saveToLocalStorage() {
        try {
            localStorage.setItem('inkSync_drawing', JSON.stringify(this.drawingOperations));
            console.log('[Storage] Drawing saved');
        } catch (e) {
            console.error('[Storage] Error saving drawing:', e);
        }
    }

    /**
     * Restores drawing state from localStorage
     */
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

    /**
     * Sets up global event listeners for keyboard shortcuts
     * and drawing input
     */
    setupEventListeners() {
        const canvas = this.canvasView.canvas;

        // Pointer events for drawing
        canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
        canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
        canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
        canvas.addEventListener('pointerout', this.handlePointerUp.bind(this));

        // Keyboard events
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                this.canvasView.setSpacebarState(true);
            } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.shiftKey ? this.redo() : this.undo();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.canvasView.setSpacebarState(false);
            }
        });
    }
}

// Initialize the app when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new DrawingApp();
});