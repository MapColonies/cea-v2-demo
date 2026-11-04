// Only server-validated claims and Auth user data may be passed here.
export function isGoogleOAuthSession(claims: { amr?: unknown }, account: {
  app_metadata?: { provider?: string };
  identities?: { provider?: string }[];
}): boolean {
  return account.app_metadata?.provider === 'google'
    && Boolean(account.identities?.some(identity => identity.provider === 'google'))
    && Array.isArray(claims.amr)
    && claims.amr.some(entry => entry && typeof entry === 'object' && entry.method === 'oauth');
}