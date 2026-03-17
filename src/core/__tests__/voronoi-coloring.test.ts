import { describe, it, expect } from 'vitest';
import { adjListToEdges, bfsGreedyAngles, voronoiColoring } from '../voronoi-coloring';
import { createRng } from '../math-utils';
import { dRp1 } from '../math-utils';

const PI = Math.PI;

describe('bfsGreedyAngles', () => {
  it('returns correct length', () => {
    const adj = [[1, 2], [0, 2], [0, 1]];
    const rng = createRng(42);
    const thetas = bfsGreedyAngles(3, adj, rng);
    expect(thetas.length).toBe(3);
  });

  it('all angles are in [0, π)', () => {
    const adj = [[1, 2], [0, 2], [0, 1]];
    const rng = createRng(42);
    const thetas = bfsGreedyAngles(3, adj, rng);
    for (let i = 0; i < thetas.length; i++) {
      expect(thetas[i]).toBeGreaterThanOrEqual(0);
      expect(thetas[i]).toBeLessThan(PI + 1e-10);
    }
  });

  it('maximises contrast between adjacent nodes', () => {
    // Triangle graph: each node has 2 neighbours.
    // BFS greedy should spread angles apart.
    const adj = [[1, 2], [0, 2], [0, 1]];
    const rng = createRng(42);
    const thetas = bfsGreedyAngles(3, adj, rng);
    // All pairwise RP¹ distances should be > 0
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        expect(dRp1(thetas[i]!, thetas[j]!)).toBeGreaterThan(0.1);
      }
    }
  });

  it('is deterministic with same seed', () => {
    const adj = [[1, 2, 3], [0, 2], [0, 1, 3], [0, 2]];
    const a = bfsGreedyAngles(4, adj, createRng(99));
    const b = bfsGreedyAngles(4, adj, createRng(99));
    for (let i = 0; i < 4; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it('handles isolated nodes', () => {
    // Node 2 is isolated (no edges)
    const adj = [[1], [0], []];
    const rng = createRng(42);
    const thetas = bfsGreedyAngles(3, adj, rng);
    expect(thetas[2]).toBeGreaterThanOrEqual(0);
    expect(thetas[2]).toBeLessThan(PI);
  });
});

describe('adjListToEdges', () => {
  it('converts adjacency list to canonical edge list', () => {
    // Triangle: 0-1, 0-2, 1-2
    const adj = [[1, 2], [0, 2], [0, 1]];
    const edges = adjListToEdges(adj);
    expect(edges).toEqual([[0, 1], [0, 2], [1, 2]]);
  });

  it('handles empty adjacency', () => {
    const adj = [[], [], []];
    expect(adjListToEdges(adj)).toEqual([]);
  });

  it('handles single edge', () => {
    const adj = [[1], [0]];
    expect(adjListToEdges(adj)).toEqual([[0, 1]]);
  });

  it('produces no duplicates', () => {
    const adj = [[1, 2, 3], [0], [0], [0]];
    const edges = adjListToEdges(adj);
    expect(edges).toEqual([[0, 1], [0, 2], [0, 3]]);
  });
});

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

  it('stores Voronoi edges (adjacency returns them)', () => {
    const config = voronoiColoring(region, 0.6, 1, 0.05, 0.5, 42);
    const edges = config.adjacency();
    expect(edges.length).toBeGreaterThan(0);
    // All indices must be in bounds
    for (const [i, j] of edges) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(config.tiles.length);
      expect(j).toBeGreaterThan(i);
    }
  });
});
