import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRealModels } from '@/hooks/useRealModels';
import { EnvironmentSwitcher } from '@/components/mapcolonies/EnvironmentSwitcher';
import { mcEnvStore, useMapColoniesEnv } from '@/lib/mapcolonies/environments';
import {
  ModelIdentificationWizard,
  statusOf,
} from '@/components/models/ModelIdentificationWizard';
import { SubtileApprovalFlow, type ApprovalSession } from '@/components/models/SubtileApprovalFlow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LogOut, User, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { exportTestPlanToExcel } from '@/lib/exportTestPlan';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];

export function Dashboard() {
  // Approval catalogue = real MapColonies 3D Tiles models; approvals are demo-only (browser-local).
  const { models, subtileStats, loading, error: catalogError, reload } = useRealModels();
  const env = useMapColoniesEnv();
  const envLabel = mcEnvStore.environment().label;
  // Models (and their ids) differ per environment: drop references chosen in the previous one.
  useEffect(() => { setReferenceIds(new Set()); }, [env]);
  const [confirmedModel, setConfirmedModel] = useState<Model | null>(null);
  const [session, setSession] = useState<ApprovalSession | null>(null);
const [referenceIds, setReferenceIds] = useState<Set<string>>(new Set());
  const toggleReference = (id: string) => setReferenceIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const { signOut, isAdmin, userRole, username } = useAuth();
  // Keep the open approval workspace on the latest row of its model.
  const activeModel = confirmedModel ? models.find(m => m.id === confirmedModel.id) ?? confirmedModel : null;

  const approvedModels = models.filter((m) => statusOf(m, subtileStats) === 'approved').length;
  const partialModels = models.filter((m) => statusOf(m, subtileStats) === 'partial').length;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden" dir="rtl">
      <header className="border-b border-border bg-card px-4 py-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-[20rem] flex-1 items-center gap-3">
            {confirmedModel ? (
              <Button variant="ghost" size="icon" onClick={() => setConfirmedModel(null)}>
                <ArrowRight className="w-5 h-5" />
              </Button>
            ) : (
              <img src="/favicon.svg" alt="" className="w-10 h-10 shrink-0 rounded-lg" />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">מנגנון אישור מודל לחילוץ נ.צ. — גרסה 2</h1>
              <p className="truncate text-sm text-muted-foreground">
                {confirmedModel
                  ? confirmedModel.name
                  : `${models.length} מודלים • ${approvedModels} מאושרים • ${partialModels} מאושרים חלקית • סביבת ${envLabel}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <EnvironmentSwitcher disabled={Boolean(confirmedModel)} />
            <div className="h-5 w-px bg-border shrink-0" />
            <Button variant="outline" size="sm" onClick={exportTestPlanToExcel} title="הורדת קובץ Excel עם תרחישי בדיקה ידניים למערכת">
              <FileSpreadsheet className="w-4 h-4 ml-2" />
              תוכנית בדיקות
            </Button>
            <div className="h-5 w-px bg-border shrink-0" />
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
            <Button variant="ghost" size="sm" onClick={signOut} title="התנתק">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {catalogError && !models.length ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-destructive">{catalogError}</p>
            <Button variant="outline" onClick={reload}>נסה שוב</Button>
          </div>
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
                model={activeModel!}
                allModels={models}
                initialReferenceIds={referenceIds}
                session={session}
                onSessionVerified={setSession}
                onBack={() => setConfirmedModel(null)}
                 onSaved={() => { setConfirmedModel(null); setSession(null); setReferenceIds(new Set()); }}
              />
            </div>
          </div>
        ) : (
          <ModelIdentificationWizard
            key={env}
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
