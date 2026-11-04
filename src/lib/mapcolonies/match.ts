import type { Mc3DRecord, McBBox } from './csw';

const overlap = (a: McBBox, b: McBBox) => {
  const w = Math.min(a.east, b.east) - Math.max(a.west, b.west);
  const h = Math.min(a.north, b.north) - Math.max(a.south, b.south);
  return w >= 0 && h >= 0 ? { w, h } : null;
};

/**
 * Real MapColonies 3D Tiles layers that cover an area, best match first:
 * largest share of the area covered, then best vertical accuracy (LE90), then smallest layer.
 */
export function tilesetsForBounds(records: Mc3DRecord[], area: McBBox) {
  const size = Math.max((area.east - area.west) * (area.north - area.south), 1e-12);
  return records
    .filter(r => r.tilesetUrl && r.bbox && overlap(r.bbox, area))
    .map(r => {
      const o = overlap(r.bbox!, area)!;
      return { record: r, coverage: Math.min(1, (o.w * o.h) / size), extent: (r.bbox!.east - r.bbox!.west) * (r.bbox!.north - r.bbox!.south) };
    })
    .sort((a, b) => b.coverage - a.coverage || (a.record.accuracyLE90 ?? 1e9) - (b.record.accuracyLE90 ?? 1e9) || a.extent - b.extent)
    .map(m => m.record);
}

export const boundsOf = (m: { bbox_west: number | string; bbox_south: number | string; bbox_east: number | string; bbox_north: number | string }): McBBox =>
  ({ west: Number(m.bbox_west), south: Number(m.bbox_south), east: Number(m.bbox_east), north: Number(m.bbox_north) });
