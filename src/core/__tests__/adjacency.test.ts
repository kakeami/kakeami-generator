import { describe, it, expect } from 'vitest';
import { buildVoronoiAdjacency, voronoiCellAreas } from '../adjacency';

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

describe('voronoiCellAreas', () => {
  it('returns one area per centre', () => {
    const centers: [number, number][] = [[1, 1], [3, 1], [1, 3], [3, 3]];
    const areas = voronoiCellAreas(centers, [0, 0, 4, 4]);
    expect(areas.length).toBe(4);
  });

  it('areas sum to region area', () => {
    const centers: [number, number][] = [[1, 1], [3, 1], [1, 3], [3, 3]];
    const region: [number, number, number, number] = [0, 0, 4, 4];
    const areas = voronoiCellAreas(centers, region);
    const totalArea = areas.reduce((a, b) => a + b, 0);
    const regionArea = (region[2] - region[0]) * (region[3] - region[1]);
    expect(totalArea).toBeCloseTo(regionArea, 1);
  });

  it('symmetric points have equal areas', () => {
    // 4 points at corners of a square → symmetric → equal Voronoi cells
    const centers: [number, number][] = [[1, 1], [3, 1], [1, 3], [3, 3]];
    const areas = voronoiCellAreas(centers, [0, 0, 4, 4]);
    for (const a of areas) {
      expect(a).toBeCloseTo(areas[0]!, 1);
    }
  });

  it('returns empty array for no centres', () => {
    expect(voronoiCellAreas([], [0, 0, 4, 4])).toEqual([]);
  });
});
