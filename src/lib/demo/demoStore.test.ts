import { beforeEach, describe, expect, it } from 'vitest';
import { demoStore } from './demoStore';

beforeEach(() => demoStore.reset());
describe('demo approval store (browser-local, no server)', () => {
  it('applies sub-tile approvals with an audit log and persists them in this browser', () => {
    const n = demoStore.saveWorkspace({ modelId: 'm', rejected: false, changes: [{ subtile_id: 'm:A1', approved: true }, { subtile_id: 'm:A2', approved: false }], performerName: 'Dana', performedBy: 'u1' });
    expect(n).toBe(2);
    expect(demoStore.isApproved('m:A1')).toBe(true);
    expect(demoStore.isApproved('m:A2')).toBe(false);
    expect(demoStore.logsFor('m').map(l => l.action)).toEqual(['revoke', 'approve']);
    expect(JSON.parse(localStorage.getItem('cea-demo-approvals-v1')!).approvals['m:A1']).toBe(true);
  });
  it('rejecting a model revokes all of its approvals and logs the status change', () => {
    demoStore.saveWorkspace({ modelId: 'm', rejected: false, changes: [{ subtile_id: 'm:A1', approved: true }], performerName: 'Dana', performedBy: 'u1' });
    demoStore.saveWorkspace({ modelId: 'm', rejected: true, changes: [], performerName: 'Dana', performedBy: 'u1' });
    expect(demoStore.isRejected('m')).toBe(true);
    expect(demoStore.isApproved('m:A1')).toBe(false);
    expect(demoStore.statusLogsFor('m')[0].action).toBe('reject');
  });
});
