import { useCallback, useMemo } from 'react';
import { useMapColoniesCatalog } from './useMapColoniesCatalog';
import { recordToModel, subtilesForRecord } from '@/lib/demo/realModels';
import { demoStore, useDemoStoreVersion } from '@/lib/demo/demoStore';
import type { Model, Subtile, SubtileStats } from '@/lib/cea/rules';

/**
 * The approval catalogue backed by real MapColonies 3D Tiles models (demo approvals, browser-local state).
 * Every screen shares the single catalogue request made by useMapColoniesCatalog.
 */
export function useRealModels() {
  const { records, loading, error, reload } = useMapColoniesCatalog();
  const version = useDemoStoreVersion();

  const base = useMemo(() => {
    const models: Model[] = [];
    const tiles = new Map<string, Subtile[]>();
    for (const record of records) {
      if (!record.tilesetUrl || !record.bbox) continue;
      const model = recordToModel(record);
      models.push(model);
      tiles.set(model.id, subtilesForRecord(record, model));
    }
    models.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return { models, tiles };
  }, [records]);

  const live = useMemo(() => {
    const tiles = new Map<string, Subtile[]>();
    const stats: SubtileStats = {};
    for (const [modelId, list] of base.tiles) {
      const rejected = demoStore.isRejected(modelId);
      const withState = list.map(t => ({ ...t, is_approved_for_coordinates: !rejected && demoStore.isApproved(t.id) }));
      tiles.set(modelId, withState);
      stats[modelId] = { total: withState.length, approved: withState.filter(t => t.is_approved_for_coordinates).length };
    }
    const models = base.models.map(m => ({ ...m, is_rejected: demoStore.isRejected(m.id), approved_subtile_count: stats[m.id]?.approved ?? 0 }));
    return { models, tiles, stats };
    // version: re-read browser-local approvals whenever they change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, version]);

  const subtilesFor = useCallback((ids: string[]) => ids.flatMap(id => live.tiles.get(id) ?? []), [live]);
  return { models: live.models, subtileStats: live.stats, subtilesFor, loading, error, reload };
}
