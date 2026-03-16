import { describe, it, expect } from 'vitest';
import {
  tilePolygon,
  hatchPolygon,
  cyrusBeckClip,
  insetConvexPolygon,
  rectMinDistance,
} from '../geometry';
import type { Point2D } from '../math-utils';

const PI = Math.PI;

describe('tilePolygon', () => {
  it('returns 4 vertices for axis-aligned tile', () => {
    const verts = tilePolygon(0, 0, 0, 2, 4);
    expect(verts.length).toBe(4);
  });

  it('axis-aligned tile has correct corners', () => {
    // phi=0: w=2, h=4, center=(0,0)
    // local: [-1,-2], [1,-2], [1,2], [-1,2]
    const verts = tilePolygon(0, 0, 0, 2, 4);
    expect(verts[0]![0]).toBeCloseTo(-1);
    expect(verts[0]![1]).toBeCloseTo(-2);
    expect(verts[2]![0]).toBeCloseTo(1);
    expect(verts[2]![1]).toBeCloseTo(2);
  });

  it('offset center shifts all vertices', () => {
    const verts = tilePolygon(5, 3, 0, 2, 2);
    for (const v of verts) {
      expect(v[0]).toBeGreaterThanOrEqual(4 - 0.01);
      expect(v[0]).toBeLessThanOrEqual(6 + 0.01);
      expect(v[1]).toBeGreaterThanOrEqual(2 - 0.01);
      expect(v[1]).toBeLessThanOrEqual(4 + 0.01);
    }
  });

  it('rotated tile preserves area', () => {
    const w = 2, h = 3;
    const verts = tilePolygon(0, 0, PI / 6, w, h);
    // Shoelace formula
    let area = 0;
    for (let i = 0; i < verts.length; i++) {
      const j = (i + 1) % verts.length;
      area += verts[i]![0] * verts[j]![1] - verts[j]![0] * verts[i]![1];
    }
    expect(Math.abs(area / 2)).toBeCloseTo(w * h);
  });
});

describe('cyrusBeckClip', () => {
  const square: Point2D[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

  it('clips a horizontal line through a square', () => {
    const seg = cyrusBeckClip(square, [-1, 0.5], [2, 0.5]);
    expect(seg).not.toBeNull();
    expect(seg![0][0]).toBeCloseTo(0);
    expect(seg![1][0]).toBeCloseTo(1);
    expect(seg![0][1]).toBeCloseTo(0.5);
  });

  it('returns null for line outside', () => {
    expect(cyrusBeckClip(square, [-1, 2], [2, 2])).toBeNull();
  });

  it('clips a diagonal line', () => {
    const seg = cyrusBeckClip(square, [-1, -1], [2, 2]);
    expect(seg).not.toBeNull();
    expect(seg![0][0]).toBeCloseTo(0);
    expect(seg![0][1]).toBeCloseTo(0);
    expect(seg![1][0]).toBeCloseTo(1);
    expect(seg![1][1]).toBeCloseTo(1);
  });

  it('handles segment fully inside', () => {
    const seg = cyrusBeckClip(square, [0.2, 0.2], [0.8, 0.8]);
    expect(seg).not.toBeNull();
    expect(seg![0][0]).toBeCloseTo(0.2);
    expect(seg![1][0]).toBeCloseTo(0.8);
  });
});

describe('hatchPolygon', () => {
  it('generates correct number of lines for unit square', () => {
    const square: Point2D[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    // Horizontal hatching (theta=0), pitch=0.25 → span=1, intervals=4 → 5 lines
    const lines = hatchPolygon(square, 0, 0.25);
    expect(lines.length).toBe(5);
  });

  it('generates fewer lines with larger pitch', () => {
    const square: Point2D[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const lines = hatchPolygon(square, 0, 0.5);
    expect(lines.length).toBe(3); // round(1/0.5)=2 intervals → 3 lines
  });

  it('margin shrinks hatching area', () => {
    const square: Point2D[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const withoutMargin = hatchPolygon(square, 0, 0.1);
    const withMargin = hatchPolygon(square, 0, 0.1, 0.05);
    expect(withMargin.length).toBeLessThanOrEqual(withoutMargin.length);
  });

  it('returns empty for collapsed margin', () => {
    const small: Point2D[] = [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]];
    const lines = hatchPolygon(small, 0, 0.05, 1.0);
    expect(lines.length).toBe(0);
  });

  it('works with rotated polygon', () => {
    // Diamond shape
    const diamond: Point2D[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const lines = hatchPolygon(diamond, 0, 0.5);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('insetConvexPolygon', () => {
  it('returns same polygon for margin=0', () => {
    const square: Point2D[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const result = insetConvexPolygon(square, 0);
    expect(result).toBe(square);
  });

  it('shrinks a square', () => {
    const square: Point2D[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const result = insetConvexPolygon(square, 0.1);
    expect(result).not.toBeNull();
    // All vertices should be within the original square
    for (const v of result!) {
      expect(v[0]).toBeGreaterThan(-0.01);
      expect(v[0]).toBeLessThan(1.01);
    }
  });

  it('returns null for too-large margin', () => {
    const square: Point2D[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    // margin > 0.5 collapses a 1x1 square (flips winding)
    const result = insetConvexPolygon(square, 0.6);
    expect(result).toBeNull();
  });
});

describe('rectMinDistance', () => {
  it('returns 0 for overlapping tiles', () => {
    const a = { cx: 0, cy: 0, phi: 0 };
    const b = { cx: 0.5, cy: 0, phi: 0 };
    const d = rectMinDistance(a, b, 2, 2);
    expect(d).toBeCloseTo(0);
  });

  it('returns positive for separated tiles', () => {
    const a = { cx: 0, cy: 0, phi: 0 };
    const b = { cx: 10, cy: 0, phi: 0 };
    const d = rectMinDistance(a, b, 1, 1);
    expect(d).toBeGreaterThan(8);
  });

  it('touching tiles have distance ~0', () => {
    // Two 2×2 tiles centered at (0,0) and (2,0) with phi=0
    const a = { cx: 0, cy: 0, phi: 0 };
    const b = { cx: 2, cy: 0, phi: 0 };
    const d = rectMinDistance(a, b, 2, 2);
    expect(d).toBeLessThan(0.01);
  });
});
