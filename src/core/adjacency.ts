/**
 * Voronoi adjacency graph via d3-delaunay.
 */

import { Delaunay } from 'd3-delaunay';

/**
 * Build adjacency list from Delaunay triangulation.
 * For n < 4, returns a complete graph.
 */
export function buildVoronoiAdjacency(
  centers: [number, number][],
): number[][] {
  const n = centers.length;
  const adj: number[][] = Array.from({ length: n }, () => []);

  if (n < 4) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        adj[i]!.push(j);
        adj[j]!.push(i);
      }
    }
    return adj;
  }

  const flat = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    flat[i * 2] = centers[i]![0];
    flat[i * 2 + 1] = centers[i]![1];
  }

  const delaunay = new Delaunay(flat);
  const { triangles } = delaunay;

  // Extract edges from triangles
  const seen = new Set<string>();
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]!;
    const b = triangles[t + 1]!;
    const c = triangles[t + 2]!;
    for (const [i, j] of [[a, b], [b, c], [a, c]] as [number, number][]) {
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const key = `${lo},${hi}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (lo < n && hi < n) {
          adj[lo]!.push(hi);
          adj[hi]!.push(lo);
        }
      }
    }
  }

  return adj;
}
