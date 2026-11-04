import { describe, it, expect } from 'vitest';
import { intersectsView, touchingModels, unapprovedInView, annotationFits } from './spatialView';
import type { Subtile } from './rules';
const tile = { id:'a', bbox_south:32, bbox_north:32.01, bbox_west:35, bbox_east:35.01, is_approved_for_coordinates:false } as Subtile;
describe('refined spatial rules', () => {
  it('shows whole touching neighbors but excludes the active model and distant models', () => {
    const edge = {...tile, id:'edge', bbox_west:35.01, bbox_east:35.02};
    const distant = {...edge, id:'distant', bbox_west:35.03};
    const overlap = {...tile, id:'overlap'};
    expect(touchingModels(tile, [tile, edge, distant, overlap])).toEqual([edge, overlap]);
  });
  it('selects only visible unapproved tiles, respecting pending approvals', () => {
    const tiles=[tile,{...tile,id:'b',is_approved_for_coordinates:true},{...tile,id:'c'}];
    expect(unapprovedInView(tiles,new Set(['a','b']),t=>t.is_approved_for_coordinates)).toEqual(['a']);
    expect(unapprovedInView(tiles,new Set(['a','b']),t=>t.id==='a'||t.is_approved_for_coordinates)).toEqual([]);
  });
  it('includes intersecting tile boundaries and excludes offscreen tiles',()=>{
    expect(intersectsView(tile,{bbox_south:32.01,bbox_north:32.02,bbox_west:35,bbox_east:35.01})).toBe(true);
    expect(intersectsView(tile,{bbox_south:32.02,bbox_north:32.03,bbox_west:35,bbox_east:35.01})).toBe(false);
  });
  it('hides labels at distant zoom and when either dimension exceeds boundaries',()=>{
    expect(annotationFits(false,200,100,120,40)).toBe(false);
    expect(annotationFits(true,100,100,120,40)).toBe(false);
    expect(annotationFits(true,200,40,120,40)).toBe(false);
    expect(annotationFits(true,200,100,120,40)).toBe(true);
  });
});
