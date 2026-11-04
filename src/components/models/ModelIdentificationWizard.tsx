import { ModelMetadata } from './ModelMetadata';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { ModelsList } from './ModelsList';
import { CatalogModelView } from './CatalogModelView';
import { FlowStepsIndicator } from './FlowSteps';
import type { Model, SubtileStats } from '@/lib/cea/rules';
export { statusOf } from '@/lib/cea/rules';
export { statusLabel, statusClass } from './ModelsList';
export type { SubtileStats, ModelStatus } from '@/lib/cea/rules';
interface Props {models:Model[];subtileStats:SubtileStats;onModelConfirmed:(m:Model)=>void;referenceIds?:Set<string>;onToggleReference?:(id:string)=>void;}
export function ModelIdentificationWizard({models,subtileStats,onModelConfirmed,referenceIds=new Set<string>(),onToggleReference}:Props) {
 const [selected,setSelected]=useState<Model|null>(null),[mode,setMode]=useState<'map'|'3d'>('map');
 const [detailsVisible,setDetailsVisible]=useState(false),[detailsCollapsed,setDetailsCollapsed]=useState(false);
 const selectModel=(model:Model)=>{if(selected?.id===model.id){setDetailsVisible(v=>!v);}else{setSelected(model);setDetailsVisible(true);setDetailsCollapsed(false);}};
  const references=models.filter(m=>referenceIds.has(m.id)&&m.id!==selected?.id);
 return <div className="h-full flex flex-col p-4 gap-3" dir="rtl"><FlowStepsIndicator currentIndex={0}/><div className="flex-1 min-h-0 grid grid-rows-2 md:grid-rows-1 grid-cols-1 md:grid-cols-[minmax(360px,42%)_1fr] gap-4"><div className="flex flex-col min-h-0"><h2 className="font-semibold mb-3">קטלוג מודלים</h2><div className="flex-[2] min-h-0"><ModelsList models={models} selectedModel={selected} subtileStats={subtileStats} onSelectModel={selectModel} onViewModelDetails={m=>{setSelected(m);setDetailsVisible(true);setDetailsCollapsed(false);setMode('3d');}} referenceIds={referenceIds} onToggleReference={onToggleReference}/></div>{selected&&detailsVisible&&<aside aria-label="מידע נלווה למודל" className={`${detailsCollapsed?'shrink-0':'flex-1'} min-h-0 mt-3 flex flex-col overflow-hidden border rounded-md bg-card text-card-foreground`}><Button variant="ghost" className="shrink-0 w-full justify-between h-8 px-3" aria-label={detailsCollapsed?'הרחב פרטי מודל':'כווץ פרטי מודל'} aria-expanded={!detailsCollapsed} onClick={()=>setDetailsCollapsed(v=>!v)}><span className="text-xs font-semibold">פרטי המודל</span>{detailsCollapsed?<ChevronDown className="h-4 w-4"/>:<ChevronUp className="h-4 w-4"/>}</Button>{!detailsCollapsed&&<div className="flex-1 min-h-0 overflow-auto"><ModelMetadata model={selected} embedded/></div>}</aside>}<div className="pt-3 flex justify-end"><Button disabled={!selected} onClick={()=>{if(selected)onModelConfirmed(selected);}}>הבא<ArrowLeft className="w-4 h-4 mr-2"/></Button></div></div><CatalogModelView model={selected} referenceModels={references} mode={mode} onModeChange={setMode}/></div></div>;
}
