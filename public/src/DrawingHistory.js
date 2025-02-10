export class DrawingHistory {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.isUndoRedo = false;
    }

    saveState(drawingOperations) {
        if (this.isUndoRedo) return;
        this.undoStack.push([...drawingOperations]);
        this.redoStack = [];
        if (this.undoStack.length > 50) this.undoStack.shift();
        return true;
    }

    undo(drawingOperations) {
        if (this.undoStack.length > 0) {
            this.redoStack.push([...drawingOperations]);
            this.isUndoRedo = true;
            const operations = this.undoStack.pop();
            this.isUndoRedo = false;
            return operations;
        }
        return null;
    }

    redo(drawingOperations) {
        if (this.redoStack.length > 0) {
            this.undoStack.push([...drawingOperations]);
            this.isUndoRedo = true;
            const operations = this.redoStack.pop();
            this.isUndoRedo = false;
            return operations;
        }
        return null;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }
}