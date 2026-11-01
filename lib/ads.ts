import {google} from 'googleapis';
export type Table={headers:string[];rows:Record<string,string>[]};
export function sourceIds(){return (process.env.GOOGLE_SHEETS_IDS||'').split(',').map(s=>s.trim()).filter(Boolean)}
async function client(){
 const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
 const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n');
 if(!email||!key)throw new Error('Google Sheets read-only connection is not configured');
 const auth=new google.auth.JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 return google.sheets({version:'v4',auth});
}
/** Every column the sheets keep a day in. "Create Date" is the Salesforce Leads
 *  spelling; "Created Date" is the Opportunities one. */
export const DATE_HEADERS=['Date','Create Date','Created Date','Lead Created','Contract Effective Date'];
export function toTable(values:any[][]|undefined):Table{
 if(!values?.length)return {headers:[],rows:[]};
 const headers=values[0].map(x=>String(x||'').trim());
 const dateCell=(value:any)=>{const s=String(value??'').trim();const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);if(typeof value==='number'&&value>30000&&value<90000)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);return s;};
 return {headers,rows:values.slice(1).filter(r=>r.some(x=>String(x??'').trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,DATE_HEADERS.includes(h)?dateCell(r[i]):String(r[i]??'')])))};
}
// The tab names the Apps Script portal already uses, copied from its own APP
// constants (TAB_ADS … TAB_SF_LEADS) rather than guessed. The first five are
// written hourly by the Google Ads script; "Opportunities" and "Salesforce
// Leads" are kept by the sales side and land in the same shared spreadsheet.
// "Run Log", "Lead Status", "Updates" and "Replies" belong to the old portal
// and are deliberately not read here.
export const TAB_LABELS=['Google Ads Summary','Sheet Summary','Campaigns','Keywords','Leads','Opportunities','Salesforce Leads'];
export function tableKey(label:string){return label.replace('Data - ','').toLowerCase().replace(/\s+/g,'_')}
/** The Ads script writes its raw daily rows into a hidden "Data - X" tab and
 *  leaves the visible "X" tab as a date-filtered view of them. That view opens
 *  with a date-range banner, so its first row is a caption rather than a header
 *  and its second row is a TOTAL. Read the raw tab wherever one exists, and
 *  fall back to the plain name for the tabs that have no twin (Opportunities,
 *  Salesforce Leads). */
