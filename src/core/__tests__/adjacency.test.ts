import { describe, it, expect } from 'vitest';
import { buildVoronoiAdjacency } from '../adjacency';

describe('buildVoronoiAdjacency', () => {
  it('n<4 returns complete graph', () => {
    const centers: [number, number][] = [[0, 0], [1, 0], [0, 1]];
    const adj = buildVoronoiAdjacency(centers);
    expect(adj.length).toBe(3);
    // Each node connected to 2 others
    expect(adj[0]!.length).toBe(2);
    expect(adj[1]!.length).toBe(2);
    expect(adj[2]!.length).toBe(2);
  });

  it('n=2 returns complete graph', () => {
    const centers: [number, number][] = [[0, 0], [1, 0]];
    const adj = buildVoronoiAdjacency(centers);
    expect(adj[0]).toEqual([1]);
    expect(adj[1]).toEqual([0]);
  });

  it('n=1 returns empty adjacency', () => {
    const adj = buildVoronoiAdjacency([[0, 0]]);
    expect(adj[0]).toEqual([]);
  });

  it('adjacency is symmetric', () => {
    const centers: [number, number][] = [
      [0, 0], [1, 0], [2, 0], [0, 1], [1, 1],
    ];
    const adj = buildVoronoiAdjacency(centers);
    for (let i = 0; i < adj.length; i++) {
      for (const j of adj[i]!) {
        expect(adj[j]).toContain(i);
      }
    }
  });

  it('grid points have expected neighbors', () => {
    // 3x3 grid
    const centers: [number, number][] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        centers.push([x, y]);
      }
    }
    const adj = buildVoronoiAdjacency(centers);
    expect(adj.length).toBe(9);
    // Center node (1,1) = index 4 should have many neighbors
    expect(adj[4]!.length).toBeGreaterThanOrEqual(4);
  });
});
