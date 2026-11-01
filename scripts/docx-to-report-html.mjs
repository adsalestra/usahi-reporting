/**
 * Turn a Word report into one self-contained HTML file the dashboard can import.
 *
 *   node scripts/docx-to-report-html.mjs "<report>.docx" "examples/<report>.html"
 *
 * Keeps the document's own words, order, headings, lists, tables and links, and
 * embeds every screenshot as a base64 PNG/JPEG so the file stays portable. It
 * invents nothing: whatever is not in the document does not appear in the output.
 * No dependencies — the .docx is unzipped with node:zlib.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

/* ---------------------------------------------------------------- zip reader */

function readZip(buffer) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66000; i--) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a .docx (no zip end-of-central-directory record)');
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip directory');
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: (name) => entries.has(name),
    names: () => [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) throw new Error('Missing from the .docx: ' + name);
      const lh = e.localOffset;
      if (buffer.readUInt32LE(lh) !== 0x04034b50) throw new Error('Damaged zip entry: ' + name);
      const start = lh + 30 + buffer.readUInt16LE(lh + 26) + buffer.readUInt16LE(lh + 28);
      const raw = buffer.subarray(start, start + e.compressedSize);
      return e.method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    }
  };
}

/* ------------------------------------------------------------- xml utilities */

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');

/** Every <tag ...>...</tag> directly inside `xml`, in document order. */
function* blocks(xml, tag) {
  const open = new RegExp('<' + tag + '(?:\\s[^>]*)?(/?)>', 'g');
  let m;
  while ((m = open.exec(xml))) {
    if (m[1] === '/') { yield { attrs: m[0], inner: '' }; continue; }
    let depth = 1, i = open.lastIndex;
    const step = new RegExp('<(/?)' + tag + '(?:\\s[^>]*)?(/?)>', 'g');
    step.lastIndex = i;
    let s;
    while (depth > 0 && (s = step.exec(xml))) {
      if (s[1] === '/') depth--; else if (s[2] !== '/') depth++;
    }
    const end = s ? s.index : xml.length;
    yield { attrs: m[0], inner: xml.slice(i, end) };
    open.lastIndex = s ? step.lastIndex : xml.length;
  }
}

const attr = (tagText, name) => {
  const m = tagText.match(new RegExp(name.replace(':', '\\:') + '="([^"]*)"'));
  return m ? unescapeXml(m[1]) : '';
};

/* ------------------------------------------------------------- docx → html */

function relationships(zip) {
  const rels = new Map();
  const xml = zip.read('word/_rels/document.xml.rels').toString('utf8');
  for (const m of xml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    rels.set(attr(m[0], 'Id'), { target: attr(m[0], 'Target'), mode: attr(m[0], 'TargetMode') });
  }
  return rels;
}

function imageData(zip, target) {
  const name = 'word/' + target.replace(/^\.?\//, '');
  if (!zip.has(name)) return null;
  const ext = path.extname(name).toLowerCase();
  const type = ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp' : null;
  if (!type) return null;      // emf/wmf and friends cannot be shown in a browser
  return 'data:' + type + ';base64,' + zip.read(name).toString('base64');
}

/** Runs and hyperlinks of one paragraph or table cell, in order. */
function inlineHtml(inner, rels, zip, report) {
  let html = '';
  const chunk = /<w:hyperlink\b[^>]*>[\s\S]*?<\/w:hyperlink>|<w:r\b(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  for (const m of inner.match(chunk) || []) {
    if (m.startsWith('<w:hyperlink')) {
      const rel = rels.get(attr(m.slice(0, m.indexOf('>') + 1), 'r:id'));
      // Recurse on what is inside the hyperlink, never on the hyperlink itself.
      const body = inlineHtml(m.slice(m.indexOf('>') + 1, m.lastIndexOf('</w:hyperlink>')), rels, zip, report);
      const href = rel && /^https?:/i.test(rel.target) ? rel.target : '';
      html += href ? '<a href="' + escapeHtml(href) + '">' + (body || escapeHtml(href)) + '</a>' : body;
      continue;
    }
    let run = '';
    // Text and tab stops in the order Word wrote them: a Word tab separates a
    // contents entry from its page number, so losing it glues the two together.
    for (const t of m.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>/g)) {
      run += t[1] === undefined ? '\t' : escapeHtml(unescapeXml(t[1]));
    }
    run += (m.match(/<w:br\b[^>]*\/>/g) || []).map(() => '<br>').join('');
    if (run) {
      const bold = /<w:b(?:\s[^>]*)?\/>|<w:b>/.test(m);
      const italic = /<w:i(?:\s[^>]*)?\/>|<w:i>/.test(m);
      if (bold) run = '<strong>' + run + '</strong>';
      if (italic) run = '<em>' + run + '</em>';
      html += run;
    }
    for (const b of m.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)) {
      const rel = rels.get(b[1]);
      const data = rel && imageData(zip, rel.target);
      if (data) { html += '<img src="' + data + '" alt="Screenshot from the report">'; report.images++; }
      else report.skippedImages++;
    }
  }
  return html;
}

function tableHtml(inner, rels, zip, report) {
  let rows = '';
  for (const tr of blocks(inner, 'w:tr')) {
    let cells = '';
    for (const tc of blocks(tr.inner, 'w:tc')) {
      let text = '';
      for (const p of blocks(tc.inner, 'w:p')) {
        const line = inlineHtml(p.inner, rels, zip, report);
        if (line) text += (text ? '<br>' : '') + line;
      }
      cells += '<td>' + (text || '&nbsp;') + '</td>';
    }
    if (cells) rows += '<tr>' + cells + '</tr>';
  }
  return rows ? '<table>' + rows + '</table>' : '';
}

