import {supabaseConfigured,adminEmailConfigured} from '@/lib/supabase';
import {sourceIds} from '@/lib/ads';
export const runtime='nodejs';export const dynamic='force-dynamic';
/**
 * Setup check for whoever configures Vercel. Booleans and a count only — no key,
 * email or spreadsheet ID is ever returned, so this stays safe on a public URL.
 */
export async function GET(){
 const google=!!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY);
 const ids=sourceIds().length;
 const checks={supabase:supabaseConfigured(),adminEmail:adminEmailConfigured(),googleServiceAccount:google,spreadsheetsConfigured:ids};
 const missing=[
  checks.supabase?null:'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY',
  checks.adminEmail?null:'ADMIN_EMAIL',
  checks.googleServiceAccount?null:'GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY',
  ids?null:'GOOGLE_SHEETS_IDS'
 ].filter(Boolean);
 return Response.json({ok:!missing.length,checks,missing,mode:checks.supabase?'live':'design preview'},{headers:{'Cache-Control':'no-store'}});
}
