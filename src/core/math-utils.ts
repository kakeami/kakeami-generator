/**
 * Mathematical utilities — RP1 distance, 2D rotation, seeded PRNG.
 */

const PI = Math.PI;

export type Point2D = [number, number];

/** RP¹ Fubini-Study distance. Range [0, π/2]. */
export function dRp1(t1: number, t2: number): number {
  const diff = ((Math.abs(t1 - t2) % PI) + PI) % PI;
  return Math.min(diff, PI - diff);
}

/** 2×2 rotation matrix as [[cos, -sin], [sin, cos]]. */
export function rotationMatrix(angle: number): [Point2D, Point2D] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[c, -s], [s, c]];
}

/** Apply 2D rotation to a point. */
export function applyRotation(mat: [Point2D, Point2D], x: number, y: number): Point2D {
  return [
    mat[0][0] * x + mat[0][1] * y,
    mat[1][0] * x + mat[1][1] * y,
  ];
}

/** Mulberry32 seeded PRNG. Returns a function that yields [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  random(): number;
  uniform(lo: number, hi: number): number;
  integers(lo: number, hi: number): number;
  normal(mean: number, std: number): number;
}

/** Create an RNG object from a seed. */
export function createRng(seed: number): Rng {
  const next = mulberry32(seed);

  let hasSpare = false;
  let spare = 0;

  return {
    random: next,
    uniform(lo: number, hi: number): number {
      return lo + next() * (hi - lo);
    },
    integers(lo: number, hi: number): number {
      return Math.floor(lo + next() * (hi - lo));
    },
    normal(mean: number, std: number): number {
      if (hasSpare) {
        hasSpare = false;
        return mean + std * spare;
      }
      let u: number, v: number, s: number;
      do {
        u = next() * 2 - 1;
        v = next() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const mul = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * mul;
      hasSpare = true;
      return mean + std * u * mul;
    },
  };
}
