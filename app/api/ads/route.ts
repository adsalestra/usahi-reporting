import {principal,jsonError,configGate} from '@/lib/supabase';import {getTables,summary} from '@/lib/ads';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user)return jsonError('Sign in required',401);
 const url=new URL(req.url),from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return jsonError('Choose valid dates');
 try{const tables=await getTables();return Response.json(summary(tables,from,to),{headers:{'Cache-Control':'private, max-age=0, no-store'}})}
 catch(e:any){return jsonError(e?.message||'Google Ads data unavailable',503)}
}
