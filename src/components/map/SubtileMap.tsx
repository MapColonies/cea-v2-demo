import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { MapContainer, Rectangle, Tooltip as LeafletTooltip, GeoJSON, useMapEvents } from 'react-leaflet';
import { BasemapLayers } from './BasemapLayers';
import type { Map as LeafletMap, Rectangle as LeafletRectangle } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { contains, projectedCoordinate, tileAnnotation, tileColorToken, type Model, type Subtile } from '@/lib/cea/rules';
import { annotationFits, intersectsView } from '@/lib/cea/spatialView';
import { sampleDemoSurface } from '@/lib/cea/demoSurface';
import type { FeatureCollection } from 'geojson';
import { DemoSurfaceView } from './DemoSurfaceView';
import { RealModel3DView } from '@/components/mapcolonies/RealModel3DView';
import { boundsOf } from '@/lib/mapcolonies/match';
import { MapLegend } from './MapLegend';
interface Props { localReference?:FeatureCollection|null; model:Model; subtiles:Subtile[]; pendingIds:Set<string>; effectiveApproved:(t:Subtile)=>boolean; onToggle:(t:Subtile)=>void; referenceModels?:Model[]; selectedIds?:Set<string>; focusedId?:string|null; hoveredId?:string|null; onSelect?:(t:Subtile)=>void; onHover?:(id:string|null)=>void; onVisibleChange?:(ids:string[])=>void; overlay?:ReactNode; }
function Cursor({models,onMove}:{models:Model[];onMove:(s:string)=>void}) {useMapEvents({mousemove:e=>{const p=projectedCoordinate(e.latlng.lat,e.latlng.lng),m=models.find(m=>!m.is_rejected&&contains(m,e.latlng.lat,e.latlng.lng)),z=m?sampleDemoSurface(m,e.latlng.lat,e.latlng.lng):null;onMove(`X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${z===null?'—':z.toFixed(2)+' m'}`);},mouseout:()=>onMove('X —  Y —  Z —')});return null;}
function ViewEvents({onChange}:{onChange:()=>void}) {useMapEvents({moveend:onChange,zoomend:onChange,resize:onChange});return null;}
function StyledRectangle(props:ComponentProps<typeof Rectangle>) {
 const ref=useRef<LeafletRectangle>(null);
 const className=props.pathOptions?.className;
 useEffect(()=>{const el=ref.current?.getElement();if(!el)return;el.classList.toggle('cea-polygon-selected',className==='cea-polygon-selected');el.classList.toggle('cea-polygon-hover',className==='cea-polygon-hover');},[className]);
 return <Rectangle {...props} ref={ref}/>;
}
export function SubtileMap({localReference=null,model,subtiles,pendingIds,effectiveApproved,onToggle,referenceModels=[],selectedIds=new Set(),focusedId,hoveredId,onSelect,onHover,onVisibleChange,overlay}:Props) {
 const [map,setMap]=useState<LeafletMap|null>(null),[mode,setMode]=useState('map'),[readout,setReadout]=useState('X —  Y —  Z —'),[refs,setRefs]=useState<Subtile[]>([]),[refError,setRefError]=useState(false),[revision,setRevision]=useState(0);
 const ids=referenceModels.map(m=>m.id).sort().join(',');
 useEffect(()=>{let live=true;setRefs([]);setRefError(false);if(!ids)return;supabase.from('model_subtiles').select('*').in('model_id',ids.split(',')).then(({data,error})=>{if(live){setRefs(data||[]);setRefError(Boolean(error));}});return()=>{live=false;};},[ids]);
 useEffect(()=>{if(map&&mode==='map'){const ms=[model,...referenceModels];map.fitBounds([[Math.min(...ms.map(m=>Number(m.bbox_south))),Math.min(...ms.map(m=>Number(m.bbox_west)))],[Math.max(...ms.map(m=>Number(m.bbox_north))),Math.max(...ms.map(m=>Number(m.bbox_east)))]],{padding:[40,40],animate:false});map.invalidateSize();setRevision(v=>v+1);}},[map,model,ids,mode]);
 useEffect(()=>{if(!map||mode!=='map')return;const b=map.getBounds();onVisibleChange?.(subtiles.filter(t=>intersectsView(t,{bbox_south:b.getSouth(),bbox_north:b.getNorth(),bbox_west:b.getWest(),bbox_east:b.getEast()})).map(t=>t.id));},[map,mode,revision,subtiles,onVisibleChange]);
 useEffect(()=>{if(!map)return;const observer=new ResizeObserver(()=>map.invalidateSize({pan:false,animate:false}));observer.observe(map.getContainer());return()=>observer.disconnect();},[map]);
 const token=(name:string)=>`hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g,', ')})`;
 const showLabel=(t:Subtile)=>{if(!map)return false;const a=map.latLngToContainerPoint([Number(t.bbox_north),Number(t.bbox_west)]),b=map.latLngToContainerPoint([Number(t.bbox_south),Number(t.bbox_east)]);const lines=tileAnnotation(t,[model,...referenceModels]),text=lines.reduce((a,b)=>a.length>b.length?a:b,'');return annotationFits(map.getZoom()>=14,Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.max(text.length*5.8,70),38);};
 return <div className="h-full flex flex-col min-h-0 gap-2">
  <div className="flex-1 relative isolate z-0 min-h-0 border rounded-md overflow-hidden">
   {mode==='3d'?<RealModel3DView area={boundsOf(model)} demo={()=><DemoSurfaceView model={model} subtiles={subtiles} referenceModels={referenceModels} referenceSubtiles={refs} effectiveApproved={effectiveApproved} onToggle={onToggle} target={null} localReference={localReference} selectedIds={selectedIds} focusedId={focusedId} hoveredId={hoveredId} onSelect={onSelect} onHover={onHover} onVisibleChange={onVisibleChange}/>}/>:<><MapContainer center={[(Number(model.bbox_north)+Number(model.bbox_south))/2,(Number(model.bbox_east)+Number(model.bbox_west))/2]} zoom={12} className="h-full w-full z-0" ref={setMap}><BasemapLayers/>
   {[model,...referenceModels].map(m=><Rectangle key={m.id} bounds={[[Number(m.bbox_south),Number(m.bbox_west)],[Number(m.bbox_north),Number(m.bbox_east)]]} pathOptions={{color:token(m.id===model.id?'--pending':'--reference'),weight:2,fill:false,dashArray:m.id===model.id?undefined:'5 4'}}><LeafletTooltip>{m.name}</LeafletTooltip></Rectangle>)}
   {[...refs,...subtiles].map(t=>{const active=t.model_id===model.id,hover=active&&hoveredId===t.id,selected=active&&selectedIds.has(t.id),pending=pendingIds.has(t.id),approved=active?effectiveApproved(t):t.is_approved_for_coordinates,parent=[model,...referenceModels].find(m=>m.id===t.model_id),fillToken=tileColorToken(parent,approved,!active),color=token(fillToken==='--warning'?'--unapproved-stroke':fillToken);return <StyledRectangle key={t.id} bounds={[[Number(t.bbox_south),Number(t.bbox_west)],[Number(t.bbox_north),Number(t.bbox_east)]]} pathOptions={{className:selected?'cea-polygon-selected':hover?'cea-polygon-hover':'',color:selected?token('--selection'):hover?token('--hover-outline'):color,fillColor:token(fillToken),weight:selected?5:hover?3:pending?2:1.5,fillOpacity:active?.38:.18,dashArray:active?undefined:'4 4'}} eventHandlers={active?{click:()=>onSelect?onSelect(t):onToggle(t),mouseover:()=>onHover?.(t.id),mouseout:()=>onHover?.(null)}:undefined}>{showLabel(t)&&<LeafletTooltip permanent direction="center" className={active?'cea-map-label':'cea-map-label cea-map-reference'}><div dir="ltr">{tileAnnotation(t,[model,...referenceModels]).map((line,i)=><div key={i}>{line}</div>)}</div></LeafletTooltip>}</StyledRectangle>;})}
   {localReference&&<GeoJSON key={JSON.stringify(localReference).length} data={localReference} interactive={false} style={{color:token('--local-reference'),fillColor:token('--local-reference'),weight:2,fillOpacity:.12,dashArray:'6 4'}}/>}<ViewEvents onChange={()=>setRevision(v=>v+1)}/><Cursor models={[model,...referenceModels]} onMove={setReadout}/></MapContainer><div className="cea-map-legend absolute bottom-6 left-2 bg-popover/95 text-popover-foreground border rounded p-2 text-xs font-mono pointer-events-none" dir="ltr" data-testid="map-readout">{readout}<span className="block text-muted-foreground">Israel Grid · מש מדומה — גובה לא מבצעי</span></div></>}
   <div className="absolute top-2 right-2 left-12 z-[9999] flex flex-wrap items-start justify-center gap-2 pointer-events-none" dir="rtl">

    {refError&&<p className="text-xs text-destructive bg-popover/95 p-2 rounded-md">לא ניתן לטעון תתי־אזורים של רפרנס</p>}
    <div className="basis-full flex justify-center"><MapLegend inline/></div>
   </div>
   <div className="absolute left-2 top-1/2 -translate-y-1/2 z-[1000] flex flex-col overflow-hidden rounded-md border bg-popover/95 shadow" role="group" aria-label="מצב תצוגה"><Button size="sm" className="rounded-none" variant={mode==='map'?'default':'ghost'} aria-pressed={mode==='map'} onClick={()=>setMode('map')}>מפה</Button><Button size="sm" className="rounded-none" variant={mode==='3d'?'default':'ghost'} aria-pressed={mode==='3d'} onClick={()=>setMode('3d')}>תלת־ממד</Button></div>
   {overlay&&<div className="absolute bottom-2 right-2 z-[1000]">{overlay}</div>}
  </div>
 </div>;
}
