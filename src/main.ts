/**
 * No Homework Notebook - Realistic A4/A5 Paper Rendering
 * 
 * Uses GPU acceleration via WebGL/Canvas for optimal performance
 * Implements universal paper standards (ISO 216 - A4: 210x297mm, A5: 148x210mm)
 * Supports realistic paper texture, ruling lines, and drawing
 */

import Atrament, { MODE_DRAW } from 'atrament';
import { createNoise2D } from 'simplex-noise';

// Universal Paper Standards (ISO 216)
const PAPER_STANDARDS = {
  a4: {
    width: 210,    // mm
    height: 297,   // mm
    name: 'A4',
    lineSpacing: 8, // mm (standard for most notebooks)
    margin: 20,    // mm (left margin for ruling)
    rulingStandard: 'German DIN'
  },
  a5: {
    width: 148,    // mm
    height: 210,   // mm
    name: 'A5',
    lineSpacing: 6, // mm (slightly smaller for A5)
    margin: 15,    // mm
    rulingStandard: 'German DIN'
  }
} as const;

type PaperSize = keyof typeof PAPER_STANDARDS;

// DPI for display conversion
const DPI = 96; // Standard screen DPI
const MM_TO_PX = DPI / 25.4; // 1mm = 3.7795px at 96 DPI

interface NotebookConfig {
  paperSize: PaperSize;
  lineSpacing: number; // mm
  margin: number; // mm
  lineColor: string;
  lineOpacity: number;
  paperColor: string;
  marginColor: string;
  rulingStandard: string;
}

class GPUNotebookRenderer {
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
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.atramentCanvas = document.createElement('canvas');
    this.atramentCanvas.style.position = 'absolute';
    this.atramentCanvas.style.top = '0';
    this.atramentCanvas.style.left = '0';
    this.atramentCanvas.style.zIndex = '10';
    this.atramentCanvas.style.pointerEvents = 'auto';
    
    // Initialize noise for paper texture
    this.noise = createNoise2D();
    
    // Default config (A4)
    this.config = {
      paperSize: 'a4',
      lineSpacing: PAPER_STANDARDS.a4.lineSpacing,
      margin: PAPER_STANDARDS.a4.margin,
      lineColor: '#4a90e2',
      lineOpacity: 0.3,
      paperColor: '#f9f7f1',
      marginColor: '#d32f2f',
      rulingStandard: PAPER_STANDARDS.a4.rulingStandard
    };
    
    this.initCanvas();
    this.initWebGL();
    this.initAtrament();
    this.setupEventListeners();
    this.resize();
    
    // Add atrament canvas to DOM
    canvas.parentNode?.appendChild(this.atramentCanvas);
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
    
