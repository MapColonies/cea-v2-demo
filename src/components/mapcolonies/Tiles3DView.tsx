import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer, EnvironmentControls } from '3d-tiles-renderer/three';
import { GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/three/plugins';
import { projectedCoordinate } from '@/lib/cea/rules';
import { tokenizedUrl } from '@/lib/mapcolonies/client';
import type { McBBox } from '@/lib/mapcolonies/csw';

interface Props {
  tilesetUrl: string;
  /** Layer extent; its centre becomes the scene origin. */
  bbox: McBBox | null;
  /** Area to open the camera on (e.g. the selected model or a target point); defaults to the whole tileset. */
  focus?: McBBox | null;
}

const EMPTY_READOUT = 'X —  Y —  Z —';
const deg = THREE.MathUtils.RAD2DEG;

/**
 * Real photorealistic 3D Tiles (b3dm/glb) rendered with Three.js through 3d-tiles-renderer.
 * The tileset is re-oriented so the bbox centre sits at the origin with +Y up (ellipsoidal height),
 * and pointer readouts convert hits back to WGS84 and Israel grid.
 */
export function Tiles3DView({ tilesetUrl, bbox, focus = null }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [readout, setReadout] = useState(EMPTY_READOUT);
  const [geo, setGeo] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    const el = host.current; if (!el) return;
    setError(''); setProgress(0); setReadout(EMPTY_READOUT); setGeo('');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); } catch { setFailure(true); return; }
    const token = (name: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g, ', ')})`;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(token('--background'));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 1e7);
    camera.position.set(0, 3000, 3000);

    const tiles = new TilesRenderer(tilesetUrl);
    tiles.registerPlugin({ name: 'MAPCOLONIES_TOKEN', preprocessURL: (url: string | URL) => tokenizedUrl(url.toString()) });
    const draco = new DRACOLoader(); // three r186 bundles the decoder via import.meta.url
    tiles.registerPlugin(new GLTFExtensionsPlugin({ rtc: true, dracoLoader: draco }));
    tiles.registerPlugin(bbox
      ? new ReorientationPlugin({ lat: ((bbox.south + bbox.north) / 2) * THREE.MathUtils.DEG2RAD, lon: ((bbox.west + bbox.east) / 2) * THREE.MathUtils.DEG2RAD, height: 0, recenter: true })
      : new ReorientationPlugin({ recenter: true }));
    tiles.errorTarget = 8;
    tiles.setCamera(camera);
    scene.add(tiles.group);

    const controls = new EnvironmentControls(scene, camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxAltitude = Math.PI / 2 - 0.05;

    const viewDir = new THREE.Vector3(0, 0.75, 1).normalize();
    const look = (center: THREE.Vector3, distance: number) => {
      camera.position.copy(center).addScaledVector(viewDir, distance);
      camera.lookAt(center);
      camera.updateMatrixWorld();
    };
    // Focus area: aim at the ellipsoid point first, then settle onto the real surface once tiles under it load.
    let settle: { center: THREE.Vector3; up: THREE.Vector3; distance: number; until: number } | null = null;
    // Frame the camera once the root tileset (and its bounding volume) is known.
    const frame = () => {
      tiles.group.updateMatrixWorld(true);
      if (focus) {
        const D = THREE.MathUtils.DEG2RAD, lat = (focus.south + focus.north) / 2, lon = (focus.west + focus.east) / 2;
        // Aim at the top of the tileset's bounding volume so the camera starts above any terrain and tiles load in view.
        let top = 0;
        const obb = new THREE.Box3(), obbMatrix = new THREE.Matrix4(), corner = new THREE.Vector3(), c = { lat: 0, lon: 0, height: 0 };
        if (tiles.getOrientedBoundingBox(obb, obbMatrix)) {
          for (let i = 0; i < 8; i++) {
            corner.set(i & 1 ? obb.max.x : obb.min.x, i & 2 ? obb.max.y : obb.min.y, i & 4 ? obb.max.z : obb.min.z).applyMatrix4(obbMatrix);
            top = Math.max(top, tiles.ellipsoid.getPositionToCartographic(corner, c).height);
          }
        }
        const center = tiles.ellipsoid.getCartographicToPosition(lat * D, lon * D, Math.min(top, 9000), new THREE.Vector3()).applyMatrix4(tiles.group.matrixWorld);
        const up = tiles.ellipsoid.getCartographicToNormal(lat * D, lon * D, new THREE.Vector3()).transformDirection(tiles.group.matrixWorld);
        const metres = Math.hypot((focus.north - focus.south) * 111320, (focus.east - focus.west) * 111320 * Math.cos(lat * D));
        const distance = Math.min(Math.max(metres * 1.2, 800), 80000);
        look(center, distance);
        settle = { center, up, distance, until: performance.now() + 20000 };
        return;
      }
      const sphere = new THREE.Sphere();
      if (!tiles.getBoundingSphere(sphere)) return;
      sphere.applyMatrix4(tiles.group.matrixWorld);
      look(sphere.center, Math.max(sphere.radius * 1.6, 200));
    };
    const stopSettle = () => { settle = null; };
    controls.addEventListener('start', stopSettle);
    const down = new THREE.Raycaster();
    let settleFrame = 0;
    const settleOnSurface = () => {
      if (!settle || ++settleFrame % 15) return;
      if (performance.now() > settle.until) { settle = null; return; }
      down.set(settle.center.clone().addScaledVector(settle.up, 20000), settle.up.clone().negate());
      const hit = down.intersectObject(tiles.group, true)[0];
      if (hit) { look(hit.point, settle.distance); settle = null; }
    };
    const onRoot = () => frame();
    const onError = (event: { error: Error; url: string | URL; tile: unknown }) => {
      console.error('3D Tiles load error', event.error);
      // Only a failing root tileset blocks the whole view; individual tile failures are tolerated.
      if (!event.tile) setError('לא ניתן לטעון את ה־tileset — בדקו חיבור VPN, טוקן והרשאת CORS לשרת האריחים');
    };
    tiles.addEventListener('load-root-tileset', onRoot);
    tiles.addEventListener('load-error', onError);

    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), inverse = new THREE.Matrix4(), cart = { lat: 0, lon: 0, height: 0 };
    const move = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObject(tiles.group, true)[0];
      if (!hit) { setReadout(EMPTY_READOUT); setGeo(''); return; }
      inverse.copy(tiles.group.matrixWorld).invert();
      tiles.ellipsoid.getPositionToCartographic(hit.point.clone().applyMatrix4(inverse), cart);
      const lat = cart.lat * deg, lng = cart.lon * deg, p = projectedCoordinate(lat, lng);
      setReadout(`X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${cart.height.toFixed(2)} m`);
      setGeo(`${lat.toFixed(6)}°, ${lng.toFixed(6)}°`);
    };
    const leave = () => { setReadout(EMPTY_READOUT); setGeo(''); };
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerleave', leave);

    const resize = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      tiles.setResolutionFromRenderer(camera, renderer);
    });
    resize.observe(el);

    let raf = 0, lastProgress = -1;
    const animate = () => {
      settleOnSurface();
      controls.update();
      camera.updateMatrixWorld();
      tiles.update();
      const p = Math.round(tiles.loadProgress * 100);
      if (p !== lastProgress) { lastProgress = p; setProgress(p); }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerleave', leave);
      tiles.removeEventListener('load-root-tileset', onRoot);
      tiles.removeEventListener('load-error', onError);
      controls.removeEventListener('start', stopSettle);
      controls.dispose();
      tiles.dispose();
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tilesetUrl, bbox, focus]);

  return <div className="relative h-full w-full min-h-0">
    <div ref={host} className="h-full w-full" aria-label="מודל תלת־ממד פוטוריאליסטי (3D Tiles)" />
    {progress < 100 && !error && <div className="absolute bottom-16 left-2 rounded border bg-popover/95 px-2 py-1 text-xs text-popover-foreground" role="status">טוען אריחים… {progress}%</div>}
    <div className="absolute bottom-2 left-2 rounded border bg-popover/95 p-2 text-xs font-mono text-popover-foreground" dir="ltr" data-testid="tiles-readout">
      {readout}
      <span className="block text-muted-foreground">{geo || 'WGS84 —'} · Israel Grid · גובה אליפסואידי</span>
    </div>
    {error && <p className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-destructive">{error}</p>}
    {failure && <p className="absolute inset-0 flex items-center justify-center bg-background text-destructive">תצוגת תלת־ממד אינה זמינה בדפדפן זה</p>}
  </div>;
}
