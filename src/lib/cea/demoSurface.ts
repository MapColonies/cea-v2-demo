import * as THREE from 'three';
import type { Model } from './rules';
export function demoHeight(u:number,v:number) {return 35+22*Math.sin(u*8)*Math.cos(v*6)+70*Math.exp(-((u-.6)**2+(v-.45)**2)*20);}
export function createDemoGeometry(model:Model,segments=48) {
 const geometry=new THREE.PlaneGeometry(1000,1000,segments,segments);geometry.rotateX(-Math.PI/2);
 const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const u=p.getX(i)/1000+.5,v=.5-p.getZ(i)/1000;p.setY(i,demoHeight(u,v));}
 geometry.computeVertexNormals(); return geometry;
}
export function sampleDemoSurface(model:Model,lat:number,lng:number):number|null {
 const u=(lng-Number(model.bbox_west))/(Number(model.bbox_east)-Number(model.bbox_west)),v=(lat-Number(model.bbox_south))/(Number(model.bbox_north)-Number(model.bbox_south));
 if(u<0||u>1||v<0||v>1)return null;
 // Same triangles as PlaneGeometry: sample their piecewise-linear rendered surface.
 const n=48,gx=u*n,gy=(1-v)*n,col=Math.min(n-1,Math.floor(gx)),row=Math.min(n-1,Math.floor(gy)),a=gx-col,b=gy-row;
 const h=(c:number,r:number)=>demoHeight(c/n,1-r/n),tl=h(col,row),tr=h(col+1,row),bl=h(col,row+1),br=h(col+1,row+1);
 return a+b<=1?tl+(tr-tl)*a+(bl-tl)*b:br+(bl-br)*(1-a)+(tr-br)*(1-b);
}
