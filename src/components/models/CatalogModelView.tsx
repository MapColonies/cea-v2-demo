import { useEffect, useState } from 'react';
import { useRealModels } from '@/hooks/useRealModels';
import { Button } from '@/components/ui/button';
import { ModelMap } from '@/components/map/ModelMap';
import { DemoSurfaceView } from '@/components/map/DemoSurfaceView';
import { contains, type Model, type Subtile } from '@/lib/cea/rules';
import { CoordinateTool, type Target } from '@/components/map/CoordinateTool';
import { sampleDemoSurface } from '@/lib/cea/demoSurface';
import { RealModel3DView } from '@/components/mapcolonies/RealModel3DView';
import { boundsOf } from '@/lib/mapcolonies/match';
import { tileOverlays } from '@/lib/mapcolonies/overlays';

const approved = (tile: Subtile) => tile.is_approved_for_coordinates;
const readOnly = () => {};

export function CatalogModelView({ model, referenceModels, mode, onModeChange }: {
  model: Model | null; referenceModels: Model[]; mode: 'map' | '3d'; onModeChange: (mode: 'map' | '3d') => void;
}) {
  const [tiles,setTiles]=useState<Subtile[]>([]),[error,setError]=useState('');
  const [target,setTarget]=useState<Target|null>(null);
  const targetModel=target?[...(model?[model]:[]),...referenceModels].find(m=>contains(m,target.lat,target.lng)):undefined;
  const targetTile=target?tiles.find(t=>contains(t,target.lat,target.lng)):undefined;
  const height=target&&targetModel&&!targetModel.is_rejected?sampleDemoSurface(targetModel,target.lat,target.lng):null;
  const ids=[...(model?[model.id]:[]),...referenceModels.map(m=>m.id)].sort().join(',');
  // Demo sub-tiles of the real MapColonies models (browser-local approval state).
  const { subtilesFor } = useRealModels();
  useEffect(()=>{setTiles(ids?subtilesFor(ids.split(',')):[]);setError('');},[ids,subtilesFor]);
  return <div className="flex h-full min-h-0 flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold truncate">{model?.name || 'תצוגת מפה'}</h2>
      <div className="flex gap-1" role="group" aria-label="תצוגת המודל">
        <Button size="sm" variant={mode === 'map' ? 'default' : 'outline'} aria-pressed={mode === 'map'} onClick={() => onModeChange('map')}>דו־ממד</Button>
        <Button size="sm" variant={mode === '3d' ? 'default' : 'outline'} aria-pressed={mode === '3d'} disabled={!model} onClick={() => onModeChange('3d')}>תלת־ממד</Button>
      </div>
    </div>
    {error&&<p className="text-xs text-destructive">{error}</p>}<div className="relative isolate z-0 flex-1 min-h-0 overflow-hidden">
      {mode === '3d' && model ? <RealModel3DView area={boundsOf(model)} preferId={model.id} target={target} overlays={tileOverlays({model,referenceModels,subtiles:tiles.filter(t=>t.model_id===model.id),references:tiles.filter(t=>t.model_id!==model.id),effectiveApproved:approved})} demo={()=><DemoSurfaceView model={model} subtiles={tiles.filter(t=>t.model_id===model.id)} referenceModels={referenceModels} referenceSubtiles={tiles.filter(t=>t.model_id!==model.id)} effectiveApproved={approved} onToggle={readOnly} target={target}/>}/> : <ModelMap model={model} referenceModels={referenceModels} subtiles={tiles} target={target}/>}
      <div className="absolute top-2 left-12 right-2 z-[9999] flex justify-center pointer-events-none" dir="rtl"><div className="max-w-full border rounded-md bg-popover/95 text-popover-foreground p-2 shadow pointer-events-auto" aria-label="קואורדינטות למציאת גובה"><CoordinateTool onGo={setTarget}/>{target&&<p className="mt-1 max-w-md text-xs text-muted-foreground">{targetModel?`${targetModel.name} • ${targetTile?.display_id||'מחוץ לתת־אזור'}`:'היעד מחוץ למודלים המוצגים'}{targetModel?.is_rejected?' • לא מאושר — לא זמין לחילוץ':height!==null?` • Z מדומה ${height.toFixed(2)} מ׳ — לא מבצעי`:''}{target.z!==undefined?` • Z מבוקש ${target.z} מ׳`:''}</p>}</div></div>
    </div>
  </div>;
}