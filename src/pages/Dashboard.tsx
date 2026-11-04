import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  ModelIdentificationWizard,
  statusOf,
  type SubtileStats,
} from '@/components/models/ModelIdentificationWizard';
import { SubtileApprovalFlow, type ApprovalSession } from '@/components/models/SubtileApprovalFlow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LogOut, Box, User, ArrowRight, FileSpreadsheet, Globe2 } from 'lucide-react';
import { MapColoniesCatalog } from '@/components/mapcolonies/MapColoniesCatalog';
import { exportTestPlanToExcel } from '@/lib/exportTestPlan';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];

export function Dashboard() {
  const [models, setModels] = useState<Model[]>([]);
  const [subtileStats, setSubtileStats] = useState<SubtileStats>({});
  const [confirmedModel, setConfirmedModel] = useState<Model | null>(null);
  const [session, setSession] = useState<ApprovalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [referenceIds, setReferenceIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'models' | 'mapcolonies'>('mapcolonies');
  const toggleReference = (id: string) => setReferenceIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const { user, signOut, isAdmin, userRole, username } = useAuth();

  const fetchData = async () => {
    const [{ data: modelRows, error }, { data: tiles }] = await Promise.all([
      supabase.from('models').select('*').eq('is_published', true).order('name'),
      supabase.from('model_subtiles').select('id, model_id, is_approved_for_coordinates'),
    ]);

    if (error) console.error('Error fetching models:', error);
    setModels(modelRows || []);

    const stats: SubtileStats = {};
    (tiles || []).forEach((tile) => {
      const entry = (stats[tile.model_id] ||= { total: 0, approved: 0 });
      entry.total += 1;
      if (tile.is_approved_for_coordinates) entry.approved += 1;
    });
    setSubtileStats(stats);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const approvedModels = models.filter((m) => statusOf(m, subtileStats) === 'approved').length;
  const partialModels = models.filter((m) => statusOf(m, subtileStats) === 'partial').length;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden" dir="rtl">
      <header className="border-b border-border bg-card px-4 py-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {confirmedModel ? (
              <Button variant="ghost" size="icon" onClick={() => setConfirmedModel(null)}>
                <ArrowRight className="w-5 h-5" />
              </Button>
            ) : (
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Box className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">מנגנון אישור מודל לחילוץ נ.צ. — גרסה 2</h1>
              <p className="text-sm text-muted-foreground">
                {confirmedModel
                  ? confirmedModel.name
                  : view === 'mapcolonies'
                  ? 'מודלים תלת־ממדיים פוטוריאליסטיים מקטלוג MapColonies'
                  : `${models.length} מודלים • ${approvedModels} מאושרים • ${partialModels} מאושרים חלקית`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{username || 'משתמש'}</span>
              {userRole && (
                <Badge variant={isAdmin ? 'default' : 'secondary'}>{isAdmin ? 'מנהל' : 'צופה'}</Badge>
              )}
              {session?.verified && (
                <Badge className="bg-success text-success-foreground text-xs">סשן מאומת</Badge>
              )}
            </div>
            {!confirmedModel && (
              <Button variant={view === 'mapcolonies' ? 'default' : 'outline'} size="sm" aria-pressed={view === 'mapcolonies'} onClick={() => setView(v => v === 'mapcolonies' ? 'models' : 'mapcolonies')} title="שכבות תלת־ממד פוטוריאליסטיות מקטלוג MapColonies">
                <Globe2 className="w-4 h-4 ml-2" />
                {view === 'mapcolonies' ? 'מודלים לאישור (דמו)' : 'מודלי MapColonies'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportTestPlanToExcel} title="הורדת קובץ Excel עם תרחישי בדיקה ידניים למערכת">
              <FileSpreadsheet className="w-4 h-4 ml-2" />
              תוכנית בדיקות (Excel)
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 ml-2" />
              התנתק
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {view === 'mapcolonies' && !confirmedModel ? (
          <MapColoniesCatalog />
        ) : loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="space-y-3 w-full max-w-md p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </div>
        ) : confirmedModel ? (
          <div className="h-full flex justify-center">
            <div className="w-full max-w-7xl h-full">
              <SubtileApprovalFlow
                model={confirmedModel}
                allModels={models}
                initialReferenceIds={referenceIds}
                session={session}
                onSessionVerified={setSession}
                onBack={() => setConfirmedModel(null)}
                 onSaved={() => { setConfirmedModel(null); setSession(null); setReferenceIds(new Set()); void supabase.rpc('end_approval_session'); void fetchData(); }}
              />
            </div>
          </div>
        ) : (
          <ModelIdentificationWizard
            models={models}
            subtileStats={subtileStats}
            onModelConfirmed={setConfirmedModel}
            referenceIds={referenceIds}
            onToggleReference={toggleReference}
          />
        )}
      </div>
    </div>
  );
}