export function convert(docxPath) {
  const zip = readZip(fs.readFileSync(docxPath));
  const rels = relationships(zip);
  const xml = zip.read('word/document.xml').toString('utf8');
  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  const body = bodyMatch ? bodyMatch[1] : xml;
  const report = { images: 0, skippedImages: 0, headings: 0, paragraphs: 0, tables: 0, links: 0 };

  const parts = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) { parts.push('</ul>'); listOpen = false; } };

  // Word's table of contents is a structured-document block of plain paragraphs
  // whose page numbers mean nothing on a scrolling page. Find its span so those
  // entries can be listed without the trailing print page number.
  const tocRanges = [];
  for (const sdt of body.matchAll(/<w:sdt>[\s\S]*?<\/w:sdt>/g)) {
    if (/w:docPartGallery\s+w:val="Table of Contents"/.test(sdt[0])) {
      tocRanges.push([sdt.index, sdt.index + sdt[0].length]);
    }
  }
  const inToc = (at) => tocRanges.some(([a, b]) => at >= a && at < b);

  // Paragraphs and tables, in the order Word stores them.
  const topLevel = [...body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/g)];
  let firstHeading = true, tocOpen = false;
  const closeToc = () => { if (tocOpen) { parts.push('</ul></section>'); tocOpen = false; } };
  for (const match of topLevel) {
    const node = match[0];
    if (inToc(match.index)) {
      const text = inlineHtml(node, rels, zip, report)
        .replace(/<[^>]+>/g, '')        // a contents line carries no formatting
        .replace(/\t+\s*\d+\s*$/, '')   // drop the print page number
        .replace(/\t+/g, ' ').trim();
      if (!text) continue;
      if (!tocOpen) { closeList(); parts.push('<section class="toc"><h2>Contents</h2><ul>'); tocOpen = true; }
      parts.push('<li>' + text + '</li>');
      continue;
    }
    closeToc();
    if (node.startsWith('<w:tbl')) {
      closeList();
      const t = tableHtml(node, rels, zip, report);
      if (t) { parts.push(t); report.tables++; }
      continue;
    }
    const style = (node.match(/<w:pStyle\s+w:val="([^"]*)"/) || [, ''])[1];
    const listed = /<w:numPr>/.test(node) || /ListParagraph/i.test(style);
    const content = inlineHtml(node, rels, zip, report);
    if (!content.trim()) continue;

    const headingLevel = (() => {
      if (/^Title$/i.test(style)) return 1;
      const h = style.match(/^Heading(\d)$/i);
      return h ? Math.min(Number(h[1]), 6) : 0;
    })();

    if (headingLevel) {
      closeList();
      // The first heading becomes the document's single h1, the rest step down.
      const level = firstHeading && headingLevel === 1 ? 1 : Math.max(2, headingLevel);
      firstHeading = false;
      parts.push('<h' + level + '>' + content + '</h' + level + '>');
      report.headings++;
    } else if (listed) {
      if (!listOpen) { parts.push('<ul>'); listOpen = true; }
      parts.push('<li>' + content + '</li>');
    } else {
      closeList();
      // A paragraph holding only screenshots reads better as a figure.
      const onlyImages = /^(?:<img [^>]*>)+$/.test(content.trim());
      parts.push(onlyImages ? '<figure>' + content + '</figure>' : '<p>' + content + '</p>');
      report.paragraphs++;
    }
  }
  closeList();
  closeToc();
  report.links = (parts.join('').match(/<a href="/g) || []).length;
  return { html: parts.join('\n'), report };
}

/* --------------------------------------------------------------- standalone */

const CSS = 'body{font:16px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#21314b;background:#fff;max-width:900px;margin:0 auto;padding:36px 32px}'
  + 'h1,h2,h3{color:#16357a;line-height:1.25;margin-top:1.6em}h2{border-bottom:1px solid #e4eaf3;padding-bottom:10px}'
  + 'img{max-width:100%;height:auto;display:block;margin:18px auto;border-radius:9px}'
  + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #dfe5ee;padding:9px 12px;text-align:left}'
  + 'a{color:#16357a;overflow-wrap:anywhere}figure{margin:22px 0}section.toc{background:#f4f7fc;border:1px solid #e4eaf3;border-radius:10px;padding:4px 24px 18px}section.toc h2{border:0;font-size:18px}section.toc ul{margin:0;padding-left:20px}section.toc li{margin:4px 0}';

function main(argv) {
  const [input, output] = argv;
  if (!input) {
    console.error('Usage: node scripts/docx-to-report-html.mjs <input.docx> [output.html]');
    process.exit(2);
  }
  const { html, report } = convert(input);
  const title = escapeHtml(path.basename(input).replace(/\.docx$/i, ''));
  const doc = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title>'
    + '<style>' + CSS + '</style></head><body>\n' + html + '\n</body></html>\n';
  const target = output || input.replace(/\.docx$/i, '.html');
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  fs.writeFileSync(target, doc);
  const mb = (Buffer.byteLength(doc) / 1048576).toFixed(2);
  console.log('Wrote ' + target + '  ' + mb + ' MB');
  console.log('  headings ' + report.headings + ', paragraphs ' + report.paragraphs
    + ', lists/tables ' + report.tables + ', links ' + report.links
    + ', images ' + report.images + (report.skippedImages ? ' (' + report.skippedImages + ' unsupported image format skipped)' : ''));
  if (Buffer.byteLength(doc) > 3_500_000) {
    console.error('  WARNING: over the 3.5 MB upload limit. Compress the screenshots in Word first.');
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
