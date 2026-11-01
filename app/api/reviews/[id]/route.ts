import {principal,serviceSupabase,jsonError,configGate,adminDenied} from '@/lib/supabase';
import {normalizeUrl} from '@/lib/review-links';
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

/** Correcting a request and taking one off the list belong to the team. The
 *  client's part is the decision on it, so both of these are admin only. */
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user?.admin)return adminDenied();
 const {id}=await params;const body=await req.json().catch(()=>({}));
 const title=String(body.title||'').trim().slice(0,180);
 const target_url=normalizeUrl(String(body.url||'').slice(0,2000));
 if(!title)return jsonError('Add a title');
 if(!target_url)return jsonError('Use a full https:// page URL');
 const {data,error}=await serviceSupabase().from('review_items')
  .update({title,target_url,description:String(body.description||'').trim().slice(0,4000),updated_at:new Date().toISOString()})
  .eq('id',id).select('*');
 if(error)return jsonError(error.message,500);
 if(!data?.length)return jsonError('Review not found',404);
 return Response.json({item:data[0]});
}

export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=configGate();if(blocked)return blocked;
 const user=await principal(req);if(!user?.admin)return adminDenied();
 const {id}=await params;
 // review_events is declared "on delete cascade", so the comments on a page go
 // with the page rather than being left pointing at nothing.
 const {data,error}=await serviceSupabase().from('review_items').delete().eq('id',id).select('id');
 if(error)return jsonError(error.message,500);
 if(!data?.length)return jsonError('Review not found',404);
 return Response.json({ok:true});
}
