import { useEffect,useState } from 'react';
import { MapContainer,Rectangle,Tooltip,CircleMarker } from 'react-leaflet';
import { BasemapLayers } from './BasemapLayers';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tileAnnotation,tileColorToken,type Subtile,type Model } from '@/lib/cea/rules';
import type { Target } from './CoordinateTool';
export function ModelMap({model,referenceModels=[],subtiles=[],target=null}:{model:Model|null;referenceModels?:Model[];subtiles?:Subtile[];target?:Target|null}) {
 const [map,setMap]=useState<LeafletMap|null>(null);const models=[...(model?[model]:[]),...referenceModels],ids=models.map(m=>m.id).join(',');
 useEffect(()=>{if(!map)return;if(models.length)map.fitBounds([[Math.min(...models.map(m=>Number(m.bbox_south))),Math.min(...models.map(m=>Number(m.bbox_west)))],[Math.max(...models.map(m=>Number(m.bbox_north))),Math.max(...models.map(m=>Number(m.bbox_east)))]],{padding:[30,30],animate:false});else map.setView([31.5,35],7,{animate:false});},[map,ids]);
 const token=(name:string)=>`hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g,', ')})`;
 useEffect(()=>{if(map&&target)map.setView([target.lat,target.lng],16,{animate:false});},[map,target]);
 return <div className="isolate relative z-0 h-full w-full border rounded-md overflow-hidden"><MapContainer center={[31.5,35]} zoom={7} className="h-full w-full z-0" ref={setMap}><BasemapLayers/>{models.map(m=><Rectangle key={m.id} bounds={[[Number(m.bbox_south),Number(m.bbox_west)],[Number(m.bbox_north),Number(m.bbox_east)]]} pathOptions={{color:token(m.id===model?.id?'--pending':'--reference'),weight:2,fillOpacity:m.id===model?.id?.2:.06,dashArray:m.id===model?.id?undefined:'5 4'}}><Tooltip permanent direction="center" className="cea-map-label">{m.name}</Tooltip></Rectangle>)}{subtiles.map(t=><Rectangle key={t.id} bounds={[[Number(t.bbox_south),Number(t.bbox_west)],[Number(t.bbox_north),Number(t.bbox_east)]]} pathOptions={{color:token(tileColorToken(models.find(m=>m.id===t.model_id),t.is_approved_for_coordinates)),fillOpacity:.3,weight:1.5}}><Tooltip className="cea-map-label">{tileAnnotation(t,models).map((line,i)=><div key={i}>{line}</div>)}</Tooltip></Rectangle>)}{target&&<CircleMarker center={[target.lat,target.lng]} radius={7} pathOptions={{color:token('--target'),fillOpacity:.9}}/>}</MapContainer></div>;
}
