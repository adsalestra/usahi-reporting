import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanReport} from '../lib/sanitize.ts';
import {reportDocument} from '../lib/report-document.ts';
import {parseLinks, titleFromUrl} from '../lib/review-links.ts';

test('scripts and event handlers never survive an import', () => {
  const out = cleanReport('<h1>Report</h1><script>alert(1)</script><p onclick="alert(2)">Body</p>');
  assert.ok(!out.includes('script'));
  assert.ok(!out.includes('onclick'));
  assert.ok(out.includes('<h1>Report</h1>'));
  assert.ok(out.includes('Body'));
});

test('headings, tables, lists and figures are kept', () => {
  const html = '<h2>Work</h2><ul><li>One</li></ul><table><tr><th>A</th><td>1</td></tr></table>'
    + '<figure><img src="https://example.com/a.png" alt="Shot"><figcaption>Caption</figcaption></figure>';
  const out = cleanReport(html);
  for (const tag of ['<h2>', '<ul>', '<li>', '<table>', '<th>', '<td>', '<img', '<figcaption>']) {
    assert.ok(out.includes(tag), 'missing ' + tag);
  }
  assert.ok(out.includes('alt="Shot"'));
});

test('links stay, and open safely in a new tab', () => {
  const out = cleanReport('<p><a href="https://www.gousahi.com/windows">Impact windows</a></p>');
  assert.ok(out.includes('href="https://www.gousahi.com/windows"'));
  assert.ok(out.includes('target="_blank"'));
  assert.ok(out.includes('rel="noopener noreferrer"'));
});

test('javascript: links are dropped but the text survives', () => {
  const out = cleanReport('<p><a href="javascript:alert(1)">Click</a></p>');
  assert.ok(!out.includes('javascript:'));
  assert.ok(out.includes('Click'));
});

test('embedded screenshots are kept, disguised data URIs are not', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const kept = cleanReport('<img src="' + png + '" alt="Before">');
  assert.ok(kept.includes(png));
  const dropped = cleanReport('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x">');
  assert.ok(!dropped.includes('data:text/html'));
});

test('the wrapper document carries USAHI styling and no script', () => {
  const doc = reportDocument('<h1>Weekly</h1>');
  assert.ok(doc.startsWith('<!doctype html>'));
  assert.ok(doc.includes('#16357a'));
  assert.ok(doc.includes('name="viewport"'));
  assert.ok(!doc.includes('<script'));
});

test('uploading a whole .html file does not print its title or stylesheet', () => {
  // The docx converter writes a standalone document. Keeping the text inside
  // <title> and <style> would open every such report with its own file name
  // and then a wall of CSS.
  const clean = cleanReport(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<title>USA Home Improvement_ Weekly Report (27 Oct 2026)</title>' +
    '<style>body{font:16px/1.7 Arial;color:#21314b}</style></head>' +
    '<body><h1>Weekly Update</h1><p>Six pages went live.</p></body></html>'
  );
  assert.ok(!clean.includes('USA Home Improvement_'), 'the file name leaked into the report');
  assert.ok(!clean.includes('font:16px'), 'the stylesheet leaked into the report');
  assert.ok(clean.includes('<h1>Weekly Update</h1>'));
  assert.ok(clean.includes('Six pages went live.'));
});

// --- Pasting a list of pages for the client to approve ----------------------

test('a list copied out of a report is read despite its bullets and numbering', () => {
  // Real newlines inside a template literal, because that is exactly how the
  // list arrives when someone copies it out of the Word report.
  const pasted = parseLinks(`1. https://usahomeimprovement.com/impact-windows/boca-raton/
• https://usahomeimprovement.com/impact-windows/delray-beach/,
   - https://usahomeimprovement.com/impact-doors/french/ 

Service pages
https://usahomeimprovement.com/about/`);
  assert.deepEqual(pasted.map(p => p.url), [
    'https://usahomeimprovement.com/impact-windows/boca-raton/',
    'https://usahomeimprovement.com/impact-windows/delray-beach/',
    'https://usahomeimprovement.com/impact-doors/french/',
    'https://usahomeimprovement.com/about/'
  ]);
});

test('the same page pasted twice is only asked about once', () => {
  const pasted = parseLinks(`https://x.com/a/
https://x.com/a/
https://x.com/b/`);
  assert.equal(pasted.length, 2);
});

test('a page is named from its own address', () => {
  assert.equal(titleFromUrl('https://usahomeimprovement.com/impact-windows/boca-raton/'), 'Impact Windows — Boca Raton');
  assert.equal(titleFromUrl('https://usahomeimprovement.com/about/'), 'About');
  assert.equal(titleFromUrl('https://usahomeimprovement.com/'), 'Home page');
  assert.equal(titleFromUrl('https://share.google/75MQcDuaz0BkgzxC5'), 'Google Business Profile post');
});

test('text with no links in it yields nothing rather than a bad row', () => {
  assert.deepEqual(parseLinks(`Tasks done this week
mailto:someone@example.com`), []);
});
