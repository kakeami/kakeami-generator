/**
 * Generate example SVGs demonstrating two axes of generalisation:
 *   1. Rectangular tiles + non-line fill (stipple/dot pattern)
 *   2. Non-rectangular tiles (Voronoi cells) individually hatched
 *
 * Uses the same voronoiColoring pipeline from core/.
 * Outputs pure SVG strings (no DOM required).
 *
 * Usage:  npx tsx experiments/scripts/generate-pattern-svgs.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Delaunay } from 'd3-delaunay';
import {
  voronoiColoring,
  tilePolygon,
  hatchPolygon,
  kakeAngleOffsets,
  poissonDisk,
  buildVoronoiAdjacency,
  bfsGreedyAngles,
  createRng,
  Stroke,
  Block,
  Tile,
  KakeamiConfig,
} from '../../src/core/index';
import type { Segment, Point2D } from '../../src/core/index';

// Fixed parameters matching the experiment setup
const REGION: [number, number, number, number] = [0, 0, 6, 6];
const TILE_SIZE = 0.6;
const K_STIPPLE = 1;
const K_VORONOI = 1;
const PITCH = 0.08;
const LINE_WEIGHT = 0.4;
const SEED = 42;

const [xmin, ymin, xmax, ymax] = REGION;
const width = xmax - xmin;
const height = ymax - ymin;
const strokeScale = Math.min(width, height) / 450;
const sw = LINE_WEIGHT * strokeScale;
const dotRadius = PITCH * 0.35;

// --- Generate kakeami configs ---
const configStipple = voronoiColoring(REGION, TILE_SIZE, K_STIPPLE, PITCH, LINE_WEIGHT, SEED);
const configVoronoi = voronoiColoring(REGION, TILE_SIZE, K_VORONOI, PITCH, LINE_WEIGHT, SEED);

// =====================================================================
// Figure 1: Rectangular tiles + stipple (dot) fill
// =====================================================================

/**
 * Place dots along hatch lines within a polygon.
 * Dots are placed at regular intervals along each hatch segment,
 * so the dot alignment reveals the tile's primary angle.
 */
function stippleSegment(seg: Segment, spacing: number, r: number): string[] {
  const [p0, p1] = seg;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [];

  const nDots = Math.max(1, Math.floor(len / spacing));
  const circles: string[] = [];
  for (let i = 0; i <= nDots; i++) {
    const t = nDots === 0 ? 0.5 : i / nDots;
    const x = p0[0] + dx * t;
    const y = p0[1] + dy * t;
    circles.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="black"/>`);
  }
  return circles;
}

function buildStippleSvg(): string {
  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${xmin} ${ymin} ${width} ${height}" width="400" height="400">`);
  lines.push(`  <rect x="${xmin}" y="${ymin}" width="${width}" height="${height}" fill="white"/>`);

  // Background stipple
  const regionPoly: Point2D[] = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]];
  const bgAngle = Math.PI / 4;
  const bgOffsets = kakeAngleOffsets(K_STIPPLE);
  lines.push('  <g class="bg-hatching">');
  for (let j = 0; j < K_STIPPLE; j++) {
    const angle = bgAngle + bgOffsets[j]!;
    const bgSegs = hatchPolygon(regionPoly, angle, PITCH);
    for (const seg of bgSegs) {
      const dots = stippleSegment(seg, PITCH * 0.8, dotRadius);
      lines.push(...dots.map(d => `    ${d}`));
    }
  }
  lines.push('  </g>');

  // Tile stipple fills
  for (const tile of configStipple.tiles) {
    const poly = tilePolygon(tile.cx, tile.cy, tile.phi, configStipple.tileWidth, configStipple.tileHeight);
    const polyPoints = poly.map(p => `${p[0]},${p[1]}`).join(' ');

    lines.push('  <g class="tile">');
    lines.push(`    <polygon points="${polyPoints}" fill="white" stroke="none"/>`);

    for (const stroke of tile.block.strokes) {
      const segs = hatchPolygon(poly, stroke.theta, stroke.pitch);
      for (const seg of segs) {
        const dots = stippleSegment(seg, PITCH * 0.8, dotRadius);
        lines.push(...dots.map(d => `    ${d}`));
      }
    }
    lines.push('  </g>');
  }

  lines.push('</svg>');
  return lines.join('\n');
}

// =====================================================================
// Figure 2: Voronoi-cell tiles (non-rectangular), individually hatched
// =====================================================================

function buildVoronoiSvg(): string {
  // Reconstruct Voronoi cells from the tile centers
  const centers = configVoronoi.tiles.map(t => [t.cx, t.cy] as [number, number]);
  const delaunay = Delaunay.from(centers);
  const voronoi = delaunay.voronoi([xmin, ymin, xmax, ymax]);

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${xmin} ${ymin} ${width} ${height}" width="400" height="400">`);
  lines.push(`  <rect x="${xmin}" y="${ymin}" width="${width}" height="${height}" fill="white"/>`);

  // Background hatching (standard lines)
  const regionPoly: Point2D[] = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]];
  const bgAngle = Math.PI / 4;
  const bgOffsets = kakeAngleOffsets(K_VORONOI);
  lines.push('  <g class="bg-hatching">');
  for (let j = 0; j < K_VORONOI; j++) {
    const angle = bgAngle + bgOffsets[j]!;
    const bgSegs = hatchPolygon(regionPoly, angle, PITCH);
    for (const [p0, p1] of bgSegs) {
      lines.push(`    <line x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke="black" stroke-width="${sw}" stroke-linecap="round"/>`);
    }
  }
  lines.push('  </g>');

  // Each Voronoi cell = one tile, hatched individually
  for (let i = 0; i < configVoronoi.tiles.length; i++) {
    const cellPoly = voronoi.cellPolygon(i);
    if (!cellPoly) continue;

    // cellPolygon returns a closed polygon (first == last); remove last
    const poly: Point2D[] = cellPoly.slice(0, -1).map(p => [p[0], p[1]] as Point2D);
    const polyPoints = poly.map(p => `${p[0]},${p[1]}`).join(' ');

    const tile = configVoronoi.tiles[i]!;

    lines.push('  <g class="tile">');
    // White fill to occlude background
    lines.push(`    <polygon points="${polyPoints}" fill="white" stroke="none"/>`);

    // Hatch this Voronoi cell with the tile's assigned angles
    for (const stroke of tile.block.strokes) {
      const segs = hatchPolygon(poly, stroke.theta, stroke.pitch);
      for (const [p0, p1] of segs) {
        lines.push(`    <line x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke="black" stroke-width="${sw}" stroke-linecap="round"/>`);
      }
    }
    lines.push('  </g>');
  }

  lines.push('</svg>');
  return lines.join('\n');
}

// --- Generate and write ---

const stippleSvg = buildStippleSvg();
const voronoiSvg = buildVoronoiSvg();

const outDir = path.resolve(import.meta.dirname, '../../public/experiments/assets');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'pattern-stipple.svg'), stippleSvg, 'utf-8');
fs.writeFileSync(path.join(outDir, 'pattern-voronoi.svg'), voronoiSvg, 'utf-8');

// Clean up old files
for (const old of ['pattern-zigzag.svg', 'pattern-wave.svg']) {
  const p = path.join(outDir, old);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`Removed: ${p}`);
  }
}

console.log(`Generated: ${path.join(outDir, 'pattern-stipple.svg')}`);
console.log(`Generated: ${path.join(outDir, 'pattern-voronoi.svg')}`);
