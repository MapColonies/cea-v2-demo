import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import type { Mc3DRecord } from '@/lib/mapcolonies/csw';

// End-to-end through the real Dashboard → catalogue → approval workspace → demo save, with only the
// map/3D renderers and network stubbed.
const record = {
  id: 'rec-1', productName: 'מעגן_דגניה', region: 'ישראל', productType: '3DPhotoRealistic', producerName: 'IDFMU', productionSystem: '333e',
  description: '', accuracyLE90: 2, maxHorizontalAccuracyCE90: 2, imagingTimeEndUTC: '2026-06-23T00:00:00Z', updateDateUTC: '2026-06-24T00:00:00Z',
  bbox: { west: 35.5666, south: 32.6741, east: 35.6089, north: 32.7129 }, footprint: null,
  tilesetUrl: 'https://tiles.mapcolonies.net/api/3d/v1/b3dm/x/tileset.json', links: [],
} as unknown as Mc3DRecord;

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin-1' }, signOut: vi.fn(), isAdmin: true, userRole: 'admin', username: 'dana' }) }));
vi.mock('@/lib/exportTestPlan', () => ({ exportTestPlanToExcel: vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/mapcolonies/client', () => ({ mapColoniesConfig: { token: 'T' }, tokenizedUrl: (u: string) => u, loadMapColoniesCatalog: async () => ({ matched: 1, records: [record] }) }));
vi.mock('@/components/mapcolonies/Tiles3DView', () => ({ Tiles3DView: () => <div>REAL-3D</div> }));
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanel: forwardRef(({ children }: { children: ReactNode }, ref) => { useImperativeHandle(ref, () => ({ expand: vi.fn(), collapse: vi.fn() })); return <div>{children}</div>; }),
  ResizableHandle: () => null,
}));
vi.mock('react-leaflet', () => {
  const map = { fitBounds: vi.fn(), setView: vi.fn(), invalidateSize: vi.fn(), latLngToContainerPoint: () => ({ x: 0, y: 0 }), getZoom: () => 12, getBounds: () => ({ getSouth: () => 32, getNorth: () => 33, getWest: () => 35, getEast: () => 36 }), getContainer: () => document.body };
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    MapContainer: forwardRef(({ children }: { children?: ReactNode }, ref) => { useImperativeHandle(ref, () => map); return <div>{children}</div>; }),
    Rectangle: forwardRef(({ children }: { children?: ReactNode }, ref) => { useImperativeHandle(ref, () => ({ getElement: () => undefined })); return <div data-testid="rect">{children}</div>; }),
    Tooltip: () => null, TileLayer: () => null, CircleMarker: () => null, GeoJSON: () => null,
    LayersControl: Object.assign(Pass, { BaseLayer: Pass }), useMap: () => map, useMapEvents: () => map,
  };
});
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

import { Dashboard } from './Dashboard';
import { demoStore } from '@/lib/demo/demoStore';
afterEach(cleanup);

describe('approval on real MapColonies models (demo)', () => {
  it('opens a real model, shows its sub-tiles, approves one and saves locally', async () => {
    demoStore.reset();
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /ישראל/ }));
    fireEvent.click(screen.getByRole('button', { name: /^מעגן_דגניה/ }));
    fireEvent.click(screen.getByRole('button', { name: /הבא/ }));

    // the workspace lists the generated sub-tiles (not just the model outline)
    const first = await screen.findByRole('checkbox', { name: 'בחר A1' });
    expect(screen.getAllByRole('checkbox', { name: /^בחר [A-H]\d$/ }).length).toBeGreaterThan(4);
    expect(screen.getByText('מצב דמו — אישורים ללא השפעה מבצעית')).toBeInTheDocument();

    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: /^אשר נבחרים$/ }));
    await waitFor(() => expect(screen.getByText('1 שינויים ממתינים לשמירה')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    fireEvent.change(screen.getByLabelText('שם מלא של המבצע *'), { target: { value: 'Dana Cohen' } });
    fireEvent.click(screen.getByRole('button', { name: 'המשך לססמת מנהל' }));
    fireEvent.change(screen.getByLabelText('ססמת מנהל *'), { target: { value: 'any' } });
    fireEvent.click(screen.getByRole('button', { name: 'אשר ושמור' }));

    expect((await screen.findAllByText('השינויים נשמרו בהצלחה')).length).toBeGreaterThan(0);
    expect(demoStore.isApproved('rec-1:A1')).toBe(true);
    expect(demoStore.logsFor('rec-1')[0]).toMatchObject({ action: 'approve', performer_name: 'Dana Cohen' });
  });

  it('3D in the workspace opens the real tileset', async () => {
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /ישראל/ }));
    fireEvent.click(screen.getByRole('button', { name: /^מעגן_דגניה/ }));
    fireEvent.click(screen.getByRole('button', { name: /הבא/ }));
    await screen.findByRole('checkbox', { name: 'בחר A1' });
    fireEvent.click(within(screen.getByRole('group', { name: 'מצב תצוגה' })).getByRole('button', { name: 'תלת־ממד' }));
    expect(await screen.findByText('REAL-3D')).toBeInTheDocument();
  });
});
