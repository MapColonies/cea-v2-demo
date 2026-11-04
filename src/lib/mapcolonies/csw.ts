import type { Polygon, MultiPolygon } from 'geojson';

/**
 * MapColonies 3D catalogue (pycsw, CSW 2.0.2, outputSchema http://schema.mapcolonies.com/3d).
 * Records are mc:MC3DRecord elements; photorealistic layers expose a tileset.json link with scheme="3DTiles".
 */
export const MC_NS = 'http://schema.mapcolonies.com/3d';
export const CSW_NS = 'http://www.opengis.net/cat/csw/2.0.2';
export const OWS_NS = 'http://www.opengis.net/ows';

export interface McLink { scheme: string; name: string; description: string; url: string; }
export interface McBBox { west: number; south: number; east: number; north: number; }
export interface Mc3DRecord {
  id: string;
  productId: string;
  productName: string;
  productType: string;
  productVersion: string;
  recordType: string;
  description: string;
  region: string;
  sensors: string;
  classification: string;
  producerName: string;
  productionSystem: string;
  productStatus: string;
  accuracyLE90: number | null;
  maxHorizontalAccuracyCE90: number | null;
  imagingTimeBeginUTC: string;
  imagingTimeEndUTC: string;
  updateDateUTC: string;
  srsName: string;
  footprint: Polygon | MultiPolygon | null;
  bbox: McBBox | null;
  links: McLink[];
  /** First link with scheme 3DTiles (case-insensitive), or null when the record is not a 3D Tiles layer. */
  tilesetUrl: string | null;
}
export interface McGetRecordsResult { records: Mc3DRecord[]; matched: number; returned: number; nextRecord: number; }

export class CswError extends Error {}

export function buildGetRecordsBody(startPosition = 1, maxRecords = 50) {
  return `<csw:GetRecords outputFormat="application/xml" outputSchema="${MC_NS}" resultType="results" service="CSW" version="2.0.2" startPosition="${startPosition}" maxRecords="${maxRecords}" xmlns:mc="${MC_NS}" xmlns:csw="${CSW_NS}" xmlns:ogc="http://www.opengis.net/ogc"><csw:Query typeNames="csw:Record"><csw:ElementSetName>full</csw:ElementSetName></csw:Query></csw:GetRecords>`;
}

const num = (value: string) => { const n = Number(value); return value.trim() && Number.isFinite(n) ? n : null; };

function parseBBox(productBBox: string, record: Element): McBBox | null {
  // mc:productBBox is "minLon,minLat,maxLon,maxLat".
  const parts = productBBox.split(',').map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    const [west, south, east, north] = parts;
    return { west, south, east, north };
  }
  // ows:BoundingBox with EPSG:4326 uses lat/lon axis order: "lat lon".
  const box = record.getElementsByTagNameNS(OWS_NS, 'BoundingBox')[0];
  const lower = box?.getElementsByTagNameNS(OWS_NS, 'LowerCorner')[0]?.textContent?.trim().split(/\s+/).map(Number);
  const upper = box?.getElementsByTagNameNS(OWS_NS, 'UpperCorner')[0]?.textContent?.trim().split(/\s+/).map(Number);
  if (lower?.length === 2 && upper?.length === 2 && [...lower, ...upper].every(Number.isFinite)) {
    return { south: lower[0], west: lower[1], north: upper[0], east: upper[1] };
  }
  return null;
}

function parseFootprint(text: string): Polygon | MultiPolygon | null {
  if (!text.trim()) return null;
  try {
    const g = JSON.parse(text);
    return g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates) ? g : null;
  } catch { return null; }
}

