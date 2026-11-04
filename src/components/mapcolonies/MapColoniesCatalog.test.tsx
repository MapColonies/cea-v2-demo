import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Mc3DRecord } from '@/lib/mapcolonies/csw';

const base: Omit<Mc3DRecord, 'id' | 'productName' | 'tilesetUrl' | 'productType'> = {
  productId: 'x', productVersion: '1', recordType: 'RECORD_3D', description: '', region: 'לבנון', sensors: '', classification: '6',
  producerName: '', productionSystem: '', productStatus: 'PUBLISHED', accuracyLE90: 3, maxHorizontalAccuracyCE90: 3,
  imagingTimeBeginUTC: '', imagingTimeEndUTC: '', updateDateUTC: '', srsName: 'WGS84GEO', footprint: null,
  bbox: { west: 35, south: 33, east: 35.1, north: 33.1 }, links: [],
};

vi.mock('@/lib/mapcolonies/client', () => ({
  mapColoniesConfig: { cswUrl: 'https://catalog.mapcolonies.net/api/3d/v1/csw', token: 'T' },
  tokenizedUrl: (u: string) => u,
  loadMapColoniesCatalog: async () => ({ matched: 2, records: [
    { ...base, id: 'a', productName: 'מודל שטח לבנון', productType: '3DPhotoRealistic', tilesetUrl: 'https://tiles.mapcolonies.net/a/tileset.json' },
    { ...base, id: 'b', productName: 'srtm100', productType: 'QuantizedMeshDTMBest', recordType: 'RECORD_DEM', tilesetUrl: null },
  ] }),
}));

vi.mock('react-leaflet', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
    GeoJSON: () => null, Rectangle: () => null, Tooltip: () => null, TileLayer: () => null,
    LayersControl: Object.assign(Pass, { BaseLayer: Pass }),
  };
});

vi.mock('./Tiles3DView', () => ({ Tiles3DView: ({ tilesetUrl }: { tilesetUrl: string }) => <div data-testid="tiles3d">{tilesetUrl}</div> }));

import { MapColoniesCatalog } from './MapColoniesCatalog';

describe('MapColoniesCatalog', () => {
  it('lists 3D Tiles layers by default and can show every catalogue record', async () => {
    render(<MapColoniesCatalog />);
    expect(await screen.findByRole('button', { name: /מודל שטח לבנון/ })).toBeInTheDocument();
    expect(screen.queryByText('srtm100')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'כל הרשומות' }));
    expect(screen.getByText('srtm100')).toBeInTheDocument();
    expect(screen.getByText('2 מוצגות • 2/2 רשומות נטענו')).toBeInTheDocument();
  });

  it('opens the first real 3D Tiles model in 3D on load', async () => {
    render(<MapColoniesCatalog />);
    expect(await screen.findByTestId('tiles3d')).toHaveTextContent('https://tiles.mapcolonies.net/a/tileset.json');
    expect(screen.getByRole('heading', { name: 'מודל שטח לבנון' })).toBeInTheDocument();
  });

  it('enables the 3D view only for records with a tileset link', async () => {
    render(<MapColoniesCatalog />);
    fireEvent.click(await screen.findByRole('button', { name: 'כל הרשומות' }));
    fireEvent.click(await screen.findByText('srtm100'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'תלת־ממד' })).toBeDisabled());
    expect(screen.getByLabelText('מטא־דאטה של השכבה')).toHaveTextContent('QuantizedMeshDTMBest');
  });
});
