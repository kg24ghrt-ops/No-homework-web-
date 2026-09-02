/**
 * No Homework Notebook - application entry point.
 *
 * Sets up the notebook canvas on the page and wires it to the rendering
 * engine and UI controller.
 */

import { GPUNotebookRenderer } from './notebook/GPUNotebookRenderer';
import { NotebookController } from './ui/notebookController';

// Re-export paper module for testing and external consumers
export { GPUNotebookRenderer } from './notebook/GPUNotebookRenderer';
export { PAPER_STANDARDS, MM_TO_PX, DPI } from './notebook/paper';
export type { PaperSize, NotebookConfig } from './notebook/paper';

// Initialize the notebook when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const notebookPage = document.getElementById('notebookPage');
    if (!notebookPage) {
      console.error('Notebook page element not found');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'notebookCanvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '1';
    canvas.style.pointerEvents = 'none';

    notebookPage.appendChild(canvas);

    const renderer = new GPUNotebookRenderer(canvas);
    const controller = new NotebookController(renderer);

    (window as any).notebookRenderer = renderer;
    (window as any).notebookController = controller;

    renderer.render();

    console.log('No Homework Notebook initialized with GPU acceleration');
  });
}
