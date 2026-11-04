import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
const schema = z.object({ password: z.string().min(1).max(256), performerName: z.string().trim().min(1).max(120) });
Deno.serve(async (req) => {
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_ANON_KEY'), serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key||!serviceKey) return reply({error:'Service unavailable'},503);
  const header=req.headers.get('Authorization');
  if(!header?.startsWith('Bearer ')) return reply({error:'Unauthorized'},401);
  const client=createClient(url,key,{global:{headers:{Authorization:header}},auth:{persistSession:false}});
  const {data:identity,error:identityError}=await client.auth.getClaims(header.slice(7));
  const claims=identity?.claims;
  if(identityError||!claims?.sub||typeof claims.session_id!=='string') return reply({error:'Unauthorized'},401);
  const parsed=schema.safeParse(await req.json());
  if(!parsed.success) return reply({error:'Invalid approval details'},400);
  const {data:permitted}=await client.rpc('has_role',{_user_id:claims.sub,_role:'admin'});
  if(!permitted) return reply({error:'Admin sign-in required'},403);
  const {data:account,error:accountError}=await client.auth.getUser(header.slice(7));
  if(accountError||!account.user?.email) return reply({error:'Unauthorized'},401);
   {
    const verifier=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:checked,error}=await verifier.auth.signInWithPassword({email:account.user.email,password:parsed.data.password});
    if(error||checked.user?.id!==claims.sub) return reply({valid:false,reason:'incorrect_password'});
    await verifier.auth.signOut({ scope: 'local' });
   }
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}}), now=new Date().toISOString();
  const {error:writeError}=await admin.from('approval_sessions').upsert({session_id:claims.session_id,user_id:claims.sub,performer_name:parsed.data.performerName,verified_at:now,last_activity_at:now});
  if(writeError) return reply({error:'Verification unavailable'},500);
  return reply({valid:true,performer_name:parsed.data.performerName,verified_at:now,last_activity_at:now});
 } catch { return reply({error:'Verification unavailable'},500); }
});
