import { describe, expect, it } from 'vitest';
import { inFootprint, recordToModel, subtilesForRecord } from './realModels';
import type { Mc3DRecord } from '@/lib/mapcolonies/csw';

const record = {
  id: 'f9e55c08', productName: 'e051n36_S', productType: '3DPhotoRealistic', region: 'אירן', producerName: 'IDFMU', productionSystem: 'vantor',
  accuracyLE90: 3, maxHorizontalAccuracyCE90: 3, imagingTimeEndUTC: '2026-01-01T14:55:00Z', updateDateUTC: '2026-01-19T18:32:03Z', description: '',
  bbox: { west: 51.998251, south: 36.4979102, east: 52.0167427, north: 36.5135174 },
  // real footprint: a triangle-ish polygon, so part of the bbox has no data
  footprint: { type: 'Polygon', coordinates: [[[52.0167427, 36.4979102], [52.0108586, 36.5025079], [52.0029789, 36.508665], [51.998251, 36.5135174], [52.0167427, 36.5135174], [52.0167427, 36.4979102]]] },
  tilesetUrl: 'https://tiles.mapcolonies.net/x/tileset.json',
} as unknown as Mc3DRecord;

describe('real MapColonies models as demo approval models', () => {
  it('maps catalogue metadata onto the approval model row', () => {
    const m = recordToModel(record);
    expect(m).toMatchObject({ id: 'f9e55c08', name: 'e051n36_S', country: 'אירן', vertical_accuracy: 3, accuracy: 3, capture_date: '2026-01-01', is_published: true, is_rejected: false });
    expect(m.center_lat).toBeCloseTo(36.5057, 3);
  });
  it('builds a deterministic grid clipped to the real footprint', () => {
    const m = recordToModel(record);
    const a = subtilesForRecord(record, m), b = subtilesForRecord(record, m);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(4);
    expect(a.every(t => /^\d{8}$/.test(t.display_id!))).toBe(true);
    expect(new Set(a.map(t => t.id)).size).toBe(a.length);
    // the empty south-west corner of the bbox gets no sub-tile
    expect(a.some(t => t.bbox_west === record.bbox!.west && t.bbox_south === record.bbox!.south)).toBe(false);
    expect(a.every(t => !t.is_approved_for_coordinates)).toBe(true);
  });
  it('tests points against footprint polygons', () => {
    expect(inFootprint(52.015, 36.512, record.footprint)).toBe(true);
    expect(inFootprint(51.999, 36.499, record.footprint)).toBe(false);
    expect(inFootprint(0, 0, null)).toBe(true);
  });
});
