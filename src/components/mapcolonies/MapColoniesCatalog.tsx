import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { MapContainer, GeoJSON, Rectangle, Tooltip as LeafletTooltip } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Search, Box } from 'lucide-react';
import { BasemapLayers } from '@/components/map/BasemapLayers';
import { loadMapColoniesCatalog, mapColoniesConfig } from '@/lib/mapcolonies/client';
import { is3DTilesRecord, type Mc3DRecord } from '@/lib/mapcolonies/csw';

// Three.js + 3d-tiles-renderer load only when a 3D layer is opened.
const Tiles3DView = lazy(() => import('./Tiles3DView').then(m => ({ default: m.Tiles3DView })));

const fmtDate = (value: string) => value ? value.slice(0, 10) : '—';

function Footprints({ records, selected, onSelect }: { records: Mc3DRecord[]; selected: Mc3DRecord | null; onSelect: (r: Mc3DRecord) => void }) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const token = (name: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g, ', ')})`;
  useEffect(() => {
    if (!map) return;
    const b = selected?.bbox;
    if (b) map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [30, 30], animate: false });
    else map.setView([31.5, 35], 7, { animate: false });
  }, [map, selected]);
  useEffect(() => { if (!map) return; const o = new ResizeObserver(() => map.invalidateSize({ pan: false, animate: false })); o.observe(map.getContainer()); return () => o.disconnect(); }, [map]);
  return <MapContainer center={[31.5, 35]} zoom={7} className="h-full w-full z-0" ref={setMap}>
    <BasemapLayers />
    {records.map(r => {
      const active = r.id === selected?.id;
      const style = { color: token(active ? '--pending' : '--reference'), weight: active ? 3 : 1.5, fillOpacity: active ? .25 : .06, dashArray: active ? undefined : '5 4' };
      const handlers = { click: () => onSelect(r) };
      return r.footprint
        ? <GeoJSON key={`${r.id}-${active}`} data={r.footprint} style={style} eventHandlers={handlers}><LeafletTooltip>{r.productName}</LeafletTooltip></GeoJSON>
        : r.bbox ? <Rectangle key={`${r.id}-${active}`} bounds={[[r.bbox.south, r.bbox.west], [r.bbox.north, r.bbox.east]]} pathOptions={style} eventHandlers={handlers}><LeafletTooltip>{r.productName}</LeafletTooltip></Rectangle> : null;
    })}
  </MapContainer>;
}

function RecordMetadata({ record }: { record: Mc3DRecord }) {
  const rows: [string, string][] = [
    ['מזהה מוצר', record.productId],
    ['סוג מוצר', record.productType],
    ['אזור', record.region || '—'],
    ['חיישנים', record.sensors || '—'],
    ['מערכת הפקה', record.productionSystem || '—'],
    ['דיוק LE90 / CE90', `${record.accuracyLE90 ?? '—'} / ${record.maxHorizontalAccuracyCE90 ?? '—'} מ׳`],
    ['זמן הדמאה', `${fmtDate(record.imagingTimeBeginUTC)} – ${fmtDate(record.imagingTimeEndUTC)}`],
    ['עודכן', fmtDate(record.updateDateUTC)],
    ['גרסה', record.productVersion || '—'],
  ];
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
    {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></div>)}
  </dl>;
}

export function MapColoniesCatalog() {
  const [records, setRecords] = useState<Mc3DRecord[]>([]);
  const [matched, setMatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyTiles, setOnlyTiles] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'map' | '3d'>('map');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    loadMapColoniesCatalog()
      .then(result => {
        if (!live) return;
        setRecords(result.records); setMatched(result.matched);
        // Open the first real 3D Tiles model immediately so the screen never starts empty.
        setSelectedId(current => {
          if (current && result.records.some(r => r.id === current)) return current;
          const first = result.records.find(r => r.tilesetUrl);
          if (first) setMode('3d');
          return first?.id ?? null;
        });
      })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'טעינת הקטלוג נכשלה'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [revision]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => (!onlyTiles || is3DTilesRecord(r)) && (!q || [r.productName, r.productId, r.region, r.description, r.productType].some(v => v.toLowerCase().includes(q))));
  }, [records, search, onlyTiles]);
  const selected = records.find(r => r.id === selectedId) ?? null;
  const select = (r: Mc3DRecord) => { setSelectedId(r.id); if (r.tilesetUrl) setMode('3d'); };

  return <div className="h-full grid grid-cols-1 md:grid-cols-[360px_1fr] gap-3 p-3 min-h-0" dir="rtl">
    <section className="flex flex-col min-h-0 border rounded-md p-2" aria-label="קטלוג MapColonies">
      <div className="shrink-0 space-y-2 pb-2 border-b">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">קטלוג 3D — MapColonies</h2>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="רענון קטלוג" aria-label="רענון קטלוג" onClick={() => setRevision(v => v + 1)} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
        <div className="relative"><Search className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" /><Input aria-label="חיפוש שכבה" placeholder="חפש לפי שם, אזור או מזהה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" /></div>
        <div className="flex gap-1">
          <Button size="sm" className="text-xs" variant={onlyTiles ? 'default' : 'outline'} onClick={() => setOnlyTiles(true)}>3D Tiles בלבד</Button>
          <Button size="sm" className="text-xs" variant={!onlyTiles ? 'default' : 'outline'} onClick={() => setOnlyTiles(false)}>כל הרשומות</Button>
        </div>
        {!mapColoniesConfig.token && <p className="text-[11px] text-muted-foreground">ללא VITE_MAPCOLONIES_TOKEN — הקטלוג נטען דרך פונקציית השרת, ואריחים נטענים ללא טוקן.</p>}
      </div>
      <div className="flex-1 overflow-auto min-h-0 py-2 space-y-1">
        {loading && [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        {!loading && error && <div className="p-3 text-sm text-destructive space-y-2"><p>{error}</p><Button size="sm" variant="outline" onClick={() => setRevision(v => v + 1)}>נסה שוב</Button></div>}
        {!loading && !error && filtered.map(r => <button key={r.id} type="button" onClick={() => select(r)}
          className={`w-full text-right border rounded-md p-2 flex gap-2 items-start hover:bg-accent/60 ${r.id === selectedId ? 'border-primary bg-accent' : 'border-border'}`}>
          <Box className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block text-sm truncate">{r.productName}</span>
            <span className="flex flex-wrap gap-1 items-center">
              <Badge variant="outline" className="text-[10px]">{r.productType || r.recordType}</Badge>
              {r.region && <span className="text-xs text-muted-foreground">{r.region}</span>}
              {!r.tilesetUrl && <span className="text-xs text-muted-foreground">אין קישור 3D Tiles</span>}
            </span>
          </span>
        </button>)}
        {!loading && !error && !filtered.length && <p className="text-center p-5 text-muted-foreground text-sm">לא נמצאו שכבות</p>}
      </div>
      <p className="text-xs text-muted-foreground pt-2 border-t">{filtered.length} מוצגות • {records.length}/{matched} רשומות נטענו</p>
    </section>

    <section className="flex flex-col min-h-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold truncate">{selected?.productName || 'בחרו שכבה מהקטלוג'}</h2>
        <div className="flex gap-1" role="group" aria-label="מצב תצוגה">
          <Button size="sm" variant={mode === 'map' ? 'default' : 'outline'} aria-pressed={mode === 'map'} onClick={() => setMode('map')}>דו־ממד</Button>
          <Button size="sm" variant={mode === '3d' ? 'default' : 'outline'} aria-pressed={mode === '3d'} disabled={!selected?.tilesetUrl} onClick={() => setMode('3d')}>תלת־ממד</Button>
        </div>
      </div>
      <div className="relative isolate z-0 flex-1 min-h-[320px] border rounded-md overflow-hidden">
        {mode === '3d' && selected?.tilesetUrl
          ? <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">טוען מנוע תלת־ממד…</p>}><Tiles3DView key={selected.id} tilesetUrl={selected.tilesetUrl} bbox={selected.bbox} /></Suspense>
          : <Footprints records={filtered} selected={selected} onSelect={select} />}
        {selected && <aside aria-label="מטא־דאטה של השכבה" className="absolute bottom-2 right-2 z-[1000] w-[360px] max-w-[calc(100%-1rem)] max-h-[40%] overflow-y-auto rounded-md border bg-card/95 p-2 text-card-foreground">
          <RecordMetadata record={selected} />
        </aside>}
      </div>
    </section>
  </div>;
}
