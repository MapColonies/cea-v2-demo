import { describe, expect, it } from 'vitest';
import { boundsOf, tilesetsForBounds } from './match';
import type { Mc3DRecord } from './csw';

const rec = (id: string, bbox: Mc3DRecord['bbox'], tilesetUrl: string | null = `https://tiles.mapcolonies.net/${id}/tileset.json`, accuracyLE90: number | null = 3) =>
  ({ id, productName: id, bbox, tilesetUrl, accuracyLE90 } as Mc3DRecord);

describe('tilesetsForBounds', () => {
  const area = { west: 35.2, south: 33.0, east: 35.3, north: 33.1 };
  it('returns only real 3D Tiles layers that overlap the area, best coverage first', () => {
    const lebanon = rec('lebanon', { west: 35.15, south: 33.0, east: 36.77, north: 34.3 }, undefined, 111);
    const partial = rec('partial', { west: 35.25, south: 33.05, east: 35.6, north: 33.5 });
    const far = rec('iran', { west: 51.99, south: 36.49, east: 52.01, north: 36.51 });
    const dem = rec('dem', { west: 35, south: 32.9, east: 35.5, north: 33.2 }, null);
    expect(tilesetsForBounds([partial, far, dem, lebanon], area).map(r => r.id)).toEqual(['lebanon', 'partial']);
  });
  it('prefers better accuracy when coverage is equal', () => {
    const coarse = rec('coarse', { west: 35, south: 32.9, east: 35.5, north: 33.2 }, undefined, 100);
    const fine = rec('fine', { west: 35.1, south: 32.95, east: 35.4, north: 33.15 }, undefined, 2);
    expect(tilesetsForBounds([coarse, fine], area)[0].id).toBe('fine');
  });
  it('converts model bbox columns', () => {
    expect(boundsOf({ bbox_west: '35.1', bbox_south: 33, bbox_east: 35.2, bbox_north: '33.1' })).toEqual({ west: 35.1, south: 33, east: 35.2, north: 33.1 });
  });
});
