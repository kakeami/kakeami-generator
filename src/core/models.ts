/**
 * Data structures: Stroke, Block, Tile, KakeamiConfig + quality metrics.
 */

import { dRp1 } from './math-utils';
import { rectMinDistance } from './geometry';

const PI = Math.PI;

/**
 * Angle offsets for k-kake hatching following manga practice:
 *   k=1: θ
 *   k=2: θ, θ+90°
 *   k=3: θ, θ+90°, θ+45°  (primary → perpendicular → diagonal)
 *   k=4: θ, θ+45°, θ+90°, θ+135°
 */
export function kakeAngleOffsets(k: number): number[] {
  switch (k) {
    case 1: return [0];
    case 2: return [0, PI / 2];
    case 3: return [0, PI / 2, PI / 4];
    case 4: return [0, PI / 4, PI / 2, (3 * PI) / 4];
    default: {
      const offsets: number[] = [];
      for (let j = 0; j < k; j++) offsets.push((j * PI) / k);
      return offsets;
    }
  }
}

/** Normalize angle to [0, π). */
function normAngle(theta: number): number {
  return ((theta % PI) + PI) % PI;
}

/** One hatch layer σ = (θ, δ) */
export class Stroke {
  readonly theta: number;
  readonly pitch: number;

  constructor(theta: number, pitch: number) {
    if (pitch <= 0) {
      throw new Error(`pitch must be positive, got ${pitch}`);
    }
    this.theta = normAngle(theta);
    this.pitch = pitch;
  }
}

/** Tile appearance β = (σ_prim, {σ₂, ...}) */
export class Block {
  readonly primary: Stroke;
  readonly secondary: readonly Stroke[];

  constructor(primary: Stroke, secondary: readonly Stroke[] = []) {
    this.primary = primary;
    this.secondary = secondary;
  }

  /** Kake count */
  get k(): number {
    return 1 + this.secondary.length;
  }

  /** All strokes (primary + secondary) */
  get strokes(): readonly Stroke[] {
    return [this.primary, ...this.secondary];
  }

  /** Standard block β_std(θ, k, δ) with manga-practice angle spacing. */
  static standard(theta: number, k: number, pitch: number): Block {
    const offsets = kakeAngleOffsets(k);
    const primary = new Stroke(theta, pitch);
    const secondary = offsets.slice(1).map(o => new Stroke(theta + o, pitch));
    return new Block(primary, secondary);
  }
}

/** Placed tile τ = (c, β) */
export class Tile {
  readonly cx: number;
  readonly cy: number;
  readonly block: Block;

  constructor(cx: number, cy: number, block: Block) {
    this.cx = cx;
    this.cy = cy;
    this.block = block;
  }

  /** Tile orientation φ = θ_prim */
  get phi(): number {
    return this.block.primary.theta;
  }
}

/** Kakeami configuration K = {τ₁, ..., τ_n} */
export class KakeamiConfig {
  readonly tiles: readonly Tile[];
  readonly region: [number, number, number, number];
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly lineWeight: number;

  constructor(
    tiles: readonly Tile[],
    region: [number, number, number, number],
    tileWidth: number,
    tileHeight: number,
    lineWeight: number = 0.5,
  ) {
    if (tileHeight < tileWidth) {
      throw new Error(
        `tileHeight (${tileHeight}) must be >= tileWidth (${tileWidth})`,
      );
    }
    this.tiles = tiles;
    this.region = region;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.lineWeight = lineWeight;
  }

  /** Adjacency graph edges. Pairs where rect distance < eps. */
  adjacency(eps: number = 1e-6): [number, number][] {
    const edges: [number, number][] = [];
    const n = this.tiles.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = rectMinDistance(
          this.tiles[i]!,
          this.tiles[j]!,
          this.tileWidth,
          this.tileHeight,
        );
        if (d < eps) {
          edges.push([i, j]);
        }
      }
    }
    return edges;
  }

  /** §4.1 Angle contrast E_contrast ∈ [0, 1] */
  eContrast(): number {
    const edges = this.adjacency();
    if (edges.length === 0) return 0;
    let total = 0;
    for (const [i, j] of edges) {
      total += dRp1(this.tiles[i]!.phi, this.tiles[j]!.phi);
    }
    return (2 / (PI * edges.length)) * total;
  }

  /** §4.3 Discrete Landau-de Gennes energy E_LdG ∈ [0, 1] */
  eLdG(): number {
    const edges = this.adjacency();
    if (edges.length === 0) return 0;
    let total = 0;
    for (const [i, j] of edges) {
      total += Math.sin(this.tiles[i]!.phi - this.tiles[j]!.phi) ** 2;
    }
    return total / edges.length;
  }

  /** §6.3 Scalar order parameter S ∈ [0, 1] */
  sOrder(): number {
    const n = this.tiles.length;
    if (n === 0) return 0;
    let sumCos = 0;
    let sumSin = 0;
    for (const t of this.tiles) {
      sumCos += Math.cos(2 * t.phi);
      sumSin += Math.sin(2 * t.phi);
    }
    return Math.sqrt((sumCos / n) ** 2 + (sumSin / n) ** 2);
  }
}
