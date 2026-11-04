import { useSyncExternalStore } from 'react';

/** MapColonies deployments; each has its own 3D catalogue (and models). */
export type McEnvId = 'prod' | 'int' | 'dev';
export interface McEnvironment { id: McEnvId; label: string; description: string; cswUrl: string; }

const env = import.meta.env as Record<string, string | undefined>;
export const MC_ENVIRONMENTS: McEnvironment[] = [
  { id: 'prod', label: 'Prod', description: 'ייצור', cswUrl: env.VITE_MAPCOLONIES_CSW_URL || 'https://catalog.mapcolonies.net/api/3d/v1/csw' },
  { id: 'int', label: 'Int', description: 'אינטגרציה', cswUrl: env.VITE_MAPCOLONIES_CSW_URL_INT || 'https://catalog-int.mapcolonies.net/api/3d/v1/csw' },
  { id: 'dev', label: 'Dev', description: 'פיתוח', cswUrl: env.VITE_MAPCOLONIES_CSW_URL_DEV || 'https://catalog-dev.mapcolonies.net/api/3d/v1/csw' },
];

/** Token per environment (VITE_MAPCOLONIES_TOKEN_INT / _DEV), falling back to VITE_MAPCOLONIES_TOKEN. */
export function tokenFor(id: McEnvId) {
  const specific = id === 'prod' ? undefined : env[`VITE_MAPCOLONIES_TOKEN_${id.toUpperCase()}`];
  return (specific || env.VITE_MAPCOLONIES_TOKEN)?.trim() || undefined;
}

const KEY = 'cea-mapcolonies-env';
const isEnv = (v: unknown): v is McEnvId => MC_ENVIRONMENTS.some(e => e.id === v);
function initial(): McEnvId {
  try { const saved = localStorage.getItem(KEY); if (isEnv(saved)) return saved; } catch { /* storage blocked */ }
  return isEnv(env.VITE_MAPCOLONIES_ENV) ? env.VITE_MAPCOLONIES_ENV : 'prod';
}
let current: McEnvId = initial();
const listeners = new Set<() => void>();

export const mcEnvStore = {
  get: () => current,
  environment: () => MC_ENVIRONMENTS.find(e => e.id === current)!,
  set(id: McEnvId) {
    if (id === current || !isEnv(id)) return;
    current = id;
    try { localStorage.setItem(KEY, id); } catch { /* keep in memory */ }
    listeners.forEach(l => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useMapColoniesEnv = () => useSyncExternalStore(mcEnvStore.subscribe, mcEnvStore.get, mcEnvStore.get);
