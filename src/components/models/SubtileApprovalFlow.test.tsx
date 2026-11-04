import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import type { Database } from '@/integrations/supabase/types';
import { SubtileApprovalFlow } from './SubtileApprovalFlow';

const mocks = vi.hoisted(() => ({ admin: true, acquire: vi.fn(), canEdit: false, verified: false, verify: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), tiles: [{ id: 'tile-1', code: 'A1', accuracy: 1, capture_date: '2026-01-01', is_approved_for_coordinates: false }, { id: 'tile-2', code: 'A2', accuracy: 3, capture_date: '2026-10-01', is_approved_for_coordinates: true }] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', app_metadata: { provider: 'google' } }, isAdmin: mocks.admin }) }));
vi.mock('@/hooks/useDemoApprovalAccess', () => ({ useDemoApprovalAccess: () => ({ canEdit: mocks.canEdit, editing: false, acquiring: false, lease: null, approval: { valid: mocks.verified, performer_name: 'Previous approver' }, error: '', acquire: mocks.acquire, verify: mocks.verify, refresh: mocks.refresh }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanel: forwardRef(({ children }: { children: ReactNode }, ref) => {
    useImperativeHandle(ref, () => ({ expand: vi.fn(), collapse: vi.fn() }));
    return <div>{children}</div>;
  }),
  ResizableHandle: () => null,
}));
vi.mock('@/components/map/SubtileMap', () => ({ SubtileMap: ({ subtiles, onSelect }: {subtiles: {id:string}[]; onSelect:(tile:{id:string})=>void}) => <button onClick={()=>onSelect(subtiles[0])}>map-pick-first</button> }));
vi.mock('./FlowSteps', () => ({ FlowStepsIndicator: () => null }));
vi.mock('@/hooks/useRealModels', () => ({ useRealModels: () => ({ subtilesFor: () => mocks.tiles }) }));
vi.mock('@/lib/demo/demoStore', () => ({ demoStore: { logsFor: () => [], statusLogsFor: () => [], saveWorkspace: (args: unknown) => mocks.rpc(args) } }));

const model = { id: 'model-1', name: 'Model', bbox_north: 32, bbox_south: 31, bbox_east: 35, bbox_west: 34 } as Database['public']['Tables']['models']['Row'];
async function selectTile() {
  render(<SubtileApprovalFlow model={model} session={null} onSessionVerified={vi.fn()} onBack={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'בחר A1' }));
}
beforeEach(() => { mocks.admin = true; mocks.canEdit = false; mocks.verified = false; mocks.acquire.mockReset(); mocks.verify.mockReset(); mocks.rpc.mockReset(); mocks.refresh.mockReset(); });
afterEach(cleanup);
describe('selected polygon approval', () => {
  it('map click selects and focuses exactly the matching tile even outside accuracy filters', async()=>{
    render(<SubtileApprovalFlow model={model} session={null} onSessionVerified={vi.fn()} onBack={vi.fn()} onSaved={vi.fn()}/>);
    await screen.findByRole('checkbox',{name:'בחר A1'});
    fireEvent.change(screen.getByLabelText('דיוק מ־ (מ׳)'),{target:{value:'2'}});
    fireEvent.click(screen.getByRole('button',{name:'map-pick-first'}));
    expect(screen.getByRole('checkbox',{name:'בחר A1'})).toBeChecked();
    expect(screen.getByRole('checkbox',{name:'בחר A2'})).not.toBeChecked();
    expect(screen.getByRole('checkbox',{name:'בחר A1'}).closest('[data-tile-id]')).toHaveAttribute('data-focused','true');
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
  it('stages model rejection without approving tiles and allows restoration',async()=>{mocks.canEdit=true;await selectTile();fireEvent.click(screen.getByRole('checkbox',{name:'לא מאושר לשימוש'}));expect(screen.getByRole('button',{name:/^אשר נבחרים$/})).toBeDisabled();expect(screen.getByRole('button',{name:'שמור שינויים'})).toBeEnabled();fireEvent.click(screen.getByRole('checkbox',{name:'לא מאושר לשימוש'}));expect(screen.getByRole('button',{name:/^אשר נבחרים$/})).toBeEnabled();expect(screen.getByRole('button',{name:'שמור שינויים'})).toBeDisabled();});
  it('confirms saving on the final screen before returning after several seconds',async()=>{mocks.canEdit=true;mocks.verify.mockResolvedValue(true);mocks.rpc.mockReturnValue(1);const saved=vi.fn();render(<SubtileApprovalFlow model={model} session={null} onSessionVerified={vi.fn()} onBack={vi.fn()} onSaved={saved}/>);fireEvent.click(await screen.findByRole('checkbox',{name:'בחר A1'}));fireEvent.click(screen.getByRole('button',{name:/^אשר נבחרים$/}));await waitFor(()=>expect(screen.getByRole('button',{name:'שמור שינויים'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'שמור שינויים'}));fireEvent.change(screen.getByLabelText('שם מלא של המבצע *'),{target:{value:'Verified Name'}});fireEvent.click(screen.getByRole('button',{name:'המשך לססמת מנהל'}));fireEvent.change(screen.getByLabelText('ססמת מנהל *'),{target:{value:'test-password'}});fireEvent.click(screen.getByRole('button',{name:'אשר ושמור'}));await waitFor(()=>expect(screen.queryByLabelText('ססמת מנהל *')).not.toBeInTheDocument());expect(saved).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'חזור'})).toBeDisabled();await waitFor(()=>expect(saved).toHaveBeenCalledOnce(),{timeout:6500});expect(mocks.rpc).toHaveBeenCalledWith(expect.objectContaining({modelId:'model-1',rejected:false,performerName:'Verified Name',changes:[{subtile_id:'tile-1',approved:true}]}));},8000);
  it('restores a rejected model and stages newly selected approvals together',async()=>{
    mocks.canEdit=true;mocks.verify.mockResolvedValue(true);mocks.rpc.mockReturnValue(1);
    render(<SubtileApprovalFlow model={{...model,is_rejected:true}} session={null} onSessionVerified={vi.fn()} onBack={vi.fn()} onSaved={vi.fn()}/>);
    fireEvent.click(await screen.findByRole('checkbox',{name:'לא מאושר לשימוש'}));
    fireEvent.click(screen.getByRole('checkbox',{name:'בחר A1'}));
    fireEvent.click(screen.getByRole('button',{name:/^אשר נבחרים$/}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'שמור שינויים'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'שמור שינויים'}));
    fireEvent.change(screen.getByLabelText('שם מלא של המבצע *'),{target:{value:'Restore Admin'}});
    fireEvent.click(screen.getByRole('button',{name:'המשך לססמת מנהל'}));
    fireEvent.change(screen.getByLabelText('ססמת מנהל *'),{target:{value:'test-password'}});
    fireEvent.click(screen.getByRole('button',{name:'אשר ושמור'}));
    await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith(expect.objectContaining({rejected:false,changes:[{subtile_id:'tile-1',approved:true}]})));
  });
  it('accumulates approvals and revocations across accuracy filters and undoes only one delta', async () => {
    mocks.canEdit = true;
    await selectTile();
    fireEvent.click(screen.getByRole('button', { name: /^אשר נבחרים$/ }));
    await waitFor(() => expect(screen.getByRole('button', {name:'הסר שינוי A1'})).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', {name:'בחר A1'}));
    fireEvent.change(screen.getByLabelText('דיוק מ־ (מ׳)'), {target:{value:'2'}});
    expect(screen.queryByRole('checkbox', {name:'בחר A1'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', {name:'בחר A2'}));
    fireEvent.click(screen.getByRole('button', {name:'בטל אישור לנבחרים'}));
    await waitFor(() => expect(screen.getByRole('button', {name:'הסר שינוי A2'})).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('דיוק מ־ (מ׳)'), {target:{value:''}});
    fireEvent.change(screen.getByLabelText('דיוק עד (מ׳)'), {target:{value:'1'}});
    expect(screen.queryByRole('checkbox', {name:'בחר A2'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name:'הסר שינוי A1'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'הסר שינוי A1'}));
    expect(screen.queryByRole('button', {name:'הסר שינוי A1'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name:'הסר שינוי A2'})).toBeInTheDocument();
    expect(screen.getByText('1 שינויים ממתינים לשמירה')).toBeInTheDocument();
  });
  it('requires a newly entered name even with an already verified session', async () => {
    mocks.canEdit = true;
    mocks.verified = true;
    await selectTile();
    fireEvent.click(screen.getByRole('button', { name: /^אשר נבחרים$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'שמור שינויים' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(screen.getByLabelText('שם מלא של המבצע *')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'המשך לססמת מנהל' })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires password verification for Google administrators before saving', async () => {
    mocks.canEdit = true;
    mocks.verify.mockResolvedValue(false);
    await selectTile();
    fireEvent.click(screen.getByRole('button', { name: /^אשר נבחרים$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'שמור שינויים' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    fireEvent.change(screen.getByLabelText('שם מלא של המבצע *'), { target: { value: 'Demo Approver' } });
    fireEvent.click(screen.getByRole('button', { name: 'המשך לססמת מנהל' }));
    expect(screen.getByRole('button', { name: 'אשר ושמור' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('ססמת מנהל *'), { target: { value: 'invalid-test-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'אשר ושמור' }));
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith('invalid-test-password', 'Demo Approver'));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('acquires the exclusive lock before staging approval without a separate edit-mode click', async () => {
    mocks.acquire.mockResolvedValue(true);
    await selectTile();
    fireEvent.click(screen.getByRole('button', { name: /^אשר נבחרים$/ }));
    await waitFor(() => expect(screen.getByText('1 שינויים ממתינים לשמירה')).toBeInTheDocument());
    expect(mocks.acquire).toHaveBeenCalledOnce();
  });
  it('does not stage approval when the server refuses the edit lock', async () => {
    mocks.acquire.mockResolvedValue(false);
    await selectTile();
    fireEvent.click(screen.getByRole('button', { name: /^אשר נבחרים$/ }));
    await waitFor(() => expect(mocks.acquire).toHaveBeenCalledOnce());
    expect(screen.getAllByText('אין שינויים ממתינים').length).toBeGreaterThan(0);
  });
  it('keeps viewer accounts unable to approve selected polygons', async () => {
    mocks.admin = false;
    await selectTile();
    expect(screen.getByRole('button', { name: /^אשר נבחרים$/ })).toBeDisabled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
});