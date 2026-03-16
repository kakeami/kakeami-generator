/**
 * SVG renderer — KakeamiConfig + RenderParams → SVGSVGElement.
 *
 * Two entry points:
 *   computeHatchData() — pure computation, no DOM
 *   renderToSvg()      — builds the SVG element
 */

import type { KakeamiConfig, RenderParams, Point2D, Segment } from '../core';
import { tilePolygon, hatchPolygon, createRng, defaultRenderParams, kakeAngleOffsets } from '../core';
import type { HatchedTile, RenderResult } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Compute hatch data for all tiles (DOM-independent).
 */
export function computeHatchData(
  config: KakeamiConfig,
  params: RenderParams,
): RenderResult {
  const rng = params.seed !== null ? createRng(params.seed) : createRng(Math.floor(Math.random() * 100000));
  const w = config.tileWidth;
  const h = config.tileHeight;
  const hatchedTiles: HatchedTile[] = [];

  for (let idx = 0; idx < config.tiles.length; idx++) {
    const tile = config.tiles[idx]!;
    const poly = tilePolygon(tile.cx, tile.cy, tile.phi, w, h);
    const segments: Segment[] = [];
    let lw = config.lineWeight;

    // Noise on line weight
    if (params.noiseWeight > 0) {
      lw *= 1.0 + rng.uniform(-params.noiseWeight, params.noiseWeight);
    }

    // Hatch lines for each stroke
    // Primary stroke: include boundary lines (edges parallel to primary direction)
    // Secondary strokes: skip boundary lines to avoid "lid" effect on all 4 sides
    const strokes = tile.block.strokes;
    for (let si = 0; si < strokes.length; si++) {
      const stroke = strokes[si]!;
      let theta = stroke.theta;
      let pitch = stroke.pitch;

      if (params.noiseAngle > 0) {
        theta += rng.uniform(
          -params.noiseAngle * Math.PI / 180,
          params.noiseAngle * Math.PI / 180,
        );
      }
      if (params.noiseSpacing > 0) {
        pitch *= 1.0 + rng.uniform(-params.noiseSpacing, params.noiseSpacing);
      }

      const skipBoundary = si > 0; // secondary strokes skip boundary
      const lines = hatchPolygon(poly, theta, pitch, params.margin, skipBoundary);
      segments.push(...lines);
    }

    hatchedTiles.push({
      tileIndex: idx,
      segments,
      outline: [...poly, poly[0]!], // closed polygon
      lineWeight: lw,
    });
  }

  return { hatchedTiles };
}

/**
 * Render a KakeamiConfig to an SVG element.
 */
export function renderToSvg(
  config: KakeamiConfig,
  params?: Partial<RenderParams>,
): SVGSVGElement {
  const fullParams: RenderParams = { ...defaultRenderParams(), ...params };
  const renderResult = computeHatchData(config, fullParams);
  const [xmin, ymin, xmax, ymax] = config.region;
  const width = xmax - xmin;
  const height = ymax - ymin;

  // matplotlib linewidth is in points (1/72 inch).
  // For an SVG displayed at ~600px, 1pt ≈ 1.33px, and 1 SVG unit = 600/viewBoxWidth px.
  // So: svgStrokeWidth = lineWeight(pt) × 1.33(px/pt) / (600/viewBoxWidth)(px/unit)
  //                    ≈ lineWeight × viewBoxWidth / 450
  const strokeScale = Math.min(width, height) / 450;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${xmin} ${ymin} ${width} ${height}`);
  svg.setAttribute('xmlns', SVG_NS);
  svg.style.width = '100%';
  svg.style.height = '100%';

  // Background hatching (optional) — uses same k, pitch, lineWeight as tiles
  if (fullParams.bgHatching) {
    const bgGroup = document.createElementNS(SVG_NS, 'g');
    bgGroup.setAttribute('class', 'bg-hatching');

    // White background rect
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', String(xmin));
    bgRect.setAttribute('y', String(ymin));
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', fullParams.backgroundColor);
    bgGroup.appendChild(bgRect);

    // Derive k and pitch from the first tile (fall back to sensible defaults)
    const firstTile = config.tiles[0];
    const bgK = firstTile ? firstTile.block.k : 1;
    const bgPitch = firstTile ? firstTile.block.primary.pitch : 0.08;
    const bgWeight = config.lineWeight;

    // Background hatch lines
    const regionPoly: Point2D[] = [
      [xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax],
    ];
    const bgOffsets = kakeAngleOffsets(bgK);
    for (let j = 0; j < bgK; j++) {
      const angle = fullParams.bgHatchingAngle + bgOffsets[j]!;
      const bgLines = hatchPolygon(regionPoly, angle, bgPitch);
      for (const [p0, p1] of bgLines) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(p0[0]));
        line.setAttribute('y1', String(p0[1]));
        line.setAttribute('x2', String(p1[0]));
        line.setAttribute('y2', String(p1[1]));
        line.setAttribute('stroke', fullParams.lineColor);
        line.setAttribute('stroke-width', String(bgWeight * strokeScale));
        line.setAttribute('stroke-linecap', 'round');
        bgGroup.appendChild(line);
      }
    }
    svg.appendChild(bgGroup);
  }

  // Tile groups: SVG order = z-order (later tiles on top)
  for (const ht of renderResult.hatchedTiles) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'tile');
    g.setAttribute('data-index', String(ht.tileIndex));

    // White polygon background (opaque)
    const polygon = document.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('points', ht.outline.map(p => `${p[0]},${p[1]}`).join(' '));
    polygon.setAttribute('fill', fullParams.backgroundColor);
    polygon.setAttribute('stroke', 'none');
    g.appendChild(polygon);

    // Hatch lines
    for (const [p0, p1] of ht.segments) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(p0[0]));
      line.setAttribute('y1', String(p0[1]));
      line.setAttribute('x2', String(p1[0]));
      line.setAttribute('y2', String(p1[1]));
      line.setAttribute('stroke', fullParams.lineColor);
      line.setAttribute('stroke-width', String(ht.lineWeight * strokeScale));
      line.setAttribute('stroke-linecap', 'round');
      g.appendChild(line);
    }

    svg.appendChild(g);
  }

  // Debug outlines (optional)
  if (fullParams.showOutline) {
    const outlineGroup = document.createElementNS(SVG_NS, 'g');
    outlineGroup.setAttribute('class', 'outlines');
    for (const ht of renderResult.hatchedTiles) {
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', ht.outline.map(p => `${p[0]},${p[1]}`).join(' '));
      polygon.setAttribute('fill', 'none');
      polygon.setAttribute('stroke', 'gray');
      polygon.setAttribute('stroke-width', '0.003');
      polygon.setAttribute('opacity', '0.5');
      outlineGroup.appendChild(polygon);
    }
    svg.appendChild(outlineGroup);
  }

  return svg;
}
