'use client';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {browserSupabase} from '@/lib/supabase';
import {reportDocument} from '@/lib/report-document';
import {LayoutDashboard,FileText,MessageSquare,ArrowUpRight,Plus,LogOut,ChevronRight,ChevronDown,UploadCloud,Eye,Check,Clock,Search,ArrowLeft,ShieldCheck,TrendingUp,ChartNoAxesColumn,Menu,ExternalLink,RefreshCw,X,AlertCircle,Send,Image as ImageIcon,LockKeyhole,LayoutGrid,List,Pencil,Trash2} from 'lucide-react';
import {shortUrl} from '@/lib/review-links';
import type {Session} from '@supabase/supabase-js';
type Tab='overview'|'reports'|'reviews';
type Report={id:string;title:string;report_date:string;category:string;summary:string;status:string;created_at:string;published_at?:string};
type Review={id:string;title:string;target_url:string;description:string;status:string;created_at:string};
type Event={id:string;review_id:string;action:string;message:string;actor:string;created_at:string};
type SalesforceCounts={dateColumn:string;leads:number;converted:number;unreadableDates:number;total:number};
type OppTotals={count:number;value:number;estimates:number;estimateValue:number;won:number;wonValue:number;wonShare:number|null;spend:number;roas:number|null;pipelineRoas:number|null;costPerEstimate:number|null;costPerWon:number|null};
type AdData={ads:Record<string,number>;calls:Record<string,number>;campaigns:any[];keywords:any[];leads:any[];opportunities:any[];oppStages:any[];oppTotals:OppTotals;salesforce:SalesforceCounts|null;monthly:any[];source:string};
const supabase=browserSupabase();const setupReady=!!supabase;
const fmt=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n||0);
const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0);
const cash=(n:number)=>n?usd(n):'—';
const times=(n:number|null|undefined)=>n==null?'—':n.toFixed(2)+'x';
const pct=(n:number|null|undefined,d=0)=>n==null?'—':(n*100).toFixed(d)+'%';
const monthLabel=(m:string)=>{const [y,mo]=m.split('-');return new Date(Number(y),Number(mo)-1,1).toLocaleDateString('en-US',{month:'short',year:'numeric'})};
const human=(s:string)=>{try{return new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch{return s}};
const statusLabel=(s:string)=>s==='changes_requested'?'Changes requested':s;
const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function daysBack(n:number){const d=new Date();d.setDate(d.getDate()-n);return iso(d)}
async function request(path:string,token:string,options?:RequestInit){const response=await fetch(path,{...options,headers:{Authorization:`Bearer ${token}`,...(options?.headers||{})},cache:'no-store'});const data=await response.json().catch(()=>({error:'Unexpected server response'}));if(!response.ok)throw new Error(data.error||'Request failed');return data}
const demoReports:Report[]=[{id:'sample-weekly',title:'Weekly SEO Update',report_date:'2026-10-27',category:'Weekly SEO',summary:'24 location pages, 12 service pages, a Google Business Profile post and website fixes.',status:'published',created_at:''},{id:'sample-technical',title:'SEO Work & Technical Review',report_date:'2026-10-06',category:'Technical SEO',summary:'Location page work, content updates, technical corrections and visual evidence.',status:'published',created_at:''}];
const demoHtml=`<h1>Weekly SEO Update</h1><p><strong>27 October 2026</strong></p><h2>Work completed</h2><p>Uploaded 24 location pages using the updated design and published 12 service pages.</p><h2>Google Business Profile</h2><p>Published a post for the Hollywood area.</p><h2>Website updates</h2><p>Added license information to the announcement bar and corrected a contact number on a blog page.</p><h2>Pages published</h2><ul><li><a href="https://www.gousahi.com/">Example published page</a> — links inside a report open in a new tab.</li></ul>`;
const demoReviews:Review[]=[{id:'sample-review-1',title:'Impact Windows — Hollywood',target_url:'https://www.gousahi.com/',description:'Example request. Please check the wording and approve for publication.',status:'pending',created_at:'2026-10-28T09:00:00Z'},{id:'sample-review-2',title:'Roofing — Fort Lauderdale',target_url:'https://www.gousahi.com/',description:'Example request that the client already approved.',status:'approved',created_at:'2026-10-21T09:00:00Z'}];
const demoEvents:Event[]=[{id:'sample-event-1',review_id:'sample-review-2',action:'comment',message:'Example comment. Looks good, one small wording change on the second heading.',actor:'client@example.com',created_at:'2026-10-21T10:30:00Z'},{id:'sample-event-2',review_id:'sample-review-2',action:'approved',message:'',actor:'client@example.com',created_at:'2026-10-22T08:15:00Z'}];
export default function Dashboard(){
 const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[authError,setAuthError]=useState(''),[logging,setLogging]=useState(false);
 const [tab,setTab]=useState<Tab>('overview'),[admin,setAdmin]=useState(false),[reports,setReports]=useState<Report[]>([]),[reviews,setReviews]=useState<Review[]>([]),[events,setEvents]=useState<Event[]>([]),[ads,setAds]=useState<AdData|null>(null),[adsError,setAdsError]=useState('');
 // A spreadsheet read takes a few seconds, and until now the tiles sat on a row
 // of dashes that looked exactly like a figure of zero. Start both of these
 // loading, so the first paint already says the numbers are on their way.
 const [openingId,setOpeningId]=useState('');
 const [adsLoading,setAdsLoading]=useState(setupReady),[listLoading,setListLoading]=useState(setupReady);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[activeReport,setActiveReport]=useState<{title:string;html:string;id:string;status:string}|null>(null),[uploadOpen,setUploadOpen]=useState(false),[reviewOpen,setReviewOpen]=useState(false),[showDetails,setShowDetails]=useState(false),[search,setSearch]=useState(''),[format,setFormat]=useState('All'),[period,setPeriod]=useState('30'),[from,setFrom]=useState(daysBack(29)),[to,setTo]=useState(iso(new Date()));
 const [file,setFile]=useState<File|null>(null),[draftTitle,setDraftTitle]=useState(''),[draftCategory,setDraftCategory]=useState('Weekly SEO'),[draftSummary,setDraftSummary]=useState(''),[draftDate,setDraftDate]=useState(iso(new Date())),[localPreview,setLocalPreview]=useState<string|null>(null),[reviewTitle,setReviewTitle]=useState(''),[reviewUrl,setReviewUrl]=useState(''),[reviewDescription,setReviewDescription]=useState(''),[reviewLinks,setReviewLinks]=useState(''),[reviewMode,setReviewMode]=useState<'one'|'many'>('one'),[comment,setComment]=useState<Record<string,string>>({}),[reviewExpanded,setReviewExpanded]=useState<string|null>(null),[reviewView,setReviewView]=useState<'cards'|'compact'>('cards'),[editing,setEditing]=useState<Review|null>(null);
 const token=session?.access_token||'';
 useEffect(()=>{if(!supabase){setAuthReady(true);return}supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_evt,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 const load=useCallback(async()=>{if(!token)return;setListLoading(true);try{const [r,v,me]=await Promise.all([request('/api/reports',token),request('/api/reviews',token),request('/api/auth/me',token)]);setReports(r.reports);setReviews(v.items);setEvents(v.events);setAdmin(!!me.user.admin)}catch(e:any){setNotice(e.message)}finally{setListLoading(false)}},[token]);
 const loadAds=useCallback(async()=>{if(!token)return;setAdsError('');setAdsLoading(true);try{const d=await request(`/api/ads?from=${from}&to=${to}`,token);setAds(d)}catch(e:any){setAds(null);setAdsError(e.message)}finally{setAdsLoading(false)}},[token,from,to]);
 useEffect(()=>{if(token)load()},[token,load]);useEffect(()=>{if(token&&tab==='overview')loadAds()},[token,tab,loadAds]);
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setLogging(true);setAuthError('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setAuthError(error.message);setLogging(false)}
 async function logout(){await supabase?.auth.signOut();setSession(null);setReports([]);setAds(null)}
 const demo=!setupReady;
 const shownReviews=demo?demoReviews:reviews, shownEvents=demo?demoEvents:events;
 /** A 12-page technical report reads better full screen than in a modal, and
  *  this is also how the client prints one. The HTML has already been through
  *  the sanitizer, and the blob is revoked once the new tab has taken it. */
 function openFullPage(html:string){
  const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  const tab=window.open(url,'_blank','noopener,noreferrer');
  if(!tab)setNotice('Your browser blocked the new tab. Allow pop-ups for this site to open a report full screen.');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 // Everything the signed-in person is allowed to see, newest first; `shownReports`
 // then narrows that by the search box and the format chips on the Reports screen.
 const visibleReports=useMemo(()=>(demo?demoReports:reports)
  .filter(r=>admin||r.status==='published')
  .slice().sort((a,b)=>a.report_date<b.report_date?1:-1),[demo,reports,admin]);
 const shownReports=useMemo(()=>{
  const q=search.trim().toLowerCase();
  return visibleReports.filter(r=>
   (format==='All'||(r.category||'SEO')===format)&&
   (!q||r.title.toLowerCase().includes(q)||(r.summary||'').toLowerCase().includes(q)));
 },[visibleReports,search,format]);
 const publishedReports=useMemo(()=>visibleReports.filter(r=>r.status==='published'),[visibleReports]);
 const latestReport=visibleReports[0]||null;
 const reportFormats=useMemo(()=>{
  const by=new Map<string,number>();
  for(const r of visibleReports)by.set(r.category||'SEO',(by.get(r.category||'SEO')||0)+1);
  return [...by.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
 },[visibleReports]);
 const pendingReviews=shownReviews.filter(x=>x.status==='pending').length;
 async function openReport(r:Report){if(demo){setActiveReport({title:r.title,html:reportDocument(demoHtml),id:r.id,status:'published'});return}setBusy(true);setOpeningId(r.id);try{const d=await request('/api/report/'+r.id,token);setActiveReport({title:r.title,html:d.report.body_html,id:r.id,status:r.status})}catch(e:any){setNotice(e.message)}finally{setBusy(false);setOpeningId('')}}
 async function updateReport(id:string,status:string){try{await request('/api/report/'+id,token,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});setNotice(status==='published'?'Report published':'Report moved to drafts');await load();setActiveReport(null)}catch(e:any){setNotice(e.message)}}
 async function chooseFile(chosen?:File){if(!chosen)return;setFile(chosen);setDraftTitle(chosen.name.replace(/\.html?$/i,'').replace(/[_-]/g,' '));if(chosen.size>3500000){setNotice('File is over the 3.5MB limit. Reduce image size.');setLocalPreview(null);return}const text=await chosen.text();setLocalPreview(text)}
 async function upload(publish:boolean){if(!file||!draftTitle.trim())return setNotice('Choose a file and enter a report title');if(demo)return setNotice('Preview mode. Connect Supabase to save this.');setBusy(true);try{const form=new FormData();form.append('file',file);form.append('title',draftTitle);form.append('category',draftCategory);form.append('date',draftDate);form.append('summary',draftSummary);form.append('publish',publish?'yes':'no');await request('/api/reports',token,{method:'POST',body:form});setUploadOpen(false);setFile(null);setLocalPreview(null);setNotice(publish?'Report published successfully':'Report saved as draft');await load();setTab('reports')}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
 async function createReview(e:React.FormEvent){e.preventDefault();if(demo)return setNotice('Preview mode. Connect Supabase to save this.');setBusy(true);
  try{
   const many=reviewMode==='many';
   const result=await request('/api/reviews',token,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(many?{links:reviewLinks,description:reviewDescription}:{title:reviewTitle,url:reviewUrl,description:reviewDescription})});
   setReviewOpen(false);setReviewTitle('');setReviewUrl('');setReviewDescription('');setReviewLinks('');
   // A bulk paste says how many pages are now waiting, and how many of them the
   // client had already been asked about, so nothing looks silently dropped.
   setNotice(many
    ?`${result.added} page${result.added===1?'':'s'} sent for approval`+(result.skipped?`. ${result.skipped} already on the list.`:'.')
    :'Review submitted to client');
   await load()}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
 // The team works through long lists and the client reads a handful of cards,
 // so the choice belongs to whoever is looking and is kept on their own machine.
 useEffect(()=>{try{const saved=localStorage.getItem('usahi.reviewView');if(saved==='compact'||saved==='cards')setReviewView(saved)}catch{}},[]);
 function chooseView(v:'cards'|'compact'){setReviewView(v);try{localStorage.setItem('usahi.reviewView',v)}catch{}}
 async function saveReviewEdit(e:React.FormEvent){e.preventDefault();if(!editing)return;if(demo)return setNotice('Preview mode. Connect Supabase to save this.');setBusy(true);
  try{await request('/api/reviews/'+editing.id,token,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:editing.title,url:editing.target_url,description:editing.description})});setEditing(null);setNotice('Page updated');await load()}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
 async function removeReview(r:Review){if(demo)return setNotice('Preview mode. Connect Supabase to save this.');
  if(!window.confirm(`Remove "${r.title}" from the approval list? Any comments on it are removed too.`))return;setBusy(true);
  try{await request('/api/reviews/'+r.id,token,{method:'DELETE'});setNotice('Page removed from the list');await load()}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
 // While the figures are being read, each tile keeps its own shape and shows a
 // moving bar where its number will be. A dash would read as a real zero.
 function metricCard(m:{label:string;value:string;hint:string;icon:string}){
  return <article className={adsLoading?'metricCard loading':'metricCard'} key={m.label} aria-busy={adsLoading||undefined}>
   <div className="metricTop"><span>{m.label}</span><span className="metricIcon">{m.icon}</span></div>
   {adsLoading?<><span className="skeleton skelValue"/><span className="skeleton skelHint"/><span className="srOnly">Loading {m.label}</span></>:<><strong>{m.value}</strong><small>{m.hint}</small></>}
  </article>;
 }
 const loadingBlock=<div className="loadingBlock" role="status"><RefreshCw size={22} className="spin"/><p>Loading…</p></div>;
 function toggleComments(id:string){setReviewExpanded(x=>x===id?null:id);setComment(c=>({...c,[id]:c[id]||''}))}
 // The same history, box and two buttons, whether they open under a card or
 // under a row of the table.
 function commentPanel(r:Review){return <div className="commentBox"><div className="commentHistory">{shownEvents.filter(e=>e.review_id===r.id).map(e=><div className="commentEntry" key={e.id}><b>{e.actor}</b><span className="smallMuted">{e.action.replace(/_/g,' ')} · {new Date(e.created_at).toLocaleString()}</span><p>{e.message}</p></div>)}</div><textarea rows={3} placeholder="Write feedback or explain the requested changes…" value={comment[r.id]||''} onChange={e=>setComment(c=>({...c,[r.id]:e.target.value}))}/><div className="reviewActions"><button className="btn subtle" disabled={busy} onClick={()=>actReview(r.id,'comment')}><Send size={15}/> Post comment</button>{r.status!=='changes_requested'&&<button className="btn outlineDanger" disabled={busy} onClick={()=>actReview(r.id,'changes_requested')}>Submit changes request</button>}</div></div>}
 async function actReview(id:string,action:string){if(demo)return setNotice('Preview mode. Connect Supabase to save this.');setBusy(true);try{await request('/api/reviews/'+id,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,message:comment[id]||''})});setComment(s=>({...s,[id]:''}));setNotice(action==='comment'?'Comment posted':'Review updated');await load()}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
 const setRange=(v:string)=>{setPeriod(v);let a=daysBack(29),b=iso(new Date());if(v==='7')a=daysBack(6);if(v==='90')a=daysBack(89);if(v==='mtd'){const d=new Date();a=iso(new Date(d.getFullYear(),d.getMonth(),1))}setFrom(a);setTo(b)};
 if(!authReady)return <div className="centerLoading">Preparing dashboard…</div>;
 if(!session&&!demo)return <main className="loginPage"><div className="loginArt"><img src="/usahi-logo.png" alt="USA Home Improvement" className="loginLogo"/><p>USA HOME IMPROVEMENT</p><h1>One clear view of your marketing work.</h1><p className="loginSub">Paid advertising, SEO reporting, and client approvals in one place.</p><div className="loginDecor"><div/><div/><div/></div></div><form className="loginCard" onSubmit={login}><div className="eyebrow">Secure access</div><h2>Welcome back</h2><p>Sign in to your client dashboard.</p><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" /></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" /></label>{authError&&<div className="errorText">{authError}</div>}<button className="btn primary wide" disabled={logging}>{logging?'Signing in…':'Sign in'} <ArrowUpRight size={17}/></button><small>Access is managed through your company account.</small></form></main>;
 return <div className="shell">
 <aside className="sidebar"><div className="wordmark"><img src="/usahi-logo.png" alt="USA Home Improvement" className="sidebarLogo"/><small className="workspaceCaption">Marketing workspace</small></div><div className="sideCaption">WORKSPACE</div><nav className="navLinks" aria-label="Main navigation">{([{key:'overview',label:'Overview',icon:LayoutDashboard},{key:'reports',label:'Reports',icon:FileText},{key:'reviews',label:'Reviews',icon:MessageSquare}] as const).map(item=><button key={item.key} className={tab===item.key?'selected':''} onClick={()=>{setTab(item.key);setActiveReport(null)}}><item.icon size={18}/>{item.label}{item.key==='reviews'&&shownReviews.filter(x=>x.status==='pending').length>0&&<span className="navCount">{shownReviews.filter(x=>x.status==='pending').length}</span>}</button>)}</nav><div className="sidebarBottom"><div className="secure"><ShieldCheck size={16}/> {demo?'Preview mode':'Private workspace'}</div>{!demo&&<button className="signout" onClick={logout}><LogOut size={16}/> Sign out</button>}</div></aside>
 <div className="mainArea"><header className="topbar"><div><span className="crumb">USAHI / {tab==='overview'?'Overview':tab==='reports'?'Reports':'Reviews'}</span></div><div className="userArea"><span className="liveDot"/> {demo?'Design preview':admin?'Administrator':'Client view'} <span className="userAvatar">{demo?'P':(session?.user.email||'U')[0].toUpperCase()}</span></div></header>
 <main className="content">{demo&&<div className="demoNote"><AlertCircle size={16}/> Preview mode. The layout uses example content from your supplied report. Connect Supabase to enable login, publishing, and reviews.</div>}{notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
 {tab==='overview'&&<><div className="pageHeading"><div><div className="eyebrow">MARKETING PERFORMANCE</div><h1>Overview</h1><p>What happened, what it means, and what needs attention.</p></div><div className="dateToolbar"><select aria-label="Reporting date range" value={period} onChange={e=>setRange(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="mtd">This month</option><option value="custom">Custom range</option></select>{period==='custom'&&<><input aria-label="From date" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="To date" type="date" value={to} onChange={e=>setTo(e.target.value)}/></>}<button className="iconButton" onClick={loadAds} title={adsLoading?'Loading…':'Refresh'} aria-label={adsLoading?'Loading':'Refresh'} disabled={adsLoading}><RefreshCw size={17} className={adsLoading?'spin':undefined}/></button></div></div>
 <section className="heroIntro"><div><div className="heroKicker">AT A GLANCE</div><h2>One place for the work behind the numbers.</h2><p>Google Ads performance and the SEO work your team delivers, without switching between reports.</p><button onClick={()=>setTab('reports')} className="textLink">Browse SEO reports <ArrowUpRight size={15}/></button></div><div className="heroPattern"><div className="statHalo"><ChartNoAxesColumn size={42}/></div></div></section>
 <div className="sectionRow"><h2>Google Ads performance</h2>{adsLoading?<span className="loadingTag" role="status"><RefreshCw size={13} className="spin"/> Reading the sheet…</span>:<span className="smallMuted">{human(from)} – {human(to)}</span>}</div>
 {adsError&&<div className="softWarning"><AlertCircle size={17}/><div><b>Ads connection needs attention</b><p>{adsError}. Your existing Ads spreadsheet has not been changed.</p></div></div>}
 <div className="metricGrid">{[{label:'Ad spend',value:ads?usd(ads.ads.Cost):'—',hint:'Total media spend',icon:'$'},{label:'Clicks',value:ads?fmt(ads.ads.Clicks):'—',hint:'Visits from paid ads',icon:'↗'},{label:'Conversions',value:ads?fmt(ads.ads.Conversions):'—',hint:'Google Ads conversions',icon:'✓'},{label:'Lead submissions',value:ads?fmt(ads.calls['Total Leads']):'—',hint:'From calls and forms sheet',icon:'◎'}].map(metricCard)}</div>
 <div className="sectionRow"><h2>Sales pipeline</h2><span className="smallMuted">Opportunities created {human(from)} – {human(to)}</span></div>
 <div className="metricGrid">{[
  {label:'Opportunities',value:ads?fmt(ads.oppTotals.count):'—',hint:ads?cash(ads.oppTotals.value)+' total':'Raised in these dates',icon:'◆'},
  {label:'Estimates given',value:ads?fmt(ads.oppTotals.estimates):'—',hint:ads?cash(ads.oppTotals.estimateValue)+' quoted':'Quoted in these dates',icon:'◍'},
  {label:'Closed won',value:ads?fmt(ads.oppTotals.won):'—',hint:ads?cash(ads.oppTotals.wonValue)+(ads.oppTotals.wonShare==null?'':' · '+pct(ads.oppTotals.wonShare,1)+' of opportunities'):'Signed in these dates',icon:'✓'},
  {label:'Google Ads spend',value:ads?usd(ads.oppTotals.spend):'—',hint:'These dates',icon:'$'}
 ].map(metricCard)}</div>
 <div className="metricGrid">{[
  {label:'ROAS',value:times(ads?.oppTotals.roas),hint:ads?cash(ads.oppTotals.wonValue)+' won ÷ spend':'Money signed ÷ ad spend',icon:'↗'},
  {label:'Pipeline ROAS',value:times(ads?.oppTotals.pipelineRoas),hint:'Every stage, quoted not earned',icon:'◎'},
  {label:'Cost per estimate',value:ads?.oppTotals.costPerEstimate==null?'—':usd(ads.oppTotals.costPerEstimate),hint:'Ad spend ÷ estimates given',icon:'$'},
  {label:'Cost per closed won',value:ads?.oppTotals.costPerWon==null?'—':usd(ads.oppTotals.costPerWon),hint:'Ad spend ÷ deals won',icon:'$'}
 ].map(metricCard)}</div>
 <p className="smallMuted">Google Ads spend and Salesforce deals are separate accounting systems, so every cost and ROAS figure here divides one by the other rather than following a single sale end to end. A quote is not revenue: pipeline ROAS counts money that has only been offered.{!!ads?.salesforce?.unreadableDates&&<> {fmt(ads.salesforce.unreadableDates)} lead {ads.salesforce.unreadableDates===1?'row has':'rows have'} no readable {ads.salesforce.dateColumn||'date'}, so {ads.salesforce.unreadableDates===1?'it is':'they are'} not counted in any date range.</>}</p>
 <div className="sectionRow"><h2>SEO work</h2><span className="smallMuted">Written up by your team, with the evidence attached</span></div>
 <div className="seoLayout">
  {latestReport
   ?<article className="latestReport">
     <div className="rowPills"><span className="eyebrow">LATEST · {(latestReport.category||'SEO').toUpperCase()}</span>{latestReport.status==='draft'&&<span className="status draft">Draft</span>}</div>
     <h3>{latestReport.title}</h3>
     <p>{latestReport.summary||'Open the report for the full write-up, links and screenshots.'}</p>
     <div className="latestFoot"><span className="smallMuted">{human(latestReport.report_date)}</span><button className="btn primary" onClick={()=>openReport(latestReport)} disabled={busy}>{openingId===latestReport.id?<>Opening… <RefreshCw size={15} className="spin"/></>:<>Read the report <ArrowUpRight size={15}/></>}</button></div>
    </article>
   :<article className="latestReport empty"><h3>No SEO report yet</h3><p>{admin?'Upload your first HTML report and it will appear here for the client.':'Your team’s SEO write-ups will appear here as they are published.'}</p>{admin&&<button className="btn primary" onClick={()=>setUploadOpen(true)}><Plus size={16}/> New report</button>}</article>}
  <div className="seoSide">
   <article className="panel compact"><div className="panelTitle"><FileText size={18}/><strong>Reports published</strong><button onClick={()=>setTab('reports')} aria-label="Browse reports"><ArrowUpRight size={18}/></button></div>
    <div className="largeNumber">{publishedReports.length}</div>
    {reportFormats.length
     ?<ul className="formatList">{reportFormats.map(f=><li key={f.name}><span>{f.name}</span><b>{f.count}</b></li>)}</ul>
     :<p>Published updates and supporting evidence</p>}
   </article>
   <article className="panel compact"><div className="panelTitle"><MessageSquare size={18}/><strong>Waiting for you</strong><button onClick={()=>setTab('reviews')} aria-label="View reviews"><ArrowUpRight size={18}/></button></div>
    <div className="largeNumber">{pendingReviews}</div>
    <p>{pendingReviews===0?'Nothing needs a decision right now':pendingReviews===1?'One page is waiting for your approval':pendingReviews+' pages are waiting for your approval'}</p>
   </article>
  </div>
 </div>
 <div className="detailBar"><div><strong>Need the detailed data?</strong><p>Campaigns, keywords, calls, lead records, and opportunities remain available.</p></div><button className="btn subtle" onClick={()=>setShowDetails(v=>!v)}>{showDetails?'Hide':'View'} detailed tables <ChevronDown size={16}/></button></div>
 {showDetails&&<section className="detailSection"><h3>Paid advertising detail</h3><div className="twoColumns"><DataTable title="Campaigns" rows={ads?.campaigns||[]} columns={['Campaign','Cost','Clicks','Conversions']}/><DataTable title="Keywords" rows={ads?.keywords||[]} columns={['Keyword','Cost','Clicks','Conversions']}/></div><div className="twoColumns"><DataTable title="Recent leads (limited fields)" rows={ads?.leads||[]} columns={['date','type','name','campaign']}/><DataTable title="Opportunities (created-date view)" rows={ads?.opportunities||[]} columns={['date','name','stage','source','value']}/></div><h3>Sales pipeline detail</h3><StageTable rows={ads?.oppStages||[]} totals={ads?.oppTotals}/>
 <MonthTable rows={ads?.monthly||[]} hasSalesforce={!!ads?.salesforce}/>
 </section>}
 </>}
 {tab==='reports'&&<><div className="pageHeading"><div><div className="eyebrow">SEO WORK & PROOF</div><h1>Reports</h1><p>Clear updates, working links, screenshots, and completed tasks.</p></div>{admin&&<button className="btn primary" onClick={()=>setUploadOpen(true)}><Plus size={17}/> New report</button>}</div><div className="reportToolbar"><div className="search"><Search size={17}/><input placeholder="Search reports…" value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="smallMuted">{shownReports.length===visibleReports.length?shownReports.length+(shownReports.length===1?' report':' reports'):shownReports.length+' of '+visibleReports.length+' reports'}</span></div>
 {reportFormats.length>1&&<div className="chipRow" role="group" aria-label="Filter by report format"><button className={format==='All'?'chip on':'chip'} onClick={()=>setFormat('All')}>All <b>{visibleReports.length}</b></button>{reportFormats.map(f=><button key={f.name} className={format===f.name?'chip on':'chip'} onClick={()=>setFormat(f.name)}>{f.name} <b>{f.count}</b></button>)}</div>}
 {listLoading&&!shownReports.length&&loadingBlock}
 <div className="reportList">{shownReports.map((r,i)=><button className="reportRow" key={r.id} onClick={()=>openReport(r)}><div className="reportSymbol"><FileText size={23}/></div><div className="reportText"><div className="rowPills"><span className="eyebrow">{r.category||'SEO'} REPORT</span>{r.status==='draft'&&<span className="status draft">Draft</span>}</div><h3>{r.title}</h3><p>{r.summary||'Open for details, links and images.'}</p><span className="smallMuted">{human(r.report_date)}</span></div>{openingId===r.id?<RefreshCw size={20} className="rowChevron spin"/>:<ChevronRight size={21} className="rowChevron"/>}</button>)}{!listLoading&&!shownReports.length&&(visibleReports.length
   ?<div className="emptyState"><Search size={30}/><h3>Nothing matches that</h3><p>No report here is called {search?'“'+search+'”':'that'}{format!=='All'&&' in '+format}.</p><button className="btn subtle" onClick={()=>{setSearch('');setFormat('All')}}>Show all {visibleReports.length} reports</button></div>
   :<div className="emptyState"><FileText size={30}/><h3>No reports here yet</h3><p>{admin?'Upload an HTML report to get started.':'Published reports will appear here.'}</p>{admin&&<button className="btn primary" onClick={()=>setUploadOpen(true)}>Upload report</button>}</div>)}</div></>}
 {tab==='reviews'&&<><div className="pageHeading"><div><div className="eyebrow">CLIENT COLLABORATION</div><h1>Reviews &amp; approvals</h1><p>One clear decision for every proposed page.</p></div>{admin&&<button className="btn primary" onClick={()=>setReviewOpen(true)}><Plus size={17}/> Request review</button>}</div>
  <div className="reviewBar"><div className="reviewStatusBar"><span><span className="dot orange"/> {shownReviews.filter(x=>x.status==='pending').length} pending</span><span><span className="dot green"/> {shownReviews.filter(x=>x.status==='approved').length} approved</span><span><span className="dot red"/> {shownReviews.filter(x=>x.status==='changes_requested').length} changes requested</span></div>
   <div className="chipRow" role="group" aria-label="List layout"><button className={reviewView==='cards'?'chip on':'chip'} onClick={()=>chooseView('cards')} aria-pressed={reviewView==='cards'}><LayoutGrid size={14}/> Cards</button><button className={reviewView==='compact'?'chip on':'chip'} onClick={()=>chooseView('compact')} aria-pressed={reviewView==='compact'}><List size={14}/> Compact</button></div></div>
  {listLoading&&!shownReviews.length
   ?loadingBlock
   :!shownReviews.length
   ?<div className="emptyState"><MessageSquare size={30}/><h3>No review requests yet</h3><p>New pages awaiting approval will appear here.</p></div>
   :reviewView==='compact'
   ?<div className="compactReviews"><div className="tableScroll"><table><thead><tr><th>Status</th><th>Page</th><th>Link</th><th>Added</th><th>Notes</th><th><span className="srOnly">Actions</span></th></tr></thead><tbody>
    {shownReviews.map(r=><React.Fragment key={r.id}>
     <tr>
      <td><span className={`status ${r.status}`}>{statusLabel(r.status)}</span></td>
      <td className="cellTitle">{r.title}</td>
      <td className="cellLink"><a href={r.target_url} target="_blank" rel="noopener noreferrer" title={r.target_url}>{shortUrl(r.target_url)} <ExternalLink size={12}/></a></td>
      <td className="smallMuted">{human(r.created_at.slice(0,10))}</td>
      <td><button className="linkButton" onClick={()=>toggleComments(r.id)}>{shownEvents.filter(e=>e.review_id===r.id).length}</button></td>
      <td className="cellActions">
       {r.status!=='approved'&&<button className="btn approve tiny" onClick={()=>actReview(r.id,'approved')} disabled={busy} title="Approve" aria-label={'Approve '+r.title}><Check size={15}/></button>}
       <button className="btn subtle tiny" onClick={()=>toggleComments(r.id)} title="Comments and change requests" aria-label={'Comments on '+r.title}><MessageSquare size={15}/></button>
       {admin&&<button className="btn subtle tiny" onClick={()=>setEditing({...r})} title="Edit this page" aria-label={'Edit '+r.title}><Pencil size={15}/></button>}
       {admin&&<button className="btn outlineDanger tiny" onClick={()=>removeReview(r)} disabled={busy} title="Remove from the list" aria-label={'Remove '+r.title}><Trash2 size={15}/></button>}
      </td>
     </tr>
     {reviewExpanded===r.id&&<tr className="commentRow"><td colSpan={6}>{commentPanel(r)}</td></tr>}
    </React.Fragment>)}
   </tbody></table></div></div>
   :<div className="reviewList">{shownReviews.map(r=><article className="reviewCard" key={r.id}><div className="reviewCardTop"><div><span className={`status ${r.status}`}>{statusLabel(r.status)}</span><h3>{r.title}</h3><p>{r.description}</p><a href={r.target_url} target="_blank" rel="noopener noreferrer">Open proposed page <ExternalLink size={14}/></a></div><span className="smallMuted">{human(r.created_at.slice(0,10))}</span></div>
    <div className="reviewActions"><button className="btn subtle" onClick={()=>toggleComments(r.id)}><MessageSquare size={15}/> Comments ({shownEvents.filter(e=>e.review_id===r.id).length})</button>{r.status!=='approved'&&<button className="btn approve" onClick={()=>actReview(r.id,'approved')} disabled={busy}><Check size={16}/> Approve</button>}{r.status!=='changes_requested'&&<button className="btn subtle" onClick={()=>{setReviewExpanded(r.id);setComment(c=>({...c,[r.id]:c[r.id]||''}))}}>Request changes</button>}{admin&&r.status!=='pending'&&<button className="btn subtle" onClick={()=>actReview(r.id,'resubmitted')}>Resubmit</button>}
     {admin&&<span className="adminTools"><button className="btn subtle" onClick={()=>setEditing({...r})}><Pencil size={15}/> Edit</button><button className="btn outlineDanger" onClick={()=>removeReview(r)} disabled={busy}><Trash2 size={15}/> Remove</button></span>}</div>
    {reviewExpanded===r.id&&commentPanel(r)}</article>)}</div>}
  </>}
 </main></div>
 {activeReport&&<div className="overlay" role="dialog" aria-modal="true" aria-label="Report viewer"><div className="viewer"><div className="viewerHead"><button className="backButton" onClick={()=>setActiveReport(null)}><ArrowLeft size={18}/> Back to reports</button><div><h2>{activeReport.title}</h2><span className="smallMuted">{activeReport.status==='draft'?'Draft — not visible to the client yet':'Published report'}</span></div><div className="viewerActions"><button className="btn subtle" onClick={()=>openFullPage(activeReport.html)}><ArrowUpRight size={16}/> Full page</button>{admin&&activeReport.id&&!demo&&<button className="btn primary" onClick={()=>updateReport(activeReport.id,activeReport.status==='published'?'draft':'published')}>{activeReport.status==='published'?'Unpublish':'Publish'}</button>}<button className="iconButton" onClick={()=>setActiveReport(null)} aria-label="Close"><X size={19}/></button></div></div><iframe title="SEO report" className="reportFrame" srcDoc={activeReport.html} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"/></div></div>}
 {uploadOpen&&<div className="overlay" role="dialog" aria-modal="true" aria-label="New SEO report"><div className="modal"><div className="modalTitle"><div><span className="eyebrow">ONE-STEP PUBLISHING</span><h2>New SEO report</h2><p>Upload your finished HTML report. Preview it before publishing.</p></div><button className="iconButton" onClick={()=>setUploadOpen(false)} aria-label="Close"><X size={20}/></button></div><label className="uploadDrop"><UploadCloud size={29}/><strong>{file?.name||'Choose HTML report'}</strong><span>.html or .htm, up to 3.5 MB</span><input type="file" accept=".html,.htm,text/html" onChange={e=>chooseFile(e.target.files?.[0])}/></label><div className="formGrid"><label>Report title<input value={draftTitle} onChange={e=>setDraftTitle(e.target.value)} placeholder="October weekly SEO update"/></label><label>Report date<input type="date" value={draftDate} onChange={e=>setDraftDate(e.target.value)}/></label></div><label>Report format<select value={draftCategory} onChange={e=>setDraftCategory(e.target.value)}><option>Weekly SEO</option><option>Technical SEO</option><option>Monthly SEO</option><option>Custom report</option></select></label><label>Short summary<textarea value={draftSummary} onChange={e=>setDraftSummary(e.target.value)} rows={2} placeholder="What did the team complete?"/></label>{localPreview&&<details className="uploadPreview"><summary><Eye size={16}/> Preview uploaded report</summary><iframe title="Local report preview" srcDoc={localPreview} sandbox="allow-popups allow-popups-to-escape-sandbox"/></details>}<div className="modalActions"><button className="btn subtle" onClick={()=>setUploadOpen(false)}>Cancel</button><button className="btn subtle" disabled={!file||busy} onClick={()=>upload(false)}>Save draft</button><button className="btn primary" disabled={!file||busy} onClick={()=>upload(true)}>{busy?'Uploading…':'Publish report'} <ArrowUpRight size={16}/></button></div><p className="smallMuted">Scripts are removed on import. Images embedded in the HTML file are supported within the size limit.</p></div></div>}
 {reviewOpen&&<div className="overlay" role="dialog" aria-modal="true" aria-label="New review request"><form className="modal" onSubmit={createReview}><div className="modalTitle"><div><span className="eyebrow">CLIENT APPROVAL</span><h2>Request page review</h2><p>Send a page for a clear approve / change decision.</p></div><button type="button" className="iconButton" onClick={()=>setReviewOpen(false)}><X size={19}/></button></div>
 <div className="chipRow" role="group" aria-label="How many pages">
  <button type="button" className={reviewMode==='one'?'chip on':'chip'} onClick={()=>setReviewMode('one')}>One page</button>
  <button type="button" className={reviewMode==='many'?'chip on':'chip'} onClick={()=>setReviewMode('many')}>Paste many links</button>
 </div>
 {reviewMode==='one'
  ?<><label>Page title<input required value={reviewTitle} onChange={e=>setReviewTitle(e.target.value)} placeholder="Impact Windows — Miami"/></label><label>Page URL<input required type="url" value={reviewUrl} onChange={e=>setReviewUrl(e.target.value)} placeholder="https://example.com/page"/></label></>
  :<label>Page links, one per line<textarea required value={reviewLinks} onChange={e=>setReviewLinks(e.target.value)} rows={9} placeholder="One link per line, for example https://usahomeimprovement.com/impact-windows/boca-raton/"/><small className="fieldHint">Paste straight from your report. Bullets and numbering are fine, each page is named from its own address, and a page already on the list is skipped.</small></label>}
 <label>What should client check?<textarea value={reviewDescription} onChange={e=>setReviewDescription(e.target.value)} rows={4} placeholder="Please review wording and approve for publication."/></label><div className="modalActions"><button type="button" className="btn subtle" onClick={()=>setReviewOpen(false)}>Cancel</button><button className="btn primary" type="submit" disabled={busy}>Create request</button></div></form></div>}
 {editing&&<div className="overlay" role="dialog" aria-modal="true" aria-label="Edit page request"><form className="modal" onSubmit={saveReviewEdit}><div className="modalTitle"><div><span className="eyebrow">TEAM ONLY</span><h2>Edit page request</h2><p>Correct the title, the address, or the note the client reads.</p></div><button type="button" className="iconButton" onClick={()=>setEditing(null)}><X size={19}/></button></div>
  <label>Page title<input required value={editing.title} onChange={e=>setEditing(v=>v&&{...v,title:e.target.value})}/></label>
  <label>Page URL<input required type="url" value={editing.target_url} onChange={e=>setEditing(v=>v&&{...v,target_url:e.target.value})}/></label>
  <label>What should client check?<textarea rows={4} value={editing.description} onChange={e=>setEditing(v=>v&&{...v,description:e.target.value})} placeholder="Please review wording and approve for publication."/></label>
  <div className="modalActions spread"><button type="button" className="btn outlineDanger" disabled={busy} onClick={()=>{const r=editing;setEditing(null);if(r)removeReview(r)}}><Trash2 size={15}/> Remove page</button><span><button type="button" className="btn subtle" onClick={()=>setEditing(null)}>Cancel</button> <button className="btn primary" type="submit" disabled={busy}>Save changes</button></span></div>
  <p className="smallMuted">Editing and removing are yours alone. The client can open the page, comment, approve or request changes.</p></form></div>}
 </div>;
}
/** The portal's stage table: every stage present in these dates, newest CRM
 *  wording included, priced against all of the Google Ads spend for the dates. */
function StageTable({rows,totals}:{rows:any[];totals?:OppTotals}){
 return <article className="dataPanel"><h4>Opportunities by stage</h4><div className="tableScroll"><table><thead><tr>
  <th>Stage</th><th className="num">Opportunities</th><th className="num">Value</th><th className="num">Average</th><th className="num">Cost per one</th>
 </tr></thead><tbody>
  {!!rows.length&&totals&&<tr className="totalRow"><td>Total ({rows.length} {rows.length===1?'stage':'stages'})</td><td className="num">{fmt(totals.count)}</td><td className="num">{cash(totals.value)}</td><td className="num">{totals.count?cash(totals.value/totals.count):'—'}</td><td className="num">{totals.costPerEstimate==null&&!totals.count?'—':cash(totals.count?totals.spend/totals.count:0)}</td></tr>}
  {rows.map(r=><tr key={r.stage}><td>{r.stage}</td><td className="num">{fmt(r.count)}</td><td className="num">{cash(r.value)}</td><td className="num">{cash(r.average)}</td><td className="num">{cash(r.costPerOne)}</td></tr>)}
 </tbody></table></div>{!rows.length&&<p className="smallMuted">Nothing in these dates.</p>}</article>;
}
/** The portal's month-by-month table. It deliberately ignores the date bar, and
 *  carries each opportunity in up to three money columns instead of picking one
 *  month for it, so the grouped headings say which question each column answers. */
function MonthTable({rows,hasSalesforce}:{rows:any[];hasSalesforce:boolean}){
 const [open,setOpen]=useState(12);
 const shown=rows.slice(0,open);
 const t=shown.reduce((a:any,r:any)=>{for(const k of ['leads','converted','opps','won','lost','estSame','estCohort','estOpp','wonSame','wonCohort','wonOpp'])a[k]=(a[k]||0)+r[k];return a},{});
 const still=(t.leads||0)-(t.converted||0),inbound=still+(t.opps||0);
 return <article className="dataPanel wide"><h4>Month by month</h4>
  <p className="smallMuted panelNote">The whole history, not the dates chosen above. A sale belongs to a different month depending on what you are asking, so each one is carried in all three money columns rather than being given a single month.</p>
  {!hasSalesforce&&<p className="smallMuted">Lead counts need the &ldquo;Salesforce Leads&rdquo; tab; the opportunity columns are filled in.</p>}
  <div className="tableScroll"><table className="groupedTable"><thead>
   <tr className="groupRow"><th/><th className="num" colSpan={2}>Leads</th><th className="num" colSpan={3}>Opportunities</th><th className="num" colSpan={3}>Won</th><th className="num" colSpan={3}>Estimates</th><th className="num" colSpan={2}>Rates</th></tr>
   <tr><th>Month</th>
    <th className="num">In Salesforce</th><th className="num">Still leads</th>
    <th className="num">Raised</th><th className="num">Closed won</th><th className="num">Closed lost</th>
    <th className="num">Sold same month</th><th className="num">All from this month&rsquo;s leads</th><th className="num">By opp date</th>
    <th className="num">Quoted same month</th><th className="num">All from this month&rsquo;s leads</th><th className="num">By opp date</th>
    <th className="num">Opp / lead</th><th className="num">Won / opp</th></tr>
  </thead><tbody>
   {!!shown.length&&<tr className="totalRow"><td>Total ({shown.length} months)</td>
    <td className="num">{fmt(inbound)}</td><td className="num">{fmt(still)}</td>
    <td className="num">{fmt(t.opps)}</td><td className="num">{fmt(t.won)}</td><td className="num">{fmt(t.lost)}</td>
    <td className="num">{cash(t.wonSame)}</td><td className="num">{cash(t.wonCohort)}</td><td className="num">{cash(t.wonOpp)}</td>
    <td className="num">{cash(t.estSame)}</td><td className="num">{cash(t.estCohort)}</td><td className="num">{cash(t.estOpp)}</td>
    <td className="num">{pct(inbound?t.opps/inbound:null)}</td><td className="num">{pct(t.opps?t.won/t.opps:null)}</td></tr>}
   {shown.map((r:any)=><tr key={r.month}><td>{monthLabel(r.month)}</td>
    <td className="num">{fmt(r.inbound)}</td><td className="num">{fmt(r.still)}</td>
    <td className="num">{fmt(r.opps)}</td><td className="num">{fmt(r.won)}</td><td className="num">{fmt(r.lost)}</td>
    <td className="num">{cash(r.wonSame)}</td><td className="num">{cash(r.wonCohort)}</td><td className="num">{cash(r.wonOpp)}</td>
    <td className="num">{cash(r.estSame)}</td><td className="num">{cash(r.estCohort)}</td><td className="num">{cash(r.estOpp)}</td>
    <td className="num">{pct(r.oppPerLead)}</td><td className="num">{pct(r.wonPerOpp)}</td></tr>)}
  </tbody></table></div>
  {!rows.length&&<p className="smallMuted">No months to show yet.</p>}
  {rows.length>open&&<button className="btn subtle" onClick={()=>setOpen(n=>n+12)}>Show {Math.min(12,rows.length-open)} more months</button>}
  <p className="smallMuted">&ldquo;Sold same month&rdquo; is the money whose lead arrived and whose contract took effect in that one month. &ldquo;All from this month&rsquo;s leads&rdquo; is everything that lead eventually became, however long it took — so the first is part of the second, and the gap between them is the money that landed later. Every opportunity counts as an estimate, whatever stage it reached.</p>
 </article>;
}
function DataTable({title,rows,columns,labels}:{title:string;rows:any[];columns:string[];labels?:Record<string,string>}){return <article className="dataPanel"><h4>{title}</h4><div className="tableScroll"><table><thead><tr>{columns.map(c=><th key={c}>{labels?.[c]||c}</th>)}</tr></thead><tbody>{rows.slice(0,60).map((r,i)=><tr key={i}>{columns.map(c=><td key={c}>{typeof r[c]==='number'&&/cost|value/i.test(c)?usd(r[c]):r[c]??'—'}</td>)}</tr>)}</tbody></table></div>{!rows.length&&<p className="smallMuted">No records for these dates.</p>}{rows.length>60&&<p className="smallMuted">Showing first 60 of {rows.length}. Narrow dates to see more.</p>}</article>}
