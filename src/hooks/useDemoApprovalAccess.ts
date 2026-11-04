import { useCallback, useEffect, useState } from 'react';
import type { VerifiedApproval } from './useApprovalAccess';

interface Lease { owned: boolean; owner_name: string; expires_at: string; }

/**
 * Demo replacement for useApprovalAccess: same interface, no edit locks, sessions or server calls.
 * Any signed-in user may edit; any non-empty password "verifies" — approvals are demo-only.
 */
export function useDemoApprovalAccess(modelId: string) {
  const [editing, setEditing] = useState(false);
  const [approval, setApproval] = useState<VerifiedApproval>({ valid: false });
  const [error, setError] = useState('');
  useEffect(() => { setEditing(false); setError(''); }, [modelId]);
  const lease: Lease | null = editing ? { owned: true, owner_name: 'דמו', expires_at: new Date(Date.now() + 36e5).toISOString() } : null;
  const acquire = useCallback(async () => { setEditing(true); setError(''); return true; }, []);
  const release = useCallback(async () => { setEditing(false); }, []);
  const refresh = useCallback(async () => {}, []);
  const verify = async (password: string, performerName: string) => {
    if (!password) { setError('נא להזין ססמה'); return false; }
    setError('');
    setApproval({ valid: true, performer_name: performerName, verified_at: new Date().toISOString() });
    return true;
  };
  return { canEdit: editing, editing, acquiring: false, lease, approval, error, acquire, release, verify, refresh };
}
