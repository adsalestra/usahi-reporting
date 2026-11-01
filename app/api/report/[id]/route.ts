import {principal,serviceSupabase,jsonError,configGate,adminDenied} from '@/lib/supabase';
import {reportDocument} from '@/lib/report-document';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req); if(!user)return jsonError('Sign in required',401);
 const {id}=await params; if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError('Invalid report ID');
 const {data,error}=await serviceSupabase().from('reports').select('*').eq('id',id).single();
 if(error||!data)return jsonError('Report not found',404);
 if(data.status!=='published'&&!user.admin)return jsonError('Not published',403);
 return Response.json({report:{...data,body_html:reportDocument(data.body_html)}},{headers:{'Cache-Control':'private, no-store'}});
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user?.admin)return adminDenied();
 const {id}=await params;const body=await req.json().catch(()=>({}));
 if(body.status!=='published'&&body.status!=='draft')return jsonError('Invalid status');
 const {data,error}=await serviceSupabase().from('reports').update({status:body.status,published_at:body.status==='published'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',id).select('id,status').single();
 return error?jsonError(error.message,500):Response.json({report:data});
}
