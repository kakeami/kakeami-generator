/**
 * Rendering parameters — independent of the mathematical model.
 */

export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot' | 'long-dash';

export const LINE_STYLES: readonly { value: LineStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dash-dot', label: 'Dash-dot' },
  { value: 'dash-dot-dot', label: 'Dash-dot-dot' },
  { value: 'long-dash', label: 'Long dash' },
] as const;

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
  lineStyle: LineStyle;
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
    lineStyle: 'solid',
  };
}
