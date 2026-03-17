/**
 * Application wiring: controls → voronoiColoring → renderToSvg → preview.
 */

import { voronoiColoring, defaultRenderParams, LINE_STYLES } from '../core';
import type { RenderParams, LineStyle } from '../core';
import { renderToSvg } from '../render/svg-renderer';
import { downloadSvg, downloadPng } from '../render/exporter';
import { presets } from './presets';

export interface AppState {
  regionSize: number;
  tileSize: number;
  k: number;
  pitch: number;
  lineWeight: number;
  seed: number;
  renderParams: RenderParams;
}

function defaultState(): AppState {
  return {
    regionSize: 12,
    tileSize: 0.7,
    k: 1,
    pitch: 0.2,
    lineWeight: 0.5,
    seed: 42,
    renderParams: defaultRenderParams(),
  };
}

// --- URL sharing ---

/** Slider ranges for clamping URL params */
const SLIDER_RANGES: Record<string, { min: number; max: number }> = {
  regionSize: { min: 1, max: 20 },
  tileSize: { min: 0.1, max: 3 },
  k: { min: 1, max: 4 },
  pitch: { min: 0.01, max: 0.5 },
  lineWeight: { min: 0.1, max: 2 },
  seed: { min: 0, max: 99999 },
  margin: { min: 0, max: 0.1 },
  noiseAngle: { min: 0, max: 10 },
  noiseSpacing: { min: 0, max: 0.3 },
  noiseWeight: { min: 0, max: 0.3 },
  bgAngle: { min: 0, max: 180 },
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function stateToSearchParams(s: AppState): URLSearchParams {
  const d = defaultState();
  const dr = defaultRenderParams();
  const p = new URLSearchParams();

  if (s.regionSize !== d.regionSize) p.set('regionSize', String(s.regionSize));
  if (s.tileSize !== d.tileSize) p.set('tileSize', String(s.tileSize));
  if (s.k !== d.k) p.set('k', String(s.k));
  if (s.pitch !== d.pitch) p.set('pitch', String(s.pitch));
  if (s.lineWeight !== d.lineWeight) p.set('lineWeight', String(s.lineWeight));
  if (s.seed !== d.seed) p.set('seed', String(s.seed));

  const rp = s.renderParams;
  if (rp.margin !== dr.margin) p.set('margin', String(rp.margin));
  if (rp.noiseAngle !== dr.noiseAngle) p.set('noiseAngle', String(rp.noiseAngle));
  if (rp.noiseSpacing !== dr.noiseSpacing) p.set('noiseSpacing', String(rp.noiseSpacing));
  if (rp.noiseWeight !== dr.noiseWeight) p.set('noiseWeight', String(rp.noiseWeight));
  if (rp.showOutline !== dr.showOutline) p.set('showOutline', rp.showOutline ? '1' : '0');
  if (rp.backgroundColor !== dr.backgroundColor) p.set('bgColor', rp.backgroundColor);
  if (rp.lineColor !== dr.lineColor) p.set('lineColor', rp.lineColor);
  if (rp.bgHatching !== dr.bgHatching) p.set('bgHatching', rp.bgHatching ? '1' : '0');
  if (rp.bgHatchingAngle !== dr.bgHatchingAngle) {
    p.set('bgAngle', String(Math.round(rp.bgHatchingAngle * 180 / Math.PI)));
  }
  if (rp.lineStyle !== dr.lineStyle) p.set('lineStyle', rp.lineStyle);

  return p;
}

function searchParamsToState(params: URLSearchParams): AppState {
  const s = defaultState();
  const validLineStyles = LINE_STYLES.map(ls => ls.value) as string[];

  function num(key: string): number | null {
    const v = params.get(key);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function clampedNum(key: string): number | null {
    const n = num(key);
    if (n === null) return null;
    const range = SLIDER_RANGES[key];
    return range ? clamp(n, range.min, range.max) : n;
  }

  const regionSize = clampedNum('regionSize');
  if (regionSize !== null) s.regionSize = regionSize;

  const tileSize = clampedNum('tileSize');
  if (tileSize !== null) s.tileSize = tileSize;

  const k = clampedNum('k');
  if (k !== null) s.k = Math.round(k);

  const pitch = clampedNum('pitch');
  if (pitch !== null) s.pitch = pitch;

  const lineWeight = clampedNum('lineWeight');
  if (lineWeight !== null) s.lineWeight = lineWeight;

  const seed = clampedNum('seed');
  if (seed !== null) s.seed = Math.round(seed);

  const margin = clampedNum('margin');
  if (margin !== null) s.renderParams.margin = margin;

  const noiseAngle = clampedNum('noiseAngle');
  if (noiseAngle !== null) s.renderParams.noiseAngle = noiseAngle;

  const noiseSpacing = clampedNum('noiseSpacing');
  if (noiseSpacing !== null) s.renderParams.noiseSpacing = noiseSpacing;

  const noiseWeight = clampedNum('noiseWeight');
  if (noiseWeight !== null) s.renderParams.noiseWeight = noiseWeight;

  const showOutline = params.get('showOutline');
  if (showOutline !== null) s.renderParams.showOutline = showOutline === '1';

  const bgColor = params.get('bgColor');
  if (bgColor !== null) s.renderParams.backgroundColor = bgColor;

  const lineColor = params.get('lineColor');
  if (lineColor !== null) s.renderParams.lineColor = lineColor;

  const bgHatching = params.get('bgHatching');
  if (bgHatching !== null) s.renderParams.bgHatching = bgHatching === '1';

  const bgAngle = clampedNum('bgAngle');
  if (bgAngle !== null) s.renderParams.bgHatchingAngle = bgAngle * Math.PI / 180;

  const lineStyle = params.get('lineStyle');
  if (lineStyle !== null && validLineStyles.includes(lineStyle)) {
    s.renderParams.lineStyle = lineStyle as LineStyle;
  }

  return s;
}

function buildShareUrl(): string {
  const params = stateToSearchParams(state);
  const qs = params.toString();
  return window.location.origin + window.location.pathname + (qs ? '?' + qs : '');
}

let state: AppState = defaultState();
let previewEl: HTMLElement | null = null;
let controlsContainer: HTMLElement | null = null;
let metricsEl: HTMLElement | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function render() {
  if (!previewEl) return;

  const half = state.regionSize / 2;
  const region: [number, number, number, number] = [-half, -half, half, half];

  const config = voronoiColoring(
    region,
    state.tileSize,
    state.k,
    state.pitch,
    state.lineWeight,
    state.seed,
  );

  const params: RenderParams = {
    ...state.renderParams,
    seed: state.seed,
  };

  const svg = renderToSvg(config, params);
  previewEl.innerHTML = '';
  previewEl.appendChild(svg);

  if (metricsEl) {
    metricsEl.textContent =
      `E_contrast: ${config.eContrast().toFixed(3)} | ` +
      `E_LdG: ${config.eLdG().toFixed(3)} | ` +
      `S_order: ${config.sOrder().toFixed(3)} | ` +
      `H_angle: ${config.hAngle().toFixed(3)}\n` +
      `C_cov: ${config.cCov().toFixed(3)} | ` +
      `U_vor: ${config.uVor().toFixed(3)} | ` +
      `Tiles: ${config.tiles.length}`;
  }
}

function debouncedRender() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 200);
}

