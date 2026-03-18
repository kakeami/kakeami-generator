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
 * Convert edge list → adjacency list (inverse of adjListToEdges).
 */
export function edgesToAdjList(
  edges: readonly [number, number][],
  n: number,
): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [i, j] of edges) {
    adj[i]!.push(j);
    adj[j]!.push(i);
  }
  return adj;
}

/**
 * Enumerate all pairs at exactly graph distance k.
 * Returns canonical [i,j] pairs (i<j), deduplicated.
 */
export function kHopPairs(
  edges: readonly [number, number][],
  n: number,
  k: number,
): [number, number][] {
  if (n === 0 || k <= 0) return [];
  const adj = edgesToAdjList(edges, n);
  const seen = new Set<string>();
  const result: [number, number][] = [];

  for (let src = 0; src < n; src++) {
    // BFS from src
    const dist = new Int32Array(n).fill(-1);
    dist[src] = 0;
    const queue = [src];
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++]!;
      if (dist[u]! >= k) break;
      for (const v of adj[u]!) {
        if (dist[v] === -1) {
          dist[v] = dist[u]! + 1;
          queue.push(v);
        }
      }
    }
    // Collect distance-k nodes
    for (let v = src + 1; v < n; v++) {
      if (dist[v] === k) {
        const key = `${src},${v}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push([src, v]);
        }
      }
    }
  }
  return result;
}

/**
 * Build adjacency list from Delaunay triangulation.
 * For n < 4, returns a complete graph.
 */
/**
 * Single BFS pass per node, grouping all pairs by graph distance up to kMax.
 * Returns Map<k, [i,j][]> with canonical pairs (i<j), no duplicates.
 */
export function allPairsByDistance(
  edges: readonly [number, number][],
  n: number,
  kMax: number = 15,
): Map<number, [number, number][]> {
  const result = new Map<number, [number, number][]>();
  if (n === 0) return result;
  const adj = edgesToAdjList(edges, n);

  for (let src = 0; src < n; src++) {
    const dist = new Int32Array(n).fill(-1);
    dist[src] = 0;
    const queue = [src];
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++]!;
      if (dist[u]! >= kMax) break;
      for (const v of adj[u]!) {
        if (dist[v] === -1) {
          dist[v] = dist[u]! + 1;
          queue.push(v);
        }
      }
    }
    for (let v = src + 1; v < n; v++) {
      const d = dist[v]!;
      if (d >= 1 && d <= kMax) {
        let arr = result.get(d);
        if (!arr) {
          arr = [];
          result.set(d, arr);
        }
        arr.push([src, v]);
      }
    }
  }
  return result;
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
