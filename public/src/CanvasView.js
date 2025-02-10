/**
 * CanvasView Class
 * Handles canvas rendering, zoom/pan interactions, and input device management
 * Optimized for stylus input while supporting touch and mouse interactions
 */
export class CanvasView {
    /**
     * @param {HTMLCanvasElement} canvas - The canvas element to draw on
     * @param {Function} onDraw - Callback function triggered when canvas needs redrawing
     */
    constructor(canvas, onDraw) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onDraw = onDraw;
        this.setupCanvas();
        
        // View transformation state
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Input state tracking
        this.isPanning = false;
        this.isPinching = false;
        this.isMousePanning = false;
        this.isSpacebarDown = false;
        this.initialPinchDistance = 0;
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.isPenActive = false;
        this.activePointerTypes = new Set();

        this.setupEventListeners();
    }

    setupCanvas() {
        const updateCanvasSize = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.style.width = `${rect.width}px`;
            this.canvas.style.height = `${rect.height}px`;
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.ctx.lineJoin = 'round';
            this.ctx.lineCap = 'round';
            this.ctx.strokeStyle = '#000';
            this.redraw();
        };

        window.addEventListener('resize', updateCanvasSize);
        updateCanvasSize();
    }

    setupEventListeners() {
        // Add pointer type tracking
        this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
        this.canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
        this.canvas.addEventListener('pointerout', this.handlePointerUp.bind(this));

        // Mouse panning events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Touch events for mobile panning and pinch-zoom
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this));

        // Gesture events for Safari
        this.canvas.addEventListener('gesturestart', this.handleGestureStart.bind(this));
        this.canvas.addEventListener('gesturechange', this.handleGestureChange.bind(this));
        this.canvas.addEventListener('gestureend', this.handleGestureEnd.bind(this));

        // Zoom with mouse wheel + Ctrl
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    /**
     * Converts viewport coordinates to canvas coordinates accounting for zoom and pan
     * @param {PointerEvent} e - The pointer event containing client coordinates
     * @returns {Object} Object containing transformed x and y coordinates
     */
    getPointerPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / this.scale) + this.offsetX;
        const y = ((e.clientY - rect.top) / this.scale) + this.offsetY;
        return {
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100
        };
    }

    /**
     * Redraws the canvas with all drawing operations
     * Applies current view transformation (scale and offset)
     * @param {Array} operations - List of drawing operations to render
     */
    redraw(operations = []) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.setTransform(
            this.scale, 0,
            0, this.scale,
            -this.offsetX * this.scale,
            -this.offsetY * this.scale
        );

        operations.forEach(op => {
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

    /**
     * Handles Safari-specific gesture events for pinch-zoom
     * @param {GestureEvent} e - The gesture event
     */
    handleGestureStart(e) {
        e.preventDefault();
        this.isPinching = true;
        this.lastScale = this.scale;
    }

    /**
     * Updates scale and position during gesture events
     * @param {GestureEvent} e - The gesture event
     */
    handleGestureChange(e) {
        e.preventDefault();
        if (!this.isPinching) return;
        
        const newScale = Math.min(Math.max(this.lastScale * e.scale, 0.1), 10.0);
        const rect = this.canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        const centerX = rect.width * devicePixelRatio / 2;
        const centerY = rect.height * devicePixelRatio / 2;
        
        this.setNewScale(newScale, centerX, centerY);
    }

    /**
     * Handles the end of gesture events
     * @param {GestureEvent} e - The gesture event
     */
    handleGestureEnd(e) {
        e.preventDefault();
        this.isPinching = false;
    }

    /**
     * Handles mouse wheel events for zooming
     * Only responds to wheel events with Ctrl key pressed
     * @param {WheelEvent} e - The wheel event
     */
    handleWheel(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const zoomSensitivity = 0.004;
        const delta = 1 - (e.deltaY * zoomSensitivity);
        const newScale = Math.min(Math.max(this.scale * delta, 0.1), 10.0);
        
        this.setNewScale(newScale, mouseX, mouseY);
    }

    /**
     * Updates canvas scale while maintaining the zoom center point
     * @param {number} newScale - The new zoom scale to apply
     * @param {number} centerX - X coordinate of zoom center
     * @param {number} centerY - Y coordinate of zoom center
     */
    setNewScale(newScale, centerX, centerY) {
        const zoomOriginX = centerX / this.scale + this.offsetX;
        const zoomOriginY = centerY / this.scale + this.offsetY;
        this.scale = newScale;
        this.offsetX = zoomOriginX - centerX / this.scale;
        this.offsetY = zoomOriginY - centerY / this.scale;
        this.onDraw();
    }

    /**
     * Handles touch start events for panning and pinch-zoom
     * Disabled when pen is active to prevent interference
     * @param {TouchEvent} e - The touch event
     */
    handleTouchStart(e) {
        // Completely prevent touch handling if any pen pointer is active
        if (this.activePointerTypes.has('pen')) {
            e.preventDefault();
            return;
        }
        
        // Don't handle touch events if pen is active
        if (this.isPenActive) return;
        
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

    /**
     * Processes touch move events for panning and pinch-zoom
     * @param {TouchEvent} e - The touch event
     */
    handleTouchMove(e) {
        // Completely prevent touch handling if any pen pointer is active
        if (this.activePointerTypes.has('pen')) {
            e.preventDefault();
            return;
        }
        
        // Don't handle touch events if pen is active
        if (this.isPenActive) return;
        
        e.preventDefault();
        if (e.touches.length === 2 && this.isPinching) {
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
            
            this.setNewScale(newScale, centerX, centerY);
            this.initialPinchDistance = currentDistance;
        } else if (e.touches.length === 1 && this.isPanning) {
            const touch = e.touches[0];
            this.handlePanMove(touch.clientX, touch.clientY);
        }
    }

    /**
     * Handles the end of touch interactions
     * @param {TouchEvent} e - The touch event
     */
    handleTouchEnd(e) {
        // Completely prevent touch handling if any pen pointer is active
        if (this.activePointerTypes.has('pen')) {
            e.preventDefault();
            return;
        }
        
        // Don't handle touch events if pen is active
        if (this.isPenActive) return;
        
        e.preventDefault();
        this.isPinching = false;
        this.isPanning = false;
        this.initialPinchDistance = 0;
    }

    /**
     * Initiates mouse-based panning
     * Only responds to middle mouse button or left click with spacebar
     * @param {MouseEvent} e - The mouse event
     */
    handleMouseDown(e) {
        // Don't handle mouse events if pen is active
        if (this.isPenActive) return;
        
        if (e.button !== 1 && !(this.isSpacebarDown && e.button === 0)) return;
        e.preventDefault();
        this.isMousePanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    /**
     * Updates view position during mouse panning
     * @param {MouseEvent} e - The mouse event
     */
    handleMouseMove(e) {
        // Don't handle mouse events if pen is active
        if (this.isPenActive) return;
        
        if (!this.isMousePanning) return;
        e.preventDefault();
        this.handlePanMove(e.clientX, e.clientY);
    }

    /**
     * Ends mouse-based panning
     * @param {MouseEvent} e - The mouse event
     */
    handleMouseUp(e) {
        // Don't handle mouse events if pen is active
        if (this.isPenActive) return;
        
        if (!this.isMousePanning) return;
        e.preventDefault();
        this.isMousePanning = false;
        this.canvas.style.cursor = this.isSpacebarDown ? 'grab' : 'default';
    }

    /**
     * Common handler for both touch and mouse panning
     * @param {number} currentX - Current X position
     * @param {number} currentY - Current Y position
     */
    handlePanMove(currentX, currentY) {
        const lastX = this.isPanning ? this.lastTouchX : this.lastMouseX;
        const lastY = this.isPanning ? this.lastTouchY : this.lastMouseY;
        
        const deltaX = currentX - lastX;
        const deltaY = currentY - lastY;
        this.offsetX -= deltaX / this.scale;
        this.offsetY -= deltaY / this.scale;
        
        if (this.isPanning) {
            this.lastTouchX = currentX;
            this.lastTouchY = currentY;
        } else {
            this.lastMouseX = currentX;
            this.lastMouseY = currentY;
        }
        
        this.onDraw();
    }

    /**
     * Updates cursor style based on spacebar state
     * @param {boolean} isDown - Whether spacebar is pressed
     */
    setSpacebarState(isDown) {
        // Don't change cursor if pen is active
        if (this.isPenActive) return;
        
        this.isSpacebarDown = isDown;
        if (!this.isMousePanning) {
            this.canvas.style.cursor = isDown ? 'grab' : 'default';
        }
    }

    /**
     * Tracks active pointer types to manage input priority
     * @param {PointerEvent} e - The pointer event
     */
    handlePointerDown(e) {
        this.activePointerTypes.add(e.pointerType);
    }

    /**
     * Removes pointer type from tracking when pointer is released
     * @param {PointerEvent} e - The pointer event
     */
    handlePointerUp(e) {
        this.activePointerTypes.delete(e.pointerType);
    }
}