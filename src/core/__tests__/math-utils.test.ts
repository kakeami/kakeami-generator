import { describe, it, expect } from 'vitest';
import { dRp1, rotationMatrix, applyRotation, mulberry32, createRng } from '../math-utils';

const PI = Math.PI;

describe('dRp1', () => {
  it('returns 0 for identical angles', () => {
    expect(dRp1(0, 0)).toBeCloseTo(0);
    expect(dRp1(1.0, 1.0)).toBeCloseTo(0);
  });

  it('is symmetric', () => {
    expect(dRp1(0.3, 1.2)).toBeCloseTo(dRp1(1.2, 0.3));
  });

  it('returns π/2 for maximum distance', () => {
    expect(dRp1(0, PI / 2)).toBeCloseTo(PI / 2);
  });

  it('treats 0 and π as identical', () => {
    expect(dRp1(0, PI)).toBeCloseTo(0);
  });

  it('handles boundary values', () => {
    expect(dRp1(0, 0)).toBeCloseTo(0);
    expect(dRp1(0, PI / 2)).toBeCloseTo(PI / 2);
    expect(dRp1(0, PI)).toBeCloseTo(0);
  });

  it('handles negative angles', () => {
    expect(dRp1(-0.5, 0.5)).toBeCloseTo(dRp1(PI - 0.5, 0.5));
  });

  it('range is [0, π/2]', () => {
    for (let i = 0; i < 100; i++) {
      const a = Math.random() * 2 * PI;
      const b = Math.random() * 2 * PI;
      const d = dRp1(a, b);
      expect(d).toBeGreaterThanOrEqual(-1e-10);
      expect(d).toBeLessThanOrEqual(PI / 2 + 1e-10);
    }
  });
});

describe('rotationMatrix + applyRotation', () => {
  it('identity for angle=0', () => {
    const R = rotationMatrix(0);
    const [x, y] = applyRotation(R, 1, 0);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
  });

  it('rotates 90°', () => {
    const R = rotationMatrix(PI / 2);
    const [x, y] = applyRotation(R, 1, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });

  it('rotates 180°', () => {
    const R = rotationMatrix(PI);
    const [x, y] = applyRotation(R, 1, 0);
    expect(x).toBeCloseTo(-1);
    expect(y).toBeCloseTo(0);
  });
});

describe('mulberry32', () => {
  it('is deterministic for same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    // At least one of the first 5 values should differ
    let allSame = true;
    for (let i = 0; i < 5; i++) {
      if (a() !== b()) allSame = false;
    }
    expect(allSame).toBe(false);
  });
});

describe('createRng', () => {
  it('uniform returns values in range', () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.uniform(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
    }
  });

  it('integers returns integers in range', () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.integers(0, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(v).toBe(Math.floor(v));
    }
  });

  it('normal produces reasonable values', () => {
    const rng = createRng(42);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      sum += rng.normal(0, 1);
    }
    // Mean should be close to 0
    expect(Math.abs(sum / n)).toBeLessThan(0.1);
  });
});
