/**
 * Playwright-driven experiment runner.
 *
 * 1. Builds the project with Vite
 * 2. Serves the build with `vite preview`
 * 3. Runs 160 conditions via page.evaluate(window.runExperiment)
 * 4. Saves PNGs + metrics.json
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const CONDITIONS = ['poissonBfs', 'poissonRandom', 'randomBfs', 'randomRandom'] as const;
const K_VALUES = [1, 2, 3, 4];
const SEEDS = [42, 123, 256, 789, 1024, 2048, 3141, 4096, 5555, 9999];

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
  wallTimeMs: number;
  svgString: string;
}

async function main() {
  // Ensure output dirs
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

  // Wait for server to be ready
  await new Promise<void>((resolve) => {
    preview.stdout.on('data', (data: Buffer) => {
      if (data.toString().includes('Local')) {
        resolve();
      }
    });
    // Fallback timeout
    setTimeout(resolve, 5000);
  });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to runner page
  await page.goto('http://localhost:4173/kakeami-generator/experiments/runner.html', {
    waitUntil: 'networkidle',
  });

  // Wait for the runExperiment function to be available
  await page.waitForFunction(() => typeof window.runExperiment === 'function');

  const allMetrics: Omit<ExperimentResult, 'svgString'>[] = [];
  const total = CONDITIONS.length * K_VALUES.length * SEEDS.length;
  let done = 0;

  for (const condition of CONDITIONS) {
    for (const k of K_VALUES) {
      for (const seed of SEEDS) {
        done++;
        const label = `${condition}_k${k}_s${seed}`;
        console.log(`[${done}/${total}] ${label}`);

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

        // Save PNG via canvas
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
                // White background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, size, size);
                ctx.drawImage(img, 0, 0, size, size);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/png').split(',')[1]!);
              };
              img.src = url;
            });
          },
          { svgString: result.svgString, size: PNG_SIZE },
        );

        fs.writeFileSync(
          path.join(IMAGES_DIR, `${label}.png`),
          Buffer.from(pngBuffer, 'base64'),
        );

        // Collect metrics (exclude svgString to keep JSON small)
        const { svgString: _, ...metrics } = result;
        allMetrics.push(metrics);
      }
    }
  }

  // Save metrics
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'metrics.json'),
    JSON.stringify(allMetrics, null, 2),
  );

  console.log(`Done! ${allMetrics.length} experiments saved to ${RESULTS_DIR}`);

  await browser.close();
  preview.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
