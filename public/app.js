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
        this.currentDrawingId = null;
        this.drawings = {}; // Format: { id: { name: string, operations: array } }
        this.isInitialized = false; // Add flag to track initialization
        this.currentPenColor = '#000000'; // Default pen color

        this.setupComponents();
        this.setupDrawingNameDisplay();
        this.loadFromLocalStorage();
        this.setupEventListeners();
        
        // Mark as initialized after all setup is complete
        this.isInitialized = true;
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

        // Initialize toolbar with all callback handlers
        this.toolbar = new ToolbarManager({
            onPenClick: () => this.setTool('pen'),
            onEraserClick: () => this.setTool('eraser'),
            onClearClick: () => this.clearCanvas(),
            onUndoClick: () => this.undo(),
            onRedoClick: () => this.redo(),
            onSizeChange: (size) => this.eraserSize = size,
            onColorChange: (color) => this.currentPenColor = color, // Bind color change
            onNewDrawingClick: () => this.createNewDrawing(),
            onSaveDrawingClick: () => this.saveCurrentDrawing(),
            onOpenDrawingClick: () => this.openDrawing()
        });
    }

    /**
     * Handles pen/stylus down events to start drawing
     * @param {PointerEvent} e - The pointer event
     */
    handlePointerDown(e) {
        // Check if the event originated from the toolbar
        if (e.target.closest('.toolbar')) {
            return;
        }

        if (e.pointerType !== 'pen') return;
        e.preventDefault();
        
        // Create new drawing if none exists
        if (!this.currentDrawingId) {
            this.createNewDrawing();
            if (!this.currentDrawingId) return; // User cancelled new drawing creation
        }
        
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
            pointerId: e.pointerId,
            color: this.currentPenColor // Include pen color
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
        // Check if the event originated from the toolbar
        if (e.target.closest('.toolbar')) {
            return;
        }

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
            pointerId: e.pointerId,
            color: this.currentPenColor // Include pen color
        };

        this.drawingOperations.push(op);
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.redraw();
        
        // Save after each operation
        if (this.currentDrawingId) {
            this.drawings[this.currentDrawingId].operations = [...this.drawingOperations];
            this.saveToLocalStorage();
        }
        
        this.sendPointerEvent('move', pos.x, pos.y, e);
    }

    /**
     * Handles pen/stylus up events to end drawing
     * @param {PointerEvent} e - The pointer event
     */
    handlePointerUp(e) {
        // Check if the event originated from the toolbar
        if (e.target.closest('.toolbar')) {
            return;
        }

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
        if (data.action === 'requestCurrentState') {
            if (!this.isInitialized) {
                setTimeout(() => this.handleRemoteDrawing(data), 100);
                return;
            }
            // Send only the current drawing ID to the requesting client
            this.webSocket.send({
                action: 'currentDrawingId',
                currentDrawingId: this.currentDrawingId
            });
            return;
        }

        if (data.action === 'currentDrawingId') {
            // Load the current drawing from local storage using the received ID
            this.currentDrawingId = data.currentDrawingId;
            if (this.currentDrawingId && this.drawings[this.currentDrawingId]) {
                this.drawingOperations = [...this.drawings[this.currentDrawingId].operations];
                this.history.clear();
                this.history.saveState(this.drawingOperations);
                this.redraw();
                this.updateDrawingNameDisplay();
                this.updateUndoRedoButtons();
            }
            return;
        }

        if (data.action === 'syncDrawings') {
            // Merge the received drawings into local state
            this.drawings = { ...this.drawings, ...data.drawings };
            this.currentDrawingId = data.currentDrawingId;
            // (Optionally update UI or call redraw if needed)
            this.updateDrawingNameDisplay();
            this.updateUndoRedoButtons();
            return;
        }

        if (data.action === 'deleteDrawing') {
            // Handle remote drawing deletion
            if (data.drawingId) {
                const wasCurrentDrawing = this.currentDrawingId === data.drawingId;
                delete this.drawings[data.drawingId];
                
                // If we were viewing the deleted drawing, clear the canvas
                if (wasCurrentDrawing) {
                    this.currentDrawingId = null;
                    this.drawingOperations = [];
                    this.history.clear();
                    this.redraw();
                    this.updateUndoRedoButtons();
                }
                
                // Update storage and UI
                this.saveToLocalStorage();
                this.updateDrawingNameDisplay();

                // If the drawings dialog is open, update it
                const existingDialog = document.querySelector('.drawings-dialog');
                if (existingDialog) {
                    const deletedItem = existingDialog.querySelector(`[data-id="${data.drawingId}"]`);
                    if (deletedItem) {
                        const container = deletedItem.closest('.drawing-item-container');
                        if (container) {
                            container.remove();
                        }
                        // If no drawings left, close the dialog
                        if (Object.keys(this.drawings).length === 0) {
                            existingDialog.remove();
                        }
                    }
                }
            }
            return;
        }

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

        if (data.action === 'saveDrawing') {
            const previousName = this.drawings[data.drawingId]?.name;
            this.drawings[data.drawingId] = {
                name: data.drawing.name,
                operations: [...data.drawing.operations]
            };
            
            // If this is the current drawing or the name changed, update the display
            if (data.drawingId === this.currentDrawingId || previousName !== data.drawing.name) {
                this.drawingOperations = [...data.drawing.operations];
                this.updateDrawingNameDisplay();
                this.redraw();
            }
            
            // Always save to localStorage when receiving new drawings
            this.saveToLocalStorage();
            return;
        }

        if (data.action === 'openDrawing') {
            const drawingId = data.drawingId;
            if (this.drawings[drawingId]) {
                this.currentDrawingId = drawingId;
                this.drawingOperations = [...this.drawings[drawingId].operations];
                this.history.clear();
                this.history.saveState(this.drawingOperations);
                this.redraw();
                this.updateDrawingNameDisplay();
                this.updateUndoRedoButtons();
            }
            return;
        }

        if (data.action === 'syncResponse') {
            // Only update if we receive more recent data
            const currentData = localStorage.getItem('inkSync_drawings');
            const currentTimestamp = currentData ? JSON.parse(currentData).lastSyncTimestamp : 0;
            
            if (!currentTimestamp || (data.timestamp && data.timestamp > currentTimestamp)) {
                console.log('[Sync] Received newer drawing data, updating...');
                this.drawings = { ...data.drawings };
                this.currentDrawingId = data.currentDrawingId;
                
                if (this.currentDrawingId && this.drawings[this.currentDrawingId]) {
                    this.drawingOperations = [...this.drawings[this.currentDrawingId].operations];
                    this.history.clear();
                    this.history.saveState(this.drawingOperations);
                    this.redraw();
                }
                
                this.updateDrawingNameDisplay();
                this.updateUndoRedoButtons();
                this.saveToLocalStorage();
            }
            return;
        }

        const op = {
            ...data,
            x: parseFloat(data.x),
            y: parseFloat(data.y),
            prevX: data.prevX !== undefined ? parseFloat(data.prevX) : undefined,
            prevY: data.prevY !== undefined ? parseFloat(data.prevY) : undefined,
            color: data.color || '#000000' // Default to black if no color
        };

        this.drawingOperations.push(op);
        this.redraw();
        
        // Save after each operation
        if (this.currentDrawingId) {
            this.drawings[this.currentDrawingId].operations = [...this.drawingOperations];
            this.saveToLocalStorage();
        }

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
            prevY: this.lastY !== undefined ? Math.round(this.lastY * 100) / 100 : undefined,
            color: this.currentPenColor // Include pen color
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
        console.debug('[Storage] saveToLocalStorage called.');
        console.debug('[Storage] currentDrawingId:', this.currentDrawingId);
        
        // Validate current drawing state before saving
        if (this.currentDrawingId && this.drawings[this.currentDrawingId]) {
            this.drawings[this.currentDrawingId] = {
                name: this.drawings[this.currentDrawingId].name,
                operations: [...this.drawingOperations]
            };
        }
        
        const validDrawings = {};
        Object.entries(this.drawings).forEach(([id, drawing]) => {
            if (drawing && drawing.name && Array.isArray(drawing.operations)) {
                validDrawings[id] = {
                    name: drawing.name,
                    operations: [...drawing.operations]
                };
            }
        });
        console.debug('[Storage] Valid drawings:', validDrawings);
        
        const data = {
            currentDrawingId: this.currentDrawingId,
            drawings: validDrawings,
            lastSyncTimestamp: Date.now() // Add timestamp for sync tracking
        };
        console.debug('[Storage] Data prepared for storage:', data);

        if (Object.keys(validDrawings).length > 0 || !this.currentDrawingId) {
            localStorage.setItem('inkSync_drawings', JSON.stringify(data));
            console.debug('[Storage] Data saved to localStorage.');
        } else {
            console.warn('[Storage] No valid drawings to save.');
        }
    }

    /**
     * Restores drawing state from localStorage
     */
    loadFromLocalStorage() {
        console.debug('[Storage] loadFromLocalStorage called.');
        const storedData = localStorage.getItem('inkSync_drawings');
        if (storedData) {
            console.debug('[Storage] Data retrieved from localStorage:', storedData);
            try {
                const data = JSON.parse(storedData);
                // First, validate the data structure
                if (!data.drawings || typeof data.drawings !== 'object') {
                    console.error('[Storage] Invalid drawings data structure');
                    return;
                }

                // Load all drawings first
                this.drawings = {};
                Object.entries(data.drawings).forEach(([id, drawing]) => {
                    if (drawing && drawing.name && Array.isArray(drawing.operations)) {
                        this.drawings[id] = {
                            name: drawing.name,
                            operations: [...drawing.operations]
                        };
                    }
                });
                console.debug('[Storage] Drawings loaded:', this.drawings);

                // Then set the current drawing ID and load its state
                this.currentDrawingId = data.currentDrawingId;
                
                if (this.currentDrawingId && this.drawings[this.currentDrawingId]) {
                    // Load the current drawing's operations
                    this.drawingOperations = [...this.drawings[this.currentDrawingId].operations];
                    this.history.clear();
                    this.history.saveState(this.drawingOperations);
                    this.redraw();
                } else {
                    // Reset if no valid current drawing
                    this.currentDrawingId = null;
                    this.drawingOperations = [];
                }

                // Update UI elements
                this.updateDrawingNameDisplay();
                this.updateUndoRedoButtons();
                
                console.debug('[Storage] Drawings restored:', data);
            } catch (error) {
                console.error('[Storage] Error parsing stored data:', error);
            }
        } else {
            console.debug('[Storage] No data found in localStorage.');
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

    /**
     * Creates a new drawing
     */
    createNewDrawing() {
        const name = prompt('Enter a name for the new drawing:');
        if (!name) return;
        
        // Check for duplicate names
        if (Object.values(this.drawings).some(drawing => drawing.name === name)) {
            alert('A drawing with this name already exists. Please choose a different name.');
            return;
        }
        
        const drawingId = `drawing_${Date.now()}`;
        this.drawings[drawingId] = {
            name: name,
            operations: []
        };
        this.currentDrawingId = drawingId;
        this.drawingOperations = [];
        this.history.clear(); // Reset history for new drawing
        this.redraw();
        this.saveToLocalStorage();
        this.updateDrawingNameDisplay();
        this.updateUndoRedoButtons();
        // Broadcast the new drawing to connected clients
        this.broadcastSave();
        this.broadcastDrawings(); // Ensure all clients have the full set of drawings
        this.broadcastOpen(this.currentDrawingId); // Ensure all clients open the new drawing
    }

    /**
     * Saves the current drawing
     */
    saveCurrentDrawing() {
        if (this.currentDrawingId) {
            const currentDrawing = this.drawings[this.currentDrawingId];
            const newName = prompt('Enter a name for the drawing:', currentDrawing.name);
            if (!newName) return;
            
            // Check for duplicate names (excluding current drawing)
            if (Object.entries(this.drawings).some(([id, drawing]) => 
                drawing.name === newName && id !== this.currentDrawingId
            )) {
                alert('A drawing with this name already exists. Please choose a different name.');
                return;
            }
            
            // Keep existing drawings and just update the current one
            this.drawings = {
                ...this.drawings,
                [this.currentDrawingId]: {
                    name: newName,
                    operations: [...this.drawingOperations]
                }
            };
            
            this.saveToLocalStorage();
            this.broadcastSave();
            this.broadcastDrawings(); // Ensure all clients have the full set of drawings
            this.broadcastOpen(this.currentDrawingId);
            this.updateDrawingNameDisplay();
        } else {
            // If no drawing is active, create a new one
            this.createNewDrawing();
        }
    }

    /**
     * Opens an existing drawing
     */
    openDrawing() {
        const drawings = Object.entries(this.drawings)
            .map(([id, drawing]) => ({ id, name: drawing.name }));

        if (drawings.length === 0) {
            alert('No saved drawings found');
            return;
        }

        // Remove any existing dialog
        const existingDialog = document.querySelector('.drawings-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        // Create a container for the dialog
        const dialog = document.createElement('div');
        dialog.className = 'drawings-dialog';
        Object.assign(dialog.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '24px',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            zIndex: '2000',
            maxWidth: '90%',
            width: '400px'
        });

        // Create a title for the dialog
        const title = document.createElement('h2');
        title.textContent = 'Open Drawing';
        dialog.appendChild(title);

        // Create the scrollable container for the drawing items
        const listContainer = document.createElement('div');
        listContainer.className = 'drawings-list';
        listContainer.style.marginBottom = '16px';
        dialog.appendChild(listContainer);

        // Helper function to close the dialog
        const closeDialog = () => {
            dialog.remove();
        };

        // Create each drawing item with pointer events to distinguish scroll vs. tap
        drawings.forEach(drawing => {
            // Create a container for the drawing item and delete button
            const itemContainer = document.createElement('div');
            itemContainer.className = 'drawing-item-container';
            
            // Create the drawing button
            const button = document.createElement('button');
            button.className = 'drawing-item';
            button.textContent = drawing.name;
            button.dataset.id = drawing.id;
            
            let pointerDown = false;
            let startX = 0, startY = 0;
            
            button.addEventListener('pointerdown', (e) => {
                pointerDown = true;
                startX = e.clientX;
                startY = e.clientY;
                button.setPointerCapture(e.pointerId);
            });
            
            button.addEventListener('pointerup', (e) => {
                if (!pointerDown) return;
                pointerDown = false;
                const deltaX = Math.abs(e.clientX - startX);
                const deltaY = Math.abs(e.clientY - startY);
                if (deltaX < 10 && deltaY < 10) {
                    if (this.drawings[drawing.id]) {
                        this.currentDrawingId = drawing.id;
                        this.drawingOperations = [...this.drawings[drawing.id].operations];
                        this.history.clear();
                        this.history.saveState(this.drawingOperations);
                        this.redraw();
                        this.updateDrawingNameDisplay();
                        this.updateUndoRedoButtons();
                        this.broadcastOpen(drawing.id);
                    }
                    closeDialog();
                }
                button.releasePointerCapture(e.pointerId);
            });
            
            button.addEventListener('pointercancel', (e) => {
                pointerDown = false;
                button.releasePointerCapture(e.pointerId);
            });
            
            // Create the delete button with a cross icon
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '&times;'; // Cross icon
            
            // Bind delete action: remove drawing from the app and local storage
            deleteButton.addEventListener('click', async (e) => {
                // Prevent the event from triggering the button pointer events
                e.stopPropagation();
                
                const drawingId = drawing.id;
                const drawingName = this.drawings[drawingId].name;
                
                // Ask for confirmation before deleting
                if (!confirm(`Are you sure you want to delete "${drawingName}"? This action cannot be undone.`)) {
                    return;
                }
                
                // Remove the drawing from the drawings object
                delete this.drawings[drawingId];
                
                // If the deleted drawing was the current one, clear the canvas
                if (this.currentDrawingId === drawingId) {
                    this.currentDrawingId = null;
                    this.drawingOperations = [];
                    this.history.clear();
                    this.redraw();
                }
                
                // Update local storage
                this.saveToLocalStorage();
                // Update the drawing name display
                this.updateDrawingNameDisplay();
                // Remove the container from the dialog
                itemContainer.remove();
                
                // If this was the last drawing, close the dialog
                if (Object.keys(this.drawings).length === 0) {
                    closeDialog();
                }
                
                // Broadcast the deletion to other clients
                if (this.webSocket.isConnected()) {
                    this.webSocket.send({ 
                        action: 'deleteDrawing', 
                        drawingId: drawingId 
                    });
                }
            });

            // Prevent pointer events on the delete button from bubbling up
            deleteButton.addEventListener('pointerdown', (e) => e.stopPropagation());
            deleteButton.addEventListener('pointerup', (e) => e.stopPropagation());
            
            // Append button and deleteButton to the item container
            itemContainer.appendChild(button);
            itemContainer.appendChild(deleteButton);
            
            // Append the container to the list container
            listContainer.appendChild(itemContainer);
        });

        // Add a close button
        const closeButton = document.createElement('button');
        closeButton.className = 'close-button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', closeDialog);
        dialog.appendChild(closeButton);

        // For backdrop handling: close dialog if click/tap outside dialog
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });

        document.body.appendChild(dialog);
    }

    /**
     * Broadcasts save action to other clients
     */
    broadcastSave() {
        if (this.webSocket.isConnected()) {
            this.webSocket.send({ 
                action: 'saveDrawing', 
                drawingId: this.currentDrawingId, 
                drawing: this.drawings[this.currentDrawingId] 
            });
        }
    }

    /**
     * Broadcasts open action to other clients
     * @param {string} drawingId - The ID of the drawing to open
     */
    broadcastOpen(drawingId) {
        if (this.webSocket.isConnected()) {
            this.webSocket.send({ action: 'openDrawing', drawingId });
        }
    }

    broadcastDrawings() {
        if (this.webSocket.isConnected()) {
            this.webSocket.send({
                action: 'syncDrawings',
                drawings: this.drawings,
                currentDrawingId: this.currentDrawingId
            });
        }
    }

    setupDrawingNameDisplay() {
        const nameDisplay = document.createElement('div');
        nameDisplay.className = 'drawing-name';
        nameDisplay.textContent = 'Untitled Drawing';
        document.body.appendChild(nameDisplay);
        this.drawingNameDisplay = nameDisplay;
    }

    updateDrawingNameDisplay() {
        const currentDrawing = this.currentDrawingId && this.drawings[this.currentDrawingId];
        if (currentDrawing && currentDrawing.name) {
            this.drawingNameDisplay.textContent = currentDrawing.name;
        } else {
            this.drawingNameDisplay.textContent = 'Untitled Drawing';
            // If we have a currentDrawingId but no valid drawing data, reset it
            if (this.currentDrawingId && !currentDrawing) {
                this.currentDrawingId = null;
            }
        }
    }
}

// Initialize the app when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new DrawingApp();
});