/**
 * Browser-side API for experiment runner.
 * Exposes window.runExperiment() for Playwright to call via page.evaluate().
 */

import { renderToSvg } from '../../src/render/svg-renderer';
import { runCondition } from './algorithms';
import type { Condition } from './algorithms';

export interface ExperimentResult {
  condition: Condition;
  k: number;
  seed: number;
  nTiles: number;
  nEdges: number;
  eContrast: number;
  eLdG: number;
  sOrder: number;
  cCov: number;
  uVor: number;
  wallTimeMs: number;
  svgString: string;
}

function runExperiment(
  condition: Condition,
  region: [number, number, number, number],
  tileSize: number,
  k: number,
  pitch: number,
  lineWeight: number,
  seed: number,
): ExperimentResult {
  const t0 = performance.now();
  const config = runCondition(condition, region, tileSize, k, pitch, lineWeight, seed);
  const wallTimeMs = performance.now() - t0;

  const edges = config.adjacency();

  const svg = renderToSvg(config, {
    margin: 0.0,
    noiseAngle: 0,
    noiseSpacing: 0,
    noiseWeight: 0,
    seed: seed,
    showOutline: false,
    bgHatching: false,
  });
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);

  return {
    condition,
    k,
    seed,
    nTiles: config.tiles.length,
    nEdges: edges.length,
    eContrast: config.eContrast(),
    eLdG: config.eLdG(),
    sOrder: config.sOrder(),
    cCov: config.cCov(),
    uVor: config.uVor(),
    wallTimeMs,
    svgString,
  };
}

// Expose to Playwright
declare global {
  interface Window {
    runExperiment: typeof runExperiment;
  }
}
window.runExperiment = runExperiment;
