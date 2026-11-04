import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { TilesRenderer, EnvironmentControls } from '3d-tiles-renderer/three';
import { GLTFExtensionsPlugin, ReorientationPlugin, ImageOverlayPlugin, GeoJSONOverlay } from '3d-tiles-renderer/three/plugins';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Home, Minus, Plus, RotateCcw, RotateCw, ChevronsUp, ChevronsDown, HelpCircle } from 'lucide-react';
import { projectedCoordinate } from '@/lib/cea/rules';
import { tokenizedUrl } from '@/lib/mapcolonies/client';
import type { McBBox } from '@/lib/mapcolonies/csw';

// BVH-accelerated picking: photorealistic tiles carry hundreds of thousands of triangles.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export type OverlayStatus = 'approved' | 'unapproved' | 'rejected' | 'reference-approved' | 'reference-unapproved';
export interface TileOverlay { id: string; bbox: McBBox; status: OverlayStatus; selected?: boolean; hovered?: boolean; }
export interface GeoPoint { lat: number; lng: number; }

interface Props {
  tilesetUrl: string;
  /** Catalogue extent of the layer (kept for API stability; orientation comes from the tileset itself). */
  bbox: McBBox | null;
  /** Area to open the camera on (e.g. the selected model or a target point); defaults to the whole tileset. */
  focus?: McBBox | null;
  /** Sub-tile rectangles draped onto the real surface. */
  overlays?: TileOverlay[];
  onPickPoint?: (p: GeoPoint) => void;
  onHoverPoint?: (p: GeoPoint | null) => void;
}

const EMPTY_READOUT = 'X —  Y —  Z —';
const deg = THREE.MathUtils.RAD2DEG, D2R = THREE.MathUtils.DEG2RAD;
type Nav = { zoom: (f: number) => void; rotate: (a: number) => void; tilt: (a: number) => void; pan: (x: number, y: number) => void; home: () => void };

const STATUS_TOKEN: Record<OverlayStatus, string> = {
  approved: '--success', unapproved: '--warning', rejected: '--rejected',
  'reference-approved': '--reference-approved', 'reference-unapproved': '--reference-unapproved',
};

/**
 * Real photorealistic 3D Tiles (b3dm/glb/i3dm, Draco/KTX2) rendered with Three.js through 3d-tiles-renderer.
 * The tileset is re-oriented around its own centre with +Y up, readouts convert hits to WGS84 / Israel grid /
 * ellipsoidal height, and sub-tiles are draped onto the surface as a GeoJSON image overlay.
 */
