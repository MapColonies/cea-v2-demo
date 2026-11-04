import { describe, expect, it } from 'vitest';
import { buildGetRecordsBody, CswError, fetchAllRecords, parseGetRecordsResponse, withToken } from './csw';

// Trimmed real response shape from catalog.mapcolonies.net/api/3d/v1/csw (pycsw 2.7, schema mc 3d).
const page = (records: string, matched: number, returned: number, next: number) => `<?xml version="1.0"?>
<csw:GetRecordsResponse xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:ows="http://www.opengis.net/ows" xmlns:mc="http://schema.mapcolonies.com/3d" version="2.0.2">
<csw:SearchStatus timestamp="2026-11-04T15:40:24Z"/>
<csw:SearchResults numberOfRecordsMatched="${matched}" numberOfRecordsReturned="${returned}" nextRecord="${next}" recordSchema="http://schema.mapcolonies.com/3d" elementSet="full">${records}</csw:SearchResults></csw:GetRecordsResponse>`;

const lebanon = `<mc:MC3DRecord><mc:accuracyLE90>111.0</mc:accuracyLE90><mc:classification>6</mc:classification><mc:description>Surface model: Lebanon_1</mc:description>
<mc:footprint>{"type":"Polygon","coordinates":[[[35.15,33.0],[35.15,34.3],[36.77,34.3],[36.77,33.0],[35.15,33.0]]]}</mc:footprint>
<mc:maxHorizontalAccuracyCE90>111.0</mc:maxHorizontalAccuracyCE90><mc:id>32d542c1-b956-4579-91df-2a43b183d8b3</mc:id>
<mc:links scheme="3DTiles" name="" description="">https://tiles.mapcolonies.net/api/3d/v1/b3dm/32d542c1-b956-4579-91df-2a43b183d8b3/data/vricon.3dtiles/tileset.json</mc:links>
<mc:productBBox>35.15,33.0,36.77,34.3</mc:productBBox><mc:productId>32d542c1-b956-4579-91df-2a43b183d8b3</mc:productId><mc:productName>מודל שטח לבנון</mc:productName>
<mc:productType>3DPhotoRealistic</mc:productType><mc:region>לבנון</mc:region><mc:type>RECORD_3D</mc:type>
<ows:BoundingBox crs="urn:x-ogc:def:crs:EPSG:6.11:4326" dimensions="2"><ows:LowerCorner>33.0 35.15</ows:LowerCorner><ows:UpperCorner>34.3 36.77</ows:UpperCorner></ows:BoundingBox></mc:MC3DRecord>`;

const terrain = `<mc:MC3DRecord><mc:id>33333333-3333-3333-3333-333333333333</mc:id><mc:links scheme="TERRAIN_QMESH" name="" description="">https://tiles.mapcolonies.net/api/dem/v1/terrains/srtm100</mc:links>
<mc:productBBox></mc:productBBox><mc:productName>srtm100</mc:productName><mc:productType>QuantizedMeshDTMBest</mc:productType><mc:type>RECORD_DEM</mc:type>
<ows:BoundingBox crs="urn:x-ogc:def:crs:EPSG:6.11:4326" dimensions="2"><ows:LowerCorner>32.7 34.98</ows:LowerCorner><ows:UpperCorner>32.8 35.1</ows:UpperCorner></ows:BoundingBox></mc:MC3DRecord>`;

describe('MapColonies CSW', () => {
  it('builds the GetRecords body with paging and the mc 3d schema', () => {
    const body = buildGetRecordsBody(51, 50);
    expect(body).toContain('startPosition="51"');
    expect(body).toContain('maxRecords="50"');
    expect(body).toContain('outputSchema="http://schema.mapcolonies.com/3d"');
    expect(body).toContain('<csw:ElementSetName>full</csw:ElementSetName>');
  });

  it('parses 3D Tiles records, footprint, bbox and tileset link', () => {
    const result = parseGetRecordsResponse(page(lebanon + terrain, 2, 2, 0));
    expect(result.matched).toBe(2);
    const [r, dem] = result.records;
    expect(r.productName).toBe('מודל שטח לבנון');
    expect(r.tilesetUrl).toMatch(/\/tileset\.json$/);
    expect(r.bbox).toEqual({ west: 35.15, south: 33.0, east: 36.77, north: 34.3 });
    expect(r.footprint?.type).toBe('Polygon');
    expect(r.accuracyLE90).toBe(111);
    expect(dem.tilesetUrl).toBeNull();
    // falls back to ows:BoundingBox (lat lon order) when productBBox is empty
    expect(dem.bbox).toEqual({ south: 32.7, west: 34.98, north: 32.8, east: 35.1 });
  });

  it('reports catalogue exceptions', () => {
    const xml = '<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows" version="1.2.0"><ows:Exception exceptionCode="InvalidParameterValue"><ows:ExceptionText>bad schema</ows:ExceptionText></ows:Exception></ows:ExceptionReport>';
    expect(() => parseGetRecordsResponse(xml)).toThrow(CswError);
    expect(() => parseGetRecordsResponse(xml)).toThrow(/bad schema/);
  });

  it('pages through nextRecord until all matched records are read', async () => {
    const calls: number[] = [];
    const result = await fetchAllRecords(async start => {
      calls.push(start);
      return start === 1 ? page(lebanon, 2, 1, 2) : page(terrain, 2, 1, 0);
    });
    expect(calls).toEqual([1, 2]);
    expect(result.records.map(r => r.productName)).toEqual(['מודל שטח לבנון', 'srtm100']);
  });

  it('attaches the token only to MapColonies hosts and never twice', () => {
    expect(withToken('https://tiles.mapcolonies.net/a/tileset.json', 'T')).toBe('https://tiles.mapcolonies.net/a/tileset.json?token=T');
    expect(withToken('https://tiles.mapcolonies.net/a/0.b3dm?x=1', 'T')).toBe('https://tiles.mapcolonies.net/a/0.b3dm?x=1&token=T');
    expect(withToken('https://tiles.mapcolonies.net/a.json?token=OLD', 'T')).toBe('https://tiles.mapcolonies.net/a.json?token=OLD');
    expect(withToken('https://evil.example.com/mapcolonies.net/a.json', 'T')).toBe('https://evil.example.com/mapcolonies.net/a.json');
    expect(withToken('https://tiles.mapcolonies.net/a.json', undefined)).toBe('https://tiles.mapcolonies.net/a.json');
  });
});
