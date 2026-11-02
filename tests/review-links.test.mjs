import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryOf, parseLinks, titleFromUrl, shortUrl} from '../lib/review-links.ts';

const page = p => 'https://usahomeimprovement.com' + p;

// --- Putting a flat list back into sections --------------------------------

test('each section of the site is recognised from the address alone', () => {
  assert.equal(categoryOf(page('/homeowners-resources/impact-doors-faqs/')), 'Blog posts');
  assert.equal(categoryOf(page('/service-areas/weston/')), 'Service areas');
  assert.equal(categoryOf(page('/roofing/metal-roofing/')), 'Roofing');
  assert.equal(categoryOf(page('/interior-doors/french-doors/')), 'Interior doors');
  assert.equal(categoryOf(page('/impact-windows/boca-raton/')), 'Impact windows');
});

test('a section hub page sits with the section, not on its own', () => {
  // /roofing/ is one segment like /reviews is, but it heads a section.
  assert.equal(categoryOf(page('/roofing/')), 'Roofing');
  assert.equal(categoryOf(page('/interior-doors')), 'Interior doors');
});

test('a page standing alone at the top level is not given a section of its own', () => {
  // Otherwise every one-off page adds a filter chip matching a single row.
  assert.equal(categoryOf(page('/reviews')), 'Other pages');
  assert.equal(categoryOf(page('/')), 'Other pages');
  assert.equal(categoryOf(page('')), 'Other pages');
});

test('a section nobody has named yet still gets a readable name', () => {
  // The team adds folders without telling the dashboard about them.
  assert.equal(categoryOf(page('/window-replacement/miami/')), 'Window replacement');
});

test('a Google Business Profile share link is its own kind of thing', () => {
  assert.equal(categoryOf('https://share.google/abc123'), 'Google Business Profile');
});

test('something that is not an address does not throw', () => {
  assert.equal(categoryOf('not a url'), 'Other pages');
  assert.equal(categoryOf(''), 'Other pages');
});

test('every page in one pasted section lands in the same group', () => {
  const links = parseLinks([
    page('/service-areas/weston/'),
    page('/service-areas/naples/'),
    page('/service-areas/miami-beach/')
  ].join('\n'));
  const groups = new Set(links.map(l => categoryOf(l.url)));
  assert.deepEqual([...groups], ['Service areas']);
});

// --- Reading a pasted list -------------------------------------------------

test('bullets, numbering and trailing commas are read through', () => {
  const links = parseLinks(`1. ${page('/roofing/')},\n• ${page('/reviews')};\n   - ${page('/service-areas/naples/')}`);
  assert.equal(links.length, 3);
  assert.equal(links[0].url, page('/roofing/'));
});

test('a heading in the paste is skipped rather than losing the list', () => {
  const links = parseLinks(`# SERVICE AREA PAGES (2)\n${page('/service-areas/naples/')}\n${page('/service-areas/weston/')}`);
  assert.equal(links.length, 2);
});

test('the same page twice is listed once', () => {
  const links = parseLinks(`${page('/roofing/')}\n${page('/roofing/')}`);
  assert.equal(links.length, 1);
});

test('a page is named from its own address when nobody typed a title', () => {
  assert.equal(titleFromUrl(page('/service-areas/miami-beach/')), 'Service Areas — Miami Beach');
  assert.equal(shortUrl('https://www.usahomeimprovement.com/roofing/'), 'usahomeimprovement.com/roofing');
});
