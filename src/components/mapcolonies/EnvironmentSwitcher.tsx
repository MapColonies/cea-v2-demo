import { Server } from 'lucide-react';
import { MC_ENVIRONMENTS, mcEnvStore, useMapColoniesEnv, type McEnvId } from '@/lib/mapcolonies/environments';

const TONE: Record<McEnvId, string> = {
  prod: 'data-[active=true]:bg-emerald-600 data-[active=true]:text-white',
  int: 'data-[active=true]:bg-amber-500 data-[active=true]:text-black',
  dev: 'data-[active=true]:bg-sky-600 data-[active=true]:text-white',
};

/** Prod / Int / Dev switch for the MapColonies catalogue; each environment has its own models. */
export function EnvironmentSwitcher({ disabled = false }: { disabled?: boolean }) {
  const env = useMapColoniesEnv();
  return <div className="flex items-center gap-1.5" dir="rtl">
    <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
    <div role="radiogroup" aria-label="סביבת MapColonies" className="flex overflow-hidden rounded-md border" dir="ltr">
      {MC_ENVIRONMENTS.map(e => <button key={e.id} type="button" role="radio" aria-checked={env === e.id} data-active={env === e.id}
        disabled={disabled && env !== e.id}
        title={`${e.description} — ${new URL(e.cswUrl).host}${disabled ? ' (סיימו את האישור כדי להחליף סביבה)' : ''}`}
        onClick={() => mcEnvStore.set(e.id)}
        className={`px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 ${TONE[e.id]}`}>
        {e.label}
      </button>)}
    </div>
  </div>;
}
