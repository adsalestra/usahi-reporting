import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanReport} from '../lib/sanitize.ts';
import {reportDocument} from '../lib/report-document.ts';

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
