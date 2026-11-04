import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from '@/lib/cea/rules';
import { ModelPreviewDialog } from './ModelPreviewDialog';

const { realProps } = vi.hoisted(() => ({ realProps: vi.fn() }));
vi.mock('@/components/mapcolonies/RealModel3DView', () => ({ RealModel3DView: (props: unknown) => { realProps(props); return null; } }));
vi.mock('./ModelMetadata', () => ({ ModelMetadata: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('catalog preview', () => {
  it('opens the real MapColonies 3D view for the model area, with a read-only synthetic fallback', () => {
    const model = { id: 'preview-model', name: 'Model', bbox_west: 35.1, bbox_south: 33, bbox_east: 35.2, bbox_north: 33.1 } as Model;
    render(<ModelPreviewDialog model={model} open onOpenChange={vi.fn()} />);
    const props = realProps.mock.lastCall?.[0];
    expect(props.area).toEqual({ west: 35.1, south: 33, east: 35.2, north: 33.1 });
    const demo = props.demo();
    expect(demo.props.subtiles).toEqual([]);
    expect(demo.props.onSelect).toBeUndefined();
    expect(demo.props.onToggle()).toBeUndefined();
  });
});
