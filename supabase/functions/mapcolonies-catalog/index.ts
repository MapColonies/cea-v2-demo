import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!bearer) return reply({ error: 'Sign in required' }, 401);
  const { data: auth, error: authError } = await client.auth.getUser(bearer);
  if (authError || !auth.user) return reply({ error: 'Sign in required' }, 401);
  const token = Deno.env.get('MAPCOLONIES_TOKEN');
  if (!token) return reply({ error: 'MapColonies credential is not configured' }, 503);
  let input: { startPosition?: number };
  try { input = await req.json(); } catch { return reply({ error: 'Invalid request' }, 400); }
  const start = input.startPosition ?? 1;
  if (!Number.isInteger(start) || start < 1 || start > 100000) return reply({ error: 'Invalid catalogue position' }, 400);
  const url = new URL('https://catalog.mapcolonies.net/api/3d/v1/csw');
  url.searchParams.set('token', token);
  try {
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
      body: `<csw:GetRecords outputFormat="application/xml" outputSchema="http://schema.mapcolonies.com/3d" resultType="results" service="CSW" version="2.0.2" startPosition="${start}" maxRecords="50" xmlns:mc="http://schema.mapcolonies.com/3d" xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:ogc="http://www.opengis.net/ogc"><csw:Query typeNames="csw:Record"><csw:ElementSetName>full</csw:ElementSetName></csw:Query></csw:GetRecords>`,
    });
    const raw = await response.text();
    // Provider XML can contain credential-bearing links; never forward those credentials.
    const xml = raw.split(token).join('[redacted]').replace(/([?&]|&amp;)(token|access_token|api_key)=[^\s<"']*/gi, '$1$2=[redacted]');
    if (!response.ok) return reply({ error: 'MapColonies request failed', status: response.status }, response.status);
    if (xml.includes('ExceptionReport')) return reply({ error: 'MapColonies rejected the catalogue request' }, 502);
    return reply({ xml });
  } catch {
    return reply({ error: 'MapColonies is unreachable or timed out' }, 502);
  }
});