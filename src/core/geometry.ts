/**
 * Geometry utilities — tile polygon, hatch polygon (Cyrus-Beck), rect distance.
 */

import type { Point2D } from './math-utils';
import { rotationMatrix, applyRotation } from './math-utils';

export type Segment = [Point2D, Point2D];

/**
 * Compute the 4 vertices of a rotated rectangle tile.
 * h (long side) is parallel to the primary stroke direction (phi).
 */
export function tilePolygon(
  cx: number,
  cy: number,
  phi: number,
  w: number,
  h: number,
): Point2D[] {
  const hw = w / 2;
  const hh = h / 2;
  const localCorners: Point2D[] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  const R = rotationMatrix(phi);
  return localCorners.map(([lx, ly]) => {
    const [rx, ry] = applyRotation(R, lx, ly);
    return [rx + cx, ry + cy] as Point2D;
  });
}

/**
 * Compute outward normals for a convex polygon (CCW winding assumed, but works for CW too).
 * Returns normals pointing outward.
 */
function polygonOutwardNormals(polygon: Point2D[]): Point2D[] {
  const n = polygon.length;
  const normals: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % n]!;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) {
      normals.push([0, 0]);
    } else {
      // Outward normal: rotate edge 90° CW → (dy, -dx) for CCW polygon
      // We'll verify direction below
      normals.push([dy / len, -dx / len]);
    }
  }

  // Verify outward direction: normal should point away from polygon centroid
  let cxSum = 0, cySum = 0;
  for (const p of polygon) { cxSum += p[0]; cySum += p[1]; }
  const centroid: Point2D = [cxSum / n, cySum / n];

  for (let i = 0; i < n; i++) {
    const mid: Point2D = [
      (polygon[i]![0] + polygon[(i + 1) % n]![0]) / 2,
      (polygon[i]![1] + polygon[(i + 1) % n]![1]) / 2,
    ];
    const toCentroid: Point2D = [centroid[0] - mid[0], centroid[1] - mid[1]];
    const dot = normals[i]![0] * toCentroid[0] + normals[i]![1] * toCentroid[1];
    if (dot > 0) {
      // Normal points inward, flip it
      normals[i] = [-normals[i]![0], -normals[i]![1]];
    }
  }

  return normals;
}

/**
 * Inset a convex polygon by moving each edge inward by `margin`.
 * Returns the inset polygon vertices or null if collapsed.
 */
export function insetConvexPolygon(polygon: Point2D[], margin: number): Point2D[] | null {
  if (margin <= 0) return polygon;

  const n = polygon.length;
  const normals = polygonOutwardNormals(polygon);

  // Move each edge inward: offset = -normal * margin
  // Each edge becomes a line defined by a point on it and the edge direction
  const edges: { point: Point2D; dir: Point2D }[] = [];
  for (let i = 0; i < n; i++) {
    const p = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    const normal = normals[i]!;
    // Offset point inward
    const op: Point2D = [
      p[0] - normal[0] * margin,
      p[1] - normal[1] * margin,
    ];
    const dir: Point2D = [next[0] - p[0], next[1] - p[1]];
    edges.push({ point: op, dir });
  }

  // Intersect consecutive offset edges to get new vertices
  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const e1 = edges[i]!;
    const e2 = edges[(i + 1) % n]!;
    const pt = lineLineIntersection(e1.point, e1.dir, e2.point, e2.dir);
    if (pt === null) return null; // Parallel edges after offset → degenerate
    result.push(pt);
  }

  // Check the polygon hasn't collapsed due to excessive margin.
  // Result vertex i is the intersection of offset edges i and (i+1).
  // So result edge i (from vertex i to i+1) lies along offset edge (i+1).
  // If any result edge direction reverses relative to original edge (i+1),
  // the offset edges have crossed and the polygon is degenerate.
  for (let i = 0; i < result.length; i++) {
    const ri = result[i]!;
    const rj = result[(i + 1) % result.length]!;
    const resultDirX = rj[0] - ri[0];
    const resultDirY = rj[1] - ri[1];

    const origEdgeIdx = (i + 1) % n;
    const oi = polygon[origEdgeIdx]!;
    const oj = polygon[(origEdgeIdx + 1) % n]!;
    const origDirX = oj[0] - oi[0];
    const origDirY = oj[1] - oi[1];

    const dot = resultDirX * origDirX + resultDirY * origDirY;
    if (dot < 1e-12) return null; // Edge reversed or degenerate
  }

  return result;
}

/** Intersection of two lines: p1 + t*d1 and p2 + t*d2. Returns null if parallel. */
function lineLineIntersection(
  p1: Point2D, d1: Point2D,
  p2: Point2D, d2: Point2D,
): Point2D | null {
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(cross) < 1e-12) return null;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const t = (dx * d2[1] - dy * d2[0]) / cross;
  return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
}

/**
 * Cyrus-Beck clipping: clip a line segment against a convex polygon.
 * Returns the clipped segment or null if entirely outside.
 */
