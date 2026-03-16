import { describe, it, expect } from 'vitest';
import { poissonDisk } from '../poisson-disk';
import { createRng } from '../math-utils';

describe('poissonDisk', () => {
  const region: [number, number, number, number] = [0, 0, 5, 5];
  const radius = 0.5;

  it('is deterministic with same seed', () => {
    const a = poissonDisk(region, radius, createRng(42));
    const b = poissonDisk(region, radius, createRng(42));
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]![0]).toBe(b[i]![0]);
      expect(a[i]![1]).toBe(b[i]![1]);
    }
  });

  it('all points are within region', () => {
    const points = poissonDisk(region, radius, createRng(42));
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(5);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(5);
    }
  });

  it('maintains minimum distance between points', () => {
    const points = poissonDisk(region, radius, createRng(42));
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i]![0] - points[j]![0];
        const dy = points[i]![1] - points[j]![1];
        const dist = Math.hypot(dx, dy);
        expect(dist).toBeGreaterThanOrEqual(radius - 1e-6);
      }
    }
  });

  it('generates reasonable number of points', () => {
    const points = poissonDisk(region, radius, createRng(42));
    // For a 5x5 region with radius 0.5, expect roughly 25/(0.5^2 * pi/4) ≈ ~130 points
    expect(points.length).toBeGreaterThan(20);
    expect(points.length).toBeLessThan(500);
  });
});
