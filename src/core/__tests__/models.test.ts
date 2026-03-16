import { describe, it, expect } from 'vitest';
import { Stroke, Block, Tile } from '../models';

const PI = Math.PI;

describe('Stroke', () => {
  it('normalizes theta to [0, π)', () => {
    const s = new Stroke(PI, 0.05);
    expect(s.theta).toBeCloseTo(0);
  });

  it('normalizes negative theta', () => {
    const s = new Stroke(-PI / 4, 0.05);
    expect(s.theta).toBeCloseTo((3 * PI) / 4);
  });

  it('throws for non-positive pitch', () => {
    expect(() => new Stroke(0, 0)).toThrow('pitch must be positive');
    expect(() => new Stroke(0, -1)).toThrow('pitch must be positive');
  });

  it('preserves valid theta', () => {
    const s = new Stroke(PI / 3, 0.1);
    expect(s.theta).toBeCloseTo(PI / 3);
  });
});

describe('Block', () => {
  it('k returns kake count', () => {
    const b = Block.standard(0, 3, 0.05);
    expect(b.k).toBe(3);
  });

  it('standard creates equal-angle spacing', () => {
    const b = Block.standard(0, 2, 0.05);
    expect(b.primary.theta).toBeCloseTo(0);
    expect(b.secondary[0]!.theta).toBeCloseTo(PI / 2);
  });

  it('standard k=3 gives 60° spacing', () => {
    const b = Block.standard(0, 3, 0.05);
    expect(b.strokes[0]!.theta).toBeCloseTo(0);
    expect(b.strokes[1]!.theta).toBeCloseTo(PI / 3);
    expect(b.strokes[2]!.theta).toBeCloseTo((2 * PI) / 3);
  });

  it('strokes returns all strokes', () => {
    const b = Block.standard(0, 2, 0.05);
    expect(b.strokes.length).toBe(2);
  });
});

describe('Tile', () => {
  it('phi returns primary theta', () => {
    const t = new Tile(0, 0, Block.standard(PI / 4, 1, 0.05));
    expect(t.phi).toBeCloseTo(PI / 4);
  });
});
