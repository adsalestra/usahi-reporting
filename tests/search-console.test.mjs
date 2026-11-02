import test from 'node:test';
import assert from 'node:assert/strict';
import {isBranded, stepFor, bucketStart, toSeries, summarise, trend, brandPattern} from '../lib/search-console.ts';

const BRAND = ['usa hi', 'usahi', 'usa home improvement', 'gousahi'];

// --- Telling the company's own name apart from real demand ----------------

test('a search that names the company counts as branded, however it is typed', () => {
  for (const q of ['usa hi', 'USA HI windows', 'usahi', 'USAHI impact doors',
                   'usa  home   improvement', 'gousahi.com', 'usa home improvement reviews'])
    assert.equal(isBranded(q, BRAND), true, q + ' should be branded');
});

test('a search for the work itself is not branded', () => {
  for (const q of ['impact windows miami', 'hurricane doors cost', 'roof replacement boca raton',
                   'usa building code', 'home improvement loans florida'])
    assert.equal(isBranded(q, BRAND), false, q + ' should not be branded');
});

test('spacing inside the brand name does not decide the answer', () => {
  // Someone typing "usahi" and someone typing "usa hi" mean the same company.
  assert.equal(isBranded('usahi windows', ['usa hi']), true);
  assert.equal(isBranded('usa hi windows', ['usahi']), true);
});

test('an empty brand term never marks everything branded', () => {
  assert.equal(isBranded('impact windows', ['', '  ']), false);
});

// --- The pattern sent to Search Console -----------------------------------

test('the brand pattern survives a term with regex characters in it', () => {
  const pattern = brandPattern(['usa hi', 'gousahi.com']);
  assert.ok(pattern.includes('usa\\s*hi'));
  assert.ok(pattern.includes('gousahi\\.com'));
  // Unanchored, so it matches part of a search however Search Console reads it.
  assert.ok(pattern.startsWith('.*(') && pattern.endsWith(').*'));
  assert.doesNotThrow(() => new RegExp(pattern));
});

test('the pattern matches the same searches the local check does', () => {
  const re = new RegExp(brandPattern(BRAND), 'i');
  for (const q of ['usa hi windows', 'USAHI', 'gousahi'])
    assert.equal(re.test(q), isBranded(q, BRAND), q);
  for (const q of ['impact windows miami', 'roof repair'])
    assert.equal(re.test(q), isBranded(q, BRAND), q);
});

// --- How far apart the points on the chart sit ----------------------------

test('the step follows the span, so a quarter is not drawn day by day', () => {
  assert.equal(stepFor('2026-10-01', '2026-10-07'), 'day');
  assert.equal(stepFor('2026-10-01', '2026-10-31'), 'day');
  assert.equal(stepFor('2026-08-04', '2026-11-01'), 'week');   // the 90 day view
  assert.equal(stepFor('2025-11-01', '2026-11-01'), 'month');
});

test('a week starts on Monday and a month on the first', () => {
  assert.equal(bucketStart('2026-11-01', 'day'), '2026-11-01');
  assert.equal(bucketStart('2026-11-01', 'week'), '2026-10-26');  // a Sunday belongs to the week before
  assert.equal(bucketStart('2026-10-26', 'week'), '2026-10-26');  // the Monday itself
  assert.equal(bucketStart('2026-10-27', 'week'), '2026-10-26');
  assert.equal(bucketStart('2026-11-17', 'month'), '2026-11-01');
});

// --- Building the line -----------------------------------------------------

test('a week with no searches is drawn as zero, not skipped', () => {
  // A missing bucket would let the line run straight through the gap and hide it.
  const points = toSeries(
    [{date: '2026-08-04', clicks: 10, impressions: 100, position: 8}],
    [],
    '2026-08-04', '2026-09-01'
  );
  assert.ok(points.length >= 4);
  assert.equal(points[0].nonBranded, 10);
  assert.ok(points.slice(1).every(p => p.nonBranded === 0));
});

test('points come back in date order whatever order the rows arrived in', () => {
  const points = toSeries(
    [{date: '2026-10-20', clicks: 5, impressions: 50, position: 9},
     {date: '2026-10-05', clicks: 3, impressions: 30, position: 7}],
    [], '2026-10-01', '2026-10-25'
  );
  const dates = points.map(p => p.period);
  assert.deepEqual([...dates].sort(), dates);
});

test('the two series land on the same points, so the lines line up', () => {
  const points = toSeries(
    [{date: '2026-10-05', clicks: 4, impressions: 40, position: 9}],
    [{date: '2026-10-05', clicks: 7, impressions: 20, position: 2}],
    '2026-10-01', '2026-10-10'
  );
  const day = points.find(p => p.period === '2026-10-05');
  assert.equal(day.nonBranded, 4);
  assert.equal(day.branded, 7);
});

test('days inside one week are added together, not drawn separately', () => {
  const rows = ['2026-08-04', '2026-08-05', '2026-08-06']
    .map(date => ({date, clicks: 2, impressions: 20, position: 5}));
  const points = toSeries(rows, [], '2026-08-04', '2026-11-01');  // 90 days, so weekly
  const first = points.find(p => p.period === '2026-08-03');
  assert.equal(first.nonBranded, 6);
  assert.equal(first.impressions, 60);
});

// --- The totals ------------------------------------------------------------

test('average position is weighted by impressions, not by day', () => {
  // One impression at position 1 must not cancel a thousand at position 20.
  const t = summarise([
    {clicks: 0, impressions: 1, position: 1},
    {clicks: 0, impressions: 999, position: 20}
  ]);
  assert.ok(t.position > 19.9, 'got ' + t.position);
});

test('nothing recorded reads as no rate rather than as zero', () => {
  const t = summarise([]);
  assert.equal(t.clicks, 0);
  assert.equal(t.ctr, null);
  assert.equal(t.position, null);
});

// --- Is it improving? ------------------------------------------------------

test('the trend compares the first half of the range with the last', () => {
  const points = [10, 10, 20, 20].map((n, i) => ({period: 'p' + i, label: '', branded: 0, nonBranded: n, impressions: 0}));
  const t = trend(points);
  assert.equal(t.first, 20);
  assert.equal(t.second, 40);
  assert.equal(t.change, 1);           // doubled
});

test('growth from nothing is reported as no percentage, not as infinity', () => {
  const points = [0, 0, 5, 5].map((n, i) => ({period: 'p' + i, label: '', branded: 0, nonBranded: n, impressions: 0}));
  assert.equal(trend(points).change, null);
});

test('a single point makes no trend at all', () => {
  assert.equal(trend([{period: 'p', label: '', branded: 0, nonBranded: 9, impressions: 0}]).change, null);
});

test('an odd number of points still splits into two equal halves', () => {
  const points = [1, 2, 3, 4, 5].map((n, i) => ({period: 'p' + i, label: '', branded: 0, nonBranded: n, impressions: 0}));
  const t = trend(points);
  assert.equal(t.first, 3);            // 1 + 2, the middle point counted in neither
  assert.equal(t.second, 9);           // 4 + 5
});
