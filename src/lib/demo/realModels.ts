import type { Model, Subtile } from '@/lib/cea/rules';
import type { Mc3DRecord, McBBox } from '@/lib/mapcolonies/csw';
import type { Polygon, MultiPolygon, Position } from 'geojson';

/**
 * Demo adapter: real MapColonies 3D Tiles records become approval-catalogue models, each split into
 * a deterministic grid of sub-tiles clipped to the record footprint. Nothing here touches the database.
 */

const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rand = (seed: string) => hash(seed) / 0xffffffff;
const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const day = (iso: string) => (iso ? iso.slice(0, 10) : null);

function inRing(lng: number, lat: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inFootprint(lng: number, lat: number, footprint: Polygon | MultiPolygon | null) {
  if (!footprint) return true;
  const polygons = footprint.type === 'Polygon' ? [footprint.coordinates] : footprint.coordinates;
  return polygons.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some(h => inRing(lng, lat, h)));
}

export function recordToModel(record: Mc3DRecord): Model {
  const b = record.bbox as McBBox;
  const updated = record.updateDateUTC || new Date(0).toISOString();
  return {
    id: record.id,
    name: record.productName,
    description: record.description || `${record.productType} · ${record.productionSystem || record.producerName || 'MapColonies'}`,
    source: [record.producerName, record.productionSystem].filter(Boolean).join(' · ') || 'MapColonies',
    country: record.region || 'אחר',
    bbox_west: b.west, bbox_south: b.south, bbox_east: b.east, bbox_north: b.north,
    center_lat: (b.south + b.north) / 2, center_lng: (b.west + b.east) / 2,
    accuracy: record.maxHorizontalAccuracyCE90,
    vertical_accuracy: record.accuracyLE90,
    resolution: null,
    capture_date: day(record.imagingTimeEndUTC),
    upload_date: day(updated),
    created_at: updated, updated_at: updated,
    is_published: true, is_rejected: false, is_locked_in_catalog: false,
    is_approved_for_coordinates: null, approved_at: null, approved_by: null, approved_subtile_count: 0,
    thumbnail_url: null,
  };
}

/** Grid of roughly square cells (≈16–36 per model) clipped to the footprint. */
export function subtilesForRecord(record: Mc3DRecord, model: Model): Subtile[] {
  const b = record.bbox as McBBox;
  const lat = (b.south + b.north) / 2;
  const widthM = (b.east - b.west) * 111320 * Math.cos((lat * Math.PI) / 180), heightM = (b.north - b.south) * 111320;
  const aspect = Math.max(widthM, 1) / Math.max(heightM, 1);
  const cols = Math.min(8, Math.max(2, Math.round(Math.sqrt(20 * aspect))));
  const rows = Math.min(8, Math.max(2, Math.round(Math.sqrt(20 / aspect))));
  const dx = (b.east - b.west) / cols, dy = (b.north - b.south) / rows;
  const baseH = record.maxHorizontalAccuracyCE90 ?? 3, baseV = record.accuracyLE90 ?? 3;
  const tiles: Subtile[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const west = b.west + c * dx, east = west + dx, south = b.south + r * dy, north = south + dy;
    const probes: [number, number][] = [[(west + east) / 2, (south + north) / 2], [west, south], [east, south], [east, north], [west, north]];
    if (!probes.some(([x, y]) => inFootprint(x, y, record.footprint))) continue;
    const code = `${String.fromCharCode(65 + r)}${c + 1}`, seed = `${record.id}:${code}`;
    tiles.push({
      id: seed, model_id: model.id, code, name: `${record.productName} ${code}`,
      display_id: String(10000000 + (hash(seed) % 90000000)),
      bbox_west: west, bbox_east: east, bbox_south: south, bbox_north: north,
      accuracy: round(baseH * (0.7 + rand(seed + 'h') * 0.8)),
      vertical_accuracy: round(baseV * (0.7 + rand(seed + 'v') * 0.8)),
      quality_rating: 3 + Math.floor(rand(seed + 'q') * 3),
      capture_date: model.capture_date,
      is_approved_for_coordinates: false, approved_at: null, approved_by: null,
      created_at: model.created_at, updated_at: model.updated_at,
    });
  }
  return tiles;
}
