/**
 * ToolbarManager Class
 * Manages the drawing toolbar UI and user interactions
 * Handles tool selection, undo/redo state, and eraser size controls
 */
export class ToolbarManager {
    /**
     * @param {Object} options - Callback functions for toolbar actions
     * @param {Function} options.onPenClick - Handler for pen tool selection
     * @param {Function} options.onEraserClick - Handler for eraser tool selection
     * @param {Function} options.onClearClick - Handler for canvas clear action
     * @param {Function} options.onUndoClick - Handler for undo action
     * @param {Function} options.onRedoClick - Handler for redo action
     * @param {Function} options.onSizeChange - Handler for eraser size changes
     */
    constructor(options) {
        this.options = options;
        this.setupToolbar();
    }

    /**
     * Creates and initializes the toolbar DOM elements
     * Sets up the UI structure for drawing tools and controls
     */
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

        this.elements = {
            penButton: document.getElementById('penTool'),
            eraserButton: document.getElementById('eraserTool'),
            clearButton: document.getElementById('clearTool'),
            undoButton: document.getElementById('undoTool'),
            redoButton: document.getElementById('redoTool'),
            sizeControl: document.getElementById('sizeControl'),
            sizeSlider: document.getElementById('sizeSlider'),
            sizeValue: document.getElementById('sizeValue')
        };

        this.bindEvents();
    }

    /**
     * Binds event handlers to toolbar elements
     * Connects UI interactions with the provided callback functions
     */
    bindEvents() {
        const { onPenClick, onEraserClick, onClearClick, onUndoClick, onRedoClick, onSizeChange } = this.options;

        this.elements.penButton.onclick = onPenClick;
        this.elements.eraserButton.onclick = onEraserClick;
        this.elements.clearButton.onclick = onClearClick;
        this.elements.undoButton.onclick = onUndoClick;
        this.elements.redoButton.onclick = onRedoClick;
        
        this.elements.sizeSlider.oninput = (e) => {
            const size = parseInt(e.target.value);
            this.elements.sizeValue.textContent = size;
            onSizeChange(size);
        };
    }

    /**
     * Updates the active tool state in the UI
     * @param {string} tool - The tool to activate ('pen' or 'eraser')
     */
    setTool(tool) {
        this.elements.penButton.className = tool === 'pen' ? 'active' : '';
        this.elements.eraserButton.className = tool === 'eraser' ? 'active' : '';
        this.elements.sizeControl.className = `size-control ${tool === 'eraser' ? '' : 'hidden'}`;
    }

    /**
     * Updates the state of undo/redo buttons based on history availability
     * @param {boolean} canUndo - Whether undo operation is available
     * @param {boolean} canRedo - Whether redo operation is available
     */
    updateUndoRedoButtons(canUndo, canRedo) {
        this.elements.undoButton.disabled = !canUndo;
        this.elements.redoButton.disabled = !canRedo;
    }
}