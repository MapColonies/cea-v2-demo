import type { Subtile } from './rules';
export type Bounds = Pick<Subtile, 'bbox_south' | 'bbox_north' | 'bbox_west' | 'bbox_east'>;
// Bounding-box contact includes shared edges/corners and overlapping extents.
export const touchingModels = (active: Bounds & { id: string }, models: (Bounds & { id: string })[]) =>
  models.filter(model => model.id !== active.id && intersectsView(model, active));
export function intersectsView(tile: Bounds, view: Bounds) {
  return Number(tile.bbox_south) <= Number(view.bbox_north) && Number(tile.bbox_north) >= Number(view.bbox_south) && Number(tile.bbox_west) <= Number(view.bbox_east) && Number(tile.bbox_east) >= Number(view.bbox_west);
}
export function unapprovedInView(tiles: Subtile[], visible: Set<string>, approved: (tile: Subtile) => boolean) {
  return tiles.filter(tile => visible.has(tile.id) && !approved(tile)).map(tile => tile.id);
}
export function annotationFits(close: boolean, polygonWidth: number, polygonHeight: number, textWidth: number, textHeight: number) {
  return close && textWidth + 12 <= polygonWidth && textHeight + 12 <= polygonHeight;
}
