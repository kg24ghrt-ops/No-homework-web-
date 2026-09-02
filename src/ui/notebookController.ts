/**
 * NotebookController - wires the DOM (buttons, status readouts) to a
 * GPUNotebookRenderer instance. Keeps DOM/UI concerns out of the renderer.
 *
 * Also provides app features:
 *  - Ink controls (color + pen thickness) applied to the drawing layer.
 *  - Auto-save/restore: the typed content and drawing are persisted to
 *    localStorage and restored on reload.
 *  - Download PNG: composites the page and saves it to the device gallery on
 *    Android/iOS (via Capacitor) or downloads a file on the web.
 */

import { Capacitor } from '@capacitor/core';
import { Media } from '@capacitor-community/media';
import { Filesystem, Directory } from '@capacitor/filesystem';

import { PAPER_STANDARDS } from '../notebook/paper';
import type { PaperSize } from '../notebook/paper';
import type { GPUNotebookRenderer } from '../notebook/GPUNotebookRenderer';

const STORAGE_KEY = 'nohomework.notebook.v1';
const ALBUM_NAME = 'No Homework';

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
    // On native, the Download action saves straight to the device gallery.
    const exportTitleBtn = document.getElementById('exportBtn');
    if (exportTitleBtn && Capacitor.isNativePlatform()) {
      exportTitleBtn.title = 'Save the page to your gallery';
    }

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
      exportBtn.addEventListener('click', () => this.exportPage());
    }

    const exportScale = document.getElementById('exportScale') as HTMLSelectElement | null;
    if (exportScale) {
      exportScale.addEventListener('change', () => {
        this.syncExportLabel();
        this.debouncedSave();
      });
    }
  }

  private syncExportLabel(): void {
    const el = document.getElementById('exportScale') as HTMLSelectElement | null;
    const statusEl = document.getElementById('exportStatus');
    if (!el || !statusEl) return;
    const scale = Number(el.value);
    statusEl.textContent = scale === 1
      ? 'Screen'
      : `${Math.round(scale * 96)} DPI`;
  }

  private getExportScale(): number {
    const el = document.getElementById('exportScale') as HTMLSelectElement | null;
    return Number(el?.value || 300 / 96);
  }

  private exportPage(): void {
    const scale = this.getExportScale();
    const composite = this.buildPageComposite(scale);
    const dpi = Math.round(scale * 96);
    const fileName = `notebook-${this.renderer.size}-${dpi}dpi-${Date.now()}.png`;

    // On Android/iOS, save straight to the device gallery. On the web, fall
    // back to a normal file download.
    if (Capacitor.isNativePlatform()) {
      this.saveToGallery(composite, fileName)
        .then(() => this.setSaveStatus('Saved to gallery'))
        .catch(() => {
          this.downloadWeb(composite, fileName);
          this.setSaveStatus('Saved (download)');
        });
      return;
    }

    this.downloadWeb(composite, fileName);
  }

  private buildPageComposite(scale: number): HTMLCanvasElement {
    const composite = this.renderer.buildComposite(scale);

    // Overlay the typed text onto the finished page.
    if (this.contentArea && this.contentArea.textContent?.trim()) {
      const ctx = composite.getContext('2d');
      if (ctx) {
        this.drawContentText(ctx, composite.width);
      }
    }

    return composite;
  }

  private downloadWeb(canvas: HTMLCanvasElement, fileName: string): void {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = fileName;
    link.click();
  }

  private async ensureGalleryAlbum(): Promise<string | undefined> {
    try {
      if (Capacitor.getPlatform() === 'android') {
        const { path } = await Media.getAlbumsPath();
        const { albums } = await Media.getAlbums();
        const existing = albums.find(
          a => a.name === ALBUM_NAME && a.identifier.startsWith(path)
        );
        if (existing) return existing.identifier;
        await Media.createAlbum({ name: ALBUM_NAME });
        return `${path}/${ALBUM_NAME}`;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async saveToGallery(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
    const albumIdentifier = await this.ensureGalleryAlbum();
    const path = await this.writeCanvasToTempFile(canvas, fileName);
    try {
      await Media.savePhoto({ path, albumIdentifier, fileName });
    } finally {
      try {
        await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
      } catch { /* ignore cleanup errors */ }
    }
  }

  private async writeCanvasToTempFile(canvas: HTMLCanvasElement, fileName: string): Promise<string> {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png');
    });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    const result = await Filesystem.writeFile({
      path: fileName,
      data: btoa(binary),
      directory: Directory.Cache,
    });
    return result.uri;
  }

  private setSaveStatus(message: string): void {
    const el = document.getElementById('saveStatus');
    if (el) {
      el.textContent = message;
      window.setTimeout(() => {
        el.textContent = 'Auto-save';
      }, 2500);
    }
  }

  /**
   * Rasterize the typed content onto the export canvas using the same metrics
   * as the content area (Courier, line height = ruling spacing, left margin).
   */
  private drawContentText(ctx: CanvasRenderingContext2D, width: number): void {
    const { paperSizePx, marginPx, lineSpacingPx } = this.renderer;
    const cssScale = width / paperSizePx.width;

    const fontSize = 16 * cssScale; // ~1rem, matching the content area
    const lineHeight = lineSpacingPx * cssScale;
    const left = marginPx * cssScale;
    const top = lineHeight * 0.75;
    const right = width - marginPx * cssScale;
    const wrapWidth = right - left;

    const text = this.contentArea?.textContent || '';

    ctx.save();
    ctx.font = `${fontSize}px 'Courier New', monospace`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const lines = this.wrapText(text, ctx, wrapWidth);

    lines.forEach((line, i) => {
      ctx.fillText(line, left, top + i * lineHeight);
    });

    ctx.restore();
  }

  private wrapText(text: string, ctx: CanvasRenderingContext2D, maxWidth: number): string[] {
    const paragraphs = text.split('\n');
    const lines: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph === '') {
        lines.push('');
        continue;
      }
      const words = paragraph.split(/\s+/).filter(Boolean);
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) {
        lines.push(current);
      }
    }

    return lines;
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
    const drawBtn = document.getElementById('drawBtn');
    if (drawBtn) {
      drawBtn.classList.toggle('icon-btn-active', enable);
      drawBtn.setAttribute('aria-pressed', String(enable));
    }
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
    this.setSaveStatus('Saved');
  }
}