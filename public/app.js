import { CanvasView } from './src/CanvasView.js';
import { WebSocketManager } from './src/WebSocketManager.js';
import { DrawingHistory } from './src/DrawingHistory.js';
import { ToolbarManager } from './src/ToolbarManager.js';

class DrawingApp {
    constructor() {
        // Drawing state
        this.isDrawing = false;
        this.isErasing = false;
        this.eraserSize = 20;
        this.drawingOperations = [];
        this.lastX = 0;
        this.lastY = 0;

        // Initialize components
        this.setupComponents();
        this.loadFromLocalStorage();
        this.setupEventListeners();
    }

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

    handlePointerUp(e) {
        if (e.pointerType !== 'pen') return;
        this.isDrawing = false;
        this.canvasView.isPenActive = false;
        const pos = this.canvasView.getPointerPosition(e);
        this.sendPointerEvent('up', pos.x, pos.y, e);
        this.history.saveState(this.drawingOperations);
        this.updateUndoRedoButtons();
    }

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

    setTool(tool) {
        this.isErasing = tool === 'eraser';
        this.toolbar.setTool(tool);
    }

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

    redraw() {
        this.canvasView.redraw(this.drawingOperations);
    }

    updateUndoRedoButtons() {
        this.toolbar.updateUndoRedoButtons(
            this.history.canUndo(),
            this.history.canRedo()
        );
    }

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