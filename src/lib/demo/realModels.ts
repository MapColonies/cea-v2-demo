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

export type DemoSubtile = Subtile & { footprintCoords?: [number, number][] };

/** Sutherland-Hodgman: clip subject polygon against each edge of clipRing. Works for convex rings. */
function clipPolygonByRing(subject: [number, number][], clipRing: Position[]): [number, number][] {
  const n = clipRing.length;
  let poly = subject;
  for (let i = 0; i < n - 1; i++) {
    if (poly.length === 0) return [];
    const a = clipRing[i] as [number, number];
    const b = clipRing[i + 1] as [number, number];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const inside = (p: [number, number]) => dx * (p[1] - a[1]) - dy * (p[0] - a[0]) >= 0;
    const intersect = (p1: [number, number], p2: [number, number]): [number, number] => {
      const denom = (p2[0] - p1[0]) * dy - (p2[1] - p1[1]) * dx;
      if (Math.abs(denom) < 1e-15) return p1;
      const t = ((a[0] - p1[0]) * dy - (a[1] - p1[1]) * dx) / denom;
      return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
    };
    const out: [number, number][] = [];
    for (let j = 0; j < poly.length; j++) {
      const curr = poly[j], prev = poly[(j - 1 + poly.length) % poly.length];
      if (inside(curr)) { if (!inside(prev)) out.push(intersect(prev, curr)); out.push(curr); }
      else if (inside(prev)) out.push(intersect(prev, curr));
    }
    poly = out;
  }
  return poly.length >= 3 ? poly : [];
}

function clipCellToFootprint(poly8: [number, number][], west: number, south: number, east: number, north: number, footprint: Polygon | MultiPolygon | null): [number, number][] | undefined {
  if (!footprint) return undefined;
  const rings = footprint.type === 'Polygon' ? [footprint.coordinates[0]] : footprint.coordinates.map(p => p[0]);
  const corners: [number, number][] = [[west, south], [east, south], [east, north], [west, north]];
  const allIn = corners.every(([lng, lat]) => inFootprint(lng, lat, footprint));
  if (allIn) return undefined;
  let best: [number, number][] = [];
  for (const ring of rings) {
    const clipped = clipPolygonByRing(poly8, ring);
    if (clipped.length > best.length) best = clipped;
  }
  if (best.length < 3) return undefined;
  // If clipped result is same as poly8 (all points inside), no need to override
  if (best.length === poly8.length && best.every(([x, y], i) => Math.abs(x - poly8[i][0]) < 1e-12 && Math.abs(y - poly8[i][1]) < 1e-12)) return undefined;
  return best;
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

/** Grid of roughly square cells (≈16–36 per model) clipped to the footprint, with perturbed interior vertices. */
export function subtilesForRecord(record: Mc3DRecord, model: Model): DemoSubtile[] {
  const b = record.bbox as McBBox;
  const lat = (b.south + b.north) / 2;
  const widthM = (b.east - b.west) * 111320 * Math.cos((lat * Math.PI) / 180), heightM = (b.north - b.south) * 111320;
  const aspect = Math.max(widthM, 1) / Math.max(heightM, 1);
  const cols = Math.min(8, Math.max(2, Math.round(Math.sqrt(20 * aspect))));
  const rows = Math.min(8, Math.max(2, Math.round(Math.sqrt(20 / aspect))));
  const dx = (b.east - b.west) / cols, dy = (b.north - b.south) / rows;
  const baseH = record.maxHorizontalAccuracyCE90 ?? 3, baseV = record.accuracyLE90 ?? 3;

  // Perturb interior grid vertices deterministically (up to 30% of cell size, border vertices stay fixed).
  const jitter = (r: number, c: number, axis: 'x' | 'y') => {
    if ((axis === 'x' && (c === 0 || c === cols)) || (axis === 'y' && (r === 0 || r === rows))) return 0;
    const s = `${record.id}:j:${r}:${c}:${axis}`;
    return (rand(s) - 0.5) * 0.6 * (axis === 'x' ? dx : dy);
  };
  const vx = (r: number, c: number) => b.west + c * dx + jitter(r, c, 'x');
  const vy = (r: number, c: number) => b.south + r * dy + jitter(r, c, 'y');
  // Shared edge-midpoint jitter keyed by edge position, not by tile — adjacent tiles share the same midpoint.
  // Horizontal edges (between row r and r+1): seed by (r+1, c), no jitter on model boundary rows.
  const mh = (edgeRow: number, c: number) => (edgeRow === 0 || edgeRow === rows) ? 0 : (rand(`${record.id}:mh:${edgeRow}:${c}`) - 0.5) * 0.35 * dy;
  // Vertical edges (between col c and c+1): seed by (r, c+1), no jitter on model boundary cols.
  const mv = (r: number, edgeCol: number) => (edgeCol === 0 || edgeCol === cols) ? 0 : (rand(`${record.id}:mv:${r}:${edgeCol}`) - 0.5) * 0.35 * dx;

  const tiles: DemoSubtile[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const west = b.west + c * dx, east = west + dx, south = b.south + r * dy, north = south + dy;
    const probes: [number, number][] = [[(west + east) / 2, (south + north) / 2], [west, south], [east, south], [east, north], [west, north]];
    if (!probes.some(([x, y]) => inFootprint(x, y, record.footprint))) continue;
    const code = `${String.fromCharCode(65 + r)}${c + 1}`, seed = `${record.id}:${code}`;
    // 8-point polygon with SHARED edge midpoints — no gaps between adjacent tiles
    const poly8: [number, number][] = [
      [vx(r, c),   vy(r, c)],
      [(vx(r, c) + vx(r, c+1)) / 2,       (vy(r, c) + vy(r, c+1)) / 2       + mh(r, c)],   // bottom edge midpoint
      [vx(r, c+1), vy(r, c+1)],
      [(vx(r, c+1) + vx(r+1, c+1)) / 2    + mv(r, c+1), (vy(r, c+1) + vy(r+1, c+1)) / 2],  // right edge midpoint
      [vx(r+1, c+1), vy(r+1, c+1)],
      [(vx(r+1, c+1) + vx(r+1, c)) / 2,   (vy(r+1, c+1) + vy(r+1, c)) / 2   + mh(r+1, c)], // top edge midpoint
      [vx(r+1, c), vy(r+1, c)],
      [(vx(r+1, c) + vx(r, c)) / 2        + mv(r, c),   (vy(r+1, c) + vy(r, c)) / 2],       // left edge midpoint
    ];
    const clipped = clipCellToFootprint(poly8, west, south, east, north, record.footprint);
    const footprintCoords = clipped ?? poly8;
    tiles.push({
      id: seed, model_id: model.id, code, name: code,
      display_id: String(10000000 + (hash(seed) % 90000000)),
      bbox_west: west, bbox_east: east, bbox_south: south, bbox_north: north,
      accuracy: round(baseH * (0.7 + rand(seed + 'h') * 0.8)),
      vertical_accuracy: round(baseV * (0.7 + rand(seed + 'v') * 0.8)),
      quality_rating: 3 + Math.floor(rand(seed + 'q') * 3),
      capture_date: model.capture_date,
      is_approved_for_coordinates: false, approved_at: null, approved_by: null,
      created_at: model.created_at, updated_at: model.updated_at,
      footprintCoords,
    });
  }
  return tiles;
}
