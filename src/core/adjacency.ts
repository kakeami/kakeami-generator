/**
 * Voronoi adjacency graph via d3-delaunay.
 */

import { Delaunay } from 'd3-delaunay';

/**
 * Compute the area of each Voronoi cell, clipped to the given region.
 * Returns an array of n areas (one per centre).
 */
export function voronoiCellAreas(
  centers: [number, number][],
  region: [number, number, number, number],
): number[] {
  const n = centers.length;
  if (n === 0) return [];

  const flat = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    flat[i * 2] = centers[i]![0];
    flat[i * 2 + 1] = centers[i]![1];
  }

  const delaunay = new Delaunay(flat);
  const voronoi = delaunay.voronoi(region);

  const areas: number[] = [];
  for (let i = 0; i < n; i++) {
    const cell = voronoi.cellPolygon(i);
    areas.push(cell ? polygonArea(cell) : 0);
  }
  return areas;
}

/** Shoelace formula for polygon area. */
function polygonArea(polygon: ArrayLike<[number, number]>): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = polygon[i]!;
    const [x1, y1] = polygon[(i + 1) % n]!;
    area += x0 * y1 - x1 * y0;
  }
  return Math.abs(area) / 2;
}

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
