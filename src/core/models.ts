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
  private readonly _edges: readonly [number, number][] | null;
  private readonly _cellAreas: readonly number[] | null;

  constructor(
    tiles: readonly Tile[],
    region: [number, number, number, number],
    tileWidth: number,
    tileHeight: number,
    lineWeight: number = 0.5,
    edges?: readonly [number, number][],
    cellAreas?: readonly number[],
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
    this._edges = edges ?? null;
    this._cellAreas = cellAreas ?? null;
  }

  /** Adjacency graph edges. Uses stored Voronoi edges if available, else rect-overlap fallback. */
  adjacency(eps: number = 1e-6): [number, number][] {
    if (this._edges !== null) {
      return this._edges.slice() as [number, number][];
    }
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

  /** Coverage ratio C_cov ∈ [0, 1]. Fraction of region covered by at least one tile. */
  cCov(gridRes: number = 200): number {
    const [xmin, ymin, xmax, ymax] = this.region;
    const n = this.tiles.length;
    if (n === 0) return 0;

    const hw = this.tileWidth / 2;
    const hh = this.tileHeight / 2;

    // Pre-compute cos/sin for each tile
    const cosP = new Float64Array(n);
    const sinP = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      cosP[i] = Math.cos(this.tiles[i]!.phi);
      sinP[i] = Math.sin(this.tiles[i]!.phi);
    }

    let covered = 0;
    const dx = (xmax - xmin) / gridRes;
    const dy = (ymax - ymin) / gridRes;

    for (let gi = 0; gi < gridRes; gi++) {
      const px = xmin + (gi + 0.5) * dx;
      for (let gj = 0; gj < gridRes; gj++) {
        const py = ymin + (gj + 0.5) * dy;

        let hit = false;
        for (let t = 0; t < n; t++) {
          const tile = this.tiles[t]!;
          const rx = px - tile.cx;
          const ry = py - tile.cy;
          // Rotate into tile-local coordinates (rotate by -phi)
          const lx = rx * cosP[t]! + ry * sinP[t]!;
          const ly = -rx * sinP[t]! + ry * cosP[t]!;
          if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
            hit = true;
            break;
          }
        }
        if (hit) covered++;
      }
    }

    return covered / (gridRes * gridRes);
  }

  /** Voronoi cell area CV (coefficient of variation). Uses stored cell areas. */
  uVor(): number {
    if (this._cellAreas === null || this._cellAreas.length < 2) return 0;
    const areas = this._cellAreas;
    const n = areas.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += areas[i]!;
    const mean = sum / n;
    if (mean < 1e-12) return 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += (areas[i]! - mean) ** 2;
    const std = Math.sqrt(sumSq / (n - 1));
    return std / mean;
  }

  /** Normalised Shannon entropy of primary-angle distribution H_angle ∈ [0, 1]. */
  hAngle(nBins: number = 12): number {
    const n = this.tiles.length;
    if (n === 0) return 0;
    const counts = new Array<number>(nBins).fill(0);
    for (const t of this.tiles) {
      const bin = Math.min(Math.floor(t.phi / PI * nBins), nBins - 1);
      counts[bin]!++;
    }
    let h = 0;
    for (let i = 0; i < nBins; i++) {
      const c = counts[i]!;
      if (c > 0) {
        const p = c / n;
        h -= p * Math.log(p);
      }
    }
    return Math.log(nBins) > 0 ? h / Math.log(nBins) : 0;
  }
}