export function cyrusBeckClip(
  polygon: Point2D[],
  p0: Point2D,
  p1: Point2D,
): Segment | null {
  const n = polygon.length;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];

  let tEnter = 0;
  let tLeave = 1;

  for (let i = 0; i < n; i++) {
    const edge0 = polygon[i]!;
    const edge1 = polygon[(i + 1) % n]!;

    // Outward normal of edge
    const ex = edge1[0] - edge0[0];
    const ey = edge1[1] - edge0[1];
    // Normal: try (ey, -ex) and check against polygon interior
    let nx = ey;
    let ny = -ex;

    // Check if normal points outward by testing against another vertex
    const other = polygon[(i + 2) % n]!;
    const toOtherX = other[0] - edge0[0];
    const toOtherY = other[1] - edge0[1];
    if (nx * toOtherX + ny * toOtherY > 0) {
      nx = -nx;
      ny = -ny;
    }

    const wX = p0[0] - edge0[0];
    const wY = p0[1] - edge0[1];

    const num = nx * wX + ny * wY;
    const den = nx * dx + ny * dy;

    if (Math.abs(den) < 1e-12) {
      // Line parallel to edge
      if (num > 1e-12) return null; // Outside
      continue;
    }

    const t = -num / den;

    if (den < 0) {
      // Entering
      if (t > tEnter) tEnter = t;
    } else {
      // Leaving
      if (t < tLeave) tLeave = t;
    }

    if (tEnter > tLeave) return null;
  }

  if (tEnter > tLeave) return null;

  return [
    [p0[0] + tEnter * dx, p0[1] + tEnter * dy],
    [p0[0] + tLeave * dx, p0[1] + tLeave * dy],
  ];
}

/**
 * Generate hatching lines within a convex polygon.
 * Replaces Shapely-based hatch_polygon.
 */
export function hatchPolygon(
  polygon: Point2D[],
  theta: number,
  pitch: number,
  margin: number = 0,
  skipBoundary: boolean = false,
): Segment[] {
  let poly = polygon;
  if (margin > 0) {
    const inset = insetConvexPolygon(polygon, margin);
    if (inset === null) return [];
    poly = inset;
  }

  // Hatch direction and perpendicular
  const dirX = Math.cos(theta);
  const dirY = Math.sin(theta);
  const perpX = -dirY;
  const perpY = dirX;

  // Project vertices onto perpendicular axis
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const p of poly) {
    const proj = p[0] * perpX + p[1] * perpY;
    if (proj < dMin) dMin = proj;
    if (proj > dMax) dMax = proj;
  }

  const span = dMax - dMin;
  if (span < 1e-10) return [];

  // Integer snap for edge alignment
  const nIntervals = Math.max(1, Math.round(span / pitch));

  // Compute diagonal for line length
  let bxMin = Infinity, bxMax = -Infinity;
  let byMin = Infinity, byMax = -Infinity;
  for (const p of poly) {
    if (p[0] < bxMin) bxMin = p[0];
    if (p[0] > bxMax) bxMax = p[0];
    if (p[1] < byMin) byMin = p[1];
    if (p[1] > byMax) byMax = p[1];
  }
  const diag = Math.hypot(bxMax - bxMin, byMax - byMin);
  const half = diag / 2 * 1.1;

  // Center of polygon along hatch direction
  const polyCx = (bxMin + bxMax) / 2;
  const polyCy = (byMin + byMax) / 2;
  const tCenter = polyCx * dirX + polyCy * dirY;

  const lines: Segment[] = [];
  const iStart = skipBoundary ? 1 : 0;
  const iEnd = skipBoundary ? nIntervals - 1 : nIntervals;
  for (let i = iStart; i <= iEnd; i++) {
    const d = dMin + i * (span / nIntervals);
    const cx = d * perpX + tCenter * dirX;
    const cy = d * perpY + tCenter * dirY;

    const p0: Point2D = [cx - half * dirX, cy - half * dirY];
    const p1: Point2D = [cx + half * dirX, cy + half * dirY];

    const clipped = cyrusBeckClip(poly, p0, p1);
    if (clipped !== null) {
      lines.push(clipped);
    }
  }

  return lines;
}

/**
 * Minimum distance between two convex polygons.
 * Used for quality metrics adjacency computation.
 */
export function convexPolygonDistance(polyA: Point2D[], polyB: Point2D[]): number {
  // Check if polygons overlap (any vertex of A inside B or vice versa)
  if (pointInConvex(polyA, polyB[0]!) || pointInConvex(polyB, polyA[0]!)) {
    return 0;
  }

  let minDist = Infinity;

  // Check all edge-vertex and vertex-vertex combinations
  const allEdgesA = getEdges(polyA);
  const allEdgesB = getEdges(polyB);

  // Point-to-edge distances
  for (const p of polyA) {
    for (const [e0, e1] of allEdgesB) {
      minDist = Math.min(minDist, pointSegmentDist(p, e0, e1));
    }
  }
  for (const p of polyB) {
    for (const [e0, e1] of allEdgesA) {
      minDist = Math.min(minDist, pointSegmentDist(p, e0, e1));
    }
  }

  return minDist;
}

function getEdges(polygon: Point2D[]): Segment[] {
  const edges: Segment[] = [];
  for (let i = 0; i < polygon.length; i++) {
    edges.push([polygon[i]!, polygon[(i + 1) % polygon.length]!]);
  }
  return edges;
}

function pointSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function pointInConvex(polygon: Point2D[], p: Point2D): boolean {
  const n = polygon.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-10) continue;
    if (sign === 0) {
      sign = cross > 0 ? 1 : -1;
    } else if ((cross > 0 ? 1 : -1) !== sign) {
      return false;
    }
  }
  return true;
}

/**
 * Minimum distance between two tile rectangles (wrapper for quality metrics).
 */
export function rectMinDistance(
  tileA: { cx: number; cy: number; phi: number },
  tileB: { cx: number; cy: number; phi: number },
  w: number,
  h: number,
): number {
  const polyA = tilePolygon(tileA.cx, tileA.cy, tileA.phi, w, h);
  const polyB = tilePolygon(tileB.cx, tileB.cy, tileB.phi, w, h);
  return convexPolygonDistance(polyA, polyB);
}
