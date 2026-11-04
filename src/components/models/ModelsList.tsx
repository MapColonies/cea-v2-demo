import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye, Search, X } from 'lucide-react';
import { ModelThumbnail } from './ModelThumbnail';
import { CoordinateTool } from '@/components/map/CoordinateTool';
import { statusOf, withinRadius, type Model, type SubtileStats, type ModelStatus } from '@/lib/cea/rules';
export const statusLabel=(s:ModelStatus)=>s==='rejected'?'לא מאושר':s==='approved'?'מאושר':s==='partial'?'מאושר חלקית':'לא נבדק';
export const statusClass=(s:ModelStatus)=>s==='rejected'?'bg-destructive/20 text-destructive':s==='approved'?'bg-success text-success-foreground':s==='partial'?'bg-warning/20 text-warning':'bg-muted text-muted-foreground';
interface Props {models:Model[];selectedModel:Model|null;onSelectModel:(m:Model)=>void;onViewModelDetails?:(m:Model)=>void;subtileStats?:SubtileStats;referenceIds?:Set<string>;onToggleReference?:(id:string)=>void;}
export function ModelsList({models,selectedModel,onSelectModel,onViewModelDetails,subtileStats={},referenceIds=new Set(),onToggleReference}:Props) {
 const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[country,setCountry]=useState('all'),[date,setDate]=useState('');
 const [radius,setRadius]=useState('10'),[spatial,setSpatial]=useState<{lat:number;lng:number;radius:number}|null>(null),[error,setError]=useState('');
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const countries=useMemo(()=>Array.from(new Set(models.map(m=>m.country||'אחר'))).sort(),[models]);
  const filtered=models.filter(m=>{const s=statusOf(m,subtileStats),q=search.toLowerCase();return (m.name.toLowerCase().includes(q)||(m.source||'').toLowerCase().includes(q)||(m.description||'').toLowerCase().includes(q))&&(status==='all'||s===status)&&(country==='all'||(m.country||'אחר')===country)&&(!date||(m.upload_date||'')>=date)&&(!spatial||withinRadius(m,spatial.lat,spatial.lng,spatial.radius));});
 return <section className="h-full flex flex-col min-h-0" dir="rtl">
  <div className="shrink-0 space-y-2 pb-3 border-b">
   <div className="relative"><Search className="absolute right-3 top-3 w-4 h-4 text-muted-foreground"/><Input aria-label="חיפוש מודל" placeholder="חפש לפי שם או מקור..." value={search} onChange={e=>setSearch(e.target.value)} className="pr-10"/></div>
    <div className="flex flex-wrap gap-1">{[['all','הכל'],['approved','מאושר'],['partial','מאושר חלקית'],['not_approved','לא נבדק'],['rejected','לא מאושר']].map(([id,label])=><Button key={id} size="sm" variant={status===id?'default':'outline'} onClick={()=>setStatus(id)} className="text-xs">{label}</Button>)}</div>
   <div className="grid grid-cols-2 gap-2"><Select value={country} onValueChange={setCountry}><SelectTrigger aria-label="מדינה"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">כל המדינות</SelectItem>{countries.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Input type="date" aria-label="הועלה מתאריך" value={date} onChange={e=>setDate(e.target.value)}/></div>
   <CoordinateTool onGo={p=>{const r=Number(radius);if(!radius.trim()||!Number.isFinite(r)||r<0){setError('נא להזין רדיוס תקין');return;}setSpatial({lat:p.lat,lng:p.lng,radius:r});setError('');}}><Input className="w-24 h-8 text-xs" aria-label="רדיוס ק״מ" title="רדיוס ק״מ" placeholder="רדיוס ק״מ" type="number" min="0" value={radius} onChange={e=>setRadius(e.target.value)} dir="ltr"/></CoordinateTool>
   {spatial&&<div className="flex items-center text-xs gap-2 text-muted-foreground">רדיוס {spatial.radius} ק״מ<Button size="icon" variant="ghost" className="h-6 w-6" title="נקה רדיוס" onClick={()=>setSpatial(null)}><X className="h-3 w-3"/></Button></div>}{error&&<p className="text-xs text-destructive">{error}</p>}
  </div>
  <div className="flex-1 overflow-auto min-h-0 py-2 space-y-1">
   {countries.map(c=>{const rows=filtered.filter(m=>(m.country||'אחר')===c);if(!rows.length)return null;return <Collapsible key={c} open={open[c]||false} onOpenChange={v=>setOpen(p=>({...p,[c]:v}))}><CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between"><span>{c} <Badge variant="outline">{rows.length}</Badge></span><ChevronDown className={`w-4 h-4 ${open[c]?'rotate-180':''}`}/></Button></CollapsibleTrigger><CollapsibleContent className="space-y-2 pt-1">{rows.map(m=>{const s=statusOf(m,subtileStats),count=subtileStats[m.id];return <div key={m.id} className={`border rounded-md p-2 flex gap-2 items-center ${selectedModel?.id===m.id?'border-primary bg-accent':'border-border'}`}>
    {onToggleReference&&<Checkbox aria-label={`הצג במפה ${m.name}`} checked={referenceIds.has(m.id)} onCheckedChange={()=>onToggleReference(m.id)}/>}
    <ModelThumbnail model={m} size="sm"/>
    <Button variant="ghost" className="flex-1 h-auto min-w-0 flex flex-col items-start text-right px-1 gap-1 whitespace-normal" onClick={()=>onSelectModel(m)}><span className="text-sm">{m.name}</span><span className="text-xs text-muted-foreground">{m.source||'—'}</span><span className="flex flex-wrap gap-2 items-center"><Badge className={`text-xs ${statusClass(s)}`}>{statusLabel(s)}</Badge><span className="text-xs text-muted-foreground" dir="rtl">{count?.approved??0}/{count?.total??0} תתי־אזורים מאושרים</span></span></Button>
    {onViewModelDetails&&<Button size="icon" variant="ghost" title="צפייה בפרטי המודל" aria-label={`פרטי ${m.name}`} onClick={()=>onViewModelDetails(m)} className="shrink-0 h-7 w-7"><Eye className="w-4 h-4"/></Button>}
   </div>;})}</CollapsibleContent></Collapsible>;})}
   {!filtered.length&&<p className="text-center p-5 text-muted-foreground text-sm">לא נמצאו מודלים</p>}
  </div><p className="text-xs text-muted-foreground pt-2 border-t">{filtered.length} מודלים • {referenceIds.size} מוצגים במפה</p>
 </section>;
}
