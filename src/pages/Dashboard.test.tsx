import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mc3DRecord } from '@/lib/mapcolonies/csw';

const record = (id: string, productName: string, region: string, west: number, south: number) => ({
  id, productName, region, productType: '3DPhotoRealistic', producerName: 'IDFMU', productionSystem: 'vantor', description: '',
  accuracyLE90: 3, maxHorizontalAccuracyCE90: 3, imagingTimeEndUTC: '2026-01-01T00:00:00Z', updateDateUTC: '2026-01-02T00:00:00Z',
  bbox: { west, south, east: west + 0.02, north: south + 0.02 }, footprint: null, tilesetUrl: `https://tiles.mapcolonies.net/${id}/tileset.json`, links: [],
}) as unknown as Mc3DRecord;

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u' }, signOut: vi.fn(), isAdmin: true, userRole: 'admin', username: 'dana' }) }));
vi.mock('@/lib/exportTestPlan', () => ({ exportTestPlanToExcel: vi.fn() }));
vi.mock('@/lib/mapcolonies/client', () => ({
  mapColoniesConfig: { token: 'T' }, tokenizedUrl: (u: string) => u,
  loadMapColoniesCatalog: async () => {
    const { mcEnvStore } = await import('@/lib/mapcolonies/environments');
    return mcEnvStore.get() === 'dev'
      ? { matched: 1, records: [record('d', 'מודל_פיתוח', 'ישראל', 35.1, 32.9)] }
      : { matched: 2, records: [record('a', 'עפולה', 'ישראל', 35.28, 32.6), record('b', 'ביירות_לוויני', 'לבנון', 35.5, 33.85)] };
  },
}));
vi.mock('@/components/models/CatalogModelView', () => ({ CatalogModelView: () => null }));
vi.mock('@/components/mapcolonies/MapColoniesCatalog', () => ({ MapColoniesCatalog: () => <div>MAPCOLONIES-CATALOG</div> }));

import { Dashboard } from './Dashboard';
import { mcEnvStore } from '@/lib/mapcolonies/environments';
afterEach(() => { cleanup(); mcEnvStore.set('prod'); });

describe('Dashboard', () => {
  it('opens on the approval workflow, listing the real MapColonies models', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('מנגנון אישור מודל לחילוץ נ.צ. — גרסה 2')).toBeInTheDocument();
    expect(await screen.findByText('2 מודלים • 0 מאושרים • 0 מאושרים חלקית • סביבת Prod')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ישראל/ }));
    expect(screen.getByText('עפולה')).toBeInTheDocument();
    expect(screen.queryByText('MAPCOLONIES-CATALOG')).not.toBeInTheDocument();
  });
  it('keeps the MapColonies catalogue one click away', async () => {
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /קטלוג MapColonies/ }));
    expect(screen.getByText('MAPCOLONIES-CATALOG')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /חזרה לאישור מודלים/ }));
    expect(screen.queryByText('MAPCOLONIES-CATALOG')).not.toBeInTheDocument();
  });
  it('switches MapColonies environment and shows that environment\'s models', async () => {
    render(<Dashboard />);
    expect(await screen.findByText(/2 מודלים .*סביבת Prod/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Dev' }));
    expect(await screen.findByText(/1 מודלים .*סביבת Dev/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ישראל/ }));
    expect(screen.getByText('מודל_פיתוח')).toBeInTheDocument();
    expect(screen.queryByText('עפולה')).not.toBeInTheDocument();
  });
});
