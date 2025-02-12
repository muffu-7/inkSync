/**
 * DrawingHistory Class
 * Manages undo/redo functionality for the drawing canvas
 * Maintains stacks of drawing operations for state management
 */
export class DrawingHistory {
    constructor() {
        // Stack for undo operations
        this.undoStack = [];
        // Stack for redo operations
        this.redoStack = [];
        // Flag to prevent recursive state saving during undo/redo
        this.isUndoRedo = false;
    }

    /**
     * Saves the current drawing state for undo functionality
     * @param {Array} drawingOperations - Current list of drawing operations
     * @returns {boolean} True if state was saved successfully
     */
    saveState(drawingOperations) {
        // Don't save state if we're in the middle of an undo/redo operation
        if (this.isUndoRedo) return;
        
        this.undoStack.push([...drawingOperations]);
        // Clear redo stack when new changes are made
        this.redoStack = [];
        
        // Limit undo history to prevent memory issues
        if (this.undoStack.length > 50) this.undoStack.shift();
        return true;
    }

    /**
     * Performs an undo operation
     * @param {Array} drawingOperations - Current list of drawing operations
     * @returns {Array|null} Previous state of drawing operations, or null if no undo available
     */
    undo(drawingOperations) {
        if (this.undoStack.length > 0) {
            // Save current state to redo stack
            this.redoStack.push([...drawingOperations]);
            this.isUndoRedo = true;
            const operations = this.undoStack.pop();
            this.isUndoRedo = false;
            return operations;
        }
        return null;
    }

    /**
     * Performs a redo operation
     * @param {Array} drawingOperations - Current list of drawing operations
     * @returns {Array|null} Next state of drawing operations, or null if no redo available
     */
    redo(drawingOperations) {
        if (this.redoStack.length > 0) {
            // Save current state to undo stack
            this.undoStack.push([...drawingOperations]);
            this.isUndoRedo = true;
            const operations = this.redoStack.pop();
            this.isUndoRedo = false;
            return operations;
        }
        return null;
    }

    /**
     * Clears all undo/redo history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.isUndoRedo = false;
    }

    /**
     * Checks if undo operation is available
     * @returns {boolean} True if undo is possible
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Checks if redo operation is available
     * @returns {boolean} True if redo is possible
     */
    canRedo() {
        return this.redoStack.length > 0;
    }
}