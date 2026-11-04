import proj4 from 'proj4';
import type { Database } from '@/integrations/supabase/types';
export type Model = Database['public']['Tables']['models']['Row'];
export type Subtile = Database['public']['Tables']['model_subtiles']['Row'];
export type SubtileStats = Record<string, { total: number; approved: number }>;
export type ModelStatus = 'approved' | 'partial' | 'not_approved' | 'rejected';
export const APPROVAL_IDLE_MS=30*60*1000, APPROVAL_HARD_MS=12*60*60*1000, EDIT_IDLE_MS=10*60*1000;
export const SAVE_CONFIRMATION_MS = 5000;
export function approvalStatusChanges(tiles: Pick<Subtile, 'id'>[], status: Exclude<ModelStatus, 'rejected'>, selected: Set<string>): Record<string, boolean> {
 const selectedCount = tiles.filter(tile => selected.has(tile.id)).length;
 if (status === 'partial' && (selectedCount === 0 || selectedCount === tiles.length)) throw new Error('לאישור חלקי יש לבחור לפחות תת־אריח אחד ולהשאיר לפחות אחד לא מאושר');
 if (status === 'approved' && tiles.length === 0) throw new Error('אין תתי־אריחים לאישור');
 return Object.fromEntries(tiles.map(tile => [tile.id, status === 'approved' || (status === 'partial' && selected.has(tile.id))]));
}
export const sessionValid=(verifiedAt:number,lastActivity:number,now:number)=>now-lastActivity<APPROVAL_IDLE_MS&&now-verifiedAt<APPROVAL_HARD_MS;
export const catalogProtected=(approved:number)=>approved>=1;
export function statusOf(model:Model,stats:SubtileStats):ModelStatus {if(model.is_rejected)return 'rejected';const s=stats[model.id];return !s||s.total===0||s.approved===0?'not_approved':s.approved===s.total?'approved':'partial';}
export function accuracyInRange(accuracy:number|null,from:string,to:string) {if(!from&&!to)return true;const min=from?Number(from):0,max=to?Number(to):Infinity;return Number.isFinite(min)&&min>=0&&max>=min&&accuracy!==null&&accuracy>=min&&accuracy<=max;}
export const tileIdentifier=(tile:Subtile)=>tile.display_id || tile.code;
export function tileAnnotation(tile:Subtile,models:Model[]) {return [models.find(m=>m.id===tile.model_id)?.name||'—',`${tileIdentifier(tile)} · H ${tile.accuracy??'—'}m / V ${tile.vertical_accuracy??'—'}m`];}
export function tileColorToken(model:Model|undefined,approved:boolean,reference=false) {return model?.is_rejected?'--rejected':reference?(approved?'--reference-approved':'--reference-unapproved'):(approved?'--success':'--warning');}
export function centerOf(m:Model) {return {lat:Number(m.center_lat??(Number(m.bbox_north)+Number(m.bbox_south))/2),lng:Number(m.center_lng??(Number(m.bbox_east)+Number(m.bbox_west))/2)};}
export function distanceKm(a:{lat:number;lng:number},b:{lat:number;lng:number}) {const r=Math.PI/180,h=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(h)));}
export const withinRadius=(m:Model,lat:number,lng:number,radius:number)=>Number.isFinite(radius)&&radius>=0&&distanceKm(centerOf(m),{lat,lng})<=radius;
export function contains(t:Pick<Subtile,'bbox_north'|'bbox_south'|'bbox_east'|'bbox_west'>,lat:number,lng:number) {return lat>=Number(t.bbox_south)&&lat<=Number(t.bbox_north)&&lng>=Number(t.bbox_west)&&lng<=Number(t.bbox_east);}
export const ITM='+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs';
export function convertCoordinate(system:string,x:number,y:number,zone=36,north=true) {
 if(!Number.isFinite(x)||!Number.isFinite(y)) throw new Error('קואורדינטות לא תקינות');
 if(system==='utm'&&(!Number.isInteger(zone)||zone<1||zone>60)) throw new Error('אזור UTM חייב להיות 1–60');
 const projection=system==='itm'?ITM:system==='utm'?`+proj=utm +zone=${zone} ${north?'':'+south'} +datum=WGS84 +units=m +no_defs`:'EPSG:4326';
 const [lng,lat]=proj4(projection,'EPSG:4326',[x,y]);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) throw new Error('קואורדינטות מחוץ לטווח');
 return {lat,lng};
}
export function projectedCoordinate(lat:number,lng:number) {const [x,y]=proj4('EPSG:4326',ITM,[lng,lat]);return {x,y};}
