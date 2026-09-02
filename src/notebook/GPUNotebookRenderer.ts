/**
 * GPUNotebookRenderer - rendering engine for realistic A4/A5 paper.
 *
 * Handles WebGL (with Canvas 2D fallback) rendering of paper texture, ruling
 * lines, and margins, plus the pressure-sensitive drawing layer via Atrament.
 * DOM/UI wiring lives in the notebook controller; this class stays focused on
 * rendering and pure state.
 */

import Atrament, { MODE_DRAW } from 'atrament';
import { createNoise2D } from 'simplex-noise';

import { PAPER_STANDARDS, MM_TO_PX, createDefaultConfig, hexToRgb } from './paper';
import type { NotebookConfig, PaperSize } from './paper';
import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './shaders';

export class GPUNotebookRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private gl: WebGLRenderingContext | null = null;
  private atramentCanvas: HTMLCanvasElement;
  private atrament: Atrament | null = null;
  private atramentCtx: CanvasRenderingContext2D | null = null;
  private noise: ReturnType<typeof createNoise2D>;
  private config: NotebookConfig;
  private currentSize: PaperSize = 'a4';

  // WebGL resources
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.atramentCanvas = document.createElement('canvas');
    this.atramentCanvas.style.position = 'absolute';
    this.atramentCanvas.style.top = '0';
    this.atramentCanvas.style.left = '0';
    this.atramentCanvas.style.zIndex = '10';
    this.atramentCanvas.className = 'drawing-area';

    // Initialize noise for paper texture
    this.noise = createNoise2D();

    // Default config (A4)
    this.config = createDefaultConfig();

    this.initCanvas();
    this.initWebGL();
    this.initAtrament();
    this.setupCanvasEvents();
    this.resize();

    // Add atrament canvas to DOM
    canvas.parentNode?.appendChild(this.atramentCanvas);
  }

  /** Current active paper size (a4 | a5). */
  get size(): PaperSize {
    return this.currentSize;
  }

  /** Whether GPU/WebGL rendering is available. */
  get isWebGL(): boolean {
    return this.gl !== null;
  }

  /** The native drawing (Atrament) canvas used for exports. */
  get drawingCanvas(): HTMLCanvasElement {
    return this.atramentCanvas;
  }

  private initCanvas(): void {
    const ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
      powerPreference: 'high-performance'
    });
    this.ctx = ctx as CanvasRenderingContext2D | null;

    // Enable GPU acceleration hints
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.imageSmoothingQuality = 'high';
    }
  }

  private initWebGL(): void {
    try {
      // Try to get WebGL2 first, fall back to WebGL1
      const gl = this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
      }) || this.canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
      });

      this.gl = gl as WebGLRenderingContext | null;

      if (!this.gl) {
        console.warn('WebGL not available, falling back to Canvas 2D');
        return;
      }

      // Compile shaders for GPU rendering
      this.compileShaders();
      this.createBuffers();

      console.log('WebGL initialized successfully');
    } catch (error) {
      console.error('WebGL initialization failed:', error);
      this.gl = null;
    }
  }

  private compileShaders(): void {
    if (!this.gl) return;

    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    if (!vertexShader || !fragmentShader) return;

    this.program = gl.createProgram();
    if (!this.program) return;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Shader program linking error:', gl.getProgramInfoLog(this.program));
      gl.deleteProgram(this.program);
      this.program = null;
      return;
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private createBuffers(): void {
    if (!this.gl || !this.program) return;

    const gl = this.gl;

    const positions = new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  }

  private initAtrament(): void {
    const canvas = this.atramentCanvas;
    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true
    });

    this.atramentCtx = ctx as CanvasRenderingContext2D | null;

    if (!ctx) return;

    this.atrament = new Atrament(canvas, {
      width: canvas.width,
      height: canvas.height,
      color: '#000000',
      weight: 2,
      smoothing: 0.5
    });
    this.atrament.mode = MODE_DRAW;
  }

  /** Internal canvas-level touch handling (kept separate from UI wiring). */
  private setupCanvasEvents(): void {
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
    }, { passive: false });
  }

  public setPaperSize(size: PaperSize): void {
    this.currentSize = size;
    const standard = PAPER_STANDARDS[size];

    this.config = {
      ...this.config,
      paperSize: size,
      lineSpacing: standard.lineSpacing,
      margin: standard.margin,
      rulingStandard: standard.rulingStandard
    };

    this.resize();
    this.render();
  }

  public setLineSpacing(spacing: number): void {
    this.config.lineSpacing = spacing;
    this.render();
  }

  /** Set the drawing (ink) color for new strokes. */
  public setInkColor(color: string): void {
    if (this.atrament) {
      this.atrament.color = color;
    }
  }

  /** Set the drawing (pen) thickness for new strokes. */
  public setInkWeight(weight: number): void {
    if (this.atrament) {
      this.atrament.weight = weight;
    }
  }

  public setRulingStandard(standard: string): void {
    this.config.rulingStandard = standard;
    this.render();
  }

  public resize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;

    const standard = PAPER_STANDARDS[this.currentSize];
    const widthPx = standard.width * MM_TO_PX;
    const heightPx = standard.height * MM_TO_PX;

    this.canvas.style.width = `${widthPx}px`;
    this.canvas.style.height = `${heightPx}px`;

    const scale = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(widthPx * scale);
    this.canvas.height = Math.round(heightPx * scale);

    this.atramentCanvas.style.width = `${widthPx}px`;
    this.atramentCanvas.style.height = `${heightPx}px`;
    this.atramentCanvas.width = Math.round(widthPx * scale);
    this.atramentCanvas.height = Math.round(heightPx * scale);

    this.clearAll();
    this.render();
  }

  public clearAll(): void {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this.atramentCtx) {
      this.atramentCtx.clearRect(0, 0, this.atramentCanvas.width, this.atramentCanvas.height);
    }

    if (this.atrament) {
      this.atrament.clear();
    }
  }

  public render(): void {
    const standard = PAPER_STANDARDS[this.currentSize];
    const widthPx = standard.width * MM_TO_PX;
    const heightPx = standard.height * MM_TO_PX;
    const scale = window.devicePixelRatio || 1;

    if (this.gl && this.program && this.positionBuffer) {
      this.renderWebGL(widthPx, heightPx, scale);
    } else if (this.ctx) {
      this.renderCanvas2D(widthPx, heightPx, scale);
    }
  }

  private renderWebGL(width: number, height: number, scale: number): void {
    if (!this.gl || !this.program || !this.positionBuffer) return;

    const gl = this.gl;
    const actualWidth = Math.round(width * scale);
    const actualHeight = Math.round(height * scale);

    gl.viewport(0, 0, actualWidth, actualHeight);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    const positionAttributeLocation = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    const lineColor = hexToRgb(this.config.lineColor);
    const paperColor = hexToRgb(this.config.paperColor);
    const marginColor = hexToRgb(this.config.marginColor);

    gl.uniform2f(gl.getUniformLocation(this.program, 'resolution'), actualWidth, actualHeight);
    gl.uniform1f(gl.getUniformLocation(this.program, 'time'), performance.now() / 1000);
    gl.uniform1f(gl.getUniformLocation(this.program, 'lineSpacing'), this.config.lineSpacing * MM_TO_PX * scale);
    gl.uniform1f(gl.getUniformLocation(this.program, 'margin'), this.config.margin * MM_TO_PX * scale);
    gl.uniform3f(gl.getUniformLocation(this.program, 'lineColor'), lineColor.r, lineColor.g, lineColor.b);
    gl.uniform1f(gl.getUniformLocation(this.program, 'lineOpacity'), this.config.lineOpacity);
    gl.uniform3f(gl.getUniformLocation(this.program, 'paperColor'), paperColor.r, paperColor.g, paperColor.b);
    gl.uniform3f(gl.getUniformLocation(this.program, 'marginColor'), marginColor.r, marginColor.g, marginColor.b);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private fbm2D(x: number, y: number, octaves: number = 5): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise(x * frequency, y * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  private renderCanvas2D(width: number, height: number, scale: number): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(scale, scale);

    ctx.fillStyle = this.config.paperColor;
    ctx.fillRect(0, 0, width, height);

    this.drawPaperTexture(ctx, width, height);

    // Margin zone with soft gradient
    const marginPx = this.config.margin * MM_TO_PX;
    const grad = ctx.createLinearGradient(0, 0, marginPx + 10, 0);
    grad.addColorStop(0, `rgba(211, 47, 47, 0.15)`);
    grad.addColorStop(0.7, `rgba(211, 47, 47, 0.12)`);
    grad.addColorStop(1, `rgba(211, 47, 47, 0.0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, marginPx + 10, height);

    // Margin line
    ctx.strokeStyle = this.config.marginColor;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(marginPx, 0);
    ctx.lineTo(marginPx, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Ruling lines
    ctx.strokeStyle = this.config.lineColor;
    ctx.globalAlpha = this.config.lineOpacity;
    ctx.lineWidth = 0.8 * scale;

    const lineSpacingPx = this.config.lineSpacing * MM_TO_PX;

    for (let y = lineSpacingPx; y <= height; y += lineSpacingPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Top edge shadow
    const topShadow = ctx.createLinearGradient(0, 0, 0, 12);
    topShadow.addColorStop(0, 'rgba(0, 0, 0, 0.04)');
    topShadow.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(0, 0, width, 12);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawPaperTexture(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const paperRgb = hexToRgb(this.config.paperColor);
    const baseR = paperRgb.r * 255;
    const baseG = paperRgb.g * 255;
    const baseB = paperRgb.b * 255;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        // Warm/cool color temperature variation
        const colorTemp = (this.fbm2D(x * 0.003, y * 0.003) - 0.5) * 7;

        // Coarse paper structure
        const coarse = (this.fbm2D(x * 0.004, y * 0.004) - 0.5) * 14;

        // Fine fiber texture
        const fine1 = (this.noise(x * 0.08, y * 0.08) - 0.5) * 7;
        const fine2 = (this.noise(x * 0.25, y * 0.25) - 0.5) * 3.5;

        // Laid paper horizontal fibers
        const laid = Math.sin(y * 0.8 + this.fbm2D(x * 0.01, y * 0.01) * 4) * 2.5;

        // Edge darkening
        const edgeX = Math.min(1, x / 30) * Math.min(1, (width - x) / 30);
        const edgeY = Math.min(1, y / 20) * Math.min(1, (height - y) / 20);
        const edgeFactor = 0.94 + edgeX * edgeY * 0.06;

        const totalVariation = colorTemp + coarse + fine1 + fine2 + laid;

        data[index]     = Math.min(255, Math.max(0, (baseR + totalVariation) * edgeFactor));
        data[index + 1] = Math.min(255, Math.max(0, (baseG + totalVariation * 0.9) * edgeFactor));
        data[index + 2] = Math.min(255, Math.max(0, (baseB + totalVariation * 0.7) * edgeFactor));
        data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  public exportAsImage(): string {
    if (!this.atramentCanvas) return '';
    return this.atramentCanvas.toDataURL('image/png');
  }

  public exportAsPDF(): void {
    console.log('PDF export not yet implemented');
  }

  /** Clean up drawing layer resources (used before replacement or teardown). */
  public destroy(): void {
    this.atrament?.destroy();
  }
}
