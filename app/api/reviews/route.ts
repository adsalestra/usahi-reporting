import {principal,serviceSupabase,jsonError,configGate,adminDenied} from '@/lib/supabase';
import {parseLinks} from '@/lib/review-links';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user)return jsonError('Sign in required',401);
 const db=serviceSupabase();const [a,b]=await Promise.all([
  db.from('review_items').select('*').order('created_at',{ascending:false}).limit(120),
  db.from('review_events').select('id,review_id,action,message,actor,created_at').order('created_at',{ascending:true}).limit(1000)
 ]);
 if(a.error||b.error)return jsonError((a.error||b.error)?.message||'Failed to load',500);
 return Response.json({items:a.data,events:b.data,admin:user.admin});
}
export async function POST(req:Request){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user?.admin)return adminDenied();
 const body=await req.json().catch(()=>({}));
 const title=String(body.title||'').trim().slice(0,180),target_url=String(body.url||'').trim().slice(0,2000),description=String(body.description||'').trim().slice(0,4000);
 // A pasted list of pages. Titles come from the addresses themselves, and a
 // page already waiting for a decision is left alone rather than duplicated.
 const pasted=parseLinks(String(body.links||''));
 if(pasted.length){
  const db=serviceSupabase();
  const {data:existing,error:readError}=await db.from('review_items').select('target_url');
  if(readError)return jsonError(readError.message,500);
  const have=new Set((existing||[]).map(r=>r.target_url));
  const fresh=pasted.filter(link=>!have.has(link.url));
  if(fresh.length){
   const {error}=await db.from('review_items')
    .insert(fresh.map(link=>({title:link.title,target_url:link.url,description,created_by:user.email})));
   if(error)return jsonError(error.message,500);
  }
  return Response.json({added:fresh.length,skipped:pasted.length-fresh.length},{status:fresh.length?201:200});
 }
 if(String(body.links||'').trim())return jsonError('No web addresses found in that list. Paste one link per line, each starting with https://');
 if(!title)return jsonError('Add a title');
 try{const url=new URL(target_url);if(!['https:','http:'].includes(url.protocol))throw new Error();}catch{return jsonError('Use a full https:// page URL')}
 const {data,error}=await serviceSupabase().from('review_items').insert({title,target_url,description,created_by:user.email}).select('*').single();
 return error?jsonError(error.message,500):Response.json({item:data},{status:201});
}
