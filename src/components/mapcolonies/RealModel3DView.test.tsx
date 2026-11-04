import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Mc3DRecord } from '@/lib/mapcolonies/csw';

vi.mock('@/lib/mapcolonies/client', () => ({
  mapColoniesConfig: { token: 'T' }, tokenizedUrl: (u: string) => u,
  loadMapColoniesCatalog: async () => ({ matched: 1, records: [
    { id: 'leb', productName: 'מודל שטח לבנון', tilesetUrl: 'https://tiles.mapcolonies.net/leb/tileset.json', bbox: { west: 35.15, south: 33, east: 36.77, north: 34.3 }, accuracyLE90: 111 } as Mc3DRecord,
  ] }),
}));
vi.mock('./Tiles3DView', () => ({ Tiles3DView: ({ tilesetUrl, focus }: { tilesetUrl: string; focus: object }) => <div data-testid="tiles3d" data-focus={JSON.stringify(focus)}>{tilesetUrl}</div> }));

import { RealModel3DView } from './RealModel3DView';

describe('RealModel3DView', () => {
  it('shows the real MapColonies tileset covering the model, focused on the model area', async () => {
    const area = { west: 35.5, south: 33.2, east: 35.6, north: 33.3 };
    render(<RealModel3DView area={area} demo={() => <div>synthetic</div>} />);
    const view = await screen.findByTestId('tiles3d');
    expect(view).toHaveTextContent('https://tiles.mapcolonies.net/leb/tileset.json');
    expect(JSON.parse(view.dataset.focus!)).toEqual(area);
    expect(screen.queryByText('synthetic')).not.toBeInTheDocument();
  });

  it('never shows the synthetic surface unless asked when no real layer covers the area', async () => {
    render(<RealModel3DView area={{ west: 34.7, south: 31.9, east: 34.8, north: 32.0 }} demo={() => <div>synthetic</div>} />);
    expect(await screen.findByText(/אין שכבת 3D Tiles אמיתית/)).toBeInTheDocument();
    expect(screen.queryByText('synthetic')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /הצג משטח דמו/ }));
    expect(screen.getByText('synthetic')).toBeInTheDocument();
  });
});
