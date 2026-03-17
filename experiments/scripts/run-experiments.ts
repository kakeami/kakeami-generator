/**
 * Playwright-driven experiment runner (two-phase design).
 *
 * Phase 1: 4 conditions × 100 seeds × k=1 → metrics + PNG  (400 runs)
 * Phase 2: 4 conditions × 3 extra k values × 1 median seed → PNG only  (12 runs)
 * Total: 412 runs.
 *
 * 1. Builds the project with Vite
 * 2. Serves the build with `vite preview`
 * 3. Runs experiments via page.evaluate(window.runExperiment)
 * 4. Saves PNGs + metrics.json + representative_seeds.json
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const CONDITIONS = ['poissonBfs', 'poissonRandom', 'randomBfs', 'randomRandom'] as const;
const SEEDS = Array.from({ length: 100 }, (_, i) => i); // 0..99
const METRIC_K = 1;
const IMAGE_K_VALUES = [2, 3, 4];

const REGION: [number, number, number, number] = [0, 0, 6, 6];
const TILE_SIZE = 0.6;
const PITCH = 0.08;
const LINE_WEIGHT = 0.4;
const PNG_SIZE = 512;

const ROOT = path.resolve(import.meta.dirname, '../..');
const RESULTS_DIR = path.resolve(ROOT, 'experiments/results');
const IMAGES_DIR = path.resolve(RESULTS_DIR, 'images');

interface ExperimentResult {
  condition: string;
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

/** Render SVG to PNG via canvas in the browser page. */
async function savePng(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>,
  svgString: string,
  filePath: string,
): Promise<void> {
  const pngBuffer = await page.evaluate(
    ({ svgString, size }) => {
      return new Promise<string>((resolve) => {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png').split(',')[1]!);
        };
        img.src = url;
      });
    },
    { svgString, size: PNG_SIZE },
  );
  fs.writeFileSync(filePath, Buffer.from(pngBuffer, 'base64'));
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // Build
  console.log('Building project...');
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

  // Start preview server
  console.log('Starting preview server...');
  const preview = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    cwd: ROOT,
    stdio: 'pipe',
  });

  await new Promise<void>((resolve) => {
    preview.stdout.on('data', (data: Buffer) => {
      if (data.toString().includes('Local')) resolve();
    });
    setTimeout(resolve, 5000);
  });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:4173/kakeami-generator/experiments/runner.html', {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => typeof window.runExperiment === 'function');

  // ── Phase 1: 4 conditions × 100 seeds × k=1 → metrics + PNG ──
  console.log('\n=== Phase 1: Metrics collection (k=1, 100 seeds) ===');
  const allMetrics: Omit<ExperimentResult, 'svgString'>[] = [];
  const phase1Total = CONDITIONS.length * SEEDS.length;
  let done = 0;

  // Track eContrast per condition for median-seed selection
  const eContrastBySeed: Record<string, { seed: number; eContrast: number }[]> = {};
  for (const c of CONDITIONS) eContrastBySeed[c] = [];

  for (const condition of CONDITIONS) {
    for (const seed of SEEDS) {
      done++;
      const label = `${condition}_k${METRIC_K}_s${seed}`;
      console.log(`[${done}/${phase1Total}] ${label}`);

      const result: ExperimentResult = await page.evaluate(
        ({ condition, region, tileSize, k, pitch, lineWeight, seed }) => {
          return window.runExperiment(
            condition as any,
            region as [number, number, number, number],
            tileSize,
            k,
            pitch,
            lineWeight,
            seed,
          );
        },
        { condition, region: REGION, tileSize: TILE_SIZE, k: METRIC_K, pitch: PITCH, lineWeight: LINE_WEIGHT, seed },
      );

      await savePng(page, result.svgString, path.join(IMAGES_DIR, `${label}.png`));

      const { svgString: _, ...metrics } = result;
      allMetrics.push(metrics);
      eContrastBySeed[condition]!.push({ seed, eContrast: result.eContrast });
    }
  }

  // Save metrics
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'metrics.json'),
    JSON.stringify(allMetrics, null, 2),
  );
  console.log(`Phase 1 done: ${allMetrics.length} experiments saved.`);

  // ── Compute median-eContrast seed per condition ──
  const representativeSeeds: Record<string, number> = {};
  for (const condition of CONDITIONS) {
    const entries = eContrastBySeed[condition]!.slice().sort((a, b) => a.eContrast - b.eContrast);
    const medianIdx = Math.floor(entries.length / 2);
    representativeSeeds[condition] = entries[medianIdx]!.seed;
  }

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'representative_seeds.json'),
    JSON.stringify(representativeSeeds, null, 2),
  );
  console.log('Representative seeds:', representativeSeeds);

  // ── Phase 2: 4 conditions × 3 extra k values × 1 median seed → PNG only ──
  console.log('\n=== Phase 2: Extra k-value images (k=2,3,4, median seeds) ===');
  const phase2Total = CONDITIONS.length * IMAGE_K_VALUES.length;
  done = 0;

  for (const condition of CONDITIONS) {
    const seed = representativeSeeds[condition]!;
    for (const k of IMAGE_K_VALUES) {
      done++;
      const label = `${condition}_k${k}_s${seed}`;
      console.log(`[${done}/${phase2Total}] ${label}`);

      const result: ExperimentResult = await page.evaluate(
        ({ condition, region, tileSize, k, pitch, lineWeight, seed }) => {
          return window.runExperiment(
            condition as any,
            region as [number, number, number, number],
            tileSize,
            k,
            pitch,
            lineWeight,
            seed,
          );
        },
        { condition, region: REGION, tileSize: TILE_SIZE, k, pitch: PITCH, lineWeight: LINE_WEIGHT, seed },
      );

      await savePng(page, result.svgString, path.join(IMAGES_DIR, `${label}.png`));
    }
  }

  console.log(`\nDone! ${allMetrics.length + phase2Total} total runs saved to ${RESULTS_DIR}`);

  await browser.close();
  preview.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
