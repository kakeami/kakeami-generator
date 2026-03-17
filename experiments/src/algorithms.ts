/**
 * Five experimental conditions: 2×2 factorial + checkerboard diagnostic.
 *
 * All functions share the same signature and return a KakeamiConfig.
 */

import {
  createRng,
  poissonDisk,
  buildVoronoiAdjacency,
  voronoiCellAreas,
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

/** Generate grid centres with checkerboard 0°/90° angles. */
function gridCheckerboardCenters(
  region: Region,
  tileSize: number,
): { centers: [number, number][]; thetas: Float64Array } {
  const [xmin, ymin, xmax, ymax] = region;
  const regionWidth = xmax - xmin;
  const regionHeight = ymax - ymin;
  const nCols = Math.floor(regionWidth / tileSize);
  const nRows = Math.floor(regionHeight / tileSize);
  const stepX = regionWidth / nCols;
  const stepY = regionHeight / nRows;
  const centers: [number, number][] = [];
  const angles: number[] = [];
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      centers.push([xmin + (col + 0.5) * stepX, ymin + (row + 0.5) * stepY]);
      angles.push((row + col) % 2 === 0 ? 0 : PI / 2);
    }
  }
  return { centers, thetas: Float64Array.from(angles) };
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

/** Build KakeamiConfig from centers + angles + Voronoi edges + cell areas. */
function buildConfig(
  centers: [number, number][],
  thetas: Float64Array,
  region: Region,
  tileSize: number,
  k: number,
  pitch: number,
  lineWeight: number,
  edges: [number, number][],
  cellAreas: number[],
): KakeamiConfig {
  const ats = actualSize(tileSize, pitch);
  const tiles = centers.map(([cx, cy], i) =>
    new Tile(cx, cy, Block.standard(thetas[i]!, k, pitch)),
  );
  return new KakeamiConfig(tiles, region, ats, ats, lineWeight, edges, cellAreas);
}

export type Condition = 'poissonBfs' | 'poissonRandom' | 'randomBfs' | 'randomRandom' | 'gridCheckerboard';

/**
 * Run one of the 5 experimental conditions.
 *
 * For randomBfs / randomRandom, the tile count `n` is determined by first
 * running poissonDisk with a separate RNG so the comparison is fair.
 * gridCheckerboard is deterministic and ignores the seed.
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
  // gridCheckerboard is deterministic — no seed-dependent RNG needed
  if (condition === 'gridCheckerboard') {
    const { centers, thetas } = gridCheckerboardCenters(region, tileSize);
    if (centers.length === 0) {
      return new KakeamiConfig([], region, tileSize, tileSize, lineWeight);
    }
    const adj = buildVoronoiAdjacency(centers);
    const edges = adjListToEdges(adj);
    const cellAreas = voronoiCellAreas(centers, region);
    return buildConfig(centers, thetas, region, tileSize, k, pitch, lineWeight, edges, cellAreas);
  }

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
  const cellAreas = voronoiCellAreas(centers, region);

  return buildConfig(centers, thetas, region, tileSize, k, pitch, lineWeight, edges, cellAreas);
}
