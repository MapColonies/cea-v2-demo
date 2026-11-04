import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDemoGeometry } from '@/lib/cea/demoSurface';
import { centerOf, contains, projectedCoordinate, tileAnnotation, tileColorToken, type Model, type Subtile } from '@/lib/cea/rules';
import { annotationFits } from '@/lib/cea/spatialView';
import type { FeatureCollection, Position } from 'geojson';
import type { Target } from './CoordinateTool';
interface Props {localReference?:FeatureCollection|null;model:Model;subtiles:Subtile[];referenceModels:Model[];referenceSubtiles:Subtile[];effectiveApproved:(t:Subtile)=>boolean;onToggle:(t:Subtile)=>void;target:Target|null;selectedIds?:Set<string>;focusedId?:string|null;hoveredId?:string|null;onSelect?:(t:Subtile)=>void;onHover?:(id:string|null)=>void;onVisibleChange?:(ids:string[])=>void;}
export function DemoSurfaceView({localReference,model,subtiles,referenceModels,referenceSubtiles,effectiveApproved,onToggle,target,selectedIds=new Set(),focusedId,hoveredId,onSelect,onHover,onVisibleChange}:Props) {
 const host=useRef<HTMLDivElement>(null),[readout,setReadout]=useState('X —  Y —  Z —'),[failure,setFailure]=useState(false);
 const current=useRef({effectiveApproved,onToggle,onSelect,onHover,onVisibleChange,selectedIds,hoveredId});current.current={effectiveApproved,onToggle,onSelect,onHover,onVisibleChange,selectedIds,hoveredId};
 useEffect(()=>{
  const el=host.current;if(!el)return;
  let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setFailure(true);return;}
  const token=(name:string)=>`hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g,', ')})`;
  const scene=new THREE.Scene();scene.background=new THREE.Color(token('--background'));
  const camera=new THREE.PerspectiveCamera(45,1,1,20000);camera.position.set(850,1050,1150);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,30,0);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(token('--foreground'),token('--muted'),2));const light=new THREE.DirectionalLight(token('--foreground'),2);light.position.set(500,1000,400);scene.add(light);
  const center=centerOf(model),width=Number(model.bbox_east)-Number(model.bbox_west),height=Number(model.bbox_north)-Number(model.bbox_south);
  const locate=(lat:number,lng:number)=>new THREE.Vector3((lng-center.lng)/width*1000,0,-(lat-center.lat)/height*1000);
  const meshes:THREE.Mesh[]=[];const mapModels=[model,...referenceModels];
  for(const m of mapModels){const geometry=createDemoGeometry(m);const active=m.id===model.id;const material=new THREE.MeshStandardMaterial({color:token(active?'--surface':'--reference'),roughness:.85,metalness:0,transparent:!active,opacity:active?1:.45,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.userData.model=m;
   if(!active){const c=centerOf(m);mesh.position.copy(locate(c.lat,c.lng));mesh.scale.set((Number(m.bbox_east)-Number(m.bbox_west))/width,1,(Number(m.bbox_north)-Number(m.bbox_south))/height);}
   scene.add(mesh);meshes.push(mesh);
   const wire=new THREE.LineSegments(new THREE.WireframeGeometry(geometry),new THREE.LineBasicMaterial({color:token('--border'),transparent:true,opacity:.16}));wire.position.copy(mesh.position);wire.scale.copy(mesh.scale);scene.add(wire);
  }
  scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  const verticalHeight=(x:number,z:number,mesh:THREE.Mesh)=>{ray.set(new THREE.Vector3(x,1000,z),new THREE.Vector3(0,-1,0));return ray.intersectObject(mesh)[0]?.point.y??0;};
  const resources:THREE.Object3D[]=[];
  const visuals:{tile:Subtile;line:THREE.Line;fill:THREE.Mesh;label?:THREE.Sprite;outline:THREE.Group;width:number;height:number}[]=[];
  for(const tile of [...subtiles,...referenceSubtiles]){const active=tile.model_id===model.id,mesh=meshes.find(m=>(m.userData.model as Model).id===tile.model_id);if(!mesh)continue;const west=Number(tile.bbox_west),east=Number(tile.bbox_east),south=Number(tile.bbox_south),north=Number(tile.bbox_north);
   const corners=[[south,west],[south,east],[north,east],[north,west],[south,west]];const points:THREE.Vector3[]=[];
   for(let edge=0;edge<4;edge++)for(let i=0;i<=24;i++){const [a,b]=corners[edge],[c,d]=corners[edge+1];const p=locate(a+(c-a)*i/24,b+(d-b)*i/24);p.y=verticalHeight(p.x,p.z,mesh)+3;points.push(p);}
   const lineMaterial=active?new THREE.LineBasicMaterial({color:token('--warning')}):new THREE.LineDashedMaterial({color:token('--reference'),dashSize:12,gapSize:8,transparent:true,opacity:.6});
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),lineMaterial);line.computeLineDistances();scene.add(line);resources.push(line);
   const sw=locate(south,west),ne=locate(north,east),w=ne.x-sw.x,h=sw.z-ne.z;
   const g=new THREE.PlaneGeometry(w,h,12,12);g.rotateX(-Math.PI/2);const attr=g.attributes.position;
   for(let i=0;i<attr.count;i++){const x=attr.getX(i)+(sw.x+ne.x)/2,z=attr.getZ(i)+(sw.z+ne.z)/2;attr.setXYZ(i,x,verticalHeight(x,z,mesh)+1.5,z);}g.computeVertexNormals();
   const fill=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:token('--warning'),transparent:true,opacity:active?.38:.08,side:THREE.DoubleSide,depthWrite:false}));scene.add(fill);
   const outline=new THREE.Group();const curve=new THREE.CatmullRomCurve3(points);for(const [radius,opacity] of [[2.5,1],[7,.22]]){const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,points.length, radius,6,false),new THREE.MeshBasicMaterial({color:token('--selection'),transparent:true,opacity,depthWrite:false}));outline.add(tube);}outline.visible=false;scene.add(outline);
   const visual:{tile:Subtile;line:THREE.Line;fill:THREE.Mesh;label?:THREE.Sprite;outline:THREE.Group;width:number;height:number}={tile,line,fill,outline,width:w,height:h};visuals.push(visual);
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');if(ctx){ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.lineWidth=5;ctx.strokeStyle=token('--label-halo');ctx.fillStyle=token('--label-text');const text=tileAnnotation(tile,mapModels);text.forEach((t,i)=>{ctx.strokeText(t,256,48+i*38);ctx.fillText(t,256,48+i*38);});const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:active?1:.6,depthWrite:false}));const pos=locate((north+south)/2,(east+west)/2);pos.y=verticalHeight(pos.x,pos.z,mesh)+12;sprite.position.copy(pos);sprite.scale.set(150,37.5,1);sprite.visible=false;scene.add(sprite);resources.push(sprite);visual.label=sprite;}

  }
  if(localReference){
   const draw=(coords:Position[])=>{const points=coords.map(([lng,lat])=>{const p=locate(lat,lng),mesh=meshes.find(m=>{const b=m.userData.model as Model;return lat>=b.bbox_south&&lat<=b.bbox_north&&lng>=b.bbox_west&&lng<=b.bbox_east;});p.y=(mesh?verticalHeight(p.x,p.z,mesh):0)+6;return p;});const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:token('--local-reference'),dashSize:12,gapSize:8}));line.computeLineDistances();scene.add(line);};
   for(const f of localReference.features){const g=f.geometry;if(g.type==='Polygon'||g.type==='MultiLineString')g.coordinates.forEach(draw);else if(g.type==='MultiPolygon')g.coordinates.forEach(p=>p.forEach(draw));else if(g.type==='LineString')draw(g.coordinates);else if(g.type==='Point'||g.type==='MultiPoint'){const coords=g.type==='Point'?[g.coordinates]:g.coordinates;for(const [lng,lat] of coords){const p=locate(lat,lng);p.y=6;const point=new THREE.Mesh(new THREE.SphereGeometry(5),new THREE.MeshBasicMaterial({color:token('--local-reference')}));point.position.copy(p);scene.add(point);}}}
  }
  const targetMesh=target?meshes.find(mesh=>contains(mesh.userData.model as Model,target.lat,target.lng)):undefined;
  if(target&&targetMesh){const p=locate(target.lat,target.lng);p.y=verticalHeight(p.x,p.z,targetMesh)+12;const marker=new THREE.Mesh(new THREE.SphereGeometry(9),new THREE.MeshBasicMaterial({color:token('--target')}));marker.position.copy(p);scene.add(marker);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(350,600,500));}
  const mouse=new THREE.Vector2(),cursorRay=new THREE.Raycaster();
  const hit=(event:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);cursorRay.setFromCamera(mouse,camera);return cursorRay.intersectObjects(meshes)[0];};
  const move=(e:PointerEvent)=>{const h=hit(e);if(!h){setReadout('X —  Y —  Z —');current.current.onHover?.(null);return;}const lat=center.lat-h.point.z/1000*height,lng=center.lng+h.point.x/1000*width,p=projectedCoordinate(lat,lng);const tile=(h.object.userData.model as Model).id===model.id?subtiles.find(t=>lat>=Number(t.bbox_south)&&lat<=Number(t.bbox_north)&&lng>=Number(t.bbox_west)&&lng<=Number(t.bbox_east)):null;current.current.onHover?.(tile?.id??null);setReadout(`X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${(h.object.userData.model as Model).is_rejected?'—':h.point.y.toFixed(2)+' m'}`);};
  let down:{x:number;y:number}|null=null;const start=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
  const end=(e:PointerEvent)=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;const h=hit(e);if(!h||(h.object.userData.model as Model).id!==model.id)return;const lat=center.lat-h.point.z/1000*height,lng=center.lng+h.point.x/1000*width;const t=subtiles.find(t=>lat>=Number(t.bbox_south)&&lat<=Number(t.bbox_north)&&lng>=Number(t.bbox_west)&&lng<=Number(t.bbox_east));if(t){if(current.current.onSelect)current.current.onSelect(t);else current.current.onToggle(t);}};
  renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',end);
  const bounds=new THREE.Box3();meshes.forEach(mesh=>bounds.expandByObject(mesh));const extent=bounds.getBoundingSphere(new THREE.Sphere());
  let framed=false;const resize=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;if(!framed&&!targetMesh){const fit=extent.radius*1.15/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))/Math.min(camera.aspect,1);controls.target.copy(extent.center);camera.position.copy(extent.center).add(new THREE.Vector3(.6,.85,.9).normalize().multiplyScalar(fit));framed=true;}camera.updateProjectionMatrix();});resize.observe(el);
  const leave=()=>current.current.onHover?.(null);renderer.domElement.addEventListener('pointerleave',leave);
  let lastVisible='',frame=0;const animate=()=>{controls.update();const visible:string[]=[];
   for(const v of visuals){const active=v.tile.model_id===model.id,hover=active&&current.current.hoveredId===v.tile.id,selected=active&&current.current.selectedIds.has(v.tile.id),approved=active?current.current.effectiveApproved(v.tile):v.tile.is_approved_for_coordinates;
    const fillToken=tileColorToken(mapModels.find(m=>m.id===v.tile.model_id),approved,!active);
    const lm=v.line.material as THREE.LineBasicMaterial;lm.color.set(token(selected?'--selection':hover?'--hover-outline':fillToken==='--warning'?'--unapproved-stroke':fillToken));
    v.outline.visible=selected;
    (v.fill.material as THREE.MeshBasicMaterial).color.set(token(fillToken));(v.fill.material as THREE.MeshBasicMaterial).opacity=active?(hover?.6:.38):.18;
    const corners=[[v.tile.bbox_south,v.tile.bbox_west],[v.tile.bbox_south,v.tile.bbox_east],[v.tile.bbox_north,v.tile.bbox_east],[v.tile.bbox_north,v.tile.bbox_west]].map(([lat,lng])=>{const p=locate(Number(lat),Number(lng));p.y=v.label?.position.y??0;return p.project(camera);});
    const front=corners.every(p=>p.z>-1&&p.z<1),minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    if(active&&front&&maxX>=-1&&minX<=1&&maxY>=-1&&minY<=1)visible.push(v.tile.id);
    if(v.label){const distance=camera.position.distanceTo(v.label.position),pixelsPerUnit=el.clientHeight/(2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));v.label.visible=front&&annotationFits(distance<1600,Math.min(corners[0].distanceTo(corners[1]),corners[2].distanceTo(corners[3]))*Math.min(el.clientWidth,el.clientHeight)/2,Math.min(corners[0].distanceTo(corners[3]),corners[1].distanceTo(corners[2]))*Math.min(el.clientWidth,el.clientHeight)/2,150*pixelsPerUnit,37.5*pixelsPerUnit);}
   }
   const key=visible.sort().join(',');if(key!==lastVisible){lastVisible=key;current.current.onVisibleChange?.(visible);}renderer.render(scene,camera);frame=requestAnimationFrame(animate);
  };animate();
  return ()=>{cancelAnimationFrame(frame);renderer.domElement.removeEventListener('pointerleave',leave);resize.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerdown',start);renderer.domElement.removeEventListener('pointerup',end);scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Sprite){if('geometry' in o)o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){if('map' in m&&(m as THREE.SpriteMaterial).map)(m as THREE.SpriteMaterial).map?.dispose();m.dispose();}}});renderer.dispose();renderer.domElement.remove();};
 },[model,subtiles,referenceModels,referenceSubtiles,target,localReference]);
 return <div className="relative h-full w-full min-h-0"><div ref={host} className="h-full w-full" aria-label="משטח תלת־ממד מדומה"/><div className="absolute bottom-2 left-2 bg-popover/95 text-popover-foreground p-2 rounded border text-xs font-mono" dir="ltr" data-testid="surface-readout">{readout}<span className="block text-muted-foreground">Israel Grid · מש מדומה — גובה לא מבצעי</span></div>{failure&&<p className="absolute inset-0 flex items-center justify-center text-destructive bg-background">תצוגת תלת־ממד אינה זמינה בדפדפן זה</p>}</div>;
}