// --- Control builders ---

function createSlider(
  label: string, key: string,
  min: number, max: number, step: number,
  getValue: () => number,
  setValue: (v: number) => void,
  container: HTMLElement,
) {
  const row = document.createElement('div');
  row.className = 'control-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.htmlFor = `slider-${key}`;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'control-value';
  valueSpan.textContent = String(getValue());

  const input = document.createElement('input');
  input.type = 'range';
  input.id = `slider-${key}`;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(getValue());

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valueSpan.textContent = String(v);
    setValue(v);
    debouncedRender();
  });

  row.appendChild(lbl);
  row.appendChild(valueSpan);
  row.appendChild(input);
  container.appendChild(row);
}

function createCheckbox(
  label: string, key: string,
  getValue: () => boolean,
  setValue: (v: boolean) => void,
  container: HTMLElement,
) {
  const row = document.createElement('div');
  row.className = 'control-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.htmlFor = `check-${key}`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `check-${key}`;
  input.checked = getValue();

  input.addEventListener('change', () => {
    setValue(input.checked);
    debouncedRender();
  });

  row.appendChild(lbl);
  row.appendChild(input);
  container.appendChild(row);
}

function createColorPicker(
  label: string, key: string,
  getValue: () => string,
  setValue: (v: string) => void,
  container: HTMLElement,
) {
  const row = document.createElement('div');
  row.className = 'control-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.htmlFor = `color-${key}`;

  const input = document.createElement('input');
  input.type = 'color';
  input.id = `color-${key}`;
  input.value = getValue();

  input.addEventListener('input', () => {
    setValue(input.value);
    debouncedRender();
  });

  row.appendChild(lbl);
  row.appendChild(input);
  container.appendChild(row);
}

