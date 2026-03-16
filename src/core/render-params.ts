/**
 * Rendering parameters — independent of the mathematical model.
 */

export interface RenderParams {
  margin: number;
  noiseAngle: number;
  noiseSpacing: number;
  noiseWeight: number;
  seed: number | null;
  showOutline: boolean;
  backgroundColor: string;
  lineColor: string;
  bgHatching: boolean;
  bgHatchingAngle: number;
}

export function defaultRenderParams(): RenderParams {
  return {
    margin: 0.0,
    noiseAngle: 0.0,
    noiseSpacing: 0.0,
    noiseWeight: 0.0,
    seed: null,
    showOutline: false,
    backgroundColor: 'white',
    lineColor: 'black',
    bgHatching: true,
    bgHatchingAngle: Math.PI / 4,
  };
}
