import { useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readLocalReference } from '@/lib/cea/localReference';
export function ReferenceUpload({onChange}:{onChange:(data:FeatureCollection|null)=>void}) {
 const input=useRef<HTMLInputElement>(null),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <div className="flex flex-wrap items-center gap-1"><input ref={input} type="file" multiple accept=".zip,.shp,.prj,.dbf,.shx,.cpg" className="hidden" aria-label="קובצי שייפ לרפרנס" onChange={async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;setBusy(true);setError('');try{const data=await readLocalReference(files);onChange(data);setName(files[0].name);}catch(err){setError(err instanceof Error?err.message:'לא ניתן לקרוא את השייפ');}finally{setBusy(false);e.target.value='';}}}/><Button size="sm" variant="outline" disabled={busy} onClick={()=>input.current?.click()}><Upload className="w-3.5 h-3.5 ml-1"/>{busy?'טוען...':'שייפ לרפרנס'}</Button>{name&&<><span className="text-xs max-w-36 truncate">{name}</span><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="הסר שייפ" onClick={()=>{onChange(null);setName('');}}><X className="w-3 h-3"/></Button></>}{error&&<p className="text-xs text-destructive">{error}</p>}</div>;
}