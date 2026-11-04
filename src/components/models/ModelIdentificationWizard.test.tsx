import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from '@/lib/cea/rules';
import { ModelIdentificationWizard } from './ModelIdentificationWizard';

const { mapProps, listProps } = vi.hoisted(() => ({ mapProps: vi.fn(), listProps: vi.fn() }));
vi.mock('./CatalogModelView', () => ({ CatalogModelView: (props: unknown) => { mapProps(props); return null; } }));
vi.mock('./ModelsList', () => ({ ModelsList: (props: unknown) => { listProps(props); return null; }, statusLabel: {}, statusClass: {} }));
vi.mock('./FlowSteps', () => ({ FlowStepsIndicator: () => null }));
vi.mock('./ModelMetadata', () => ({ ModelMetadata: () => null }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('reference selection initialization', () => {
  const model = { id: 'neighbor' } as Model;
  it('handles omitted reference selection with a populated catalog', () => {
    render(<ModelIdentificationWizard models={[model]} subtileStats={{}} onModelConfirmed={vi.fn()} />);
    expect(mapProps.mock.lastCall?.[0].referenceModels).toEqual([]);
    expect(listProps.mock.lastCall?.[0].referenceIds).toEqual(new Set());
  });
  it('passes selected reference models to the map', () => {
    render(<ModelIdentificationWizard models={[model]} subtileStats={{}} onModelConfirmed={vi.fn()} referenceIds={new Set(['neighbor'])} />);
    expect(mapProps.mock.lastCall?.[0].referenceModels).toEqual([model]);
  });
  it('keeps eye preview inline and switches modes without confirming or replacing selection', () => {
    const confirm = vi.fn();
    render(<ModelIdentificationWizard models={[model]} subtileStats={{}} onModelConfirmed={confirm} />);
    act(() => listProps.mock.lastCall?.[0].onViewModelDetails(model));
    expect(mapProps.mock.lastCall?.[0].model).toBe(model);
    expect(mapProps.mock.lastCall?.[0].mode).toBe('3d');
    expect(listProps.mock.lastCall?.[0].selectedModel).toBe(model);
    expect(confirm).not.toHaveBeenCalled();
    act(() => mapProps.mock.lastCall?.[0].onModeChange('map'));
    expect(mapProps.mock.lastCall?.[0].mode).toBe('map');
    expect(listProps.mock.lastCall?.[0].selectedModel).toBe(model);
    fireEvent.click(screen.getByRole('button', {name:'הבא'}));
    expect(confirm).toHaveBeenCalledWith(model);
  });
});