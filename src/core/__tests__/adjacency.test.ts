import { describe, it, expect } from 'vitest';
import { buildVoronoiAdjacency, voronoiCellAreas, edgesToAdjList, kHopPairs, allPairsByDistance } from '../adjacency';

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

describe('edgesToAdjList', () => {
  it('converts edges to adjacency list', () => {
    const edges: [number, number][] = [[0, 1], [1, 2]];
    const adj = edgesToAdjList(edges, 3);
    expect(adj[0]).toEqual([1]);
    expect(adj[1]).toEqual([0, 2]);
    expect(adj[2]).toEqual([1]);
  });

  it('returns empty lists for no edges', () => {
    const adj = edgesToAdjList([], 3);
    expect(adj).toEqual([[], [], []]);
  });

  it('roundtrips with adjListToEdges-like structure', () => {
    // Triangle: 0-1, 0-2, 1-2
    const edges: [number, number][] = [[0, 1], [0, 2], [1, 2]];
    const adj = edgesToAdjList(edges, 3);
    expect(adj[0]!.sort()).toEqual([1, 2]);
    expect(adj[1]!.sort()).toEqual([0, 2]);
    expect(adj[2]!.sort()).toEqual([0, 1]);
  });
});

describe('kHopPairs', () => {
  it('linear chain: distance-1 pairs', () => {
    // 0-1-2-3
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3]];
    const pairs = kHopPairs(edges, 4, 1);
    expect(pairs.sort()).toEqual([[0, 1], [1, 2], [2, 3]]);
  });

  it('linear chain: distance-2 pairs', () => {
    // 0-1-2-3
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3]];
    const pairs = kHopPairs(edges, 4, 2);
    expect(pairs.sort()).toEqual([[0, 2], [1, 3]]);
  });

  it('linear chain: distance-3 pairs', () => {
    // 0-1-2-3
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3]];
    const pairs = kHopPairs(edges, 4, 3);
    expect(pairs).toEqual([[0, 3]]);
  });

  it('triangle: no distance-2 pairs', () => {
    // Complete K3: 0-1, 0-2, 1-2 → all at distance 1
    const edges: [number, number][] = [[0, 1], [0, 2], [1, 2]];
    const pairs = kHopPairs(edges, 3, 2);
    expect(pairs).toEqual([]);
  });

  it('4-cycle: distance-2 pairs are diagonals', () => {
    // 0-1-2-3-0
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [0, 3]];
    const pairs = kHopPairs(edges, 4, 2);
    expect(pairs.sort()).toEqual([[0, 2], [1, 3]]);
  });

  it('empty graph returns empty', () => {
    expect(kHopPairs([], 0, 1)).toEqual([]);
    expect(kHopPairs([], 3, 1)).toEqual([]);
  });

  it('k=0 returns empty', () => {
    const edges: [number, number][] = [[0, 1]];
    expect(kHopPairs(edges, 2, 0)).toEqual([]);
  });
});

describe('allPairsByDistance', () => {
  it('linear chain: k=1→3 pairs, k=2→2 pairs, k=3→1 pair', () => {
    // 0-1-2-3
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3]];
    const result = allPairsByDistance(edges, 4);
    expect(result.get(1)!.sort()).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(result.get(2)!.sort()).toEqual([[0, 2], [1, 3]]);
    expect(result.get(3)).toEqual([[0, 3]]);
  });

  it('triangle (K3): only k=1', () => {
    const edges: [number, number][] = [[0, 1], [0, 2], [1, 2]];
    const result = allPairsByDistance(edges, 3);
    expect(result.get(1)!.sort()).toEqual([[0, 1], [0, 2], [1, 2]]);
    expect(result.has(2)).toBe(false);
  });

  it('empty/single node: empty map', () => {
    expect(allPairsByDistance([], 0).size).toBe(0);
    expect(allPairsByDistance([], 1).size).toBe(0);
  });

  it('kMax truncation: chain with kMax=2 omits k=3', () => {
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3]];
    const result = allPairsByDistance(edges, 4, 2);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.has(3)).toBe(false);
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
