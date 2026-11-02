import {google} from 'googleapis';

/** Search Console, read only, through the service account that already reads
 *  the report spreadsheet. Nothing new to create: the same account is added as
 *  a user on the Search Console property and that is the whole setup.
 *
 *  The question this answers is "is non-branded search growing", so every
 *  figure here is split into searches that name the company and searches that
 *  do not. Someone typing the brand was coming anyway; the rest is the work. */

export type Row={date:string;clicks:number;impressions:number;position:number};
export type QueryRow={query:string;clicks:number;impressions:number;ctr:number;position:number};
export type Point={period:string;label:string;branded:number;nonBranded:number;impressions:number};
export type Totals={clicks:number;impressions:number;ctr:number|null;position:number|null};

/** The property as Search Console names it: a URL-prefix property ends in a
 *  slash, a domain property is written "sc-domain:example.com". */
export function siteUrl(){return (process.env.GSC_SITE_URL||'').trim()}
export function searchConfigured(){
 return !!(siteUrl()&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY);
}

const DEFAULT_BRAND=['usa hi','usahi','usa home improvement','gousahi','usa home improvment'];
/** Brand spellings to treat as branded. Set BRAND_TERMS to override, comma
 *  separated; misspellings belong in the list too, since that is how people
 *  actually type a company name. */
export function brandTerms():string[]{
 const given=(process.env.BRAND_TERMS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 return given.length?given:DEFAULT_BRAND;
}

/** A search is branded when it contains any brand spelling, ignoring case and
 *  however the words are spaced. "usahi windows" and "USA  HI" both count. */
export function isBranded(query:string,terms:string[]):boolean{
 const flat=String(query||'').toLowerCase().replace(/\s+/g,' ').trim();
 const tight=flat.replace(/\s+/g,'');
 return terms.some(t=>{
  const term=t.toLowerCase().replace(/\s+/g,' ').trim();
  return !!term&&(flat.includes(term)||tight.includes(term.replace(/\s+/g,'')));
 });
}

const DAY=86400000;
const iso=(d:Date)=>d.toISOString().slice(0,10);
const days=(from:string,to:string)=>Math.round((Date.parse(to)-Date.parse(from))/DAY)+1;

/** Daily points are noise over a quarter and a monthly point hides a month of
 *  progress, so the step follows the span being looked at. */
export function stepFor(from:string,to:string):'day'|'week'|'month'{
 const n=days(from,to);
 if(!Number.isFinite(n)||n<=35)return 'day';
 return n<=200?'week':'month';
}

/** The first day of the bucket a date falls in. Weeks start on Monday, the day
 *  Search Console's own week starts. */
export function bucketStart(date:string,step:'day'|'week'|'month'):string{
 const d=new Date(date+'T00:00:00Z');
 if(isNaN(d.getTime()))return date;
 if(step==='day')return iso(d);
 if(step==='month')return iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)));
 const back=(d.getUTCDay()+6)%7;           // Sunday is 0, and Monday starts the week
 return iso(new Date(d.getTime()-back*DAY));
}

export function bucketLabel(period:string,step:'day'|'week'|'month'):string{
 const d=new Date(period+'T12:00:00Z');
 if(isNaN(d.getTime()))return period;
 if(step==='month')return d.toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'});
 return d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
}

/** The two daily series folded into one list of points, in date order, with a
 *  zero kept for any bucket neither side reported. A gap in a trend line is a
 *  week with no searches, and leaving it out would draw a line through it. */
export function toSeries(nonBranded:Row[],branded:Row[],from:string,to:string):Point[]{
 const step=stepFor(from,to);
 const points=new Map<string,Point>();
 const touch=(period:string)=>{
  let p=points.get(period);
  if(!p){p={period,label:bucketLabel(period,step),branded:0,nonBranded:0,impressions:0};points.set(period,p)}
  return p;
 };
 const start=Date.parse(from),end=Date.parse(to);
 if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)
  for(let t=start;t<=end;t+=DAY)touch(bucketStart(iso(new Date(t)),step));
 for(const r of nonBranded){const p=touch(bucketStart(r.date,step));p.nonBranded+=r.clicks;p.impressions+=r.impressions}
 for(const r of branded){const p=touch(bucketStart(r.date,step));p.branded+=r.clicks}
 return [...points.values()].sort((a,b)=>a.period<b.period?-1:1);
}

