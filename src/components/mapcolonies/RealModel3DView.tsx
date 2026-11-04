import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMapColoniesCatalog } from '@/hooks/useMapColoniesCatalog';
import { tilesetsForBounds } from '@/lib/mapcolonies/match';
import type { McBBox } from '@/lib/mapcolonies/csw';
import type { GeoPoint, TileOverlay } from './Tiles3DView';

const Tiles3DView = lazy(() => import('./Tiles3DView').then(m => ({ default: m.Tiles3DView })));
const POINT_SPAN = 0.004; // ~400 m around a target point

/**
 * 3D for an area: the real MapColonies photorealistic 3D Tiles layer that covers it.
 * The synthetic surface is only shown when the user explicitly asks for it (no real layer covers the area).
 */
export function RealModel3DView({ area, target = null, demo, preferId, overlays, onPickPoint, onHoverPoint }: {
  area: McBBox;
  target?: { lat: number; lng: number } | null;
  demo?: () => ReactNode;
  /** Catalogue record to show first (the model's own MapColonies layer). */
  preferId?: string;
  overlays?: TileOverlay[];
  onPickPoint?: (p: GeoPoint) => void;
  onHoverPoint?: (p: GeoPoint | null) => void;
}) {
  const { records, loading, error, reload } = useMapColoniesCatalog();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const { west, south, east, north } = area;
  const matches = useMemo(() => {
    const covering = tilesetsForBounds(records, { west, south, east, north });
    const own = preferId ? records.find(r => r.id === preferId && r.tilesetUrl) : undefined;
    return own ? [own, ...covering.filter(r => r.id !== own.id)] : covering;
  }, [records, west, south, east, north, preferId]);
  const record = matches.find(r => r.id === chosenId) ?? matches[0] ?? null;
  const tlat = target?.lat, tlng = target?.lng;
  const focus = useMemo<McBBox>(() => tlat !== undefined && tlng !== undefined
    ? { west: tlng - POINT_SPAN, east: tlng + POINT_SPAN, south: tlat - POINT_SPAN, north: tlat + POINT_SPAN }
    : { west, south, east, north }, [tlat, tlng, west, south, east, north]);

  if (showDemo && demo) return <div className="relative h-full w-full">
    {demo()}
    <Button size="sm" variant="secondary" className="absolute top-2 left-2 z-[1001]" onClick={() => setShowDemo(false)}>חזרה למודל האמיתי</Button>
  </div>;

  const panel = (children: ReactNode) => <div className="flex h-full w-full items-center justify-center bg-background p-6 text-center" dir="rtl"><div className="max-w-md space-y-3 text-sm">{children}</div></div>;
  if (loading) return panel(<p className="text-muted-foreground" role="status">טוען מודלים תלת־ממדיים מקטלוג MapColonies…</p>);
  if (error) return panel(<><p className="text-destructive">{error}</p><Button size="sm" variant="outline" onClick={reload}>נסה שוב</Button></>);
  if (!record) return panel(<>
    <p>אין שכבת 3D Tiles אמיתית בקטלוג MapColonies שחופפת לאזור הזה.</p>
    {demo && <Button size="sm" variant="outline" onClick={() => setShowDemo(true)}>הצג משטח דמו (לא מבצעי)</Button>}
  </>);

  return <div className="relative h-full w-full">
    <Suspense fallback={panel(<p className="text-muted-foreground">טוען מנוע תלת־ממד…</p>)}>
      <Tiles3DView key={record.id} tilesetUrl={record.tilesetUrl!} bbox={record.bbox} focus={focus} overlays={overlays} onPickPoint={onPickPoint} onHoverPoint={onHoverPoint} />
    </Suspense>
    <div className="absolute top-2 left-2 z-[1001] flex items-center gap-2 rounded border bg-popover/95 px-2 py-1 text-xs text-popover-foreground" dir="rtl">
      <span className="font-semibold">MapColonies 3D Tiles</span>
      {matches.length > 1
        ? <Select value={record.id} onValueChange={setChosenId}><SelectTrigger className="h-7 w-48 text-xs" aria-label="שכבת תלת־ממד"><SelectValue /></SelectTrigger><SelectContent>{matches.map(r => <SelectItem key={r.id} value={r.id}>{r.productName}</SelectItem>)}</SelectContent></Select>
        : <span>{record.productName}</span>}
    </div>
  </div>;
}
