import { supabase } from '@/integrations/supabase/client';
import { buildGetRecordsBody, CswError, fetchAllRecords, withToken } from './csw';

/**
 * Connection settings (Vite env, set in .env or the build environment):
 * - VITE_MAPCOLONIES_CSW_URL  — 3D catalogue CSW endpoint (default: production MapColonies 3D CSW)
 * - VITE_MAPCOLONIES_TOKEN    — MapColonies access token. When set, the browser calls the catalogue directly
 *                               (requires VPN reachability + CORS) and attaches the token to 3D Tiles requests.
 *                               When empty, the catalogue is read through the `mapcolonies-catalog` edge function.
 */
export const mapColoniesConfig = {
  cswUrl: (import.meta.env.VITE_MAPCOLONIES_CSW_URL as string | undefined) || 'https://catalog.mapcolonies.net/api/3d/v1/csw',
  token: (import.meta.env.VITE_MAPCOLONIES_TOKEN as string | undefined)?.trim() || undefined,
};

export const tokenizedUrl = (url: string) => withToken(url, mapColoniesConfig.token);

async function fetchPageDirect(startPosition: number) {
  let response: Response;
  try {
    response = await fetch(withToken(mapColoniesConfig.cswUrl, mapColoniesConfig.token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
      body: buildGetRecordsBody(startPosition, 50),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new CswError('לא ניתן להגיע לקטלוג MapColonies — בדקו חיבור VPN והרשאת CORS לכתובת האפליקציה');
  }
  if (!response.ok) throw new CswError(`הקטלוג החזיר שגיאה ${response.status}`);
  return response.text();
}

async function fetchPageViaEdge(startPosition: number) {
  const { data, error } = await supabase.functions.invoke('mapcolonies-catalog', { body: { startPosition } });
  if (error || !data?.xml) throw new CswError(data?.error || 'שירות הקטלוג אינו זמין');
  return data.xml as string;
}

export function loadMapColoniesCatalog() {
  return fetchAllRecords(mapColoniesConfig.token ? fetchPageDirect : fetchPageViaEdge);
}
