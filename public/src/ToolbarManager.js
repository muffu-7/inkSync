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
     * @param {Function} options.onNewDrawingClick - Handler for new drawing action
     * @param {Function} options.onSaveDrawingClick - Handler for save drawing action
     * @param {Function} options.onOpenDrawingClick - Handler for open drawing action
     * @param {Function} options.onColorChange - Handler for color change action
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
        
        // Enable smooth scrolling for the toolbar
        let isToolbarScrolling = false;
        let startX = 0;
        let scrollLeft = 0;

        toolbar.addEventListener('touchstart', (e) => {
            isToolbarScrolling = true;
            startX = e.touches[0].pageX - toolbar.offsetLeft;
            scrollLeft = toolbar.scrollLeft;
            toolbar.style.scrollBehavior = 'auto';
        }, { passive: true });

        toolbar.addEventListener('touchmove', (e) => {
            if (!isToolbarScrolling) return;
            e.stopPropagation();
            const x = e.touches[0].pageX - toolbar.offsetLeft;
            const delta = x - startX;
            toolbar.scrollLeft = scrollLeft - delta;
        }, { passive: true });

        toolbar.addEventListener('touchend', () => {
            isToolbarScrolling = false;
            toolbar.style.scrollBehavior = 'smooth';
        }, { passive: true });

        // Prevent toolbar interactions from affecting canvas
        toolbar.addEventListener('touchcancel', () => {
            isToolbarScrolling = false;
            toolbar.style.scrollBehavior = 'smooth';
        }, { passive: true });
        
        // Prevent toolbar interactions from affecting canvas
        toolbar.addEventListener('touchstart', (e) => e.stopPropagation());
        toolbar.addEventListener('touchmove', (e) => e.stopPropagation());
        toolbar.addEventListener('touchend', (e) => e.stopPropagation());
        
        // Prevent scroll momentum from affecting the canvas
        toolbar.addEventListener('scroll', (e) => e.stopPropagation());
        
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
            <input type="color" id="colorPicker" value="#000000" title="Choose pen color">
            <button id="newDrawing">New Drawing</button>
            <button id="saveDrawing">Save Drawing</button>
            <button id="openDrawing">Open Drawing</button>
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
            sizeValue: document.getElementById('sizeValue'),
            colorPicker: document.getElementById('colorPicker'),
            newDrawingButton: document.getElementById('newDrawing'),
            saveDrawingButton: document.getElementById('saveDrawing'),
            openDrawingButton: document.getElementById('openDrawing')
        };

        this.bindEvents();
    }

    /**
     * Binds event handlers to toolbar elements
     * Connects UI interactions with the provided callback functions
     */
    bindEvents() {
        const { onPenClick, onEraserClick, onClearClick, onUndoClick, onRedoClick, onSizeChange, onColorChange, onNewDrawingClick, onSaveDrawingClick, onOpenDrawingClick } = this.options;

        // Helper function to handle proper tap events
        const bindTapHandler = (element, handler) => {
            let touchStartX = 0;
            let touchStartY = 0;
            let isTouchMoved = false;
            let touchStartTime = 0;

            element.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isTouchMoved = false;
                touchStartTime = Date.now();
            }, { passive: true });

            element.addEventListener('touchmove', (e) => {
                if (!e.touches[0]) return;
                e.stopPropagation();
                
                const moveThreshold = 10; // pixels
                const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
                const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
                
                if (deltaX > moveThreshold || deltaY > moveThreshold) {
                    isTouchMoved = true;
                }
            }, { passive: true });

            element.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const touchTime = Date.now() - touchStartTime;
                // Only trigger if it was a quick tap (less than 300ms) and didn't move significantly
                if (!isTouchMoved && touchTime < 300) {
                    handler(e);
                }
            });

            // Keep click handler for desktop
            element.addEventListener('click', (e) => {
                e.stopPropagation();
                handler(e);
            });
        };

        bindTapHandler(this.elements.penButton, onPenClick);
        bindTapHandler(this.elements.eraserButton, onEraserClick);
        bindTapHandler(this.elements.clearButton, onClearClick);
        bindTapHandler(this.elements.undoButton, onUndoClick);
        bindTapHandler(this.elements.redoButton, onRedoClick);
        bindTapHandler(this.elements.newDrawingButton, onNewDrawingClick);
        bindTapHandler(this.elements.saveDrawingButton, onSaveDrawingClick);
        bindTapHandler(this.elements.openDrawingButton, onOpenDrawingClick);
        
        // Handle size slider with touch prevention
        const preventToolbarTouch = (e) => {
            e.stopPropagation();
        };

        // Size control touch handling
        [this.elements.sizeControl, this.elements.sizeSlider].forEach(element => {
            element.addEventListener('touchstart', preventToolbarTouch, { passive: true });
            element.addEventListener('touchmove', preventToolbarTouch, { passive: true });
            element.addEventListener('touchend', preventToolbarTouch, { passive: true });
        });
        
        this.elements.sizeSlider.oninput = (e) => {
            e.stopPropagation();
            const size = parseInt(e.target.value);
            this.elements.sizeValue.textContent = size;
            onSizeChange(size);
        };

        this.elements.colorPicker.addEventListener('input', (e) => {
            e.stopPropagation();
            onColorChange(e.target.value);
        });
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