/**
 * Paper configuration module.
 *
 * Centralizes ISO 216 paper standards (A4/A5), unit conversions, and the
 * notebook rendering configuration shape. Rendering logic lives in the
 * renderer; this module only owns the data contract.
 */

// DPI for display conversion
export const DPI = 96; // Standard screen DPI
export const MM_TO_PX = DPI / 25.4; // 1mm = 3.7795px at 96 DPI

// Universal Paper Standards (ISO 216)
export const PAPER_STANDARDS = {
  a4: {
    width: 210, // mm
    height: 297, // mm
    name: 'A4',
    lineSpacing: 8, // mm (standard for most notebooks)
    margin: 20, // mm (left margin for ruling)
    rulingStandard: 'German DIN'
  },
  a5: {
    width: 148, // mm
    height: 210, // mm
    name: 'A5',
    lineSpacing: 6, // mm (slightly smaller for A5)
    margin: 15, // mm
    rulingStandard: 'German DIN'
  }
} as const;

export type PaperSize = keyof typeof PAPER_STANDARDS;

export interface NotebookConfig {
  paperSize: PaperSize;
  lineSpacing: number; // mm
  margin: number; // mm
  lineColor: string;
  lineOpacity: number;
  paperColor: string;
  marginColor: string;
  rulingStandard: string;
}

export function createDefaultConfig(): NotebookConfig {
  return {
    paperSize: 'a4',
    lineSpacing: PAPER_STANDARDS.a4.lineSpacing,
    margin: PAPER_STANDARDS.a4.margin,
    lineColor: '#4a90e2',
    lineOpacity: 0.3,
    paperColor: '#f9f7f1',
    marginColor: '#d32f2f',
    rulingStandard: PAPER_STANDARDS.a4.rulingStandard
  };
}

/** Convert a hex color (e.g. "#4a90e2") to normalized RGB (0..1). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
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