    // Vertex shader
    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    
    // Fragment shader for paper texture
    const fsSource = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float lineSpacing;
      uniform float margin;
      uniform vec3 lineColor;
      uniform float lineOpacity;
      uniform vec3 paperColor;
      uniform vec3 marginColor;
      
      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }
      
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        vec2 pos = uv * resolution;
        
        float paperNoise = fbm(pos * 0.01) * 0.1;
        vec3 paper = paperColor + vec3(paperNoise * 0.05);
        
        vec3 color = paper;
        
        if (pos.x < margin) {
          float marginAlpha = smoothstep(margin - 2.0, margin, pos.x);
          color = mix(paper, marginColor, marginAlpha * 0.3);
        }
        
        float lineY = mod(pos.y, lineSpacing);
        if (lineY < 1.0) {
          float lineAlpha = smoothstep(0.0, 1.0, lineY);
          color = mix(color, lineColor, lineOpacity * lineAlpha);
        }
        
        float grain = fbm(pos * 0.5) * 0.02;
        color += vec3(grain);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    
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
    
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
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
  
  private setupEventListeners(): void {
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = btn.getAttribute('data-size') as PaperSize;
        this.setPaperSize(size);
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
        this.clearAll();
        this.render();
      });
    }
    
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const dataUrl = this.exportAsImage();
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `notebook-${this.currentSize}-${Date.now()}.png`;
        link.click();
      });
    }
    
    window.addEventListener('resize', () => this.resize());
    
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
    
    this.updateUI();
    this.resize();
    this.render();
  }
  
  public setLineSpacing(spacing: number): void {
    this.config.lineSpacing = spacing;
    const lineSpacingEl = document.getElementById('lineSpacing');
    if (lineSpacingEl) {
      lineSpacingEl.textContent = `${spacing}mm`;
    }
    this.render();
  }
  
  public setRulingStandard(standard: string): void {
    this.config.rulingStandard = standard;
    const standardEl = document.getElementById('standard');
    if (standardEl) {
      standardEl.textContent = standard;
    }
    this.render();
  }
  
  public toggleDrawingMode(enable: boolean): void {
    document.body.classList.toggle('drawing-mode', enable);
    const gpuStatusEl = document.getElementById('gpuStatus');
    if (gpuStatusEl) {
      gpuStatusEl.textContent = this.gl ? 'Enabled (WebGL)' : 'Not available';
    }
    const renderModeEl = document.getElementById('renderMode');
    if (renderModeEl) {
      renderModeEl.textContent = this.gl ? 'WebGL' : 'Canvas 2D';
    }
  }
  
  private updateUI(): void {
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-size') === this.currentSize);
    });
    
    const standard = PAPER_STANDARDS[this.currentSize];
    const lineSpacingEl = document.getElementById('lineSpacing');
    const standardEl = document.getElementById('standard');
    
    if (lineSpacingEl) {
      lineSpacingEl.textContent = `${standard.lineSpacing}mm`;
    }
    if (standardEl) {
      standardEl.textContent = standard.rulingStandard;
    }
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
    if (!this.gl || !this.program || !this.positionBuffer || !this.framebuffer) return;
    
    const gl = this.gl;
    const actualWidth = Math.round(width * scale);
    const actualHeight = Math.round(height * scale);
    
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 
      actualWidth, actualHeight, 0, 
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
      gl.TEXTURE_2D, this.texture, 0
    );
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer incomplete');
      return;
    }
    
    gl.viewport(0, 0, actualWidth, actualHeight);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.useProgram(this.program);
    
    const positionAttributeLocation = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    const lineColor = this.hexToRgb(this.config.lineColor);
    const paperColor = this.hexToRgb(this.config.paperColor);
    const marginColor = this.hexToRgb(this.config.marginColor);
    
    gl.uniform2f(gl.getUniformLocation(this.program, 'resolution'), actualWidth, actualHeight);
    gl.uniform1f(gl.getUniformLocation(this.program, 'time'), performance.now() / 1000);
    gl.uniform1f(gl.getUniformLocation(this.program, 'lineSpacing'), this.config.lineSpacing * scale);
    gl.uniform1f(gl.getUniformLocation(this.program, 'margin'), this.config.margin * scale);
    gl.uniform3f(gl.getUniformLocation(this.program, 'lineColor'), lineColor.r, lineColor.g, lineColor.b);
    gl.uniform1f(gl.getUniformLocation(this.program, 'lineOpacity'), this.config.lineOpacity);
    gl.uniform3f(gl.getUniformLocation(this.program, 'paperColor'), paperColor.r, paperColor.g, paperColor.b);
    gl.uniform3f(gl.getUniformLocation(this.program, 'marginColor'), marginColor.r, marginColor.g, marginColor.b);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  private renderCanvas2D(width: number, height: number, scale: number): void {
    if (!this.ctx) return;
    
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(scale, scale);
    
    ctx.fillStyle = this.config.paperColor;
    ctx.fillRect(0, 0, width, height);
    
    this.drawPaperTexture(ctx, width, height);
    
    ctx.fillStyle = this.config.marginColor;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(0, 0, this.config.margin, height);
    ctx.globalAlpha = 1;
    
    ctx.strokeStyle = this.config.marginColor;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(this.config.margin, 0);
    ctx.lineTo(this.config.margin, height);
    ctx.stroke();
    
    ctx.strokeStyle = this.config.lineColor;
    ctx.globalAlpha = this.config.lineOpacity;
    ctx.lineWidth = 1 * scale;
    
    const lineSpacingPx = this.config.lineSpacing * MM_TO_PX;
    const startY = lineSpacingPx;
    const endY = height;
    
    for (let y = startY; y <= endY; y += lineSpacingPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  
  private drawPaperTexture(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    const paperColor = this.hexToRgb(this.config.paperColor);
    const baseR = paperColor.r * 255;
    const baseG = paperColor.g * 255;
    const baseB = paperColor.b * 255;
    
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const noiseValue = this.noise(x * 0.01, y * 0.01);
        const variation = (noiseValue * 0.5 + 0.5) * 10 - 5;
        
        data[index] = Math.min(255, Math.max(0, baseR + variation));
        data[index + 1] = Math.min(255, Math.max(0, baseG + variation));
        data[index + 2] = Math.min(255, Math.max(0, baseB + variation));
        data[index + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
      };
    }
    return { r: 1, g: 1, b: 1 };
  }
  
  public exportAsImage(): string {
    if (!this.atramentCanvas) return '';
    return this.atramentCanvas.toDataURL('image/png');
  }
  
  public exportAsPDF(): void {
    console.log('PDF export not yet implemented');
  }
}

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
  
  (window as any).notebookRenderer = renderer;
  
  renderer.render();
  renderer.toggleDrawingMode(false);
  
  console.log('No Homework Notebook initialized with GPU acceleration');
});
}

// Export for testing
export { GPUNotebookRenderer, PAPER_STANDARDS, MM_TO_PX };
