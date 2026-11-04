import { useSyncExternalStore } from 'react';

/**
 * Demo-only approval state for real MapColonies models. It lives in this browser (localStorage) and never
 * reaches the database or MapColonies — approvals here have no operational effect.
 */
export interface DemoLog { id: string; model_id: string; subtile_id: string; action: 'approve' | 'revoke'; performer_name: string; performed_by: string; notes: string | null; created_at: string; }
export interface DemoStatusLog { id: string; model_id: string; action: string; performer_name: string; performed_by: string; notes: string | null; created_at: string; }
interface State { approvals: Record<string, boolean>; rejected: Record<string, boolean>; logs: DemoLog[]; statusLogs: DemoStatusLog[]; }

const KEY = 'cea-demo-approvals-v1';
const empty = (): State => ({ approvals: {}, rejected: {}, logs: [], statusLogs: [] });
function read(): State {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...empty(), ...JSON.parse(raw) }; } catch { /* private mode / blocked storage */ }
  return empty();
}
let state = read();
let version = 0;
const listeners = new Set<() => void>();
const commit = (next: State) => {
  state = next; version++;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* keep in memory only */ }
  listeners.forEach(l => l());
};
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

export const demoStore = {
  isApproved: (subtileId: string) => Boolean(state.approvals[subtileId]),
  isRejected: (modelId: string) => Boolean(state.rejected[modelId]),
  logsFor: (modelId: string) => state.logs.filter(l => l.model_id === modelId).slice(0, 100),
  statusLogsFor: (modelId: string) => state.statusLogs.filter(l => l.model_id === modelId).slice(0, 100),
  /** Same contract as the protected save RPC: returns the number of applied sub-tile changes. */
  saveWorkspace({ modelId, rejected, changes, performerName, performedBy, notes }: {
    modelId: string; rejected: boolean; changes: { subtile_id: string; approved: boolean }[]; performerName: string; performedBy: string; notes?: string;
  }) {
    const now = new Date().toISOString();
    const approvals = { ...state.approvals };
    const logs = [...state.logs];
    const statusLogs = [...state.statusLogs];
    const wasRejected = Boolean(state.rejected[modelId]);
    if (rejected !== wasRejected) {
      statusLogs.unshift({ id: uid(), model_id: modelId, action: rejected ? 'reject' : 'restore', performer_name: performerName, performed_by: performedBy, notes: notes ?? null, created_at: now });
      // Rejection revokes every approval of the model, as in the protected flow.
      if (rejected) for (const id of Object.keys(approvals)) if (id.startsWith(`${modelId}:`) && approvals[id]) {
        approvals[id] = false;
        logs.unshift({ id: uid(), model_id: modelId, subtile_id: id, action: 'revoke', performer_name: performerName, performed_by: performedBy, notes: notes ?? null, created_at: now });
      }
    }
    for (const change of changes) {
      approvals[change.subtile_id] = change.approved;
      logs.unshift({ id: uid(), model_id: modelId, subtile_id: change.subtile_id, action: change.approved ? 'approve' : 'revoke', performer_name: performerName, performed_by: performedBy, notes: notes ?? null, created_at: now });
    }
    commit({ approvals, rejected: { ...state.rejected, [modelId]: rejected }, logs: logs.slice(0, 2000), statusLogs: statusLogs.slice(0, 500) });
    return changes.length;
  },
  reset() { commit(empty()); },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  version: () => version,
};

/** Re-renders the caller whenever demo approvals change. */
export const useDemoStoreVersion = () => useSyncExternalStore(demoStore.subscribe, demoStore.version, demoStore.version);