export function parseRecord(record: Element): Mc3DRecord {
  const text = (name: string) => record.getElementsByTagNameNS(MC_NS, name)[0]?.textContent?.trim() ?? '';
  const links = Array.from(record.getElementsByTagNameNS(MC_NS, 'links')).map(link => ({
    scheme: link.getAttribute('scheme') ?? '',
    name: link.getAttribute('name') ?? '',
    description: link.getAttribute('description') ?? '',
    url: link.textContent?.trim() ?? '',
  })).filter(link => link.url);
  const tiles = links.find(link => link.scheme.toLowerCase().replace(/[^a-z0-9]/g, '') === '3dtiles');
  return {
    id: text('id') || text('productId'),
    productId: text('productId'),
    productName: text('productName') || text('productId') || text('id'),
    productType: text('productType'),
    productVersion: text('productVersion'),
    recordType: text('type'),
    description: text('description'),
    region: text('region'),
    sensors: text('sensors'),
    classification: text('classification'),
    producerName: text('producerName'),
    productionSystem: text('productionSystem'),
    productStatus: text('productStatus'),
    accuracyLE90: num(text('accuracyLE90')),
    maxHorizontalAccuracyCE90: num(text('maxHorizontalAccuracyCE90')),
    imagingTimeBeginUTC: text('imagingTimeBeginUTC'),
    imagingTimeEndUTC: text('imagingTimeEndUTC'),
    updateDateUTC: text('updateDateUTC'),
    srsName: text('SRSName'),
    footprint: parseFootprint(text('footprint')),
    bbox: parseBBox(text('productBBox'), record),
    links,
    tilesetUrl: tiles?.url ?? null,
  };
}

export function parseGetRecordsResponse(xml: string): McGetRecordsResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new CswError('תשובת הקטלוג אינה XML תקין');
  const exception = doc.getElementsByTagNameNS(OWS_NS, 'ExceptionText')[0] ?? doc.getElementsByTagNameNS(OWS_NS, 'Exception')[0];
  if (exception || doc.documentElement.localName === 'ExceptionReport') {
    throw new CswError(`הקטלוג דחה את הבקשה${exception?.textContent?.trim() ? `: ${exception.textContent.trim()}` : ''}`);
  }
  const results = doc.getElementsByTagNameNS(CSW_NS, 'SearchResults')[0];
  if (!results) throw new CswError('תשובת הקטלוג אינה מכילה SearchResults');
  const records = Array.from(doc.getElementsByTagNameNS(MC_NS, 'MC3DRecord')).map(parseRecord);
  return {
    records,
    matched: Number(results.getAttribute('numberOfRecordsMatched') ?? records.length) || 0,
    returned: Number(results.getAttribute('numberOfRecordsReturned') ?? records.length) || 0,
    nextRecord: Number(results.getAttribute('nextRecord') ?? 0) || 0,
  };
}

/** Hosts that may receive the MapColonies token. The token is never attached to any other host. */
export const isMapColoniesHost = (hostname: string) => hostname === 'mapcolonies.net' || hostname.endsWith('.mapcolonies.net');

/** Adds `token` to MapColonies URLs (tileset.json and every child tile/b3dm/glb request). */
export function withToken(url: string, token: string | undefined) {
  if (!token) return url;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return url; }
  if (!isMapColoniesHost(parsed.hostname) || parsed.searchParams.has('token')) return url;
  parsed.searchParams.set('token', token);
  return parsed.toString();
}

/** Pages through GetRecords until every matched record is read (bounded to protect the browser). */
export async function fetchAllRecords(fetchPage: (startPosition: number) => Promise<string>, maxPages = 40) {
  const records: Mc3DRecord[] = [];
  let start = 1, matched = 0;
  for (let page = 0; page < maxPages; page++) {
    const result = parseGetRecordsResponse(await fetchPage(start));
    records.push(...result.records);
    matched = result.matched;
    if (!result.returned || !result.nextRecord || result.nextRecord <= start || records.length >= matched) break;
    start = result.nextRecord;
  }
  const unique = Array.from(new Map(records.map(r => [r.id, r])).values());
  return { records: unique, matched };
}

export const is3DTilesRecord = (record: Mc3DRecord) => Boolean(record.tilesetUrl);
