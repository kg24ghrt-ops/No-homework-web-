import { describe, it, expect } from 'vitest';
import { PAPER_STANDARDS, MM_TO_PX } from './main';

describe('PAPER_STANDARDS', () => {
  it('has A4 with correct ISO 216 dimensions', () => {
    expect(PAPER_STANDARDS.a4.width).toBe(210);
    expect(PAPER_STANDARDS.a4.height).toBe(297);
    expect(PAPER_STANDARDS.a4.name).toBe('A4');
  });

  it('has A5 with correct ISO 216 dimensions', () => {
    expect(PAPER_STANDARDS.a5.width).toBe(148);
    expect(PAPER_STANDARDS.a5.height).toBe(210);
    expect(PAPER_STANDARDS.a5.name).toBe('A5');
  });

  it('has positive line spacing and margin for both sizes', () => {
    for (const size of ['a4', 'a5'] as const) {
      expect(PAPER_STANDARDS[size].lineSpacing).toBeGreaterThan(0);
      expect(PAPER_STANDARDS[size].margin).toBeGreaterThan(0);
    }
  });

  it('A4 line spacing is larger than A5', () => {
    expect(PAPER_STANDARDS.a4.lineSpacing).toBeGreaterThan(PAPER_STANDARDS.a5.lineSpacing);
  });

  it('A4 margin is larger than A5', () => {
    expect(PAPER_STANDARDS.a4.margin).toBeGreaterThan(PAPER_STANDARDS.a5.margin);
  });
});

describe('MM_TO_PX', () => {
  it('converts mm to px at 96 DPI', () => {
    const expected = 96 / 25.4;
    expect(MM_TO_PX).toBeCloseTo(expected, 4);
  });

  it('is a positive number', () => {
    expect(MM_TO_PX).toBeGreaterThan(0);
  });
});
