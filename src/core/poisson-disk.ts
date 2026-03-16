/**
 * Bridson's Poisson-disk sampling algorithm.
 */

import type { Rng } from './math-utils';

/**
 * Generate well-spaced points within a rectangular region.
 *
 * @param region [xmin, ymin, xmax, ymax]
 * @param radius Minimum distance between points
 * @param rng Seeded random number generator
 * @param k Candidates per active point (default 30)
 */
export function poissonDisk(
  region: [number, number, number, number],
  radius: number,
  rng: Rng,
  k: number = 30,
): [number, number][] {
  const [xmin, ymin, xmax, ymax] = region;
  const width = xmax - xmin;
  const height = ymax - ymin;

  const cellSize = radius / Math.SQRT2;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);

  // Grid stores point indices, -1 = empty
  const grid = new Int32Array(rows * cols).fill(-1);
  const points: [number, number][] = [];
  const active: number[] = [];

  function toGrid(x: number, y: number): [number, number] {
    return [
      Math.floor((y - ymin) / cellSize),
      Math.floor((x - xmin) / cellSize),
    ];
  }

  // First point
  const x0 = rng.uniform(xmin, xmax);
  const y0 = rng.uniform(ymin, ymax);
  const [r0, c0] = toGrid(x0, y0);
  points.push([x0, y0]);
  grid[r0 * cols + c0] = 0;
  active.push(0);

  while (active.length > 0) {
    const idx = rng.integers(0, active.length);
    const pi = active[idx]!;
    const [px, py] = points[pi]!;
    let found = false;

    for (let attempt = 0; attempt < k; attempt++) {
      const angle = rng.uniform(0, 2 * Math.PI);
      const dist = rng.uniform(radius, 2 * radius);
      const nx = px + dist * Math.cos(angle);
      const ny = py + dist * Math.sin(angle);

      if (nx < xmin || nx >= xmax || ny < ymin || ny >= ymax) {
        continue;
      }

      const [gr, gc] = toGrid(nx, ny);

      let ok = true;
      outer:
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = gr + dr;
          const nc = gc + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const existing = grid[nr * cols + nc]!;
            if (existing >= 0) {
              const [ex, ey] = points[existing]!;
              if (Math.hypot(nx - ex, ny - ey) < radius) {
                ok = false;
                break outer;
              }
            }
          }
        }
      }

      if (ok) {
        const newIdx = points.length;
        points.push([nx, ny]);
        grid[gr * cols + gc] = newIdx;
        active.push(newIdx);
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(idx, 1);
    }
  }

  return points;
}
