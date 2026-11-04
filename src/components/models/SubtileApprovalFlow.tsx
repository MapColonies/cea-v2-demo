import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useIsMobile } from '@/hooks/use-mobile';
import { intersectsView, unapprovedInView } from '@/lib/cea/spatialView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { useDemoApprovalAccess } from '@/hooks/useDemoApprovalAccess';
import { useRealModels } from '@/hooks/useRealModels';
import { demoStore } from '@/lib/demo/demoStore';
import { toast } from 'sonner';
import { SubtileMap } from '@/components/map/SubtileMap';
import { ReferenceUpload } from '@/components/map/ReferenceUpload';
import type { FeatureCollection } from 'geojson';
import { FlowStepsIndicator } from './FlowSteps';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  History,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  Loader2,
  Save,
  Shield,
  User,
  XCircle,
  Undo2,
} from 'lucide-react';
import { accuracyInRange, tileIdentifier, approvalStatusChanges, SAVE_CONFIRMATION_MS, type ModelStatus } from '@/lib/cea/rules';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];
type Subtile = Database['public']['Tables']['model_subtiles']['Row'];
type LogRow = Database['public']['Tables']['subtile_approval_logs']['Row'];

export interface ApprovalSession {
  performerName: string;
  verified: boolean;
}

interface Props {
  model: Model;
  session: ApprovalSession | null;
  onSessionVerified: (session: ApprovalSession) => void;
  onBack: () => void;
  onSaved: () => void;
  allModels?: Model[];
  initialReferenceIds?: Set<string>;
}

type Step = 'subtiles' | 'performer' | 'password' | 'saved';

