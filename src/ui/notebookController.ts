/**
 * NotebookController - wires the DOM (buttons, status readouts) to a
 * GPUNotebookRenderer instance. Keeps DOM/UI concerns out of the renderer.
 *
 * Also provides two app features:
 *  - Ink controls (color + pen thickness) applied to the drawing layer.
 *  - Auto-save/restore: the typed content and drawing are persisted to
 *    localStorage and restored on reload.
 */

import { PAPER_STANDARDS } from '../notebook/paper';
import type { PaperSize } from '../notebook/paper';
import type { GPUNotebookRenderer } from '../notebook/GPUNotebookRenderer';

const STORAGE_KEY = 'nohomework.notebook.v1';

interface SavedState {
  text: string;
  drawing: string; // data URL of the drawing canvas
  inkColor: string;
  inkWeight: number;
}

export class NotebookController {
  private renderer: GPUNotebookRenderer;
  private contentArea: HTMLElement | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(renderer: GPUNotebookRenderer) {
    this.renderer = renderer;
    this.contentArea = document.getElementById('contentArea');
    this.bindButtons();
    this.bindInkControls();
    this.bindResize();
    this.bindAutoSave();
    this.restore();
    this.syncStatus();
    this.syncPaperInfo();
  }

  private bindButtons(): void {
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = btn.getAttribute('data-size') as PaperSize;
        this.renderer.setPaperSize(size);
        this.syncButtons();
        this.syncPaperInfo();
        this.savePaperSize(size);
      });
    });

    const drawBtn = document.getElementById('drawBtn');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        this.toggleDrawingMode(!document.body.classList.contains('drawing-mode'));
      });
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.renderer.clearAll();
        if (this.contentArea) {
          this.contentArea.textContent = '';
        }
        this.renderer.render();
        this.save();
      });
    }

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const dataUrl = this.renderer.exportAsImage();
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `notebook-${this.renderer.size}-${Date.now()}.png`;
        link.click();
      });
    }
  }

  private bindInkControls(): void {
    const colorInput = document.getElementById('inkColor') as HTMLInputElement | null;
    if (colorInput) {
      colorInput.addEventListener('input', () => {
        this.renderer.setInkColor(colorInput.value);
        this.debouncedSave();
      });
      this.renderer.setInkColor(colorInput.value);
    }

    const weightSelect = document.getElementById('inkWeight') as HTMLSelectElement | null;
    if (weightSelect) {
      weightSelect.addEventListener('change', () => {
        this.renderer.setInkWeight(Number(weightSelect.value));
        this.debouncedSave();
      });
      this.renderer.setInkWeight(Number(weightSelect.value));
    }
  }

  private bindResize(): void {
    window.addEventListener('resize', () => this.renderer.resize());
  }

  private bindAutoSave(): void {
    if (this.contentArea) {
      this.contentArea.addEventListener('input', () => this.debouncedSave());
    }
  }

  private toggleDrawingMode(enable: boolean): void {
    document.body.classList.toggle('drawing-mode', enable);
    this.syncStatus();
  }

  private syncStatus(): void {
    const gpuStatusEl = document.getElementById('gpuStatus');
    if (gpuStatusEl) {
      gpuStatusEl.textContent = this.renderer.isWebGL ? 'Enabled (WebGL)' : 'Not available';
    }
    const renderModeEl = document.getElementById('renderMode');
    if (renderModeEl) {
      renderModeEl.textContent = this.renderer.isWebGL ? 'WebGL' : 'Canvas 2D';
    }
  }

  private syncButtons(): void {
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-size') === this.renderer.size);
    });
  }

  private syncPaperInfo(): void {
    const standard = PAPER_STANDARDS[this.renderer.size];
    const lineSpacingEl = document.getElementById('lineSpacing');
    const standardEl = document.getElementById('standard');

    if (lineSpacingEl) {
      lineSpacingEl.textContent = `${standard.lineSpacing}mm`;
    }
    if (standardEl) {
      standardEl.textContent = standard.rulingStandard;
    }
  }

  private savePaperSize(size: PaperSize): void {
    try {
      localStorage.setItem('nohomework.papersize', size);
    } catch {
      // storage unavailable - ignore
    }
  }

  private restorePaperSize(): PaperSize {
    try {
      const saved = localStorage.getItem('nohomework.papersize');
      if (saved === 'a4' || saved === 'a5') {
        return saved;
      }
    } catch {
      // ignore
    }
    return this.renderer.size;
  }

  private restore(): void {
    // Paper size
    const savedSize = this.restorePaperSize();
    if (savedSize !== this.renderer.size) {
      this.renderer.setPaperSize(savedSize);
      this.syncButtons();
      this.syncPaperInfo();
    }

    // Content + drawing + ink
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as SavedState;

      if (this.contentArea && typeof state.text === 'string') {
        this.contentArea.textContent = state.text;
      }
      if (typeof state.drawing === 'string' && state.drawing) {
        this.restoreDrawing(state.drawing);
      }

      const colorInput = document.getElementById('inkColor') as HTMLInputElement | null;
      if (colorInput && typeof state.inkColor === 'string') {
        colorInput.value = state.inkColor;
        this.renderer.setInkColor(state.inkColor);
      }
      const weightSelect = document.getElementById('inkWeight') as HTMLSelectElement | null;
      if (weightSelect && state.inkWeight != null) {
        weightSelect.value = String(state.inkWeight);
        this.renderer.setInkWeight(Number(state.inkWeight));
      }
    } catch (error) {
      console.warn('Could not restore notebook state:', error);
    }
  }

  private restoreDrawing(dataUrl: string): void {
    const canvas = this.renderer.drawingCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  }

  private collectState(): SavedState {
    return {
      text: this.contentArea ? this.contentArea.textContent || '' : '',
      drawing: this.renderer.exportAsImage(),
      inkColor: (document.getElementById('inkColor') as HTMLInputElement | null)?.value || '#000000',
      inkWeight: Number((document.getElementById('inkWeight') as HTMLSelectElement | null)?.value || 2)
    };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.collectState()));
      this.showSaved();
    } catch {
      // storage full or unavailable - ignore
    }
  }

  private debouncedSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => this.save(), 300);
  }

  private showSaved(): void {
    const el = document.getElementById('saveStatus');
    if (el) {
      el.textContent = 'Saved';
      window.setTimeout(() => {
        el.textContent = 'Auto-save';
      }, 1500);
    }
  }
}