export function resolveTab(label:string,titles:string[]){
 const raw='Data - '+label;
 if(titles.includes(raw))return raw;
 return titles.includes(label)?label:'';
}
export async function getTables(){
 const ids=sourceIds();if(!ids.length)throw new Error('No Ads spreadsheet configured. Set GOOGLE_SHEETS_IDS in Vercel, then redeploy.');
 const sheets=await client();
 const out:Record<string,Table>={}; const seenTabs:string[]=[];
 for(let si=0;si<ids.length;si++){
  const id=ids[si];
  // Ask the spreadsheet which tabs it has, then read only those. Reading is
  // strictly read-only: nothing here calls a write method.
  let titles:string[];
  try{
   const meta=await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets.properties.title'});
   titles=(meta.data.sheets||[]).map(sh=>String(sh.properties?.title||'')).filter(Boolean);
  }catch(error:any){
   const code=error?.code??error?.response?.status;
   if(code===403)throw new Error('The Google service account cannot open spreadsheet '+(si+1)+'. Share it with the service account email as Viewer.');
   if(code===404)throw new Error('Spreadsheet '+(si+1)+' was not found. Check the ID in GOOGLE_SHEETS_IDS.');
   throw new Error('Could not read spreadsheet '+(si+1)+': '+(error?.message||'unknown error'));
  }
  seenTabs.push(...titles);
  const wanted=TAB_LABELS.map(label=>({label,title:resolveTab(label,titles)}))
   .filter(w=>w.title&&!out[tableKey(w.label)]?.rows.length);
  if(!wanted.length)continue;
  const reply=await sheets.spreadsheets.values.batchGet({
   spreadsheetId:id,
   ranges:wanted.map(w=>`'${w.title.replace(/'/g,"''")}'!A1:AZ12000`),
   valueRenderOption:'UNFORMATTED_VALUE',      // dates arrive as serial numbers,
   dateTimeRenderOption:'SERIAL_NUMBER'        // so no sheet locale can flip d/m
  });
  const ranges=reply.data.valueRanges||[];
  wanted.forEach((w,i)=>{
   const table=toTable(ranges[i]?.values as any[][]);
   if(table.headers.length)out[tableKey(w.label)]=table;
  });
 }
 if(!Object.keys(out).length)throw new Error('None of the expected tabs were found. Looked for: '+TAB_LABELS.join(', ')+'. The spreadsheet has: '+(seenTabs.join(', ')||'no readable tabs')+'.');
 return out;
}
export function number(v:any){let n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;}
export function summary(tables:Record<string,Table>,from:string,to:string){
 const sum=(key:string)=>{
  const t=tables[key];const rows=(t?.rows||[]).filter(r=>r.Date>=from&&r.Date<=to);
  const totals:Record<string,number>={};for(const r of rows)for(const h of t.headers)if(h!=='Date'&&!['Campaign','Ad Group','Keyword','Match Type','Status'].includes(h))totals[h]=(totals[h]||0)+number(r[h]);
  return {rows,totals};
 };
 const ads=sum('google_ads_summary'),calls=sum('sheet_summary');
 const aggregate=(key:string,group:string,sort:string)=>{
  const t=tables[key];if(!t)return [];
  const rows=t.rows.filter(r=>r.Date>=from&&r.Date<=to);const grouped=new Map<string,any>();
  for(const row of rows){const k=row[group]||'(unknown)';let obj=grouped.get(k);if(!obj){obj={[group]:k,Cost:0,Clicks:0,Impressions:0,Conversions:0};grouped.set(k,obj)};
   for(const metric of ['Cost','Clicks','Impressions','Conversions'])obj[metric]+=number(row[metric]);}
  return [...grouped.values()].sort((a,b)=>b[sort]-a[sort]).slice(0,80);
 };
 const leads=(tables.leads?.rows||[]).filter(r=>r.Date>=from&&r.Date<=to).slice(-500).reverse().map(r=>({date:r.Date,name:r.Name,source:r['Data Source'],campaign:r.Campaign,type:r['Lead Type'],duration:r.Duration}));
 const isDay=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
 const monthOf=(day:string)=>day.slice(0,7);
 /** The Apps Script portal matches stages loosely, because Salesforce spells them
  *  differently over time ("Estimate Given", "Estimate given — follow up"). Same
  *  rule here, so both apps count the same rows. */
 const isStage=(stage:string,want:string)=>String(stage||'').toLowerCase().includes(want);
 const isConverted=(v:any)=>/^(1|true|yes|y|checked)$/i.test(String(v??'').trim());
 // Every opportunity row the sheet holds. The tiles use the date bar; the
 // month-by-month table below is deliberately whole-history, as in the portal.
 const allOpps=(tables.opportunities?.rows||[]).map(r=>({
  date:r['Created Date'],stage:r.Stage||'',value:number(r['HI Sale Price']),name:r['Opportunity Name']||'',
  source:r['Lead Source']||'',close:isDay(r['Contract Effective Date'])?r['Contract Effective Date']:'',
  leadCreated:isDay(r['Lead Created'])?r['Lead Created']:''
 })).filter(o=>isDay(o.date)&&o.stage);
 const opportunities=allOpps.filter(o=>o.date>=from&&o.date<=to);
 const sumValue=(list:{value:number}[])=>list.reduce((a,o)=>a+o.value,0);
 /** Every stage present in these dates, not a fixed list: the client adds and
  *  renames stages in their CRM and the page follows without an edit. Cost per
  *  one prices each stage against all of the Google Ads spend for the same
  *  dates, which is what the portal's own stage table does. */
 const oppStages=(()=>{
  const spend=ads.totals.Cost||0;
  const by=new Map<string,{stage:string;count:number;value:number;average:number;costPerOne:number}>();
  for(const o of opportunities){
   const slot=by.get(o.stage)||{stage:o.stage,count:0,value:0,average:0,costPerOne:0};
   slot.count++;slot.value+=o.value;by.set(o.stage,slot);
  }
  const out=[...by.values()].sort((a,b)=>b.count-a.count);
  for(const s of out){s.average=s.value/s.count;s.costPerOne=s.count>0?spend/s.count:0}
  return out;
 })();
 /** The tiles above the portal's Opportunities table, on its own definitions:
  *  "Estimates given" and "Closed won" are the rows whose stage contains those
  *  words, and every ratio is priced against all of the Google Ads spend for the
  *  same dates. No rows at all is "nothing logged" rather than "earned nothing",
  *  so the ratios come back null and the page shows a dash; rows with no win
  *  genuinely are 0.00x. */
 const oppTotals=(()=>{
  const spend=ads.totals.Cost||0;
  const est=opportunities.filter(o=>isStage(o.stage,'estimate given'));
  const won=opportunities.filter(o=>isStage(o.stage,'closed won'));
  const wonValue=sumValue(won),pipeline=sumValue(opportunities);
  const times=(revenue:number)=>spend>0&&opportunities.length?revenue/spend:null;
  const per=(n:number)=>n>0?spend/n:null;
  return {count:opportunities.length,value:pipeline,
   estimates:est.length,estimateValue:sumValue(est),
   won:won.length,wonValue,wonShare:opportunities.length?won.length/opportunities.length:null,
   spend,roas:times(wonValue),pipelineRoas:times(pipeline),
   costPerEstimate:per(est.length),costPerWon:per(won.length)};
 })();
 /** The Salesforce Leads export the sales team keeps in the same spreadsheet,
  *  counted as it stands for the chosen dates. A lead stays in the export after
  *  it converts and has its Converted box ticked, so `converted` is a subset of
  *  `leads` and nobody is counted twice. */
 const salesforce=(()=>{
  const t=tables.salesforce_leads;
  if(!t)return null;
  const dateColumn=['Create Date','Created Date','Date'].find(h=>t.headers.includes(h))||'';
  let leads=0,converted=0,unreadableDates=0;
  for(const row of t.rows){
   const day=dateColumn?row[dateColumn]:'';
   if(!isDay(day)){unreadableDates++;continue}
   if(day<from||day>to)continue;
   leads++;if(isConverted(row.Converted))converted++;
  }
  return {dateColumn,leads,converted,unreadableDates,total:t.rows.length};
 })();
 /** Month by month, whole history, ignoring the date bar — the portal's own
  *  drawOppMonths, kept to its arithmetic so both apps report the same figures.
  *  Money lands in a different month depending on the question asked, so each
  *  opportunity is added to up to three buckets rather than one:
  *    same    the lead came in this month AND it was quoted (or sold) this month
  *    cohort  the lead came in this month, whenever the quote or sale followed
  *    opp     credited to the month the opportunity itself was raised
  *  "same" is a subset of "cohort"; the gap between them is the money that took
  *  until a later month to land. The est… figures count every opportunity as an
  *  estimate, whatever its stage; only the won… figures are limited to Closed
  *  Won. All six are sums of money, not counts — the counts are the separate
  *  leads/opps/won/lost fields. */
 const monthly=(()=>{
  const slots=new Map<string,any>();
  const slot=(m:string)=>{
   let s=slots.get(m);
   if(!s){s={month:m,leads:0,converted:0,opps:0,won:0,lost:0,
    estSame:0,estCohort:0,estOpp:0,wonSame:0,wonCohort:0,wonOpp:0};slots.set(m,s)}
   return s;
  };
  const t=tables.salesforce_leads;
  const dateColumn=t?(['Create Date','Created Date','Date'].find(h=>t.headers.includes(h))||''):'';
  if(t&&dateColumn)for(const row of t.rows){
   const day=row[dateColumn];
   if(!isDay(day))continue;
   const s=slot(monthOf(day));s.leads++;if(isConverted(row.Converted))s.converted++;
  }
  for(const o of allOpps){
   const oppMonth=monthOf(o.date),leadMonth=monthOf(o.leadCreated||o.date);
   const closeMonth=o.close?monthOf(o.close):'';
   const isWon=isStage(o.stage,'closed won');
   const s=slot(oppMonth);
   s.opps++;s.estOpp+=o.value;
   if(isWon){s.won++;s.wonOpp+=o.value}
   else if(isStage(o.stage,'closed lost'))s.lost++;
   // every opportunity is an estimate, credited to the month its lead arrived
   slot(leadMonth).estCohort+=o.value;
   if(leadMonth===oppMonth)slot(leadMonth).estSame+=o.value;
   if(isWon){
    slot(leadMonth).wonCohort+=o.value;
    if(closeMonth&&leadMonth===closeMonth)slot(leadMonth).wonSame+=o.value;
   }
  }
  // The derived columns the portal shows: everyone who came in that month, the
  // leads that never became an opportunity, and the two conversion rates.
  for(const s of slots.values()){
   s.still=s.leads-s.converted;
   s.inbound=s.still+s.opps;
   s.stillEstimates=s.opps-s.won-s.lost;
   s.oppPerLead=s.inbound?s.opps/s.inbound:null;
   s.wonPerOpp=s.opps?s.won/s.opps:null;
  }
  return [...slots.values()].sort((a,b)=>a.month<b.month?1:-1).slice(0,24);
 })();
 return {from,to,ads:ads.totals,calls:calls.totals,campaigns:aggregate('campaigns','Campaign','Cost'),keywords:aggregate('keywords','Keyword','Cost'),leads,opportunities,oppStages,oppTotals,salesforce,monthly,source:'Google Sheets (read only)',asOf:new Date().toISOString()};
}
