import { createClient } from '@supabase/supabase-js';

export function browserSupabase() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) return null;
 return createClient(url,key);
}
/** Supabase renamed the server key: older projects issue a service_role key, newer
 *  ones a secret key, and Vercel's integration sets whichever the project has. Both
 *  bypass row level security, so either one is what the server needs. */
export function serviceKey(){return process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||''}
export function serviceSupabase() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=serviceKey();
 if(!url||!key) throw new Error('Supabase server credentials are not configured');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export type Principal={email:string; admin:boolean; id:string};
export async function principal(req:Request):Promise<Principal|null> {
 const auth=req.headers.get('authorization')||''; const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 if(!token) return null;
 try {
  const db=serviceSupabase(); const {data,error}=await db.auth.getUser(token);
  if(error||!data.user?.email) return null;
  const email=data.user.email.toLowerCase();
  return {email, id:data.user.id, admin:email===(process.env.ADMIN_EMAIL||'').toLowerCase()};
 } catch { return null; }
}
export function jsonError(message:string,status=400){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}})}
export function supabaseConfigured(){return !!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY&&serviceKey())}
export function adminEmailConfigured(){return !!(process.env.ADMIN_EMAIL||'').trim()}
/** Returns a response when the server itself is unconfigured, so visitors are not told to "sign in" to a database that does not exist yet. */
export function configGate():Response|null{
 return supabaseConfigured()?null:jsonError('Supabase is not configured on this deployment. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in Vercel, then redeploy.',503);
}
export function adminDenied(){
 return jsonError(adminEmailConfigured()?'Admin access required':'ADMIN_EMAIL is not set on this deployment, so no account can publish. Set it in Vercel, then redeploy.',403);
}
