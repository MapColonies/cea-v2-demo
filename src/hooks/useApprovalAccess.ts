import { useCallback,useEffect,useRef,useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { EDIT_IDLE_MS } from '@/lib/cea/rules';
export interface VerifiedApproval {valid:boolean;performer_name?:string;verified_at?:string;last_activity_at?:string;}
interface Lease {owned:boolean;owner_name:string;expires_at:string;}
export function useApprovalAccess(modelId:string) {
 const {isAdmin}=useAuth();const [editing,setEditing]=useState(false),[lease,setLease]=useState<Lease|null>(null),[approval,setApproval]=useState<VerifiedApproval>({valid:false}),[error,setError]=useState(''),[acquiring,setAcquiring]=useState(false);
 const activity=useRef(Date.now()),renewed=useRef(0),mounted=useRef(true);
 const refresh=useCallback(async()=>{const [{data:lock},{data:verified}]=await Promise.all([supabase.from('model_edit_locks').select('*').eq('model_id',modelId).maybeSingle(),supabase.rpc('approval_session_status',{_touch:false})]);if(!mounted.current)return;if(lock&&new Date(lock.expires_at).getTime()>Date.now())setLease(prev=>({owned:prev?.owned??false,owner_name:lock.owner_name,expires_at:lock.expires_at}));else setLease(null);if(verified&&typeof verified==='object'&&!Array.isArray(verified))setApproval(verified as unknown as VerifiedApproval);},[modelId]);
 useEffect(()=>{mounted.current=true;setEditing(false);setLease(null);void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>{mounted.current=false;clearInterval(timer);void supabase.rpc('release_model_edit_lock',{_model_id:modelId});};},[modelId,refresh]);
 const acquire=useCallback(async()=>{
  setError('');setAcquiring(true);
  try {
   const {data,error}=await supabase.rpc('acquire_model_edit_lock',{_model_id:modelId});
   if(error){setEditing(false);setError(error.message.includes('Admin sign-in required')||error.code==='PGRST301'?'הכניסה הנוכחית אינה תקפה לאישור. יש להתנתק ולהיכנס מחדש עם Google לחשבון המנהל.':`לא ניתן להתחיל עריכה: ${error.message}`);return false;}
   const next=data as unknown as Lease|null;
   if(!next){setError('לא התקבל אישור להתחיל עריכה. נסה שוב.');return false;}
   setLease(next);setEditing(next.owned);activity.current=Date.now();renewed.current=Date.now();if(!next.owned)setError(`המודל נעול לעריכה על ידי ${next.owner_name}`);return next.owned;
  }catch{setError('לא ניתן להתחבר לשמירת האישורים. בדוק את החיבור ונסה שוב.');return false;}finally{setAcquiring(false);}
 },[modelId]);
 const release=useCallback(async()=>{await supabase.rpc('release_model_edit_lock',{_model_id:modelId});setEditing(false);setLease(null);},[modelId]);
 useEffect(()=>{if(!editing)return;let busy=false;
  const touch=()=>{activity.current=Date.now();};window.addEventListener('pointerdown',touch);window.addEventListener('keydown',touch);window.addEventListener('wheel',touch);
  const timer=setInterval(async()=>{if(busy)return;if(Date.now()-activity.current>=EDIT_IDLE_MS){setEditing(false);setError('העריכה הסתיימה לאחר 10 דקות ללא פעילות');void release();return;}if(activity.current>renewed.current&&Date.now()-renewed.current>20000){busy=true;try{const {data,error}=await supabase.rpc('acquire_model_edit_lock',{_model_id:modelId});const next=data as unknown as Lease;if(error||!next?.owned){setEditing(false);setError('נעילת העריכה פגה');}else{setLease(next);renewed.current=Date.now();const {data:status}=await supabase.rpc('approval_session_status',{_touch:true});if(status)setApproval(status as unknown as VerifiedApproval);}}finally{busy=false;}}},5000);
  return()=>{clearInterval(timer);window.removeEventListener('pointerdown',touch);window.removeEventListener('keydown',touch);window.removeEventListener('wheel',touch);};
 },[editing,modelId,release]);
 const verify=async(password:string,performerName:string)=>{const {data,error}=await supabase.functions.invoke('verify-approval-session',{body:{password:password||undefined,performerName}});if(error||!data?.valid){setError('אימות המנהל נכשל. יש להתחבר מחדש או לבדוק את הסיסמה.');return false;}setError('');setApproval(data);return true;};
 return {canEdit:isAdmin&&editing&&Boolean(lease?.owned)&&new Date(lease?.expires_at||0).getTime()>Date.now(),editing,acquiring,lease,approval,error,acquire,release,verify,refresh};
}
