import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from '@/lib/cea/rules';
import { ModelPreviewDialog } from './ModelPreviewDialog';

const { surfaceProps } = vi.hoisted(() => ({ surfaceProps: vi.fn() }));
vi.mock('@/components/map/DemoSurfaceView', () => ({ DemoSurfaceView: (props: unknown) => { surfaceProps(props); return null; } }));
vi.mock('./ModelMetadata', () => ({ ModelMetadata: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('catalog preview is read-only', () => {
  it('renders only the model surface without editable polygons', () => {
    const model = { id: 'preview-model', name: 'Model' } as Model;
    render(<ModelPreviewDialog model={model} open onOpenChange={vi.fn()} />);
    const props = surfaceProps.mock.lastCall?.[0];
    expect(props.model).toBe(model);
    expect(props.subtiles).toEqual([]);
    expect(props.onSelect).toBeUndefined();
    expect(props.onToggle()).toBeUndefined();
  });
});