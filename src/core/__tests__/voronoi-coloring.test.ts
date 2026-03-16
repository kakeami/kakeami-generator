import { describe, it, expect } from 'vitest';
import { voronoiColoring } from '../voronoi-coloring';

const PI = Math.PI;

describe('voronoiColoring', () => {
  const region: [number, number, number, number] = [0, 0, 3, 3];

  it('is deterministic with same seed', () => {
    const a = voronoiColoring(region, 0.6, 1, 0.05, 0.5, 42);
    const b = voronoiColoring(region, 0.6, 1, 0.05, 0.5, 42);
    expect(a.tiles.length).toBe(b.tiles.length);
    for (let i = 0; i < a.tiles.length; i++) {
      expect(a.tiles[i]!.cx).toBe(b.tiles[i]!.cx);
      expect(a.tiles[i]!.cy).toBe(b.tiles[i]!.cy);
      expect(a.tiles[i]!.phi).toBe(b.tiles[i]!.phi);
    }
  });

  it('generates tiles within reasonable count', () => {
    const config = voronoiColoring(region, 0.6, 1, 0.05, 0.5, 42);
    // 3x3 region with tileSize 0.6 → expect roughly 25 tiles
    expect(config.tiles.length).toBeGreaterThan(5);
    expect(config.tiles.length).toBeLessThan(100);
  });

  it('all tile angles are in [0, π)', () => {
    const config = voronoiColoring(region, 0.6, 1, 0.05, 0.5, 42);
    for (const tile of config.tiles) {
      expect(tile.phi).toBeGreaterThanOrEqual(0);
      expect(tile.phi).toBeLessThan(PI + 1e-10);
    }
  });

  it('tile width equals height (square tiles)', () => {
    const config = voronoiColoring(region, 0.6, 1, 0.05, 0.5, 42);
    expect(config.tileWidth).toBe(config.tileHeight);
  });

  it('tile size is snapped to pitch multiple', () => {
    const pitch = 0.05;
    const config = voronoiColoring(region, 0.6, 1, pitch, 0.5, 42);
    const remainder = config.tileWidth % pitch;
    expect(Math.min(remainder, pitch - remainder)).toBeLessThan(1e-10);
  });

  it('handles k > 1', () => {
    const config = voronoiColoring(region, 0.6, 2, 0.05, 0.5, 42);
    for (const tile of config.tiles) {
      expect(tile.block.k).toBe(2);
    }
  });

  it('returns few tiles for tiny region', () => {
    const config = voronoiColoring([0, 0, 0.01, 0.01], 0.6, 1, 0.05, 0.5, 42);
    // Poisson-disk may produce 0 or 1 point in a tiny region
    expect(config.tiles.length).toBeLessThanOrEqual(1);
  });
});