function createSelect(
  label: string, key: string,
  options: readonly { value: string; label: string }[],
  getValue: () => string,
  setValue: (v: string) => void,
  container: HTMLElement,
) {
  const row = document.createElement('div');
  row.className = 'control-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.htmlFor = `select-${key}`;

  const select = document.createElement('select');
  select.id = `select-${key}`;
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  }
  select.value = getValue();

  select.addEventListener('change', () => {
    setValue(select.value);
    debouncedRender();
  });

  row.appendChild(lbl);
  row.appendChild(select);
  container.appendChild(row);
}

function createFieldset(title: string, container: HTMLElement): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  fieldset.appendChild(legend);
  container.appendChild(fieldset);
  return fieldset;
}

function buildControls(container: HTMLElement) {
  const rp = () => state.renderParams;

  // Region
  const regionFs = createFieldset('Region', container);
  createSlider('Size', 'regionSize', 1, 20, 0.5,
    () => state.regionSize, v => { state.regionSize = v; }, regionFs);

  // Tile
  const tileFs = createFieldset('Tile', container);
  createSlider('Tile size', 'tileSize', 0.1, 3, 0.05,
    () => state.tileSize, v => { state.tileSize = v; }, tileFs);
  createSlider('k (kake count)', 'k', 1, 4, 1,
    () => state.k, v => { state.k = v; }, tileFs);
  createSlider('Pitch', 'pitch', 0.01, 0.5, 0.01,
    () => state.pitch, v => { state.pitch = v; }, tileFs);
  createSlider('Line weight', 'lineWeight', 0.1, 2, 0.05,
    () => state.lineWeight, v => { state.lineWeight = v; }, tileFs);

  // Render
  const renderFs = createFieldset('Render', container);
  createSlider('Margin', 'margin', 0, 0.1, 0.005,
    () => rp().margin, v => { rp().margin = v; }, renderFs);
  createSlider('Noise angle', 'noiseAngle', 0, 10, 0.5,
    () => rp().noiseAngle, v => { rp().noiseAngle = v; }, renderFs);
  createSlider('Noise spacing', 'noiseSpacing', 0, 0.3, 0.01,
    () => rp().noiseSpacing, v => { rp().noiseSpacing = v; }, renderFs);
  createSlider('Noise weight', 'noiseWeight', 0, 0.3, 0.01,
    () => rp().noiseWeight, v => { rp().noiseWeight = v; }, renderFs);
  createSlider('Seed', 'seed', 0, 99999, 1,
    () => state.seed, v => { state.seed = v; }, renderFs);

  // Background
  const bgFs = createFieldset('Background', container);
  createCheckbox('BG hatching', 'bgHatching',
    () => rp().bgHatching, v => { rp().bgHatching = v; }, bgFs);
  createSlider('BG angle (°)', 'bgHatchingAngle', 0, 180, 1,
    () => rp().bgHatchingAngle * 180 / Math.PI,
    v => { rp().bgHatchingAngle = v * Math.PI / 180; }, bgFs);

  // Style
  const styleFs = createFieldset('Style', container);
  createColorPicker('Background', 'bgColor',
    () => rp().backgroundColor === 'white' ? '#ffffff' : rp().backgroundColor,
    v => { rp().backgroundColor = v; }, styleFs);
  createColorPicker('Line color', 'lineColor',
    () => rp().lineColor === 'black' ? '#000000' : rp().lineColor,
    v => { rp().lineColor = v; }, styleFs);
  createSelect('Line style', 'lineStyle', LINE_STYLES,
    () => rp().lineStyle,
    v => { rp().lineStyle = v as LineStyle; }, styleFs);
  createCheckbox('Show outline', 'showOutline',
    () => rp().showOutline, v => { rp().showOutline = v; }, styleFs);
}

