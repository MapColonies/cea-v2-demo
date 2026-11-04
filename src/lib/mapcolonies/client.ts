import { supabase } from '@/integrations/supabase/client';
import { buildGetRecordsBody, CswError, fetchAllRecords, withToken } from './csw';
import { mcEnvStore, tokenFor } from './environments';

/**
 * Connection settings (Vite env, set in .env or the build environment):
 * - VITE_MAPCOLONIES_CSW_URL[_INT|_DEV] — 3D catalogue CSW endpoint per environment (defaults: catalog / catalog-int /
 *                                          catalog-dev .mapcolonies.net/api/3d/v1/csw)
 * - VITE_MAPCOLONIES_TOKEN[_INT|_DEV]   — MapColonies access token per environment (falls back to VITE_MAPCOLONIES_TOKEN).
 *                               When set, the browser calls the catalogue directly (requires VPN reachability + CORS)
 *                               and attaches the token to 3D Tiles requests. When empty, the catalogue is read through
 *                               the `mapcolonies-catalog` edge function.
 * The active environment (Prod / Int / Dev) is chosen in the UI and stored per browser (environments.ts).
 */
export const mapColoniesConfig = {
  get env() { return mcEnvStore.get(); },
  get cswUrl() { return mcEnvStore.environment().cswUrl; },
  get token() { return tokenFor(mcEnvStore.get()); },
};

export const tokenizedUrl = (url: string) => withToken(url, mapColoniesConfig.token);

async function fetchPageDirect(startPosition: number, cswUrl: string, token: string | undefined) {
  let response: Response;
  try {
    response = await fetch(withToken(cswUrl, token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
      body: buildGetRecordsBody(startPosition, 50),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new CswError(`לא ניתן להגיע לקטלוג MapColonies (${new URL(cswUrl).host}) — בדקו חיבור VPN והרשאת CORS לכתובת האפליקציה`);
  }
  if (response.status === 401 || response.status === 403) throw new CswError(`הקטלוג דחה את הטוקן (${response.status}) — ייתכן שלסביבה זו נדרש טוקן אחר`);
  if (response.status === 502 || response.status === 503) throw new CswError(`שירות הקטלוג בסביבה זו אינו זמין כרגע (${response.status}, ${new URL(cswUrl).host}) — הסביבה כבויה או שהנתיב שונה`);
  if (!response.ok) throw new CswError(`הקטלוג החזיר שגיאה ${response.status}`);
  return response.text();
}

async function fetchPageViaEdge(startPosition: number, environment: string) {
  const { data, error } = await supabase.functions.invoke('mapcolonies-catalog', { body: { startPosition, environment } });
  if (error || !data?.xml) throw new CswError(data?.error || 'שירות הקטלוג אינו זמין');
  return data.xml as string;
}

/** Reads the whole catalogue of the active environment (captured at call time). */
export function loadMapColoniesCatalog() {
  const { env, cswUrl, token } = mapColoniesConfig;
  return fetchAllRecords(start => token ? fetchPageDirect(start, cswUrl, token) : fetchPageViaEdge(start, env));
}
