import { describe, it, expect } from 'vitest';
import { Stroke, Block, Tile, KakeamiConfig, kakeAngleOffsets } from '../models';

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

describe('kakeAngleOffsets', () => {
  it('k=1 returns [0]', () => {
    const offsets = kakeAngleOffsets(1);
    expect(offsets).toHaveLength(1);
    expect(offsets[0]).toBeCloseTo(0);
  });

  it('k=2 returns [0, π/2]', () => {
    const offsets = kakeAngleOffsets(2);
    expect(offsets).toHaveLength(2);
    expect(offsets[0]).toBeCloseTo(0);
    expect(offsets[1]).toBeCloseTo(PI / 2);
  });

  it('k=3 returns [0, π/2, π/4] (manga practice)', () => {
    const offsets = kakeAngleOffsets(3);
    expect(offsets).toHaveLength(3);
    expect(offsets[0]).toBeCloseTo(0);
    expect(offsets[1]).toBeCloseTo(PI / 2);
    expect(offsets[2]).toBeCloseTo(PI / 4);
  });

  it('k=4 returns [0, π/4, π/2, 3π/4]', () => {
    const offsets = kakeAngleOffsets(4);
    expect(offsets).toHaveLength(4);
    expect(offsets[0]).toBeCloseTo(0);
    expect(offsets[1]).toBeCloseTo(PI / 4);
    expect(offsets[2]).toBeCloseTo(PI / 2);
    expect(offsets[3]).toBeCloseTo((3 * PI) / 4);
  });

  it('k>4 falls back to equal spacing', () => {
    const offsets = kakeAngleOffsets(6);
    expect(offsets).toHaveLength(6);
    for (let j = 0; j < 6; j++) {
      expect(offsets[j]).toBeCloseTo((j * PI) / 6);
    }
  });
});

describe('Block', () => {
  it('k returns kake count', () => {
    const b = Block.standard(0, 3, 0.05);
    expect(b.k).toBe(3);
  });

  it('standard k=2 gives 0° and 90°', () => {
    const b = Block.standard(0, 2, 0.05);
    expect(b.primary.theta).toBeCloseTo(0);
    expect(b.secondary[0]!.theta).toBeCloseTo(PI / 2);
  });

  it('standard k=3 gives 0°, 90°, 45° (manga practice)', () => {
    const b = Block.standard(0, 3, 0.05);
    expect(b.strokes[0]!.theta).toBeCloseTo(0);
    expect(b.strokes[1]!.theta).toBeCloseTo(PI / 2);
    expect(b.strokes[2]!.theta).toBeCloseTo(PI / 4);
  });

  it('standard k=3 with base angle', () => {
    const b = Block.standard(PI / 6, 3, 0.05);
    expect(b.strokes[0]!.theta).toBeCloseTo(PI / 6);
    expect(b.strokes[1]!.theta).toBeCloseTo(PI / 6 + PI / 2);
    expect(b.strokes[2]!.theta).toBeCloseTo(PI / 6 + PI / 4);
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

describe('KakeamiConfig stored edges', () => {
  const tiles = [
    new Tile(0, 0, Block.standard(0, 1, 0.05)),
    new Tile(1, 0, Block.standard(PI / 4, 1, 0.05)),
    new Tile(0, 1, Block.standard(PI / 2, 1, 0.05)),
  ];
  const region: [number, number, number, number] = [0, 0, 2, 2];
  const storedEdges: [number, number][] = [[0, 1], [0, 2], [1, 2]];

  it('adjacency() returns stored edges when provided', () => {
    const config = new KakeamiConfig(tiles, region, 1, 1, 0.5, storedEdges);
    expect(config.adjacency()).toEqual(storedEdges);
  });

  it('adjacency() falls back to rect-overlap when no edges stored', () => {
    const config = new KakeamiConfig(tiles, region, 1, 1, 0.5);
    // Without stored edges, falls back to rect-overlap
    const edges = config.adjacency();
    expect(Array.isArray(edges)).toBe(true);
  });

  it('returned edges are a copy (mutation-safe)', () => {
    const config = new KakeamiConfig(tiles, region, 1, 1, 0.5, storedEdges);
    const edges1 = config.adjacency();
    edges1.push([2, 3]);
    const edges2 = config.adjacency();
    expect(edges2).toEqual(storedEdges);
  });

  it('eContrast and eLdG use stored edges', () => {
    const config = new KakeamiConfig(tiles, region, 1, 1, 0.5, storedEdges);
    // With 3 tiles at 0, PI/4, PI/2 and all pairs adjacent, metrics should be > 0
    expect(config.eContrast()).toBeGreaterThan(0);
    expect(config.eLdG()).toBeGreaterThan(0);
  });
});

describe('KakeamiConfig.cCov', () => {
  it('returns 1.0 for a tile that covers the entire region', () => {
    // Single large tile covering the 2x2 region (phi=0 → axis-aligned)
    const tiles = [new Tile(1, 1, Block.standard(0, 1, 0.05))];
    const region: [number, number, number, number] = [0, 0, 2, 2];
    const config = new KakeamiConfig(tiles, region, 2, 2, 0.5);
    expect(config.cCov()).toBeCloseTo(1.0, 1);
  });

  it('returns 0.0 for no tiles', () => {
    const config = new KakeamiConfig([], [0, 0, 2, 2], 1, 1, 0.5);
    expect(config.cCov()).toBe(0);
  });

  it('returns partial coverage for a small tile', () => {
    // 1x1 tile in a 2x2 region → ~0.25 coverage
    const tiles = [new Tile(1, 1, Block.standard(0, 1, 0.05))];
    const region: [number, number, number, number] = [0, 0, 2, 2];
    const config = new KakeamiConfig(tiles, region, 1, 1, 0.5);
    const cov = config.cCov();
    expect(cov).toBeGreaterThan(0.2);
    expect(cov).toBeLessThan(0.3);
  });
});

describe('KakeamiConfig.uVor', () => {
  it('returns 0 when no cell areas stored', () => {
    const tiles = [new Tile(0, 0, Block.standard(0, 1, 0.05))];
    const config = new KakeamiConfig(tiles, [0, 0, 2, 2], 1, 1, 0.5);
    expect(config.uVor()).toBe(0);
  });

  it('returns 0 for identical cell areas', () => {
    const tiles = [
      new Tile(0, 0, Block.standard(0, 1, 0.05)),
      new Tile(1, 0, Block.standard(0, 1, 0.05)),
    ];
    const config = new KakeamiConfig(tiles, [0, 0, 2, 2], 1, 1, 0.5, undefined, [1, 1]);
    expect(config.uVor()).toBeCloseTo(0);
  });

  it('returns positive CV for unequal cell areas', () => {
    const tiles = [
      new Tile(0, 0, Block.standard(0, 1, 0.05)),
      new Tile(1, 0, Block.standard(0, 1, 0.05)),
      new Tile(2, 0, Block.standard(0, 1, 0.05)),
    ];
    const config = new KakeamiConfig(tiles, [0, 0, 3, 3], 1, 1, 0.5, undefined, [1, 2, 3]);
    expect(config.uVor()).toBeGreaterThan(0);
  });
});
