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
    
    // Fragment shader for realistic paper texture
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

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        for (int i = 0; i < 5; i++) {
          value += amplitude * valueNoise(p * frequency);
          frequency *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      float fbmDomainWarped(vec2 p) {
        vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
        vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15),
                       fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.126));
        return fbm(p + 3.5 * r);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        vec2 pos = uv * resolution;

        // --- Paper base color with warm/cool variation ---
        float colorTemp = fbm(pos * 0.003) * 0.015 - 0.0075;
        vec3 warmTint = vec3(colorTemp, colorTemp * 0.5, -colorTemp * 0.3);
        vec3 paper = paperColor + warmTint;

        // --- Coarse paper structure (large blotches, fiber bundles) ---
        float coarseNoise = fbmDomainWarped(pos * 0.004) * 0.06 - 0.03;
        paper += vec3(coarseNoise);

        // --- Fine paper fiber texture ---
        float fineNoise1 = valueNoise(pos * 0.08) * 0.03 - 0.015;
        float fineNoise2 = valueNoise(pos * 0.25) * 0.015 - 0.0075;
        paper += vec3(fineNoise1 + fineNoise2);

        // --- Horizontal fiber directionality (laid paper effect) ---
        float laidLine = sin(pos.y * 0.8 + fbm(pos * 0.01) * 4.0) * 0.005;
        paper += vec3(laidLine);

        // --- Edge darkening (paper curl / shadow at borders) ---
        float edgeX = smoothstep(0.0, 30.0, pos.x) * smoothstep(0.0, 30.0, resolution.x - pos.x);
        float edgeY = smoothstep(0.0, 20.0, pos.y) * smoothstep(0.0, 20.0, resolution.y - pos.y);
        float edgeDarken = edgeX * edgeY;
        paper *= 0.94 + edgeDarken * 0.06;

        // --- Top edge subtle shadow (paper sits on surface) ---
        float topShadow = smoothstep(resolution.y, resolution.y - 15.0, pos.y) * 0.04;
        paper -= vec3(topShadow);

        // --- Subtle specular highlight (light from top-left) ---
        float specDist = length((pos / resolution - vec2(0.25, 0.85)) * vec2(1.0, 0.7));
        float specular = exp(-specDist * specDist * 6.0) * 0.02;
        paper += vec3(specular);

        vec3 color = paper;

        // --- Margin zone ---
        float marginPx = margin;
        float marginSoft = 6.0;
        float marginProgress = smoothstep(marginPx - marginSoft, marginPx + marginSoft, pos.x);
        vec3 marginTint = mix(marginColor, paper, marginProgress);
        float marginAlpha = (1.0 - marginProgress) * 0.15;
        color = mix(color, marginTint, marginAlpha);

        // --- Margin line (vertical red line) ---
        float distToMargin = abs(pos.x - marginPx);
        float marginLineAlpha = 1.0 - smoothstep(0.0, 0.8, distToMargin);
        color = mix(color, marginColor * 0.8, marginLineAlpha * 0.65);

        // --- Ruling lines ---
        float lineThick = 0.8;
        float distToLine = mod(pos.y, lineSpacing);
        if (pos.y > lineSpacing * 0.5) {
          distToLine = min(distToLine, lineSpacing - distToLine);
        }
        float lineAlpha = 1.0 - smoothstep(0.0, lineThick, distToLine);
        float lineShadowAlpha = 1.0 - smoothstep(0.0, 2.0, abs(distToLine - lineThick * 0.5));
        vec3 lineWithShadow = mix(color, lineColor * 0.7, lineShadowAlpha * 0.03);
        color = mix(lineWithShadow, lineColor, lineAlpha * lineOpacity);

        // --- Final film grain ---
        float grain = (fbm(pos * 0.4) - 0.5) * 0.025;
        color += vec3(grain);

        // --- Clamp ---
        color = clamp(color, 0.0, 1.0);

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
    gl.uniform1f(gl.getUniformLocation(this.program, 'lineSpacing'), this.config.lineSpacing * MM_TO_PX * scale);
    gl.uniform1f(gl.getUniformLocation(this.program, 'margin'), this.config.margin * MM_TO_PX * scale);
    gl.uniform3f(gl.getUniformLocation(this.program, 'lineColor'), lineColor.r, lineColor.g, lineColor.b);
    gl.uniform1f(gl.getUniformLocation(this.program, 'lineOpacity'), this.config.lineOpacity);
    gl.uniform3f(gl.getUniformLocation(this.program, 'paperColor'), paperColor.r, paperColor.g, paperColor.b);
    gl.uniform3f(gl.getUniformLocation(this.program, 'marginColor'), marginColor.r, marginColor.g, marginColor.b);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    
    const paperRgb = this.hexToRgb(this.config.paperColor);
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
