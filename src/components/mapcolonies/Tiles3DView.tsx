import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { TilesRenderer, EnvironmentControls } from '3d-tiles-renderer/three';
import { GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/three/plugins';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Home, Minus, Plus, RotateCcw, RotateCw, ChevronsUp, ChevronsDown, HelpCircle } from 'lucide-react';
import { projectedCoordinate } from '@/lib/cea/rules';
import { tokenizedUrl } from '@/lib/mapcolonies/client';
import type { McBBox } from '@/lib/mapcolonies/csw';

// BVH-accelerated picking: photorealistic tiles carry hundreds of thousands of triangles.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// While draping outlines, meshes whose BVH is not built yet are skipped (brute-force rays on photorealistic
// meshes are too slow); outlines are re-draped once the BVHs exist.
let bvhOnly = false;
THREE.Mesh.prototype.raycast = function (this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  if (bvhOnly && !this.geometry?.boundsTree) return;
  acceleratedRaycast.call(this, raycaster, intersects);
};

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
  /** Small label/selector shown above the coordinate readout (e.g. the layer name). */
  badge?: ReactNode;
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
export function Tiles3DView({ tilesetUrl, bbox, focus = null, overlays, onPickPoint, onHoverPoint, badge }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const nav = useRef<Nav | null>(null);
  // Overlay plugin is attached lazily, only when there are sub-tiles to drape (it is costly for big photorealistic tilesets).
  const ctx = useRef<{ setOverlays: (list: TileOverlay[]) => void; retry: () => void } | null>(null);
  const callbacks = useRef({ onPickPoint, onHoverPoint });
  callbacks.current = { onPickPoint, onHoverPoint };
  const [readout, setReadout] = useState(EMPTY_READOUT);
  const [geo, setGeo] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [tileErrors, setTileErrors] = useState<{ count: number; last: string }>({ count: 0, last: '' });
  const [empty, setEmpty] = useState(false);
  const [stats, setStats] = useState({ loaded: 0, loading: 0, refused: 0 });
  const [failure, setFailure] = useState(false);
  const [help, setHelp] = useState(false);
  const [sceneRevision, setSceneRevision] = useState(0);

  useEffect(() => {
    const el = host.current; if (!el) return;
    setError(''); setProgress(0); setReadout(EMPTY_READOUT); setGeo(''); setTileErrors({ count: 0, last: '' }); setEmpty(false); setStats({ loaded: 0, loading: 0, refused: 0 });
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
    // Tile materials are left exactly as authored (lit); only sharpen oblique views with anisotropic filtering.
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    tiles.registerPlugin({
      name: 'ANISOTROPY',
      processTileModel: (model: THREE.Object3D) => {
        model.traverse(o => {
          const mats = (o as THREE.Mesh).isMesh ? [(o as THREE.Mesh).material].flat() : [];
          for (const m of mats) { const map = (m as THREE.MeshStandardMaterial).map; if (map) map.anisotropy = anisotropy; }
        });
      },
    });
    // Orient from the tileset's own bounding volume: catalogue bboxes are sometimes wrong.
    tiles.registerPlugin(new ReorientationPlugin({ recenter: true }));
    // Default screen-space error keeps the tile count (and download time) reasonable for large photorealistic layers.
    tiles.errorTarget = 16;
    // Photorealistic textures fill the default 0.4 GB cache quickly; a full cache refuses new tiles and loading stalls.
    tiles.lruCache.minBytesSize = 0.9 * 2 ** 30;
    tiles.lruCache.maxBytesSize = 1.2 * 2 ** 30;
    tiles.setCamera(camera);
    scene.add(tiles.group);

    let models = 0;
    let onBvhReady = () => {};
    // BVHs are built in idle time, never inside the tile load (a throw there would fail the tile).
    const bvhQueue: THREE.Mesh[] = [];
    let bvhScheduled = false;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback;
    const idle = (cb: () => void) => (ric ? ric(cb, { timeout: 500 }) : window.setTimeout(cb, 50));
    const buildBvh = () => {
      bvhScheduled = false;
      const start = performance.now();
      while (bvhQueue.length && performance.now() - start < 12) {
        const m = bvhQueue.shift()!;
        try { const g = m.geometry; if (g?.attributes.position && !g.boundsTree && (g.index || g.attributes.position.count % 3 === 0)) g.computeBoundsTree(); } catch { /* fall back to plain raycast */ }
      }
      if (bvhQueue.length) { bvhScheduled = true; idle(buildBvh); } else onBvhReady();
    };
    const onModel = ({ scene: model }: { scene: THREE.Object3D }) => {
      models++;
      model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) bvhQueue.push(m); });
      if (!bvhScheduled && bvhQueue.length) { bvhScheduled = true; idle(buildBvh); }
    };
    const onDisposeModel = ({ scene: model }: { scene: THREE.Object3D }) => model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.disposeBoundsTree?.(); });
    tiles.addEventListener('load-model', onModel);
    tiles.addEventListener('dispose-model', onDisposeModel);

    // Ctrl + left drag rotates (EnvironmentControls natively uses Shift / right button): runs before the controls' handler.
    const ctrlAsRotate = (e: PointerEvent) => { if (e.ctrlKey && e.button === 0) Object.defineProperty(e, 'shiftKey', { get: () => true }); };
    const noMenu = (e: MouseEvent) => e.preventDefault();
    renderer.domElement.addEventListener('pointerdown', ctrlAsRotate, { capture: true });
    renderer.domElement.addEventListener('contextmenu', noMenu);
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
    const emptyTimer = window.setTimeout(() => {
      const st = (tiles as unknown as { stats: object }).stats as { queued: number; downloading: number; parsing: number };
      if (!models && !(st.queued + st.downloading + st.parsing)) setEmpty(true);
    }, 45000);

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

    const tilesLoading = () => { const st = (tiles as unknown as { stats: { queued: number; downloading: number; parsing: number } }).stats; return st.queued + st.downloading + st.parsing; };
    // --- sub-tile overlay: outlines draped on the real surface as separate lines (tile materials untouched) ---
    const overlayGroup = new THREE.Group();
    overlayGroup.raycast = () => {}; // never intercept picking / camera pivots
    scene.add(overlayGroup);
    const lineResolution = new THREE.Vector2(1, 1);
    const color = (name: string) => new THREE.Color().setStyle(token(name));
    type Item = { overlay: TileOverlay; line: Line2; material: LineMaterial; fill: THREE.Mesh | null; fillReady: boolean };
    const items = new Map<string, Item>();
    let overlayGeometryKey = '', topHeight = 0, lastDrape = 0;
    // Draping raycasts against heavy photorealistic meshes, so it runs as a small time-budgeted job per frame
    // (never a burst that would freeze rendering and tile loading).
    const lineQueue = new Set<string>(), fillQueue = new Set<string>(), incomplete = new Set<string>();
    let lastRetry = 0;
    const surfaceRay = new THREE.Raycaster(); surfaceRay.firstHitOnly = true; surfaceRay.far = 30000;
    const surfacePoint = (lat: number, lng: number, lift: number) => {
      const up = tiles.ellipsoid.getCartographicToNormal(lat * D2R, lng * D2R, new THREE.Vector3()).transformDirection(tiles.group.matrixWorld);
      const from = tiles.ellipsoid.getCartographicToPosition(lat * D2R, lng * D2R, topHeight + 500, new THREE.Vector3()).applyMatrix4(tiles.group.matrixWorld);
      surfaceRay.set(from, up.clone().negate());
      bvhOnly = true;
      let hit: THREE.Intersection | undefined;
      try { hit = surfaceRay.intersectObject(tiles.group, true)[0]; } finally { bvhOnly = false; }
      return hit ? hit.point.addScaledVector(up, lift) : null;
    };
    const ring = (b: McBBox, n = 8) => {
      const c: [number, number][] = [[b.south, b.west], [b.south, b.east], [b.north, b.east], [b.north, b.west], [b.south, b.west]];
      const pts: [number, number][] = [];
      for (let e = 0; e < 4; e++) for (let i = 0; i < n; i++) { const t = i / n; pts.push([c[e][0] + (c[e + 1][0] - c[e][0]) * t, c[e][1] + (c[e + 1][1] - c[e][1]) * t]); }
      pts.push(c[4]);
      return pts;
    };
    const drapeLine = (item: Item) => {
      const pts = ring(item.overlay.bbox).map(([lat, lng]) => surfacePoint(lat, lng, 2));
      const ok = pts.filter((p): p is THREE.Vector3 => p !== null);
      // Surface not ready under part of the outline (tiles / BVH still loading): retry later.
      if (ok.length < pts.length) incomplete.add(item.overlay.id); else incomplete.delete(item.overlay.id);
      if (ok.length < 2) { item.line.visible = false; return; }
      const geometry = new LineGeometry();
      geometry.setPositions(ok.flatMap(p => [p.x, p.y, p.z]));
      item.line.geometry.dispose();
      item.line.geometry = geometry;
      item.line.computeLineDistances();
      item.line.visible = true;
    };
    const drapeFill = (item: Item) => {
      const { west, south, east, north } = item.overlay.bbox, n = 8, positions: number[] = [], index: number[] = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const p = surfacePoint(south + (north - south) * j / n, west + (east - west) * i / n, 1.5);
        if (!p) return;
        positions.push(p.x, p.y, p.z);
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; index.push(a, b, c, b, d, c); }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(index);
      if (!item.fill) {
        item.fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
        item.fill.raycast = () => {};
        overlayGroup.add(item.fill);
      } else { item.fill.geometry.dispose(); item.fill.geometry = geometry; }
      item.fillReady = true;
    };
    const restyle = () => {
      for (const item of items.values()) {
        const o = item.overlay, reference = o.status.startsWith('reference');
        const base = STATUS_TOKEN[o.status];
        item.material.color.copy(color(o.selected ? '--selection' : o.hovered ? '--hover-outline' : o.status === 'unapproved' ? '--unapproved-stroke' : base));
        item.material.linewidth = o.selected ? 5 : o.hovered ? 4 : reference ? 1.5 : 2.5;
        item.material.dashed = reference;
        item.material.opacity = reference ? 0.7 : 1;
        item.line.renderOrder = o.selected ? 3 : o.hovered ? 2 : 1;
        // Only the selection gets a draped fill; hover stays outline-only (no extra raycasts while moving the mouse).
        if (o.selected && !item.fillReady) fillQueue.add(o.id);
        if (item.fill) {
          item.fill.visible = Boolean(o.selected);
          (item.fill.material as THREE.MeshBasicMaterial).color.copy(color('--selection'));
        }
      }
    };
    const redrapeAll = () => {
      for (const [id, item] of items) { lineQueue.add(id); if (item.fillReady) { item.fillReady = false; if (item.overlay.selected) fillQueue.add(id); } }
      lastDrape = performance.now();
    };
    const drapeTick = (budgetMs: number) => {
      if (!tiles.root || (!lineQueue.size && !fillQueue.size)) return;
      const start = performance.now();
      for (const id of fillQueue) {
        if (performance.now() - start > budgetMs) return;
        fillQueue.delete(id); const item = items.get(id); if (item?.overlay.selected) { drapeFill(item); if (item.fill) item.fill.visible = true; }
      }
      for (const id of lineQueue) {
        if (performance.now() - start > budgetMs) return;
        lineQueue.delete(id); const item = items.get(id); if (item) drapeLine(item);
      }
    };
    const setOverlays = (list: TileOverlay[]) => {
      const key = list.map(o => `${o.id}@${o.bbox.west},${o.bbox.south},${o.bbox.east},${o.bbox.north}`).join('|');
      if (key !== overlayGeometryKey) {
        overlayGeometryKey = key;
        for (const item of items.values()) { overlayGroup.remove(item.line); item.line.geometry.dispose(); item.material.dispose(); if (item.fill) { overlayGroup.remove(item.fill); item.fill.geometry.dispose(); (item.fill.material as THREE.Material).dispose(); } }
        items.clear();
        for (const o of list) {
          const material = new LineMaterial({ linewidth: 2.5, transparent: true, dashSize: 6, gapSize: 4, worldUnits: false });
          material.resolution.copy(lineResolution);
          const line = new Line2(new LineGeometry(), material);
          line.visible = false; line.raycast = () => {};
          overlayGroup.add(line);
          items.set(o.id, { overlay: o, line, material, fill: null, fillReady: false });
          lineQueue.add(o.id);
        }
        fillQueue.clear();
      } else {
        for (const o of list) { const item = items.get(o.id); if (item) item.overlay = o; }
      }
      restyle();
    };
    tiles.addEventListener('load-root-tileset', () => { topHeight = Math.max(tilesetExtent()?.top ?? 0, 0); redrapeAll(); });
    const onLoadEnd = () => { if (performance.now() - lastDrape > 3000) redrapeAll(); };
    onBvhReady = () => { if (items.size) redrapeAll(); };
    tiles.addEventListener('tiles-load-end', onLoadEnd);
    ctx.current = { setOverlays, retry: () => { setTileErrors({ count: 0, last: '' }); setEmpty(false); tiles.resetFailedTiles(); } };
    setSceneRevision(v => v + 1);

    const resize = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      lineResolution.set(w, h);
      for (const item of items.values()) item.material.resolution.set(w, h);
      tiles.setResolutionFromRenderer(camera, renderer);
    });
    resize.observe(el);

    let raf = 0, lastProgress = -1, statsFrame = 0;
    const animate = () => {
      settleOnSurface();
      // Re-drape outlines as finer tiles arrive (throttled), so they hug the real surface.
      if (items.size && tiles.root) {
        const now = performance.now();
        if (!lineQueue.size && tilesLoading() > 0 && now - lastDrape > 5000) redrapeAll();
        else if (!lineQueue.size && incomplete.size && now - lastRetry > 1500) { lastRetry = now; incomplete.forEach(id => lineQueue.add(id)); }
        drapeTick(4);
      }
      controls.update();
      camera.updateMatrixWorld();
      tiles.update();
      const p = Math.round(tiles.loadProgress * 100);
      if (p !== lastProgress) { lastProgress = p; setProgress(p); }
      if (++statsFrame % 30 === 0) {
        const st = (tiles as unknown as { stats: object }).stats as { queued: number; downloading: number; parsing: number; refused?: number };
        const loading = st.queued + st.downloading + st.parsing, refused = st.refused ?? 0;
        setStats(prev => prev.loaded === models && prev.loading === loading && prev.refused === refused ? prev : { loaded: models, loading, refused });
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(emptyTimer);
      resize.disconnect();
      nav.current = null;
      ctx.current = null;
      tiles.removeEventListener('tiles-load-end', onLoadEnd);
      for (const item of items.values()) { item.line.geometry.dispose(); item.material.dispose(); if (item.fill) { item.fill.geometry.dispose(); (item.fill.material as THREE.Material).dispose(); } }
      items.clear();
      bvhQueue.length = 0;
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerleave', leave);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointerdown', ctrlAsRotate, { capture: true });
      renderer.domElement.removeEventListener('contextmenu', noMenu);
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

  // Keep the draped sub-tile outlines in sync with status / selection without reloading the tileset.
  const list = overlays ?? [];
  const styleKey = list.map(o => `${o.id}@${o.bbox.west},${o.bbox.south},${o.bbox.east},${o.bbox.north}:${o.status}:${o.selected ? 1 : 0}:${o.hovered ? 1 : 0}`).join('|');
  useEffect(() => {
    ctx.current?.setOverlays(list);
    // styleKey captures every input from `list`; sceneRevision re-applies after a new scene is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey, sceneRevision]);

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
      <p><b>Ctrl + גרירה שמאלית</b> (או כפתור ימני / Shift) — סיבוב והטיה</p>
      <p><b>גלגלת</b> — זום לנקודת העכבר</p>
      <p><b>W A S D / חצים</b> — טיסה (לחצו קודם על המודל), Q/E — מטה/מעלה</p>
      <p><b>לחיצה</b> — בחירת תת־אריח</p>
    </div>}

    <div className="pointer-events-none absolute bottom-2 left-2 z-[1001] flex max-w-[min(26rem,calc(100%-5rem))] flex-col items-start gap-1">
      {tileErrors.count > 0 && !error && <div className="pointer-events-auto flex items-center gap-2 rounded border border-destructive/50 bg-popover/95 px-2 py-1 text-xs text-destructive" role="status" dir="rtl">
        <span>{tileErrors.count} אריחים לא נטענו — {tileErrors.last}</span>
        <button type="button" className="shrink-0 rounded border px-2 py-0.5 text-popover-foreground hover:bg-accent" onClick={() => ctx.current?.retry()}>נסה שוב</button>
      </div>}
      {(stats.loading > 0 || progress < 100) && !error && <div className="rounded border bg-popover/95 px-2 py-1 text-xs text-popover-foreground" role="status" dir="rtl">
        טוען אריחים… {stats.loaded} הוצגו · {stats.loading} בטעינה
        {stats.refused > 0 && <span className="block text-muted-foreground">זיכרון האריחים מלא — אזורים רחוקים יוצגו ברזולוציה נמוכה</span>}
      </div>}
      {badge && <div className="pointer-events-auto">{badge}</div>}
      <div className="rounded border bg-popover/95 p-2 text-xs font-mono text-popover-foreground" dir="ltr" data-testid="tiles-readout">
        {readout}
        <span className="block text-muted-foreground">{geo || 'WGS84 —'} · Israel Grid · גובה אליפסואידי</span>
      </div>
    </div>
    {empty && !error && !tileErrors.count && <div className="absolute inset-x-0 top-1/3 mx-auto w-fit max-w-md rounded border bg-popover/95 p-3 text-center text-sm text-popover-foreground">ה־tileset נטען אך שרת האריחים לא החזיר גאומטריה. בדקו בקונסול (F12) את שגיאות 3D Tiles ושלחו אותן.</div>}
    {error && <p className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-destructive">{error}</p>}
    {failure && <p className="absolute inset-0 flex items-center justify-center bg-background text-destructive">תצוגת תלת־ממד אינה זמינה בדפדפן זה</p>}
  </div>;
}
