import sanitizeHtml from 'sanitize-html';
/** Uploaded HTML never executes script. Inline data images are permitted for portable reports. */
export function cleanReport(input:string):string {
 return sanitizeHtml(input,{
  allowedTags:['h1','h2','h3','h4','h5','h6','p','div','section','article','span','strong','b','em','i','u','s','small','blockquote','pre','code','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','a','img','figure','figcaption','hr','br','sup','sub','details','summary'],
  allowedAttributes:{'*':['class','title','aria-label','colspan','rowspan'],a:['href','target','rel','title'],img:['src','alt','width','height','title']},
  allowedSchemes:['http','https','mailto'],
  allowedSchemesByTag:{img:['http','https','data']},
  allowedSchemesAppliedToAttributes:['href','src'],
  transformTags:{a:(tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}})},
  // Keep legitimate browser-visible embedded images, reject arbitrary data/html URIs.
  exclusiveFilter:(frame)=>frame.tag==='img' && !!frame.attribs.src && frame.attribs.src.startsWith('data:') && !/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(frame.attribs.src)
 });
}
