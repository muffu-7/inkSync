# InkSync

InkSync is a real-time S-Pen drawing application that captures stylus input and synchronizes drawing actions between multiple clients using WebSockets. It also features an undo/redo functionality and local storage persistence, making it a robust tool for collaborative and personal drawing sessions.

## Features

- **Real-Time Drawing:** Capture stylus (pen) input and render drawings directly to an HTML5 canvas.
- **Collaborative Synchronization:** Uses WebSockets ([`WebSocketManager`](public/src/WebSocketManager.js)) to broadcast drawing events between clients, enabling real-time collaboration.
- **Undo/Redo Support:** Manage drawing history with undo and redo functionalities handled by [`DrawingHistory`](public/src/DrawingHistory.js).
- **Tool Switching:** Switch seamlessly between pen and eraser tools via the [`ToolbarManager`](public/src/ToolbarManager.js). The eraser tool comes with adjustable size.
- **State Persistence:** Automatically saves the drawing state to `localStorage` so your drawing persists across page reloads.
- **Responsive Canvas:** Supports panning, zooming (with mouse wheel + Ctrl or gesture events), and dynamic resizing to adjust to different screen sizes.
- **Mobile-Friendly:** The design and touch handling are optimized for mobile devices.

## Application Structure

- **Server:**  
  - [`server.js`](server.js) – Express server that hosts static files and initializes the WebSocket server for client communication.
- **Client (Public Folder):**
  - **HTML/CSS:**  
    - [`index.html`](public/index.html) – Main HTML file defining the canvas container, UI elements, and status indicator.
  - **JavaScript:**
    - [`app.js`](public/app.js) – Main application controller that coordinates drawing, persistence, and WebSocket communication.
    - [`CanvasView.js`](public/src/CanvasView.js) – Manages canvas interactions, rendering, zooming, and panning.
    - [`WebSocketManager.js`](public/src/WebSocketManager.js) – Handles real-time communication between clients.
    - [`DrawingHistory.js`](public/src/DrawingHistory.js) – Provides undo/redo functionality by managing drawing states.
    - [`ToolbarManager.js`](public/src/ToolbarManager.js) – Manages the UI for tool and action selections such as pen, eraser, clear, and undo/redo.

## Installation and Usage

### Prerequisites

- [Node.js](https://nodejs.org/en/) (v14 or higher recommended)
- npm (usually comes with Node.js)

### Setup

1. **Clone the Repository:**  
   Clone the repository to your local machine.

2. **Install Dependencies:**  
   Open a terminal in the project root and run:
   ```sh
   npm install
   ```

### Running the Application

- **Start the Server:**  
  Use the following command to start the server:
  ```sh
  npm start
  ```
  Alternatively, for active development with automatic restarts:
  ```sh
  npm run dev
  ```

- **Access the Application:**  
  Open your browser and navigate to [http://localhost:8080](http://localhost:8080).  
  For mobile devices on the same network, check the console output from [`server.js`](server.js ) for the correct local access URL.

### How to Use

1. **Drawing:**  
   Use your S-Pen (or mouse if configured) to draw on the canvas. The drawing actions are automatically synchronized with other connected clients.
   
2. **Switch Tools:**  
   - Click on **Pen** to activate pen drawing.
   - Click on **Eraser** to activate the eraser; you can adjust the eraser size using the slider that appears.
   
3. **Undo/Redo:**  
   - Use the **Undo** and **Redo** buttons in the toolbar.
   - Alternatively, use keyboard shortcuts:
     - **Undo:** Press `Ctrl+Z` (or `Cmd+Z` on Mac).
     - **Redo:** Press `Shift+Ctrl+Z` (or `Shift+Cmd+Z` on Mac).

4. **Clear Canvas:**  
   Click on the **Clear All** button in the toolbar to remove all drawings.

5. **Pan and Zoom:**  
   - **Zoom:** Hold `Ctrl` (or `Cmd`) and scroll the mouse wheel, or use touch pinch gestures on mobile.
   - **Pan:** Press and hold spacebar (or use the middle mouse button) to pan the canvas.

6. **State Persistence:**  
   The drawing is automatically saved to [`localStorage`](/Users/muffu/Library/Caches/typescript/5.7/node_modules/@types/node/globals.d.ts ) on every change, so if you accidentally refresh or close the browser, your work is recovered when you open the app again.

## Future Enhancements

- **Shape Tools:** Adding support for drawing basic shapes such as rectangles, circles, and lines.
- **Color Picker:** Implement a color selection tool to allow users to choose different drawing colors.
- **Layer Support:** Introduce layers for more complex drawings where elements can be organized, hidden, or reordered.
- **Improved Mobile Support:** Enhance touch interactions and add gesture recognition to improve the mobile experience.
- **Enhanced Performance:** Optimize canvas rendering and WebSocket communication for high-frequency drawing events.
- **Offline Mode:** Provide a progressive web app (PWA) experience with offline capabilities and data synchronization when reconnected.
- **User Authentication:** Allow users to save and share their drawings through cloud storage or user accounts.
- **Real-Time Collaboration Enhancements:** Features like chat, cursor sharing, and session management for a better collaborative experience.

## Contributing

Contributions are welcome! If you'd like to contribute improvements or report bugs, please submit an issue or a pull request.

## License

This project is licensed under the MIT License.

---

For more detailed code references, please see:
- app.js
- CanvasView.js
- WebSocketManager.js
- DrawingHistory.js
- ToolbarManager.js
- [`server.js`](server.js )
- index.html
