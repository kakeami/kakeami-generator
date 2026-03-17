/**
 * Generate example SVGs demonstrating pattern-agnostic tile filling.
 *
 * Uses the same voronoiColoring + tilePolygon + hatchPolygon pipeline from core/,
 * but converts the straight-line segments into zigzag and wave patterns.
 * Outputs pure SVG strings (no DOM required).
 *
 * Usage:  npx tsx experiments/scripts/generate-pattern-svgs.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  voronoiColoring,
  tilePolygon,
  hatchPolygon,
  kakeAngleOffsets,
} from '../../src/core/index';
import type { Segment, Point2D } from '../../src/core/index';

// Fixed parameters matching the experiment setup
const REGION: [number, number, number, number] = [0, 0, 6, 6];
const TILE_SIZE = 0.6;
const K = 2;
const PITCH = 0.08;
const LINE_WEIGHT = 0.4;
const SEED = 42;

const [xmin, ymin, xmax, ymax] = REGION;
const width = xmax - xmin;
const height = ymax - ymin;
const strokeScale = Math.min(width, height) / 450;
const sw = LINE_WEIGHT * strokeScale;

// --- Pattern converters ---

/** Perpendicular unit vector for a segment. */
function perpDir(p0: Point2D, p1: Point2D): Point2D {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return [0, 0];
  return [-dy / len, dx / len];
}

/** Lerp between two points. */
function lerp(a: Point2D, b: Point2D, t: number): Point2D {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Convert a straight segment to a zigzag SVG path.
 * amplitude: peak deviation perpendicular to segment direction.
 * frequency: number of zigzag teeth per unit length.
 */
function segmentToZigzag(seg: Segment, amplitude: number, frequency: number): string {
  const [p0, p1] = seg;
  const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (segLen < 1e-9) return '';
  const perp = perpDir(p0, p1);
  const nTeeth = Math.max(2, Math.round(segLen * frequency));
  const points: string[] = [`M ${p0[0]},${p0[1]}`];

  for (let i = 1; i <= nTeeth; i++) {
    const t = i / nTeeth;
    const base = lerp(p0, p1, t);
    const sign = i % 2 === 1 ? 1 : -1;
    // Last point returns to the line
    const amp = i === nTeeth ? 0 : amplitude * sign;
    const x = base[0] + perp[0] * amp;
    const y = base[1] + perp[1] * amp;
    points.push(`L ${x},${y}`);
  }

  return points.join(' ');
}

/**
 * Convert a straight segment to a wave (sinusoidal) SVG path using cubic Beziers.
 * amplitude: peak deviation perpendicular to segment direction.
 * frequency: number of half-waves per unit length.
 */
function segmentToWave(seg: Segment, amplitude: number, frequency: number): string {
  const [p0, p1] = seg;
  const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (segLen < 1e-9) return '';
  const perp = perpDir(p0, p1);
  const nHalves = Math.max(2, Math.round(segLen * frequency));

  let d = `M ${p0[0]},${p0[1]}`;
  for (let i = 0; i < nHalves; i++) {
    const t0 = i / nHalves;
    const t1 = (i + 1) / nHalves;
    const sign = i % 2 === 0 ? 1 : -1;

    const start = lerp(p0, p1, t0);
    const end = lerp(p0, p1, t1);
    const mid = lerp(start, end, 0.5);

    // Cubic Bezier control points: offset perpendicular at 1/3 and 2/3
    const cp1: Point2D = [
      lerp(start, end, 1 / 3)[0] + perp[0] * amplitude * sign,
      lerp(start, end, 1 / 3)[1] + perp[1] * amplitude * sign,
    ];
    const cp2: Point2D = [
      lerp(start, end, 2 / 3)[0] + perp[0] * amplitude * sign,
      lerp(start, end, 2 / 3)[1] + perp[1] * amplitude * sign,
    ];

    d += ` C ${cp1[0]},${cp1[1]} ${cp2[0]},${cp2[1]} ${end[0]},${end[1]}`;
  }

  return d;
}

// --- Generate kakeami config ---

const config = voronoiColoring(REGION, TILE_SIZE, K, PITCH, LINE_WEIGHT, SEED);

// --- Build SVGs ---

type PatternFn = (seg: Segment) => string;

function buildSvg(patternFn: PatternFn, label: string): string {
  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${xmin} ${ymin} ${width} ${height}" width="400" height="400">`);

  // Background
  lines.push(`  <rect x="${xmin}" y="${ymin}" width="${width}" height="${height}" fill="white"/>`);

  // Background hatching
  const regionPoly: Point2D[] = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]];
  const bgAngle = Math.PI / 4;
  const bgOffsets = kakeAngleOffsets(K);
  lines.push('  <g class="bg-hatching" opacity="1">');
  for (let j = 0; j < K; j++) {
    const angle = bgAngle + bgOffsets[j]!;
    const bgLines = hatchPolygon(regionPoly, angle, PITCH);
    for (const seg of bgLines) {
      const d = patternFn(seg);
      if (d) {
        lines.push(`    <path d="${d}" fill="none" stroke="black" stroke-width="${sw}" stroke-linecap="round"/>`);
      }
    }
  }
  lines.push('  </g>');

  // Tiles
  for (const tile of config.tiles) {
    const poly = tilePolygon(tile.cx, tile.cy, tile.phi, config.tileWidth, config.tileHeight);
    const polyPoints = poly.map(p => `${p[0]},${p[1]}`).join(' ');

    lines.push(`  <g class="tile">`);
    // White background polygon
    lines.push(`    <polygon points="${polyPoints}" fill="white" stroke="none"/>`);

    // Hatch lines as patterns
    for (const stroke of tile.block.strokes) {
      const segs = hatchPolygon(poly, stroke.theta, stroke.pitch);
      for (const seg of segs) {
        const d = patternFn(seg);
        if (d) {
          lines.push(`    <path d="${d}" fill="none" stroke="black" stroke-width="${sw}" stroke-linecap="round"/>`);
        }
      }
    }
    lines.push('  </g>');
  }

  lines.push('</svg>');
  return lines.join('\n');
}

// Pattern functions
const zigzagFn: PatternFn = (seg) => segmentToZigzag(seg, 0.015, 40);
const waveFn: PatternFn = (seg) => segmentToWave(seg, 0.015, 30);

const zigzagSvg = buildSvg(zigzagFn, 'zigzag');
const waveSvg = buildSvg(waveFn, 'wave');

// Write output
const outDir = path.resolve(import.meta.dirname, '../../public/experiments/assets');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'pattern-zigzag.svg'), zigzagSvg, 'utf-8');
fs.writeFileSync(path.join(outDir, 'pattern-wave.svg'), waveSvg, 'utf-8');

console.log(`Generated: ${path.join(outDir, 'pattern-zigzag.svg')}`);
console.log(`Generated: ${path.join(outDir, 'pattern-wave.svg')}`);
