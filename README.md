# Kakeami Generator

An interactive web-based generator for **カケアミ** (kakeami), the traditional Japanese manga hatching technique. This tool reproduces kakeami tile placement using mathematical models, letting you tweak parameters in real time and export the results — all in the browser.

**[Try the Generator](https://kakeami.github.io/kakeami-generator/)** | **[Read the Experiment Report](https://kakeami.github.io/kakeami-generator/experiments/)**

![UI Screenshot](docs/screenshot-ui.png)

## Gallery

Varying k (the number of hatching layers per tile) changes the density and character of the カケアミ pattern.

| k=1 | k=2 | k=3 | k=4 |
|:---:|:---:|:---:|:---:|
| ![k=1](docs/sample-k1.png) | ![k=2](docs/sample-k2.png) | ![k=3](docs/sample-k3.png) | ![k=4](docs/sample-k4.png) |

## Features

- **Voronoi coloring algorithm** — Poisson-disk sampling + BFS greedy angle assignment for natural-looking カケアミ
- **Real-time preview** — Adjust parameters and see the result instantly
- **Presets** — 1-kake / 2-kake / 3-kake / 4-kake
- **Export** — Download as SVG or high-resolution PNG (4096x4096)
- **URL sharing** — Embed parameters in the URL to share your configuration
- **No server required** — Runs entirely in the browser

## Getting Started

```bash
npm install
npm run dev
```

Open the displayed URL in your browser. Use the right-hand panel to adjust parameters; the preview updates in real time.

### Production Build

```bash
npm run build
```

Output is in `dist/`. Deploy to any static hosting service (GitHub Pages, Netlify, etc.).

### Tests

```bash
npm test
```

## How It Works

カケアミ consists of rectangular tiles, each filled with parallel hatching lines at a specific angle. The algorithm maximises angular contrast between neighbouring tiles, producing the characteristic visual texture.

The generation pipeline:

1. **Poisson-disk sampling** — Place tile centres uniformly across the region
2. **Voronoi tessellation** — Determine each tile's area from its centre point
3. **BFS greedy angle assignment** — Maximise angular contrast between adjacent tiles

Angular distance is measured on the real projective line RP<sup>1</sup> using the Fubini-Study metric.

## Experiment Report

A 2x2 factorial experiment evaluating placement (Poisson-disk vs. random) and angle assignment (BFS greedy vs. random) across 100 seeds.

**[Experiment Report](https://kakeami.github.io/kakeami-generator/experiments/)**

## Tech Stack

- **TypeScript** + **Vite** (no UI framework)
- **d3-delaunay** — Voronoi adjacency computation (sole runtime dependency)
- **Vitest** — Unit tests
- **Playwright** — Browser automation for experiments
- **GitHub Actions** — Auto-deploy to GitHub Pages

## License

[MIT](LICENSE)
