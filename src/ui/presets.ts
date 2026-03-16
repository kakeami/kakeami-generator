/**
 * Preset configurations — k=1,2,3,4 を自然な見た目で提示.
 */

import type { AppState } from './app';
import { defaultRenderParams } from '../core';

export interface Preset {
  name: string;
  state: AppState;
}

// 共通ベース: size≥10, pitch≥0.2, margin=0, bgHatching=true@45°
function base(): AppState {
  return {
    regionSize: 12,
    tileSize: 0.7,
    k: 1,
    pitch: 0.2,
    lineWeight: 0.5,
    seed: 42,
    renderParams: { ...defaultRenderParams() },
  };
}

export const presets: Preset[] = [
  {
    name: '1-kake',
    state: {
      ...base(),
      k: 1,
    },
  },
  {
    name: '2-kake',
    state: {
      ...base(),
      k: 2,
    },
  },
  {
    name: '3-kake',
    state: {
      ...base(),
      k: 3,
      pitch: 0.25,
    },
  },
  {
    name: '4-kake',
    state: {
      ...base(),
      k: 4,
      pitch: 0.25,
    },
  },
];
