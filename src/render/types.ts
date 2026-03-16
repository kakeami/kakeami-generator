/**
 * Render output data structures.
 */

import type { Point2D, Segment } from '../core';

export interface HatchedTile {
  tileIndex: number;
  segments: Segment[];
  outline: Point2D[];
  lineWeight: number;
}

export interface RenderResult {
  hatchedTiles: HatchedTile[];
}
