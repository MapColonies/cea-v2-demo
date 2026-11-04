import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer, EnvironmentControls } from '3d-tiles-renderer/three';
import { GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/three/plugins';
import { projectedCoordinate } from '@/lib/cea/rules';
import { tokenizedUrl } from '@/lib/mapcolonies/client';
import type { McBBox } from '@/lib/mapcolonies/csw';

interface Props { tilesetUrl: string; bbox: McBBox | null; }

const EMPTY_READOUT = 'X —  Y —  Z —';
const deg = THREE.MathUtils.RAD2DEG;

/**
 * Real photorealistic 3D Tiles (b3dm/glb) rendered with Three.js through 3d-tiles-renderer.
 * The tileset is re-oriented so the bbox centre sits at the origin with +Y up (ellipsoidal height),
 * and pointer readouts convert hits back to WGS84 and Israel grid.
 */
export function Tiles3DView({ tilesetUrl, bbox }: Props) {
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

    // Frame the camera once the root tileset (and its bounding volume) is known.
    const frame = () => {
      tiles.group.updateMatrixWorld(true);
      const sphere = new THREE.Sphere();
      if (!tiles.getBoundingSphere(sphere)) return;
      sphere.applyMatrix4(tiles.group.matrixWorld);
      const distance = Math.max(sphere.radius * 1.6, 200);
      camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0.75, 1).normalize().multiplyScalar(distance));
      camera.lookAt(sphere.center);
      camera.updateMatrixWorld();
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
      controls.dispose();
      tiles.dispose();
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tilesetUrl, bbox]);

  return <div className="relative h-full w-full min-h-0">
    <div ref={host} className="h-full w-full" aria-label="מודל תלת־ממד פוטוריאליסטי (3D Tiles)" />
    {progress < 100 && !error && <div className="absolute top-2 left-2 rounded border bg-popover/95 px-2 py-1 text-xs text-popover-foreground" role="status">טוען אריחים… {progress}%</div>}
    <div className="absolute bottom-2 left-2 rounded border bg-popover/95 p-2 text-xs font-mono text-popover-foreground" dir="ltr" data-testid="tiles-readout">
      {readout}
      <span className="block text-muted-foreground">{geo || 'WGS84 —'} · Israel Grid · גובה אליפסואידי</span>
    </div>
    {error && <p className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-destructive">{error}</p>}
    {failure && <p className="absolute inset-0 flex items-center justify-center bg-background text-destructive">תצוגת תלת־ממד אינה זמינה בדפדפן זה</p>}
  </div>;
}
