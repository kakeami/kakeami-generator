/**
 * Four experimental conditions for the 2×2 comparison.
 *
 * All functions share the same signature and return a KakeamiConfig.
 */

import {
  createRng,
  poissonDisk,
  buildVoronoiAdjacency,
  adjListToEdges,
  bfsGreedyAngles,
  Block,
  Tile,
  KakeamiConfig,
} from '../../src/core';

const PI = Math.PI;

type Region = [number, number, number, number];

/** Compute actual tile size (same logic as voronoiColoring). */
function actualSize(tileSize: number, pitch: number): number {
  const expanded = tileSize * 1.4;
  return Math.max(pitch, Math.round(expanded / pitch) * pitch);
}

/** Generate n uniform-random points in the region. */
function uniformRandomPoints(
  region: Region,
  n: number,
  rng: ReturnType<typeof createRng>,
): [number, number][] {
  const [xmin, ymin, xmax, ymax] = region;
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    points.push([rng.uniform(xmin, xmax), rng.uniform(ymin, ymax)]);
  }
  return points;
}

/** Assign random angles from rng.uniform(0, PI). */
function randomAngles(
  n: number,
  rng: ReturnType<typeof createRng>,
): Float64Array {
  const thetas = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    thetas[i] = rng.uniform(0, PI);
  }
  return thetas;
}

/** Build KakeamiConfig from centers + angles + Voronoi edges. */
function buildConfig(
  centers: [number, number][],
  thetas: Float64Array,
  region: Region,
  tileSize: number,
  k: number,
  pitch: number,
  lineWeight: number,
  edges: [number, number][],
): KakeamiConfig {
  const ats = actualSize(tileSize, pitch);
  const tiles = centers.map(([cx, cy], i) =>
    new Tile(cx, cy, Block.standard(thetas[i]!, k, pitch)),
  );
  return new KakeamiConfig(tiles, region, ats, ats, lineWeight, edges);
}

export type Condition = 'poissonBfs' | 'poissonRandom' | 'randomBfs' | 'randomRandom';

/**
 * Run one of the 4 experimental conditions.
 *
 * For randomBfs / randomRandom, the tile count `n` is determined by first
 * running poissonDisk with a separate RNG so the comparison is fair.
 */
export function runCondition(
  condition: Condition,
  region: Region,
  tileSize: number,
  k: number,
  pitch: number,
  lineWeight: number,
  seed: number,
): KakeamiConfig {
  // RNG for Poisson-disk count (deterministic per seed, independent of condition RNG)
  const countRng = createRng(seed);
  const poissonCenters = poissonDisk(region, tileSize, countRng);
  const n = poissonCenters.length;

  if (n === 0) {
    return new KakeamiConfig([], region, tileSize, tileSize, lineWeight);
  }

  // Condition RNG — offset seed so it doesn't share state with countRng
  const rng = createRng(seed + 1_000_000);

  let centers: [number, number][];
  let thetas: Float64Array;

  switch (condition) {
    case 'poissonBfs': {
      centers = poissonCenters;
      const adj = buildVoronoiAdjacency(centers);
      thetas = bfsGreedyAngles(n, adj, rng);
      break;
    }
    case 'poissonRandom': {
      centers = poissonCenters;
      thetas = randomAngles(n, rng);
      break;
    }
    case 'randomBfs': {
      centers = uniformRandomPoints(region, n, rng);
      const adj = buildVoronoiAdjacency(centers);
      // Use a fresh RNG for BFS to avoid state dependency on point generation
      const bfsRng = createRng(seed + 2_000_000);
      thetas = bfsGreedyAngles(n, adj, bfsRng);
      break;
    }
    case 'randomRandom': {
      centers = uniformRandomPoints(region, n, rng);
      thetas = randomAngles(n, createRng(seed + 2_000_000));
      break;
    }
  }

  // All conditions use Voronoi adjacency so metrics match the graph BFS optimises on
  const adj = buildVoronoiAdjacency(centers);
  const edges = adjListToEdges(adj);

  return buildConfig(centers, thetas, region, tileSize, k, pitch, lineWeight, edges);
}
