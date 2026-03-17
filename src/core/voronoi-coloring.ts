/**
 * Voronoi coloring algorithm — Poisson-disk + Voronoi adjacency + BFS greedy.
 */

import { dRp1, createRng } from './math-utils';
import type { Rng } from './math-utils';
import { Block, Tile, KakeamiConfig } from './models';
import { poissonDisk } from './poisson-disk';
import { buildVoronoiAdjacency } from './adjacency';

const PI = Math.PI;

/**
 * BFS greedy angle assignment on an adjacency graph.
 *
 * Starting from the highest-degree node, assigns each tile an angle from 360
 * candidates that maximises the minimum RP¹ distance to already-placed neighbours.
 * Isolated nodes get a random angle from `rng`.
 *
 * @param n Number of nodes
 * @param adj Adjacency list
 * @param rng Seeded RNG (used only for isolated nodes)
 * @returns Float64Array of angles in [0, π)
 */
export function bfsGreedyAngles(
  n: number,
  adj: number[][],
  rng: Rng,
): Float64Array {
  const thetas = new Float64Array(n).fill(-1);
  const visited = new Uint8Array(n);

  // Start from highest-degree node
  let start = 0;
  let maxDeg = 0;
  for (let i = 0; i < n; i++) {
    const deg = adj[i]!.length;
    if (deg > maxDeg) {
      maxDeg = deg;
      start = i;
    }
  }

  const queue: number[] = [start];
  let qHead = 0;
  visited[start] = 1;
  thetas[start] = 0;

  // 360 candidate angles
  const nCand = 360;
  const candidates = new Float64Array(nCand);
  for (let i = 0; i < nCand; i++) {
    candidates[i] = (i * PI) / nCand;
  }

  while (qHead < queue.length) {
    const node = queue[qHead++]!;
    for (const neighbor of adj[node]!) {
      if (visited[neighbor]) continue;
      visited[neighbor] = 1;
      queue.push(neighbor);

      // Find placed neighbors
      const placedNeighbors: number[] = [];
      for (const j of adj[neighbor]!) {
        if (thetas[j]! >= 0) {
          placedNeighbors.push(j);
        }
      }

      if (placedNeighbors.length > 0) {
        let bestTheta = candidates[0]!;
        let bestMinD = -1;
        for (let ci = 0; ci < nCand; ci++) {
          const c = candidates[ci]!;
          let minD = Infinity;
          for (const j of placedNeighbors) {
            const d = dRp1(c, thetas[j]!);
            if (d < minD) minD = d;
          }
          if (minD > bestMinD) {
            bestMinD = minD;
            bestTheta = c;
          }
        }
        thetas[neighbor] = bestTheta;
      } else {
        thetas[neighbor] = 0;
      }
    }
  }

  // Assign random angles to isolated nodes
  for (let i = 0; i < n; i++) {
    if (thetas[i]! < 0) {
      thetas[i] = rng.uniform(0, PI);
    }
  }

  return thetas;
}

/**
 * Generate a kakeami configuration using Voronoi coloring.
 *
 * @param region [xmin, ymin, xmax, ymax]
 * @param tileSize Minimum spacing for Poisson-disk sampling
 * @param k Kake count (1-4)
 * @param pitch Line spacing
 * @param lineWeight Stroke width
 * @param seed Random seed (null for random)
 */
export function voronoiColoring(
  region: [number, number, number, number],
  tileSize: number,
  k: number = 1,
  pitch: number = 0.05,
  lineWeight: number = 0.5,
  seed: number | null = null,
): KakeamiConfig {
  const actualSeed = seed ?? Math.floor(Math.random() * 100000);
  const rng = createRng(actualSeed);

  // Poisson-disk sampling
  const centers = poissonDisk(region, tileSize, rng);
  const n = centers.length;

  if (n === 0) {
    return new KakeamiConfig([], region, tileSize, tileSize, lineWeight);
  }

  // Tile size expansion for coverage guarantee
  let actualTileSize = tileSize * 1.4;
  actualTileSize = Math.max(pitch, Math.round(actualTileSize / pitch) * pitch);

  // Voronoi adjacency
  const adj = buildVoronoiAdjacency(centers);

  // BFS greedy angle assignment
  const thetas = bfsGreedyAngles(n, adj, rng);

  const tiles = centers.map(([cx, cy], i) =>
    new Tile(cx, cy, Block.standard(thetas[i]!, k, pitch)),
  );

  return new KakeamiConfig(tiles, region, actualTileSize, actualTileSize, lineWeight);
}
