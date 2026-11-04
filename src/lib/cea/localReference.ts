import shp, { parseShp } from 'shpjs';
import type { FeatureCollection, Position } from 'geojson';

export const MAX_REFERENCE_BYTES=20*1024*1024;
export function validateReference(data:FeatureCollection):FeatureCollection {
 if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>10000)throw new Error('קובץ רפרנס לא תקין או גדול מדי');
 let points=0;
 const coordinates=(value:unknown):void=>{if(!Array.isArray(value))throw new Error('גאומטריה לא תקינה');if(typeof value[0]==='number'){const p=value as Position;if(p.length<2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new Error('מערכת קואורדינטות לא נתמכת; יש לצרף PRJ');if(++points>200000)throw new Error('יותר מדי נקודות ברפרנס');}else value.forEach(coordinates);};
 for(const f of data.features){if(!f.geometry||!['Polygon','MultiPolygon','LineString','MultiLineString','Point','MultiPoint'].includes(f.geometry.type))throw new Error('סוג גאומטריה לא נתמך');if('coordinates' in f.geometry)coordinates(f.geometry.coordinates);}
 return data;
}
export async function readLocalReference(files:File[]):Promise<FeatureCollection> {
 if(files.reduce((n,f)=>n+f.size,0)>MAX_REFERENCE_BYTES)throw new Error('גודל הרפרנס המרבי הוא 20 MB');
 const zip=files.find(f=>f.name.toLowerCase().endsWith('.zip'));
 let data:FeatureCollection|FeatureCollection[];
 if(zip)data=await shp(await zip.arrayBuffer());
 else {const shape=files.find(f=>f.name.toLowerCase().endsWith('.shp')),prj=files.find(f=>f.name.toLowerCase().endsWith('.prj'));if(!shape||!prj)throw new Error('יש לבחור SHP ו־PRJ יחד, או ZIP המכיל אותם');data={type:'FeatureCollection',features:parseShp(await shape.arrayBuffer(),await prj.text()).map(geometry=>({type:'Feature',geometry,properties:{}}))};}
 const collections=Array.isArray(data)?data:[data];
 return validateReference({type:'FeatureCollection',features:collections.flatMap(d=>d.features)});
}