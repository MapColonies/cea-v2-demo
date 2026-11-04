import { useCallback, useEffect, useState } from 'react';
import { loadMapColoniesCatalog } from '@/lib/mapcolonies/client';
import type { Mc3DRecord } from '@/lib/mapcolonies/csw';

type Catalog = { records: Mc3DRecord[]; matched: number };
// One catalogue request shared by every screen; reload() forces a fresh read.
let cached: Promise<Catalog> | null = null;
const load = (force = false) => {
  if (!cached || force) cached = loadMapColoniesCatalog().catch(e => { cached = null; throw e; });
  return cached;
};

export function useMapColoniesCatalog() {
  const [state, setState] = useState<{ records: Mc3DRecord[]; matched: number; loading: boolean; error: string }>({ records: [], matched: 0, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    load(revision > 0)
      .then(c => { if (live) setState({ records: c.records, matched: c.matched, loading: false, error: '' }); })
      .catch(e => { if (live) setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'טעינת קטלוג MapColonies נכשלה' })); });
    return () => { live = false; };
  }, [revision]);
  const reload = useCallback(() => setRevision(v => v + 1), []);
  return { ...state, reload };
}
