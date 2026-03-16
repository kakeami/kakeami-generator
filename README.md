# kakeami-generator

An interactive web-based generator for **kakeami** (掛け網), the traditional Japanese manga hatching technique. Attempt mathematical models of kakeami tile placement with real-time parameter control and SVG/PNG export.

## Features

- **Voronoi coloring algorithm**: Poisson-disk sampling + BFS greedy angle assignment for natural-looking results
- **Real-time preview**: Adjust parameters and see results instantly
- **Quality metrics**: Angular contrast (E_contrast), Landau-de Gennes energy (E_LdG), order parameter (S_order)
- **Presets**: Default, Dense Crosshatch, Light Sketch, Heavy Shadow
- **Export**: Download as SVG or high-resolution PNG (4096x4096)
- **No server required**: Runs entirely in the browser

## Usage

```bash
npm install
npm run dev
```

Open the displayed URL. Adjust parameters in the right panel and the preview updates in real-time.

### Build for production

```bash
npm run build
```

Output is in `dist/`. Deploy to any static hosting (GitHub Pages, Netlify, etc.).

### Run tests

```bash
npm test
```

## How it works

Kakeami consists of rectangular tiles, each filled with parallel hatching lines at a specific angle. The algorithms optimise angular contrast between neighbouring tiles — adjacent tiles should have maximally different hatching angles, creating the characteristic visual texture.

The mathematical model treats angles on the real projective line RP^1 and uses the Fubini-Study distance to measure angular difference.

## License

MIT
