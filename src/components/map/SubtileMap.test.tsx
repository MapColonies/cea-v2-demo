import { forwardRef, useImperativeHandle } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SubtileMap } from './SubtileMap';
import type { Model, Subtile } from '@/lib/cea/rules';

const map = vi.hoisted(() => ({ fitBounds:vi.fn(), setView:vi.fn(), invalidateSize:vi.fn(), latLngToContainerPoint:()=>({x:0,y:0}), getZoom:()=>12, getBounds:()=>({getSouth:()=>32,getNorth:()=>33,getWest:()=>35,getEast:()=>36}), getContainer:()=>document.body }));
vi.mock('react-leaflet',()=>({
 MapContainer:forwardRef(({children}:{children:React.ReactNode},ref)=>{useImperativeHandle(ref,()=>map);return <div>{children}</div>;}),
 Rectangle:forwardRef(({children}:{children:React.ReactNode},ref)=>{useImperativeHandle(ref,()=>({getElement:()=>undefined}));return <div>{children}</div>;}),
 TileLayer:()=>null, Tooltip:()=>null, CircleMarker:()=>null, useMap:()=>map, useMapEvents:()=>map,
}));
vi.mock('./BasemapLayers',()=>({BasemapLayers:()=>null}));
vi.mock('./DemoSurfaceView',()=>({DemoSurfaceView:()=>null}));
vi.mock('./CoordinateTool',()=>({CoordinateTool:()=>null}));
vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});

describe('selection camera stability',()=>{
 it('fits on entry and never pans or refits when selection or hover changes',async()=>{
  const model={id:'model',bbox_south:32,bbox_north:33,bbox_west:35,bbox_east:36} as Model;
  const tile={id:'tile',model_id:'model',bbox_south:32,bbox_north:33,bbox_west:35,bbox_east:36,code:'A1',quality_rating:4,updated_at:'2026-10-25',is_approved_for_coordinates:false} as Subtile;
  const props={model,subtiles:[tile],pendingIds:new Set<string>(),effectiveApproved:()=>false,onToggle:vi.fn()};
  const view=render(<SubtileMap {...props}/>);
  await waitFor(()=>expect(map.fitBounds).toHaveBeenCalledWith([[32,35],[33,36]],{padding:[40,40],animate:false}));
  map.fitBounds.mockClear();map.setView.mockClear();
  view.rerender(<SubtileMap {...props} selectedIds={new Set(['tile'])} focusedId="tile" hoveredId="tile"/>);
  expect(map.setView).not.toHaveBeenCalled();
  expect(map.fitBounds).not.toHaveBeenCalled();
 });
});