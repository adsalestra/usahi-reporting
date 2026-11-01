import {principal,serviceSupabase,jsonError,configGate} from '@/lib/supabase';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user)return jsonError('Sign in required',401);
 const {id}=await params;const body=await req.json().catch(()=>({}));
 const action=String(body.action||''),message=String(body.message||'').trim().slice(0,2000);
 if(!['comment','approved','changes_requested','resubmitted'].includes(action))return jsonError('Invalid action');
 if((action==='changes_requested'||action==='comment')&&!message)return jsonError('Please write a comment or reason');
 if(action==='resubmitted'&&!user.admin)return jsonError('Only admin can resubmit',403);
 const db=serviceSupabase();const {data:item}=await db.from('review_items').select('id').eq('id',id).single();if(!item)return jsonError('Review not found',404);
 const {error}=await db.from('review_events').insert({review_id:id,action,message,actor:user.email});if(error)return jsonError(error.message,500);
 if(action!=='comment'){
  const status=action==='approved'?'approved':action==='changes_requested'?'changes_requested':'pending';
  const {error:updateError}=await db.from('review_items').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(updateError)return jsonError('Comment saved; status update failed: '+updateError.message,500);
 }
 return Response.json({ok:true});
}
