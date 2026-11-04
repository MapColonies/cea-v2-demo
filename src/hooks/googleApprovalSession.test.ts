import { describe, expect, it } from 'vitest';
import { isGoogleOAuthSession } from '../../supabase/functions/verify-approval-session/googleSession';

describe('Google passwordless session verification', () => {
  const googleUser = { app_metadata: { provider: 'google' }, identities: [{ provider: 'google' }] };
  it('accepts an authenticated Google OAuth session without a password', () => {
    expect(isGoogleOAuthSession({ amr: [{ method: 'oauth' }] }, googleUser)).toBe(true);
  });
  it('does not waive password verification for a password session with linked Google', () => {
    expect(isGoogleOAuthSession({ amr: [{ method: 'password' }] }, googleUser)).toBe(false);
  });
  it('rejects an OAuth session without a verified Google identity', () => {
    expect(isGoogleOAuthSession({ amr: [{ method: 'oauth' }] }, { app_metadata: { provider: 'google' }, identities: [] })).toBe(false);
  });
  it('rejects missing authentication evidence', () => {
    expect(isGoogleOAuthSession({}, googleUser)).toBe(false);
  });
});