export function Tiles3DView({ tilesetUrl, bbox, focus = null, overlays, onPickPoint, onHoverPoint }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const nav = useRef<Nav | null>(null);
  const overlayRef = useRef<{ overlay: GeoJSONOverlay; plugin: ImageOverlayPlugin } | null>(null);
  const callbacks = useRef({ onPickPoint, onHoverPoint });
  callbacks.current = { onPickPoint, onHoverPoint };
  const [readout, setReadout] = useState(EMPTY_READOUT);
  const [geo, setGeo] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [tileErrors, setTileErrors] = useState<{ count: number; last: string }>({ count: 0, last: '' });
  const [empty, setEmpty] = useState(false);
  const [failure, setFailure] = useState(false);
  const [help, setHelp] = useState(false);
  const [sceneRevision, setSceneRevision] = useState(0);

  useEffect(() => {
    const el = host.current; if (!el) return;
    setError(''); setProgress(0); setReadout(EMPTY_READOUT); setGeo(''); setTileErrors({ count: 0, last: '' }); setEmpty(false);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); } catch { setFailure(true); return; }
    const token = (name: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g, ', ')})`;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.tabIndex = 0; // keyboard flight (WASD / arrows) needs focus
    renderer.domElement.style.outline = 'none';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(token('--background'));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(1, 2, 1); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 1e7);
    camera.position.set(0, 3000, 3000);

    const tiles = new TilesRenderer(tilesetUrl);
    tiles.registerPlugin({ name: 'MAPCOLONIES_TOKEN', preprocessURL: (url: string | URL) => tokenizedUrl(url.toString()) });
    const draco = new DRACOLoader(); // decoders bundled by three via import.meta.url
    const ktx2 = new KTX2Loader().detectSupport(renderer);
    tiles.registerPlugin(new GLTFExtensionsPlugin({ rtc: true, dracoLoader: draco, ktxLoader: ktx2 }));
    // Orient from the tileset's own bounding volume: catalogue bboxes are sometimes wrong.
    tiles.registerPlugin(new ReorientationPlugin({ recenter: true }));
    const overlayPlugin = new ImageOverlayPlugin({ overlays: [], renderer, resolution: 512 });
    tiles.registerPlugin(overlayPlugin);
    tiles.errorTarget = 8;
    tiles.setCamera(camera);
    scene.add(tiles.group);

    let models = 0;
    const onModel = ({ scene: model }: { scene: THREE.Object3D }) => {
      models++;
      model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && !m.geometry.boundsTree) m.geometry.computeBoundsTree(); });
    };
    const onDisposeModel = ({ scene: model }: { scene: THREE.Object3D }) => model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.disposeBoundsTree?.(); });
    tiles.addEventListener('load-model', onModel);
    tiles.addEventListener('dispose-model', onDisposeModel);

    const controls = new EnvironmentControls(scene, camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableFlight = true;
    controls.minDistance = 2;
    controls.maxAltitude = Math.PI / 2 - 0.05;

    const viewDir = new THREE.Vector3(0, 0.75, 1).normalize();
    const look = (center: THREE.Vector3, distance: number) => {
      camera.position.copy(center).addScaledVector(viewDir, distance);
      camera.lookAt(center);
      camera.updateMatrixWorld();
    };
    const setGround = (y: number) => { controls.fallbackPlane.constant = -y; };

    // --- geo helpers ---------------------------------------------------------------------------------
    const inverse = new THREE.Matrix4(), cart = { lat: 0, lon: 0, height: 0 };
    const toGeo = (world: THREE.Vector3) => {
      inverse.copy(tiles.group.matrixWorld).invert();
      tiles.ellipsoid.getPositionToCartographic(world.clone().applyMatrix4(inverse), cart);
      return { lat: cart.lat * deg, lng: cart.lon * deg, height: cart.height };
    };
    const upAt = (world: THREE.Vector3) => {
      const g = toGeo(world);
      return tiles.ellipsoid.getCartographicToNormal(g.lat * D2R, g.lng * D2R, new THREE.Vector3()).transformDirection(tiles.group.matrixWorld);
    };
    /** Geographic extent of the root bounding volume, plus its highest point. */
    const tilesetExtent = () => {
      const obb = new THREE.Box3(), m = new THREE.Matrix4(), corner = new THREE.Vector3(), c = { lat: 0, lon: 0, height: 0 };
      if (!tiles.getOrientedBoundingBox(obb, m)) return null;
      const ext = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity, top: -Infinity };
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? obb.max.x : obb.min.x, i & 2 ? obb.max.y : obb.min.y, i & 4 ? obb.max.z : obb.min.z).applyMatrix4(m);
        tiles.ellipsoid.getPositionToCartographic(corner, c);
        ext.west = Math.min(ext.west, c.lon * deg); ext.east = Math.max(ext.east, c.lon * deg);
        ext.south = Math.min(ext.south, c.lat * deg); ext.north = Math.max(ext.north, c.lat * deg);
        ext.top = Math.max(ext.top, c.height);
      }
      return ext;
    };

    // --- framing --------------------------------------------------------------------------------------
    let settle: { center: THREE.Vector3; up: THREE.Vector3; distance: number; until: number } | null = null;
    let homeView: { center: THREE.Vector3; distance: number } | null = null;
    const frame = () => {
      tiles.group.updateMatrixWorld(true);
      const ext = tilesetExtent();
      // A focus outside the real data (wrong catalogue bbox) would show an empty screen: frame the tileset instead.
      const plausible = focus && ext && focus.west <= ext.east && focus.east >= ext.west && focus.south <= ext.north && focus.north >= ext.south;
      if (focus && ext && plausible) {
        const lat = (focus.south + focus.north) / 2, lon = (focus.west + focus.east) / 2;
        const top = Math.min(Math.max(ext.top, 0), 9000);
        const center = tiles.ellipsoid.getCartographicToPosition(lat * D2R, lon * D2R, top, new THREE.Vector3()).applyMatrix4(tiles.group.matrixWorld);
        const up = tiles.ellipsoid.getCartographicToNormal(lat * D2R, lon * D2R, new THREE.Vector3()).transformDirection(tiles.group.matrixWorld);
        const metres = Math.hypot((focus.north - focus.south) * 111320, (focus.east - focus.west) * 111320 * Math.cos(lat * D2R));
        const distance = Math.min(Math.max(metres * 1.2, 800), 80000);
        look(center, distance);
        homeView = { center, distance };
        settle = { center, up, distance, until: performance.now() + 20000 };
        return;
      }
      const sphere = new THREE.Sphere();
      if (!tiles.getBoundingSphere(sphere)) return;
      sphere.applyMatrix4(tiles.group.matrixWorld);
      const distance = Math.max(sphere.radius * 1.6, 200);
      look(sphere.center, distance);
      homeView = { center: sphere.center.clone(), distance };
      settle = { center: sphere.center.clone(), up: new THREE.Vector3(0, 1, 0), distance, until: performance.now() + 20000 };
    };
    const down = new THREE.Raycaster(); down.firstHitOnly = true;
    let settleFrame = 0;
    const settleOnSurface = () => {
      if (!settle || ++settleFrame % 15) return;
      if (performance.now() > settle.until) { settle = null; return; }
      down.set(settle.center.clone().addScaledVector(settle.up, 20000), settle.up.clone().negate());
      const hit = down.intersectObject(tiles.group, true)[0];
      if (hit) { look(hit.point, settle.distance); setGround(hit.point.y); homeView = { center: hit.point.clone(), distance: settle.distance }; settle = null; }
    };
    const stopSettle = () => { settle = null; };
    controls.addEventListener('start', stopSettle);

    // --- diagnostics ----------------------------------------------------------------------------------
    const onRoot = () => { frame(); setSceneRevision(v => v + 1); };
    const explain = (e: Error) => {
      const m = e?.message || String(e);
      if (/glTF versions|version.*1\.0|>=\s*2\.0/i.test(m)) return 'פורמט glTF 1.0 (ישן) — לא נתמך במנוע התצוגה';
      if (/KTX|basis/i.test(m)) return 'טקסטורות KTX2 לא נטענו';
      if (/draco/i.test(m)) return 'פענוח Draco נכשל';
      if (/\b40[13]\b/.test(m)) return 'אין הרשאה (טוקן) לשרת האריחים';
      if (/\b404\b/.test(m)) return 'קובץ אריח לא נמצא בשרת (404)';
      if (/fetch|network|cors/i.test(m)) return 'בעיית רשת / CORS בגישה לשרת האריחים';
      return m.slice(0, 160);
    };
    const onError = (event: { error: Error; url: string | URL; tile: unknown }) => {
      console.error('3D Tiles load error', event.url?.toString().replace(/token=[^&]+/, 'token=…'), event.error);
      if (!event.tile) setError(`לא ניתן לטעון את ה־tileset — ${explain(event.error)}`);
      else setTileErrors(prev => ({ count: prev.count + 1, last: explain(event.error) }));
    };
    tiles.addEventListener('load-root-tileset', onRoot);
    tiles.addEventListener('load-error', onError);
    const emptyTimer = window.setTimeout(() => { if (!models) setEmpty(true); }, 25000);

    // --- pointer: readout, hover, pick ----------------------------------------------------------------
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    ray.firstHitOnly = true;
    const hitAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(mouse, camera);
      return ray.intersectObject(tiles.group, true)[0];
    };
    let pendingMove: PointerEvent | null = null, moveQueued = false;
    const processMove = () => {
      moveQueued = false; const event = pendingMove; if (!event) return;
      const hit = hitAt(event);
      if (!hit) { setReadout(EMPTY_READOUT); setGeo(''); callbacks.current.onHoverPoint?.(null); return; }
      const g = toGeo(hit.point), p = projectedCoordinate(g.lat, g.lng);
      setReadout(`X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${g.height.toFixed(2)} m`);
      setGeo(`${g.lat.toFixed(6)}°, ${g.lng.toFixed(6)}°`);
      callbacks.current.onHoverPoint?.({ lat: g.lat, lng: g.lng });
    };
    const move = (event: PointerEvent) => { pendingMove = event; if (!moveQueued) { moveQueued = true; requestAnimationFrame(processMove); } };
    const leave = () => { pendingMove = null; setReadout(EMPTY_READOUT); setGeo(''); callbacks.current.onHoverPoint?.(null); };
    let downAt: { x: number; y: number } | null = null;
    const pointerDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; renderer.domElement.focus({ preventScroll: true }); };
    const pointerUp = (e: PointerEvent) => {
      const start = downAt; downAt = null;
      if (!start || e.button !== 0 || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      const hit = hitAt(e); if (!hit) return;
      const g = toGeo(hit.point);
      callbacks.current.onPickPoint?.({ lat: g.lat, lng: g.lng });
    };
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerleave', leave);
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);

    // --- on-screen navigation -------------------------------------------------------------------------
    const pivot = () => {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = ray.intersectObject(tiles.group, true)[0];
      if (hit) return hit.point;
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(controls.fallbackPlane, p) ?? camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1000));
    };
    const orbit = (axis: THREE.Vector3, angle: number, center: THREE.Vector3) => {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      camera.position.sub(center).applyQuaternion(q).add(center);
      camera.quaternion.premultiply(q);
      camera.updateMatrixWorld();
    };
    nav.current = {
      zoom: f => { controls.resetState(); settle = null; const c = pivot(); camera.position.sub(c).multiplyScalar(f).add(c); camera.updateMatrixWorld(); },
      rotate: a => { controls.resetState(); settle = null; const c = pivot(); orbit(upAt(c), a, c); },
      tilt: a => {
        controls.resetState(); settle = null;
        const c = pivot(), up = upAt(c), offset = camera.position.clone().sub(c);
        const elevation = Math.asin(THREE.MathUtils.clamp(offset.clone().normalize().dot(up), -1, 1));
        const target = THREE.MathUtils.clamp(elevation + a, 8 * D2R, 89 * D2R);
        const right = new THREE.Vector3().crossVectors(offset, up).normalize();
        if (right.lengthSq() > 0) orbit(right, -(target - elevation), c);
      },
      pan: (x, y) => {
        controls.resetState(); settle = null;
        const c = pivot(), up = upAt(c), dist = camera.position.distanceTo(c);
        const forward = camera.getWorldDirection(new THREE.Vector3()).projectOnPlane(up).normalize();
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        camera.position.addScaledVector(right, x * dist * 0.25).addScaledVector(forward, y * dist * 0.25);
        camera.updateMatrixWorld();
      },
      home: () => { controls.resetState(); settle = null; if (homeView) look(homeView.center, homeView.distance); else frame(); },
    };

    overlayRef.current = { overlay: new GeoJSONOverlay({ geojson: { type: 'FeatureCollection', features: [] } }), plugin: overlayPlugin };
    overlayPlugin.addOverlay(overlayRef.current.overlay);

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
      window.clearTimeout(emptyTimer);
      resize.disconnect();
      nav.current = null;
      overlayRef.current = null;
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerleave', leave);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      tiles.removeEventListener('load-root-tileset', onRoot);
      tiles.removeEventListener('load-error', onError);
      tiles.removeEventListener('load-model', onModel);
      tiles.removeEventListener('dispose-model', onDisposeModel);
      controls.removeEventListener('start', stopSettle);
      controls.dispose();
      tiles.dispose();
      draco.dispose();
      ktx2.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tilesetUrl, bbox, focus]);

  // Keep the draped sub-tiles in sync with status / selection without reloading the tileset.
  const list = overlays ?? [];
  const styleKey = list.map(o => `${o.id}:${o.status}:${o.selected ? 1 : 0}:${o.hovered ? 1 : 0}`).join('|');
  const geometryKey = list.map(o => `${o.id}@${o.bbox.west},${o.bbox.south},${o.bbox.east},${o.bbox.north}`).join('|');
  const lastGeometry = useRef('');
  useEffect(() => {
    const ref = overlayRef.current; if (!ref) return;
    const css = (name: string, alpha = 1) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g, ', ');
      return v ? `hsla(${v}, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
    };
    const styleOf = (o: TileOverlay) => {
      const token = STATUS_TOKEN[o.status], reference = o.status.startsWith('reference');
      return {
        fillStyle: css(token, o.selected ? 0.45 : o.hovered ? 0.4 : reference ? 0.12 : 0.25),
        strokeStyle: o.selected ? css('--selection') : o.hovered ? css('--hover-outline') : css(o.status === 'unapproved' ? '--unapproved-stroke' : token, reference ? 0.7 : 1),
        strokeWidth: o.selected ? 6 : o.hovered ? 4 : 2,
      };
    };
    const geometryChanged = lastGeometry.current !== `${sceneRevision}#${geometryKey}`;
    if (geometryChanged) {
      // New sub-tile set (or new scene): rebuild the overlay so its spatial index matches.
      lastGeometry.current = `${sceneRevision}#${geometryKey}`;
      const features: Feature<Polygon>[] = list.map(o => {
        const { west, south, east, north } = o.bbox;
        return { type: 'Feature', id: o.id, properties: styleOf(o), geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } };
      });
      ref.plugin.deleteOverlay(ref.overlay);
      const next = new GeoJSONOverlay({ geojson: { type: 'FeatureCollection', features } as FeatureCollection, resolution: 512 });
      ref.plugin.addOverlay(next);
      overlayRef.current = { overlay: next, plugin: ref.plugin };
      return;
    }
    // Same geometry: restyle in place and redraw the already generated textures.
    const byId = new Map(list.map(o => [o.id, o]));
    for (const f of ((ref.overlay as unknown as { geojson: FeatureCollection<Polygon> }).geojson).features) {
      const o = byId.get(String(f.id)); if (o) Object.assign(f.properties as object, styleOf(o));
    }
    (ref.overlay as unknown as { redraw: () => void }).redraw();
    // styleKey/geometryKey capture every input from `list`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey, geometryKey, sceneRevision]);

  const btn = 'h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-popover-foreground';
  const go = (fn: (n: Nav) => void) => () => { if (nav.current) fn(nav.current); };
  return <div className="relative h-full w-full min-h-0">
    <div ref={host} className="h-full w-full" aria-label="מודל תלת־ממד פוטוריאליסטי (3D Tiles)" />

    <div className="absolute top-12 right-2 z-[1001] flex flex-col items-center gap-1 rounded-md border bg-popover/95 p-1 shadow" role="group" aria-label="ניווט בתלת־ממד" dir="ltr">
      <div className="grid grid-cols-3 gap-0.5">
        <span /><button type="button" className={btn} title="הזזה קדימה" aria-label="הזזה קדימה" onClick={go(n => n.pan(0, 1))}><ArrowUp className="h-4 w-4" /></button><span />
        <button type="button" className={btn} title="הזזה שמאלה" aria-label="הזזה שמאלה" onClick={go(n => n.pan(-1, 0))}><ArrowLeft className="h-4 w-4" /></button>
        <button type="button" className={btn} title="חזרה לתצוגת הפתיחה" aria-label="חזרה לתצוגת הפתיחה" onClick={go(n => n.home())}><Home className="h-4 w-4" /></button>
        <button type="button" className={btn} title="הזזה ימינה" aria-label="הזזה ימינה" onClick={go(n => n.pan(1, 0))}><ArrowRight className="h-4 w-4" /></button>
        <span /><button type="button" className={btn} title="הזזה אחורה" aria-label="הזזה אחורה" onClick={go(n => n.pan(0, -1))}><ArrowDown className="h-4 w-4" /></button><span />
      </div>
      <div className="h-px w-full bg-border" />
      <div className="grid grid-cols-2 gap-0.5">
        <button type="button" className={btn} title="התקרבות" aria-label="התקרבות" onClick={go(n => n.zoom(0.6))}><Plus className="h-4 w-4" /></button>
        <button type="button" className={btn} title="התרחקות" aria-label="התרחקות" onClick={go(n => n.zoom(1.6))}><Minus className="h-4 w-4" /></button>
        <button type="button" className={btn} title="סיבוב שמאלה" aria-label="סיבוב שמאלה" onClick={go(n => n.rotate(Math.PI / 8))}><RotateCcw className="h-4 w-4" /></button>
        <button type="button" className={btn} title="סיבוב ימינה" aria-label="סיבוב ימינה" onClick={go(n => n.rotate(-Math.PI / 8))}><RotateCw className="h-4 w-4" /></button>
        <button type="button" className={btn} title="מבט מלמעלה" aria-label="הגבהת זווית המבט" onClick={go(n => n.tilt(10 * D2R))}><ChevronsUp className="h-4 w-4" /></button>
        <button type="button" className={btn} title="מבט מהצד" aria-label="הנמכת זווית המבט" onClick={go(n => n.tilt(-10 * D2R))}><ChevronsDown className="h-4 w-4" /></button>
      </div>
      <button type="button" className={btn} title="עזרה לניווט" aria-label="עזרה לניווט" aria-expanded={help} onClick={() => setHelp(v => !v)}><HelpCircle className="h-4 w-4" /></button>
    </div>
    {help && <div className="absolute top-12 right-14 z-[1001] w-64 space-y-1 rounded-md border bg-popover/95 p-2 text-xs text-popover-foreground shadow" dir="rtl">
      <p><b>גרירה עם כפתור שמאלי</b> — הזזת המודל</p>
      <p><b>כפתור ימני / Shift + גרירה</b> — סיבוב והטיה</p>
      <p><b>גלגלת</b> — זום לנקודת העכבר</p>
      <p><b>W A S D / חצים</b> — טיסה (לחצו קודם על המודל), Q/E — מטה/מעלה</p>
      <p><b>לחיצה</b> — בחירת תת־אריח</p>
    </div>}

    {progress < 100 && !error && <div className="absolute bottom-16 left-2 rounded border bg-popover/95 px-2 py-1 text-xs text-popover-foreground" role="status">טוען אריחים… {progress}%</div>}
    {tileErrors.count > 0 && !error && <div className="absolute bottom-24 left-2 max-w-sm rounded border border-destructive/50 bg-popover/95 px-2 py-1 text-xs text-destructive" role="status">{tileErrors.count} אריחים לא נטענו — {tileErrors.last}</div>}
    {empty && !error && !tileErrors.count && <div className="absolute inset-x-0 top-1/3 mx-auto w-fit max-w-md rounded border bg-popover/95 p-3 text-center text-sm text-popover-foreground">ה־tileset נטען אך לא התקבלה גאומטריה — ייתכן שהמודל ריק או שהנתונים בקטלוג שגויים.</div>}
    <div className="absolute bottom-2 left-2 rounded border bg-popover/95 p-2 text-xs font-mono text-popover-foreground" dir="ltr" data-testid="tiles-readout">
      {readout}
      <span className="block text-muted-foreground">{geo || 'WGS84 —'} · Israel Grid · גובה אליפסואידי</span>
    </div>
    {error && <p className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-destructive">{error}</p>}
    {failure && <p className="absolute inset-0 flex items-center justify-center bg-background text-destructive">תצוגת תלת־ממד אינה זמינה בדפדפן זה</p>}
  </div>;
}
