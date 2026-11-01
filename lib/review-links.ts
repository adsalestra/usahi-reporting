/** Turning a pasted list of pages into review requests.
 *
 *  The list is nearly always copied out of a Word report, so it arrives with
 *  bullets, numbering and trailing commas attached. Rather than ask the team to
 *  tidy it first, tolerate all of that and read the links out of it.
 */

/** A readable name for a page, taken from its own address. Used when a link is
 *  pasted in bulk and nobody has typed a title for it. */
export function titleFromUrl(raw:string):string{
 let url:URL;
 try{url=new URL(raw)}catch{return raw}
 // A share link carries a random code, not a page name.
 if(url.hostname==='share.google')return 'Google Business Profile post';
 const path=url.pathname.replace(/^\/|\/$/g,'');
 if(!path)return 'Home page';
 return path.split('/')
  .map(part=>part.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))
  .join(' \u2014 ');
}

/** An http(s) address written the one way, or '' when `raw` is not one. A page
 *  is identified by this string everywhere, so a link that was typed into the
 *  form and the same link pasted in a list have to agree on its spelling. */
export function normalizeUrl(raw:string):string{
 let url:URL;
 try{url=new URL(String(raw||'').trim())}catch{return ''}
 return url.protocol==='https:'||url.protocol==='http:'?url.toString():'';
}

/** The address as it reads in a dense row: no scheme, no "www.", no trailing
 *  slash. What is left is the part that differs between two pages. */
export function shortUrl(raw:string):string{
 let url:URL;
 try{url=new URL(raw)}catch{return raw}
 return url.hostname.replace(/^www\./,'')+url.pathname.replace(/\/$/,'')+url.search;
}

export type PastedLink={title:string;url:string};

/** Every http(s) address in `text`, one per line, in the order pasted and with
 *  repeats dropped. Anything that is not a link is ignored rather than
 *  rejected, so one stray heading in the paste does not lose the whole list. */
export function parseLinks(text:string):PastedLink[]{
 const out:PastedLink[]=[];const seen=new Set<string>();
 for(const line of String(text||'').split(/[\r\n]+/)){
  const cleaned=line.replace(/^[\s\u2022\u2013\u2014\-*\d.)]+/,'').trim().replace(/[,;]+$/,'');
  const href=cleaned?normalizeUrl(cleaned):'';
  if(!href||seen.has(href))continue;
  seen.add(href);
  out.push({title:titleFromUrl(href),url:href});
 }
 return out;
}
