import { useCallback, useEffect, useState } from 'react';
import { loadMapColoniesCatalog } from '@/lib/mapcolonies/client';
import { useMapColoniesEnv, type McEnvId } from '@/lib/mapcolonies/environments';
import type { Mc3DRecord } from '@/lib/mapcolonies/csw';

type Catalog = { records: Mc3DRecord[]; matched: number };
// One catalogue request per environment, shared by every screen; reload() forces a fresh read.
const cached = new Map<McEnvId, Promise<Catalog>>();
// Last resolved catalogue per environment, so components mounted later render it immediately.
const resolved = new Map<McEnvId, Catalog>();
const load = (env: McEnvId, force = false) => {
  let p = cached.get(env);
  if (!p || force) {
    p = loadMapColoniesCatalog().then(c => { resolved.set(env, c); return c; }).catch(e => { cached.delete(env); throw e; });
    cached.set(env, p);
  }
  return p;
};

type State = { env: McEnvId; records: Mc3DRecord[]; matched: number; loading: boolean; error: string };
const initialState = (env: McEnvId): State => {
  const r = resolved.get(env);
  return r ? { env, ...r, loading: false, error: '' } : { env, records: [], matched: 0, loading: true, error: '' };
};

export function useMapColoniesCatalog() {
  const env = useMapColoniesEnv();
  const [state, setState] = useState<State>(() => initialState(env));
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    if (revision === 0 && resolved.has(env)) { setState(initialState(env)); return () => { live = false; }; }
    setState(s => (s.env === env ? { ...s, loading: true, error: '' } : { env, records: [], matched: 0, loading: true, error: '' }));
    load(env, revision > 0)
      .then(c => { if (live) setState({ env, records: c.records, matched: c.matched, loading: false, error: '' }); })
      .catch(e => { if (live) setState(s => ({ ...s, env, loading: false, error: e instanceof Error ? e.message : 'טעינת קטלוג MapColonies נכשלה' })); });
    return () => { live = false; };
  }, [env, revision]);
  const reload = useCallback(() => setRevision(v => v + 1), []);
  // Never hand out another environment's records while the new one is loading.
  const current = state.env === env ? state : initialState(env);
  return { records: current.records, matched: current.matched, loading: current.loading, error: current.error, env, reload };
}

/** Test helper: forget every cached catalogue. */
export const resetMapColoniesCatalogCache = () => { cached.clear(); resolved.clear(); };