export function SubtileApprovalFlow({
  model,
  onSessionVerified,
  onBack,
  onSaved,
  allModels = [],
  initialReferenceIds = new Set(),
}: Props) {
  const { user } = useAuth();
  // Demo mode: every signed-in user may approve (approvals are browser-local and have no operational effect).
  const isAdmin = Boolean(user);
  // Demo mode: real MapColonies models, approvals stay in this browser and have no operational effect.
  const access = useDemoApprovalAccess(model.id);
  const { subtilesFor } = useRealModels();
  const isMobile = useIsMobile();
  const panelRef = useRef<ImperativePanelHandle>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [subtiles, setSubtiles] = useState<Subtile[]>([]);
  const [logs, setLogs] = useState<(LogRow & { subtile_code?: string })[]>([]);
  const [statusLogs, setStatusLogs] = useState<Database['public']['Tables']['model_status_logs']['Row'][]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('subtiles');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const onVisibleChange = useCallback((ids: string[]) => setVisibleIds(prev => prev.size === ids.length && ids.every(id => prev.has(id)) ? prev : new Set(ids)), []);
  const selectFromMap = (tile: Subtile) => {
    if (step !== 'subtiles') return;
    panelRef.current?.expand();
    setFocusedId(tile.id);
    setSelected(prev => new Set(prev).add(tile.id));
    if (!filtered.some(t => t.id === tile.id)) { setMinAccuracy(''); setMaxAccuracy(''); }
    requestAnimationFrame(() => rowRefs.current.get(tile.id)?.scrollIntoView({ block: 'nearest', behavior: 'auto' }));
  };
  const [minAccuracy, setMinAccuracy] = useState('');
  const [rejected, setRejected] = useState(Boolean(model.is_rejected));
  const statusChanged = rejected !== Boolean(model.is_rejected);
  const viewModel = useMemo(()=>({...model,is_rejected:rejected}),[model,rejected]);
  const [maxAccuracy, setMaxAccuracy] = useState('');
  const [performerName, setPerformerName] = useState('');
  const [notes, setNotes] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(SAVE_CONFIRMATION_MS / 1000);
  const [referenceIds, setReferenceIds] = useState<Set<string>>(new Set(initialReferenceIds));
  const [localReference,setLocalReference]=useState<FeatureCollection|null>(null);

  const neighbourModels = useMemo(
    () => allModels.filter((m) => m.id !== model.id && intersectsView(m, model)),
    [allModels, model],
  );
  const referenceModels = useMemo(
    () => neighbourModels.filter((m) => referenceIds.has(m.id)),
    [neighbourModels, referenceIds],
  );

  const toggleReference = (id: string) => {
    setReferenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const loadData = async () => {
    setSubtiles([...subtilesFor([model.id])].sort((a, b) => a.code.localeCompare(b.code)));
    setLogs(demoStore.logsFor(model.id) as unknown as LogRow[]);
    setStatusLogs(demoStore.statusLogsFor(model.id) as unknown as Database['public']['Tables']['model_status_logs']['Row'][]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    setPending({});
    setSelected(new Set());
    setRejected(Boolean(model.is_rejected));
    setFocusedId(null);
    setHoveredId(null);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

  // The shared catalogue may still be arriving when the workspace opens: load the grid once it exists.
  const tilesAvailable = subtilesFor([model.id]).length > 0;
  useEffect(() => {
    if (tilesAvailable && subtiles.length === 0) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilesAvailable, model.id]);

  const effectiveApproved = (subtile: Subtile) =>
    !rejected && (pending[subtile.id] ?? subtile.is_approved_for_coordinates);

  const filtered = useMemo(() => {
    return subtiles.filter((s) => {
      if (!accuracyInRange(s.accuracy, minAccuracy, maxAccuracy)) return false;
      return true;
    });
  }, [subtiles, minAccuracy, maxAccuracy]);

  const focusedTile = subtiles.find(tile => tile.id === focusedId);

  const changes = useMemo(
    () => subtiles.filter((s) => s.id in pending && pending[s.id] !== s.is_approved_for_coordinates),
    [subtiles, pending],
  );

  const approvedCount = subtiles.filter((s) => effectiveApproved(s)).length;
  const currentStatus: ModelStatus = rejected ? 'rejected' : approvedCount === 0 ? 'not_approved' : approvedCount === subtiles.length ? 'approved' : 'partial';

  useEffect(() => {
    if (step !== 'saved') return;
    const start = Date.now();
    const countdown = window.setInterval(() => setSecondsRemaining(Math.max(0, Math.ceil((SAVE_CONFIRMATION_MS - (Date.now() - start)) / 1000))), 1000);
    const timer = window.setTimeout(onSaved, SAVE_CONFIRMATION_MS);
    return () => { window.clearInterval(countdown); window.clearTimeout(timer); };
  }, [step, onSaved]);

  const chooseStatus = async (value: ModelStatus) => {
    if (!isAdmin || access.acquiring) return;
    setError('');
    let next: Record<string, boolean> = {};
    try { if (value !== 'rejected') next = approvalStatusChanges(subtiles, value, selected); }
    catch (err) { setError((err as Error).message); return; }
    if (!access.canEdit && !(await access.acquire())) return;
    setRejected(value === 'rejected');
    setPending(next);
  };

  const toggleSubtile = (subtile: Subtile) => {
    if (rejected || !access.canEdit || step !== 'subtiles') return;
    const next = !effectiveApproved(subtile);
    setPending((prev) => ({ ...prev, [subtile.id]: next }));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const allSelected = filtered.every((s) => selected.has(s.id));
    setSelected(allSelected ? new Set() : new Set(filtered.map((s) => s.id)));
  };

  const applyToSelected = async (value: boolean) => {
    if (rejected || !isAdmin || access.acquiring || selected.size === 0) return;
    if (!access.canEdit && !(await access.acquire())) return;
    setPending((prev) => {
      const next = { ...prev };
      selected.forEach((id) => {
        next[id] = value;
      });
      return next;
    });
  };

  const save = async (name: string) => {
    if (!user) return;
    setSaving(true);
    try {
      const savedCount = demoStore.saveWorkspace({
        modelId: model.id,
        rejected,
        changes: changes.map((tile) => ({ subtile_id: tile.id, approved: Boolean(pending[tile.id]) })),
        performerName: name,
        performedBy: user.id,
        notes: notes || undefined,
      });
      if (savedCount !== changes.length) {
        throw new Error('חלק מהאזורים השתנו במקביל. נא לרענן ולנסות שוב.');
      }
      setLogs(demoStore.logsFor(model.id) as unknown as LogRow[]);
      setStatusLogs(demoStore.statusLogsFor(model.id) as unknown as Database['public']['Tables']['model_status_logs']['Row'][]);

      toast.success(statusChanged ? (rejected?'המודל סומן כלא מאושר וכל האישורים בוטלו':'המודל הוחזר לבדיקה') : `נשמרו ${savedCount} שינויים בתתי-אזורים`);
      setPending({});
      setSelected(new Set());
      setPassword('');
      setSubtiles(prev => prev.map(tile => ({ ...tile, is_approved_for_coordinates: effectiveApproved(tile) })));
      setSecondsRemaining(SAVE_CONFIRMATION_MS / 1000);
      setStep('saved');
    } catch (err) {
      console.error(err);
      const message =
        (err as { message?: string })?.message || 'שגיאה לא ידועה';
      toast.error('השמירה נכשלה, נסה שוב', { description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (changes.length === 0 && !statusChanged) return;
    setError('');
    panelRef.current?.expand();
    setPerformerName('');
    setPassword('');
    setStep('performer');
  };

  const handlePerformerNext = () => {
    setError('');
    if (!performerName.trim()) {
      setError('נא להזין שם מלא');
      return;
    }
    setStep('password');
  };

  const handleAdminPassword = async () => {
    setError('');
    if (!password) {
      setError('נא להזין ססמת מנהל');
      return;
    }
    setSaving(true);
    const valid = await access.verify(password, performerName.trim());
    setSaving(false);
    if (!valid) {
      setError('אימות המנהל נכשל. יש להתחבר מחדש או לבדוק את הסיסמה.');
      return;
    }
    onSessionVerified({ performerName: performerName.trim(), verified: true });
    await save(performerName.trim());
  };

  const stepIndex = step === 'subtiles' ? 1 : step === 'performer' ? 2 : 3;

  const renderSidePanel = () => {
    if (step === 'saved') {
      return <Alert role="status" className="border-success bg-success/10 text-success"><CheckCircle className="h-5 w-5"/><AlertDescription><p className="font-semibold">השינויים נשמרו בהצלחה</p><p className="mt-2">חזרה למסך ההתחלה לסשן חדש בעוד {secondsRemaining} שניות</p></AlertDescription></Alert>;
    }
    if (step === 'performer') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">פרטי מבצע</h3>
          </div>
          <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800">
            <AlertTriangle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertDescription className="text-emerald-800 dark:text-emerald-200">
              עומדים להישמר {changes.length} שינויים בתתי-אזורים (מצב דמו — נשמר בדפדפן זה בלבד, ללא השפעה מבצעית).
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="performerName">שם מלא של המבצע *</Label>
            <Input
              id="performerName"
              value={performerName}
              onChange={(e) => setPerformerName(e.target.value)}
              placeholder="הזן את שמך המלא"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && performerName.trim()) handlePerformerNext();
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">הערות (אופציונלי)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="הוסף הערות לתיעוד..."
            />
          </div>
        </div>
      );
    }

    if (step === 'password') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">ססמת מנהל</h3>
          </div>
          <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800">
            <AlertTriangle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertDescription className="text-emerald-800 dark:text-emerald-200">
              מאשר: {performerName} • {changes.length} שינויים ממתינים. נא לאמת ססמת מנהל לביצוע האישור.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="adminPassword">ססמת מנהל *</Label>
            <Input
              id="adminPassword"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password) handleAdminPassword();
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <p className="text-xs text-muted-foreground">מצב דמו — כל ססמה מתקבלת והאישור נשמר רק בדפדפן זה.</p>
        </div>
      );
    }

    // subtiles step: list + filters
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-2"><Checkbox aria-label="לא מאושר לשימוש" checked={rejected} disabled={!isAdmin || access.acquiring} onCheckedChange={async value=>{if(!access.canEdit && !(await access.acquire()))return;setRejected(value===true);setPending({});}}/><span className="text-sm">לא מאושר לשימוש</span>{statusChanged&&<Badge variant="outline">{rejected?'אי־אישור וביטול כל האישורים':'החזרה לבדיקה — נדרש אישור מחדש'}</Badge>}</div>
        <div className="mb-2 space-y-1 shrink-0">
          <Label htmlFor="model-status" className="text-xs">מצב המודל</Label>
          <Select value={currentStatus} onValueChange={value => void chooseStatus(value as ModelStatus)} disabled={!isAdmin || access.acquiring} dir="rtl">
            <SelectTrigger id="model-status" className="h-8"><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="approved">מאושר — כל תתי־האריחים</SelectItem><SelectItem value="partial">מאושר חלקית — תתי־האריחים הנבחרים</SelectItem><SelectItem value="not_approved">לא נבדק — ללא אישורים</SelectItem><SelectItem value="rejected">לא מאושר</SelectItem></SelectContent>
          </Select>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2 flex-shrink-0">
          <div className="space-y-1"><Label htmlFor="tile-accuracy-from" className="text-xs">דיוק מ־ (מ׳)</Label><Input id="tile-accuracy-from" className="h-8" type="number" min="0" step="0.1" value={minAccuracy} onChange={e=>setMinAccuracy(e.target.value)} placeholder="הכל"/></div>
          <div className="space-y-1">
            <Label htmlFor="tile-accuracy" className="text-xs">דיוק עד (מ׳)</Label>
            <Input
              id="tile-accuracy"
              className="h-8"
              type="number"
              step="0.1"
              value={maxAccuracy}
              onChange={(e) => setMaxAccuracy(e.target.value)}
              placeholder="הכל"
            />
          </div>

        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 flex-shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(new Set(unapprovedInView(filtered, visibleIds, effectiveApproved)))}>
            בחר לא נבדקים בתצוגה
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={selectAllFiltered}>
            בחר הכל למסונן ({filtered.length})
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-success hover:bg-success/90 text-success-foreground"
            disabled={rejected || !isAdmin || access.acquiring || selected.size === 0}
            onClick={() => void applyToSelected(true)}
          >
            <CheckCircle className="w-3 h-3 ml-1" />
            אשר נבחרים
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            disabled={rejected || !isAdmin || access.acquiring || selected.size === 0}
            onClick={() => void applyToSelected(false)}
          >
            <XCircle className="w-3 h-3 ml-1" />
            בטל אישור לנבחרים
          </Button>
        </div>


        {focusedTile && <div role="status" aria-label="תת־אריח נבחר" className="mt-2 shrink-0 border-s-4 border-selection bg-accent px-2 py-1 text-xs">
          <p className="font-semibold break-words">{model.name} · תת־אריח <span dir="ltr">{tileIdentifier(focusedTile)}</span></p>
          <p className="text-muted-foreground">{focusedTile.name || focusedTile.code} · דיוק אופקי {focusedTile.accuracy ?? '—'} מ׳ · דיוק אנכי {focusedTile.vertical_accuracy ?? '—'} מ׳</p>
        </div>}
        <div className="flex-1 min-h-[260px] mt-3 flex gap-2">
        <section aria-label="שינויים ממתינים" className="w-32 md:w-44 shrink-0 flex flex-col min-h-0 border rounded-lg p-2">
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
            <h3 className="font-semibold">שינויים ממתינים ({changes.length})</h3>
            <span><span className="text-success">לאישור: {changes.filter(t => pending[t.id]).length}</span> · <span className="text-destructive">לביטול: {changes.filter(t => !pending[t.id]).length}</span></span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto divide-y mt-1">
            {changes.map(tile => <div key={tile.id} className="flex items-center justify-between gap-2 py-1 text-xs" data-pending-tile={tile.id}>
              <span className="min-w-0 break-words">{tileIdentifier(tile)} · <span className={pending[tile.id] ? 'text-success' : 'text-destructive'}>{pending[tile.id] ? 'לאישור' : 'לביטול אישור'}</span></span>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`הסר שינוי ${tile.code}`} title={`הסר שינוי ${tile.code}`} onClick={() => setPending(prev => { const next = {...prev}; delete next[tile.id]; return next; })}><Undo2 className="h-3.5 w-3.5"/></Button>
            </div>)}
            {!changes.length && <p className="py-1 text-xs text-muted-foreground">אין שינויים ממתינים</p>}
          </div>
        </section>
        <div className="flex-1 min-w-0 overflow-auto border rounded-lg min-h-0 divide-y">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">אין תתי-אזורים תואמים לסינון</div>
          ) : (
            filtered.map((tile) => {
              const approved = effectiveApproved(tile);
              const changed = tile.id in pending && pending[tile.id] !== tile.is_approved_for_coordinates;
              return (
                <div
                  key={tile.id}
                  ref={el => { if (el) rowRefs.current.set(tile.id, el); else rowRefs.current.delete(tile.id); }}
                  data-tile-id={tile.id}
                  data-selected={selected.has(tile.id)}
                  data-focused={focusedId === tile.id}
                  onMouseEnter={() => setHoveredId(tile.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex items-center justify-between gap-2 p-2 text-sm ${
                    focusedId === tile.id ? 'cea-selected-row ring-2 ring-inset ring-selection' : selected.has(tile.id) ? 'cea-selected-row' : hoveredId === tile.id ? 'bg-accent ring-1 ring-inset ring-ring' : changed ? 'bg-pending/10' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={selected.has(tile.id)}
                      aria-label={`בחר ${tile.code}`}
                      onCheckedChange={() => { toggleSelect(tile.id); setFocusedId(tile.id); }}
                    />
                    <Button variant="ghost" className="min-w-0 text-right h-auto flex flex-col items-start px-1 whitespace-normal" onClick={() => { toggleSelect(tile.id); setFocusedId(tile.id); }}>
                      <p className="font-medium">{tileIdentifier(tile)} · {tile.name || model.name}</p>
                      <p className="text-xs text-muted-foreground">
                        דיוק {tile.accuracy ?? '—'} מ׳ • איכות {tile.quality_rating ?? '—'} • {tile.capture_date ?? '—'}
                      </p>
                    </Button>
                  </div>
                  <Badge
                    className={`shrink-0 whitespace-nowrap text-xs cursor-pointer ${
                      approved
                        ? 'bg-success hover:bg-success/90 text-success-foreground'
                        : 'bg-warning/20 text-warning hover:bg-warning/30'
                    }`}
                    onClick={() => toggleSubtile(tile)}
                  >
                    {rejected ? 'לא מאושר' : approved ? 'מאושר' : 'לא נבדק'}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto md:overflow-hidden" dir="rtl">
      <div className="flex-shrink-0 mb-3">
        <FlowStepsIndicator currentIndex={stepIndex} />
      </div>

      <div className="flex-shrink-0 mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{model.name}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
            <span>מדינה: {model.country || '—'}</span>
            <span>מקור: {model.source || '—'}</span>
            <span>רזולוציה: {model.resolution ?? '—'} מ׳</span>
            <span>דיוק אופקי: {model.accuracy ?? '—'} מ׳</span>
            <span>דיוק אנכי: {model.vertical_accuracy ?? '—'} מ׳</span>
            <span>תאריך צילום: {model.capture_date ?? '—'}</span>
            <span>הועלה: {model.upload_date ?? '—'}</span>
            <span>
              מרכז: {Number(model.center_lat ?? (Number(model.bbox_north) + Number(model.bbox_south)) / 2).toFixed(4)},{' '}
              {Number(model.center_lng ?? (Number(model.bbox_east) + Number(model.bbox_west)) / 2).toFixed(4)}
            </span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2 max-w-60">
        <Badge
          className={
            rejected ? 'bg-destructive/20 text-destructive' : approvedCount === 0
              ? 'bg-muted text-muted-foreground'
              : approvedCount === subtiles.length
              ? 'bg-success text-success-foreground'
              : 'bg-warning/20 text-warning'
          }
        >
          {rejected ? 'לא מאושר' : approvedCount === 0
            ? 'לא נבדק'
            : approvedCount === subtiles.length
            ? 'מאושר במלואו'
            : `מאושר חלקית ${approvedCount}/${subtiles.length}`}
        </Badge>
        <div className="flex justify-start max-w-full" dir="ltr"><ReferenceUpload onChange={setLocalReference}/></div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3 shrink-0">
        {!isAdmin ? <Alert><AlertDescription>צפייה בלבד — לאישור יש להיכנס מראש לחשבון מנהל</AlertDescription></Alert> : <Button variant={access.editing ? 'outline' : 'default'} size="sm" disabled={access.acquiring} onClick={() => { if (access.editing) { setPending({}); void access.release(); } else void access.acquire(); }}>{access.acquiring ? 'מתחיל עריכה...' : access.editing ? 'סיום עריכה' : 'מצב עריכה'}</Button>}
        {access.lease && !access.lease.owned && <Badge variant="outline">המודל נעול לעריכה על ידי {access.lease.owner_name}</Badge>}
        {access.approval.valid && <Badge className="bg-success text-success-foreground">סשן אישור מאומת — {access.approval.performer_name}</Badge>}
        {access.error && <p className="text-xs text-destructive">{access.error}</p>}
        <Badge variant="outline" className="text-warning border-warning/50" title="האישורים נשמרים בדפדפן זה בלבד ואינם משפיעים על MapColonies או על מערכות מבצעיות">מצב דמו — אישורים ללא השפעה מבצעית</Badge>
      </div>
      <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="flex-1 min-h-[750px] md:min-h-0" dir="rtl">
        <ResizablePanel ref={panelRef} defaultSize={isMobile ? 35 : 36} minSize={isMobile ? 25 : 24} maxSize={isMobile ? 60 : 55} collapsible collapsedSize={0} onCollapse={() => setPanelCollapsed(true)} onExpand={() => setPanelCollapsed(false)}>
          <div className="h-full overflow-hidden flex flex-col min-h-0 px-2" data-testid="approval-sidebar">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                טוען תתי-אזורים...
              </div>
            ) : (
              renderSidePanel()
            )}
          </div>
          <Button variant="ghost" className="shrink-0 justify-start gap-2 mt-2" onClick={() => setHistoryOpen(v => !v)} aria-expanded={historyOpen}><History className="h-4 w-4"/>יומן שינויים ({logs.length+statusLogs.length})</Button>
          {historyOpen&&statusLogs.length>0&&<div className="max-h-24 overflow-auto shrink-0 text-xs">{statusLogs.map(log=><div key={log.id} className="py-1"><span className="text-destructive">{log.action==='reject'?'סימון מודל כלא מאושר':'החזרה לבדיקה'}</span> · {log.performer_name} · {new Date(log.created_at).toLocaleString('he-IL')}</div>)}</div>}
          {historyOpen && <div className="h-32 shrink-0 overflow-auto text-xs divide-y">{logs.length ? logs.map(log => <div key={log.id} className="py-2 flex flex-wrap justify-between gap-1"><span className={log.action === "approve" ? "text-success" : "text-destructive"}>{log.action === "approve" ? "אישור" : "ביטול אישור"} • {log.performer_name}</span><span className="text-muted-foreground">{new Date(log.created_at).toLocaleString("he-IL")}</span></div>) : <p className="py-2 text-muted-foreground">אין שינויים מתועדים למודל זה</p>}</div>}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle aria-label="שינוי גודל רשימת תתי־אזורים"/>
        <ResizablePanel defaultSize={isMobile ? 65 : 64} minSize={40}>
          <div className="h-full flex flex-col min-h-0 ps-2" data-testid="map-workspace">
            <div className="flex-1 min-h-0">
              {!loading && (
                <SubtileMap
                  localReference={localReference}
                  model={viewModel}
                  subtiles={subtiles}
                  pendingIds={new Set(changes.map((c) => c.id))}
                  effectiveApproved={effectiveApproved}
                  onToggle={step === 'subtiles' ? toggleSubtile : () => undefined}
                  referenceModels={referenceModels}
                  selectedIds={selected}
                  focusedId={focusedId}
                  hoveredId={hoveredId}
                  onSelect={selectFromMap}
                  onHover={setHoveredId}
                  onVisibleChange={onVisibleChange}
                  overlay={<div className="flex items-center gap-1 rounded-md border bg-popover/95 p-1 shadow"><Button variant="outline" size="icon" className="h-7 w-7" aria-label={panelCollapsed ? "פתח רשימת תתי־אזורים" : "קפל רשימת תתי־אזורים"} title={panelCollapsed ? "פתח רשימת תתי־אזורים" : "קפל רשימת תתי־אזורים"} disabled={step !== "subtiles"} onClick={() => { if (panelCollapsed) panelRef.current?.expand(); else panelRef.current?.collapse(); }}>{panelCollapsed ? <PanelRightOpen className="h-4 w-4"/> : <PanelRightClose className="h-4 w-4"/>}</Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <Layers className="w-3 h-3" />
                      מודלים שכנים לרפרנס
                      {referenceModels.length > 0 && (
                        <Badge className="bg-reference text-reference-foreground text-[10px] px-1">{referenceModels.length}</Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="z-[10000] w-72 p-2" dir="rtl">
                    <p className="text-xs text-muted-foreground px-1 pb-2">
                      בחר מודלים להצגה על המפה לצפייה בלבד (ללא אפשרות אישור)
                    </p>
                    <div className="max-h-64 overflow-auto space-y-1">
                      {neighbourModels.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-1">אין מודלים נוגעים במודל הפעיל</p>
                      ) : (
                        neighbourModels.map((m) => (
                          <label
                            key={m.id}
                            className="flex items-center gap-2 p-1.5 rounded hover:bg-accent/50 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={referenceIds.has(m.id)}
                              onCheckedChange={() => toggleReference(m.id)}
                            />
                            <span className="flex-1">{m.name}</span>
                            <span className="text-muted-foreground">{m.country || '—'}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover></div>}
                />
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <div className="flex-shrink-0 flex items-center justify-between pt-3 mt-3 border-t">
        <Button
          variant="outline"
          className="gap-2"
          disabled={saving || step === 'saved'}
          onClick={() => {
            if (step === 'password') setStep('performer');
            else if (step === 'performer') setStep('subtiles');
            else onBack();
          }}
        >
          <ArrowRight className="w-4 h-4" />
          חזור
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {step === 'saved' ? 'השינויים נשמרו בהצלחה' : statusChanged ? (rejected?'אי־אישור וביטול אישורים ממתינים לשמירה':'החזרה לבדיקה ממתינה לשמירה') : changes.length > 0 ? `${changes.length} שינויים ממתינים לשמירה` : 'אין שינויים ממתינים'}
          </span>
          {step === 'subtiles' && (
            <Button
              className="bg-success hover:bg-success/90 text-success-foreground gap-2"
              disabled={!access.canEdit || (changes.length === 0 && !statusChanged) || saving}
              onClick={handleSaveClick}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור שינויים
            </Button>
          )}
          {step === 'performer' && (
            <Button
              className="bg-success hover:bg-success/90 text-success-foreground gap-2"
              disabled={performerName.trim().length === 0 || saving}
              onClick={handlePerformerNext}
            >
              <ArrowLeft className="w-4 h-4" />
              המשך לססמת מנהל
            </Button>
          )}
          {step === 'password' && (
            <Button
              className="bg-success hover:bg-success/90 text-success-foreground gap-2"
              disabled={password.length === 0 || saving}
              onClick={handleAdminPassword}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? 'שומר...' : 'אשר ושמור'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
