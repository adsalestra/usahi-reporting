import {principal,serviceSupabase,jsonError,configGate,adminDenied} from '@/lib/supabase';
import {cleanReport} from '@/lib/sanitize';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(req:Request){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req); if(!user)return jsonError('Sign in required',401);
 const db=serviceSupabase(); const {data,error}=await db.from('reports')
 .select('id,title,report_date,category,summary,status,created_at,published_at')
 .in('status',user.admin?['draft','published']:['published']).order('report_date',{ascending:false}).limit(120);
 return error?jsonError(error.message,500):Response.json({reports:data,admin:user.admin});
}
export async function POST(req:Request){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req); if(!user?.admin)return adminDenied();
 const type=req.headers.get('content-type')||'';if(!type.includes('multipart/form-data'))return jsonError('Please upload an HTML file');
 const form=await req.formData(); const file=form.get('file');
 if(!(file instanceof File)||!/\.html?$/i.test(file.name))return jsonError('Choose an .html or .htm report');
 if(file.size>3_500_000)return jsonError('HTML file exceeds 3.5MB. Compress embedded images or use hosted image URLs.');
 const raw=await file.text(); const html=cleanReport(raw);
 if(!html.trim())return jsonError('No readable report content was found');
 const title=String(form.get('title')||'').trim().slice(0,160);
 const date=String(form.get('date')||''); const summary=String(form.get('summary')||'').trim().slice(0,700);
 if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))return jsonError('Enter a title and valid report date');
 const format=String(form.get('category')||'Weekly SEO');const category=['Weekly SEO','Technical SEO','Monthly SEO','Custom report'].includes(format)?format:'Custom report';
 const status=form.get('publish')==='yes'?'published':'draft';
 const {data,error}=await serviceSupabase().from('reports').insert({title,report_date:date,category,summary,body_html:html,status,created_by:user.email,published_at:status==='published'?new Date().toISOString():null}).select('id,title,status').single();
 return error?jsonError(error.message,500):Response.json({report:data},{status:201});
}