export function initApp(root: HTMLElement) {
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  // Preview
  const previewWrapper = document.createElement('div');
  previewWrapper.className = 'preview-wrapper';
  previewEl = document.createElement('div');
  previewEl.className = 'preview';
  previewWrapper.appendChild(previewEl);

  metricsEl = document.createElement('div');
  metricsEl.className = 'metrics';
  previewWrapper.appendChild(metricsEl);

  layout.appendChild(previewWrapper);

  // Controls panel
  const panel = document.createElement('div');
  panel.className = 'controls-panel';

  const title = document.createElement('h1');
  title.textContent = 'Kakeami Generator';
  panel.appendChild(title);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'actions';

  const regenerateBtn = document.createElement('button');
  regenerateBtn.textContent = 'Regenerate';
  regenerateBtn.addEventListener('click', () => {
    state.seed = Math.floor(Math.random() * 100000);
    rebuildControls();
    render();
  });
  actions.appendChild(regenerateBtn);

  const svgBtn = document.createElement('button');
  svgBtn.textContent = 'Download SVG';
  svgBtn.addEventListener('click', () => {
    const svgEl = previewEl?.querySelector('svg');
    if (svgEl) downloadSvg(svgEl);
  });
  actions.appendChild(svgBtn);

  const pngBtn = document.createElement('button');
  pngBtn.textContent = 'Download PNG';
  pngBtn.addEventListener('click', () => {
    const svgEl = previewEl?.querySelector('svg');
    if (svgEl) downloadPng(svgEl);
  });
  actions.appendChild(pngBtn);

  const shareBtn = document.createElement('button');
  shareBtn.textContent = 'Share URL';
  shareBtn.addEventListener('click', () => {
    const url = buildShareUrl();
    navigator.clipboard.writeText(url).then(() => {
      shareBtn.textContent = 'Copied!';
      setTimeout(() => { shareBtn.textContent = 'Share URL'; }, 1500);
    });
  });
  actions.appendChild(shareBtn);

  panel.appendChild(actions);

  // Presets
  const presetsDiv = document.createElement('div');
  presetsDiv.className = 'presets';
  const presetLabel = document.createElement('span');
  presetLabel.textContent = 'Presets: ';
  presetsDiv.appendChild(presetLabel);

  for (const preset of presets) {
    const btn = document.createElement('button');
    btn.textContent = preset.name;
    btn.className = 'preset-btn';
    btn.addEventListener('click', () => {
      state = {
        ...preset.state,
        renderParams: { ...preset.state.renderParams },
      };
      rebuildControls();
      render();
    });
    presetsDiv.appendChild(btn);
  }
  panel.appendChild(presetsDiv);

  // Controls
  controlsContainer = document.createElement('div');
  controlsContainer.className = 'controls';
  buildControls(controlsContainer);
  panel.appendChild(controlsContainer);

  // Link to experiment report
  const navLink = document.createElement('a');
  navLink.href = 'experiments/';
  navLink.textContent = 'Experiment Report: Algorithm Comparison';
  navLink.className = 'nav-link';
  panel.appendChild(navLink);

  layout.appendChild(panel);
  root.appendChild(layout);

  // Restore state from URL query parameters if present
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.toString()) {
    state = searchParamsToState(urlParams);
    rebuildControls();
  }

  render();
}

function rebuildControls() {
  if (controlsContainer) {
    controlsContainer.innerHTML = '';
    buildControls(controlsContainer);
  }
}
