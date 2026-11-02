import {principal,jsonError,configGate} from '@/lib/supabase';
import {searchConfigured,searchPerformance,siteUrl} from '@/lib/search-console';
export const runtime='nodejs';export const dynamic='force-dynamic';

export async function GET(req:Request){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user)return jsonError('Sign in required',401);
 const url=new URL(req.url),from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return jsonError('Choose valid dates');
 // Unset is not a failure: the rest of the dashboard works without it, so the
 // screen leaves the panel out rather than showing an error the client cannot act on.
 if(!searchConfigured())return Response.json({configured:false},{headers:{'Cache-Control':'no-store'}});
 try{
  const data=await searchPerformance(from,to);
  return Response.json({configured:true,...data},{headers:{'Cache-Control':'private, max-age=0, no-store'}});
 }catch(e:any){
  const message=String(e?.message||'');
  // The one failure worth naming: the service account has not been added to
  // the property yet, which is the single manual step this feature needs.
  if(/permission|forbidden|403/i.test(message))
   return jsonError(`Search Console has not granted access to this service account yet. Add ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'the service account'} as a user on ${siteUrl()} in Search Console, then refresh.`,403);
  if(/not found|404/i.test(message))
   return jsonError(`Search Console has no property called ${siteUrl()}. Check GSC_SITE_URL: a URL property ends in a slash, a domain property is written sc-domain:example.com.`,404);
  return jsonError(message||'Search Console data unavailable',503);
 }
}
