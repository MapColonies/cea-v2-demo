import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './useAuth';

const mocks = vi.hoisted(() => ({ roles: [] as { role: 'admin' | 'viewer' }[], roleError: null as null | Error }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'google-admin' } } } })),
    },
    from: (table: string) => ({ select: () => ({ eq: () => table === 'user_roles'
      ? Promise.resolve({ data: mocks.roles, error: mocks.roleError })
      : { maybeSingle: async () => ({ data: { username: null } }) } }) }),
  },
}));

afterEach(() => { cleanup(); mocks.roles = []; mocks.roleError = null; });

describe('administrator approval access', () => {
  it('allows admin controls when Google account retains its default viewer role', async () => {
    mocks.roles = [{ role: 'viewer' }, { role: 'admin' }];
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(result.current.userRole).toBe('admin');
  });
  it('keeps viewer-only accounts unable to approve', async () => {
    mocks.roles = [{ role: 'viewer' }];
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.userRole).toBe('viewer'));
    expect(result.current.isAdmin).toBe(false);
  });
  it('does not grant approval access when protected role lookup fails', async () => {
    mocks.roles = [{ role: 'admin' }];
    mocks.roleError = new Error('Role lookup failed');
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });
});