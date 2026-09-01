/// <reference types="vite/client" />

// Type declarations for external modules without types
declare module 'atrament' {
  const MODE_DISABLED: string;
  const MODE_DRAW: string;
  const MODE_ERASE: string;
  const MODE_FILL: string;
  
  interface AtramentOptions {
    color?: string;
    weight?: number;
    smoothing?: number;
    adaptiveStroke?: boolean;
    fill?: any;
    width?: number;
    height?: number;
  }
  
  class Atrament {
    constructor(canvas: HTMLCanvasElement | string, options?: AtramentOptions);
    beginStroke(x: number, y: number): void;
    endStroke(x: number, y: number): void;
    draw(x: number, y: number, prevX: number, prevY: number, pressure?: number): { x: number; y: number };
    clear(): void;
    destroy(): void;
    get color(): string;
    set color(value: string);
    get weight(): number;
    set weight(value: number);
    get mode(): string;
    set mode(value: string);
    get currentStroke(): any;
    get dirty(): boolean;
    addEventListener(event: string, callback: (data: any) => void): void;
    removeEventListener(event: string, callback: (data: any) => void): void;
    dispatchEvent(event: string, data: any): void;
  }
  
  export { MODE_DISABLED, MODE_DRAW, MODE_ERASE, MODE_FILL };
  export default Atrament;
}

declare module 'handwritten.js' {
  export function setup(options?: any): Promise<void>;
  export function recognize(canvas: HTMLCanvasElement, options?: any): Promise<string>;
}

declare module 'simplex-noise' {
  export function createNoise2D(): (x: number, y: number) => number;
  export function createNoise3D(): (x: number, y: number, z: number) => number;
  export function createNoise4D(): (x: number, y: number, z: number, w: number) => number;
}

// Global types for window object
declare global {
  interface Window {
    notebookRenderer: any;
  }
}
