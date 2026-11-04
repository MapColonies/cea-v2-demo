import { contains, type Model, type Subtile } from '@/lib/cea/rules';
import type { OverlayStatus, TileOverlay } from '@/components/mapcolonies/Tiles3DView';

/** Sub-tiles of the active model (and read-only reference models) as draped 3D overlays, same colours as the 2D map. */
export function tileOverlays({ model, referenceModels = [], subtiles, references = [], effectiveApproved, selectedIds, hoveredId }: {
  model: Model; referenceModels?: Model[]; subtiles: Subtile[]; references?: Subtile[];
  effectiveApproved: (t: Subtile) => boolean; selectedIds?: Set<string>; hoveredId?: string | null;
}): TileOverlay[] {
  const bbox = (t: Subtile) => ({ west: Number(t.bbox_west), south: Number(t.bbox_south), east: Number(t.bbox_east), north: Number(t.bbox_north) });
  const refs = references.map(t => {
    const parent = referenceModels.find(m => m.id === t.model_id);
    const status: OverlayStatus = parent?.is_rejected ? 'rejected' : t.is_approved_for_coordinates ? 'reference-approved' : 'reference-unapproved';
    return { id: t.id, bbox: bbox(t), status };
  });
  const own = subtiles.map(t => {
    const status: OverlayStatus = model.is_rejected ? 'rejected' : effectiveApproved(t) ? 'approved' : 'unapproved';
    return { id: t.id, bbox: bbox(t), status, selected: selectedIds?.has(t.id), hovered: hoveredId === t.id };
  });
  return [...refs, ...own];
}

export const tileAt = (tiles: Subtile[], p: { lat: number; lng: number }) => tiles.find(t => contains(t, p.lat, p.lng));
