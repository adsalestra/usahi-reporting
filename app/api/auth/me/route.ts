import {principal,jsonError,configGate} from '@/lib/supabase';
export const dynamic='force-dynamic';
export async function GET(req:Request){const blocked=configGate();if(blocked)return blocked;const user=await principal(req);return user?Response.json({user}):jsonError('Sign in required',401)}