/** Position is an average over impressions, not over days: a day with four
 *  impressions must not weigh as much as a day with four thousand. */
export function summarise(rows:{clicks:number;impressions:number;position:number}[]):Totals{
 let clicks=0,impressions=0,weighted=0;
 for(const r of rows){clicks+=r.clicks;impressions+=r.impressions;weighted+=r.position*r.impressions}
 return {
  clicks,impressions,
  ctr:impressions?clicks/impressions:null,
  position:impressions?weighted/impressions:null
 };
}

/** Clicks over the first half of the range against the second half. The client's
 *  question is "is this improving", and that is the shortest honest answer. */
export function trend(points:Point[]):{first:number;second:number;change:number|null}{
 if(points.length<2)return {first:0,second:0,change:null};
 const half=Math.floor(points.length/2);
 const sum=(list:Point[])=>list.reduce((n,p)=>n+p.nonBranded,0);
 const first=sum(points.slice(0,half)),second=sum(points.slice(points.length-half));
 return {first,second,change:first?(second-first)/first:null};
}

function api(){
 const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
 const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n');
 if(!email||!key)throw new Error('Google service account is not configured');
 const auth=new google.auth.JWT({email,key,scopes:['https://www.googleapis.com/auth/webmasters.readonly']});
 return google.searchconsole({version:'v1',auth});
}

/** One brand pattern, used to exclude branded searches on one call and to keep
 *  only branded searches on the other, so the two series are measured the same
 *  way. Both are query-aggregated, which is why their total is a little under
 *  the site total: Search Console leaves out rare searches that could identify
 *  a person. Anchors are left off so the pattern matches part of a search. */
export function brandPattern(terms:string[]):string{
 const escaped=terms.map(t=>t.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*'));
 return '.*('+escaped.join('|')+').*';
}

type Dim='date'|'query';
async function fetchRows(site:string,from:string,to:string,dimensions:Dim[],regex:string,keep:boolean,rowLimit:number){
 const res=await api().searchanalytics.query({
  siteUrl:site,
  requestBody:{
   startDate:from,endDate:to,dimensions,rowLimit,
   dimensionFilterGroups:[{filters:[{dimension:'query',operator:keep?'includingRegex':'excludingRegex',expression:regex}]}]
  }
 });
 return (res.data.rows||[]).map(r=>({
  key:String(r.keys?.[0]??''),
  clicks:Number(r.clicks||0),impressions:Number(r.impressions||0),
  ctr:Number(r.ctr||0),position:Number(r.position||0)
 }));
}

export async function searchPerformance(from:string,to:string){
 const site=siteUrl();
 if(!site)throw new Error('GSC_SITE_URL is not set');
 const regex=brandPattern(brandTerms());
 const [nb,b,q]=await Promise.all([
  fetchRows(site,from,to,['date'],regex,false,1000),
  fetchRows(site,from,to,['date'],regex,true,1000),
  fetchRows(site,from,to,['query'],regex,false,100)
 ]);
 const asRows=(list:typeof nb):Row[]=>list.map(r=>({date:r.key,clicks:r.clicks,impressions:r.impressions,position:r.position}));
 const nonBranded=asRows(nb),branded=asRows(b);
 const points=toSeries(nonBranded,branded,from,to);
 return {
  site,
  step:stepFor(from,to),
  brandTerms:brandTerms(),
  nonBranded:summarise(nonBranded),
  branded:summarise(branded),
  series:points,
  trend:trend(points),
  queries:q.map(r=>({query:r.key,clicks:r.clicks,impressions:r.impressions,ctr:r.ctr,position:r.position})) as QueryRow[]
 };
}
