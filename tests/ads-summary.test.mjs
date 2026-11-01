import test from 'node:test';
import assert from 'node:assert/strict';
import {toTable, summary, number, tableKey, resolveTab} from '../lib/ads.ts';

// 46322 is the Google Sheets serial for 2026-10-27; the reader asks for serials
// so a sheet set to a d/m/Y locale can never be read as a different month.
const SERIAL_27_OCT_2026 = 46322;

test('a date serial becomes the right ISO day', () => {
  const t = toTable([['Date', 'Cost'], [SERIAL_27_OCT_2026, 12.5]]);
  assert.equal(t.rows[0].Date, '2026-10-27');
});

test('text dates are still understood in both common shapes', () => {
  assert.equal(toTable([['Date'], ['2026-10-27']]).rows[0].Date, '2026-10-27');
  assert.equal(toTable([['Date'], ['10/27/2026']]).rows[0].Date, '2026-10-27');
});

test('blank rows are dropped, headers trimmed', () => {
  const t = toTable([[' Date ', 'Cost'], ['', ''], [SERIAL_27_OCT_2026, 1]]);
  assert.deepEqual(t.headers, ['Date', 'Cost']);
  assert.equal(t.rows.length, 1);
});

test('number() survives currency and thousands separators', () => {
  assert.equal(number('$1,234.56'), 1234.56);
  assert.equal(number(''), 0);
  assert.equal(number('n/a'), 0);
  assert.equal(number(42), 42);
});

test('tab names map to the keys the summary reads', () => {
  assert.equal(tableKey('Data - Google Ads Summary'), 'google_ads_summary');
  assert.equal(tableKey('Sheet Summary'), 'sheet_summary');
  assert.equal(tableKey('Opportunities'), 'opportunities');
});

const tables = {
  google_ads_summary: toTable([
    ['Date', 'Cost', 'Clicks', 'Impressions', 'Conversions'],
    ['2026-10-01', 100, 10, 500, 2],
    ['2026-10-15', 50, 5, 250, 1],
    ['2026-11-02', 999, 99, 999, 9]   // outside the range on purpose
  ]),
  sheet_summary: toTable([
    ['Date', 'Total Leads', 'Form Submissions', 'Total Calls'],
    ['2026-10-01', 4, 1, 3],
    ['2026-10-15', 2, 2, 0]
  ]),
  campaigns: toTable([
    ['Date', 'Campaign', 'Cost', 'Clicks', 'Impressions', 'Conversions'],
    ['2026-10-01', 'Windows', 60, 6, 300, 1],
    ['2026-10-15', 'Windows', 40, 4, 200, 1],
    ['2026-10-15', 'Roofing', 50, 5, 250, 1]
  ]),
  keywords: toTable([
    ['Date', 'Keyword', 'Cost', 'Clicks', 'Impressions', 'Conversions'],
    ['2026-10-01', 'impact windows', 30, 3, 150, 1]
  ]),
  leads: toTable([
    ['Date', 'Name', 'Data Source', 'Campaign', 'Lead Type', 'Duration'],
    ['2026-10-01', 'A Caller', 'CallRail', 'Windows', 'Call', '240'],
    ['2026-11-02', 'Out Of Range', 'CallRail', 'Windows', 'Call', '10']
  ]),
  opportunities: toTable([
    ['Created Date', 'Stage', 'HI Sale Price', 'Opportunity Name'],
    ['2026-10-05', 'Estimate Given', '$8,000', 'A Caller - Windows'],
    ['2026-11-05', 'Closed Won', '$9,000', 'Later Opp']
  ])
};

test('the range filter excludes days outside from..to', () => {
  const s = summary(tables, '2026-10-01', '2026-10-31');
  assert.equal(s.ads.Cost, 150);
  assert.equal(s.ads.Clicks, 15);
  assert.equal(s.ads.Conversions, 3);
  assert.equal(s.calls['Total Leads'], 6);
  assert.equal(s.leads.length, 1);
  assert.equal(s.opportunities.length, 1);
});

test('campaigns are grouped and sorted by spend', () => {
  const s = summary(tables, '2026-10-01', '2026-10-31');
  assert.equal(s.campaigns.length, 2);
  assert.equal(s.campaigns[0].Campaign, 'Windows');
  assert.equal(s.campaigns[0].Cost, 100);
  assert.equal(s.campaigns[1].Campaign, 'Roofing');
});

test('opportunity value is read from the sale price column', () => {
  const s = summary(tables, '2026-10-01', '2026-10-31');
  assert.equal(s.opportunities[0].value, 8000);
  assert.equal(s.opportunities[0].stage, 'Estimate Given');
});

test('a missing tab yields empty output rather than a crash', () => {
  const s = summary({}, '2026-10-01', '2026-10-31');
  assert.deepEqual(s.ads, {});
  assert.deepEqual(s.campaigns, []);
  assert.deepEqual(s.leads, []);
});

test('the payload names its source and never claims cohort attribution', () => {
  const s = summary(tables, '2026-10-01', '2026-10-31');
  assert.equal(s.source, 'Google Sheets (read only)');
  assert.ok(!('wonRevenueByLeadMonth' in s));
});

// --- Salesforce tabs: counted as the sheet stands, never joined to each other ---

const withSalesforce = {
  ...tables,
  salesforce_leads: toTable([
    ['Create Date', 'Lead Source', 'Converted'],
    ['2026-10-02', 'Google Ads', 'true'],
    ['2026-10-09', 'Google Ads', 'false'],
    ['2026-10-20', 'Referral', '1'],
    ['2026-09-30', 'Google Ads', 'true'],   // just before the range
    ['not a date', 'Google Ads', 'true']    // the team will have to fix this row
  ]),
  opportunities: toTable([
    ['Created Date', 'Stage', 'HI Sale Price', 'Opportunity Name', 'Lead Source', 'Contract Effective Date', 'Lead Created'],
    ['2026-10-05', 'Estimate Given', '$8,000', 'A Caller - Windows', 'Google Ads', '', '2026-09-28'],
    ['2026-10-18', 'Closed Won', '$12,500', 'B Caller - Doors', 'Referral', '2026-10-25', '2026-10-01'],
    ['2026-10-22', 'Estimate Given', '$4,000', 'C Caller - Windows', 'Google Ads', '', '2026-10-20'],
    ['2026-11-05', 'Closed Won', '$9,000', 'Later Opp', 'Google Ads', '2026-11-09', '2026-11-01']
  ])
};

test('salesforce leads are counted on their own Create Date', () => {
  const s = summary(withSalesforce, '2026-10-01', '2026-10-31');
  assert.equal(s.salesforce.dateColumn, 'Create Date');
  assert.equal(s.salesforce.leads, 3);          // the September row is outside the range
  assert.equal(s.salesforce.converted, 2);      // "true" and "1" count, "false" does not
});

test('rows with an unreadable date are reported, not silently dropped', () => {
  const s = summary(withSalesforce, '2026-10-01', '2026-10-31');
  assert.equal(s.salesforce.unreadableDates, 1);
});

test('converted is a subset of leads, so nobody is counted twice', () => {
  const s = summary(withSalesforce, '2026-10-01', '2026-10-31');
  assert.ok(s.salesforce.converted <= s.salesforce.leads);
});

test('a missing Salesforce Leads tab reads as absent, not as zero leads', () => {
  assert.equal(summary(tables, '2026-10-01', '2026-10-31').salesforce, null);
});

test('opportunities keep their source, close date and lead-created date', () => {
  const s = summary(withSalesforce, '2026-10-01', '2026-10-31');
  const won = s.opportunities.find(o => o.stage === 'Closed Won');
  assert.equal(won.source, 'Referral');
  assert.equal(won.close, '2026-10-25');
  assert.equal(won.leadCreated, '2026-10-01');
});

test('stage totals carry the average and the cost of one, as the portal does', () => {
  const s = summary(withSalesforce, '2026-10-01', '2026-10-31');
  assert.deepEqual(s.oppStages, [
    { stage: 'Estimate Given', count: 2, value: 12000, average: 6000, costPerOne: 75 },
    { stage: 'Closed Won', count: 1, value: 12500, average: 12500, costPerOne: 150 }
  ]);
});

test('an opportunity is never moved into the month of its lead', () => {
  // The first opportunity was raised in October from a September lead. The
  // date-range view must report it under October, where it was raised.
  const october = summary(withSalesforce, '2026-10-01', '2026-10-31');
  const september = summary(withSalesforce, '2026-09-01', '2026-09-30');
  assert.ok(october.opportunities.some(o => o.name === 'A Caller - Windows'));
  assert.equal(september.opportunities.length, 0);
});

// --- The portal's own Opportunities screen, kept to its own definitions ----

test('stages are matched on the portal’s own words, loosely', () => {
  const t = {
    ...withSalesforce,
    opportunities: toTable([
      ['Created Date', 'Stage', 'HI Sale Price'],
      ['2026-10-02', 'Estimate Given - follow up', '1000'],
      ['2026-10-03', 'CLOSED WON', '2000'],
      ['2026-10-04', 'Closed Lost', '500'],
      ['2026-10-05', 'Needs Estimate', '3000']   // "estimate" but not "estimate given"
    ])
  };
  const s = summary(t, '2026-10-01', '2026-10-31');
  assert.equal(s.oppTotals.estimates, 1);
  assert.equal(s.oppTotals.won, 1);
  assert.equal(s.oppTotals.count, 4);
});

test('the tiles report counts, their value, and the won share', () => {
  const s = summary(withSalesforce, '2026-10-01', '2026-10-31');
  assert.equal(s.oppTotals.count, 3);
  assert.equal(s.oppTotals.value, 24500);        // every stage, quoted not earned
  assert.equal(s.oppTotals.estimates, 2);
  assert.equal(s.oppTotals.estimateValue, 12000);
  assert.equal(s.oppTotals.won, 1);
  assert.equal(s.oppTotals.wonValue, 12500);
  assert.equal(s.oppTotals.wonShare, 1 / 3);
});

test('every ratio is priced against all of the Google Ads spend', () => {
  const s = summary(withSalesforce, '2026-10-01', '2026-10-31');
  assert.equal(s.oppTotals.spend, 150);
  assert.equal(s.oppTotals.roas, 12500 / 150);
  assert.equal(s.oppTotals.pipelineRoas, 24500 / 150);
  assert.equal(s.oppTotals.costPerEstimate, 75);
  assert.equal(s.oppTotals.costPerWon, 150);
});

test('nothing logged reads as a dash, not as having earned nothing', () => {
  // No spend and no opportunity rows: the portal shows a dash, not 0.00x.
  const empty = summary(withSalesforce, '2026-12-01', '2026-12-31');
  assert.equal(empty.oppTotals.count, 0);
  assert.equal(empty.oppTotals.roas, null);
  assert.equal(empty.oppTotals.pipelineRoas, null);
  assert.equal(empty.oppTotals.costPerEstimate, null);
  assert.equal(empty.oppTotals.costPerWon, null);
  assert.equal(empty.oppTotals.wonShare, null);
});

test('rows with spend but no win genuinely are zero, not a dash', () => {
  const t = {
    ...withSalesforce,
    opportunities: toTable([
      ['Created Date', 'Stage', 'HI Sale Price'],
      ['2026-10-01', 'Estimate Given', '5000']
    ])
  };
  const s = summary(t, '2026-10-01', '2026-10-31');
  assert.equal(s.oppTotals.roas, 0);
  assert.equal(s.oppTotals.pipelineRoas, 5000 / 150);
});

// --- Month by month: six money columns, three bases, counts kept apart ----

test('the month table ignores the chosen dates and covers the whole history', () => {
  const narrow = summary(withSalesforce, '2026-10-01', '2026-10-02');
  assert.deepEqual(narrow.monthly.map(m => m.month), ['2026-11', '2026-10', '2026-09']);
});

test('every opportunity counts as an estimate, whatever stage it reached', () => {
  // October raised three opportunities worth 8,000 + 12,500 + 4,000. "Est: by
  // opp date" is all of that, not only the two sitting at Estimate Given.
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  const oct = s.monthly.find(m => m.month === '2026-10');
  assert.equal(oct.opps, 3);
  assert.equal(oct.estOpp, 24500);
});

test('the money columns are sums of money, and the counts stay separate', () => {
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  const oct = s.monthly.find(m => m.month === '2026-10');
  assert.equal(oct.won, 1);              // a count
  assert.equal(oct.wonOpp, 12500);       // the money behind it
  assert.equal(oct.lost, 0);
  assert.equal(oct.leads, 3);
  assert.equal(oct.converted, 2);
});

test('same-month money is a subset of the cohort, never larger', () => {
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  for (const m of s.monthly) {
    assert.ok(m.estSame <= m.estCohort, m.month + ': estSame exceeded estCohort');
    assert.ok(m.wonSame <= m.wonCohort, m.month + ': wonSame exceeded wonCohort');
  }
});

test('a September lead quoted in October lands in September’s cohort only', () => {
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  const sep = s.monthly.find(m => m.month === '2026-09');
  const oct = s.monthly.find(m => m.month === '2026-10');
  assert.equal(sep.estCohort, 8000);   // the money its lead eventually became
  assert.equal(sep.estSame, 0);        // but it was not quoted that same month
  assert.equal(sep.opps, 0);           // and no opportunity was raised in September
  assert.equal(oct.estSame, 16500);    // October's own two, quoted the month they arrived
  assert.equal(oct.estCohort, 16500);
});

test('a deal sold the month its lead arrived is counted as same-month', () => {
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  const oct = s.monthly.find(m => m.month === '2026-10');
  assert.equal(oct.wonSame, 12500);    // lead 1 Oct, contract effective 25 Oct
  assert.equal(oct.wonCohort, 12500);
  assert.equal(oct.wonOpp, 12500);
});

test('a deal signed later than its lead month is cohort but not same-month', () => {
  const t = {
    ...withSalesforce,
    opportunities: toTable([
      ['Created Date', 'Stage', 'HI Sale Price', 'Lead Created', 'Contract Effective Date'],
      ['2026-10-18', 'Closed Won', '5000', '2026-09-02', '2026-10-25'],   // lead Sep, signed Oct
      ['2026-10-19', 'Closed Won', '7000', '2026-10-01', '']              // signed, no contract date
    ])
  };
  const s = summary(t, '2026-01-01', '2026-12-31');
  const oct = s.monthly.find(m => m.month === '2026-10');
  const sep = s.monthly.find(m => m.month === '2026-09');
  assert.equal(oct.wonOpp, 12000);     // both opportunities were raised in October
  assert.equal(oct.wonCohort, 7000);   // only one came from an October lead
  assert.equal(sep.wonCohort, 5000);   // the other belongs to September's cohort
  assert.equal(oct.wonSame, 0);        // neither was signed the month its lead arrived
  assert.equal(sep.wonSame, 0);
});

test('the derived columns match the portal: inbound, still, and the rates', () => {
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  const oct = s.monthly.find(m => m.month === '2026-10');
  assert.equal(oct.still, 1);              // 3 leads less the 2 marked converted
  assert.equal(oct.inbound, 4);            // those plus the 3 opportunities raised
  assert.equal(oct.stillEstimates, 2);     // 3 opportunities, 1 won, 0 lost
  assert.equal(oct.oppPerLead, 3 / 4);
  assert.equal(oct.wonPerOpp, 1 / 3);
});

test('a month with no leads reports no rate rather than dividing by zero', () => {
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  const sep = s.monthly.find(m => m.month === '2026-09');
  assert.equal(sep.inbound, 0);
  assert.equal(sep.oppPerLead, null);
  assert.equal(sep.wonPerOpp, null);
});

test('no single unqualified revenue figure is ever produced', () => {
  const s = summary(withSalesforce, '2026-01-01', '2026-12-31');
  const oct = s.monthly.find(m => m.month === '2026-10');
  for (const key of ['wonSame', 'wonCohort', 'wonOpp']) assert.ok(key in oct, key + ' is missing');
  assert.ok(!('revenue' in oct));
  assert.ok(!('wonValue' in oct));
});

// --- Which tab holds the real rows -----------------------------------------

// The live spreadsheet carries both: a hidden "Data - Campaigns" of raw daily
// rows, and a visible "Campaigns" that is a date-filtered view of it. The view
// opens with a date-range caption, so reading it yields a header row of
// ["Date range", "2026-09-01", "to", ...] and every metric totals zero.
const LIVE_TABS = [
  'Date Range', 'Salesforce Leads', 'Reports', 'Updates', 'Replies',
  'Opportunities', 'Google Ads Summary', 'Sheet Summary', 'Campaigns',
  'Keywords', 'Leads', 'Sheet1', 'Data - Google Ads Summary',
  'Data - Sheet Summary', 'Data - Campaigns', 'Data - Keywords',
  'Data - Leads', 'Run Log'
];

test('the hidden raw tab is preferred over the filtered view of it', () => {
  assert.equal(resolveTab('Google Ads Summary', LIVE_TABS), 'Data - Google Ads Summary');
  assert.equal(resolveTab('Campaigns', LIVE_TABS), 'Data - Campaigns');
  assert.equal(resolveTab('Keywords', LIVE_TABS), 'Data - Keywords');
  assert.equal(resolveTab('Leads', LIVE_TABS), 'Data - Leads');
  assert.equal(resolveTab('Sheet Summary', LIVE_TABS), 'Data - Sheet Summary');
});

test('tabs with no raw twin are read under their own name', () => {
  assert.equal(resolveTab('Opportunities', LIVE_TABS), 'Opportunities');
  assert.equal(resolveTab('Salesforce Leads', LIVE_TABS), 'Salesforce Leads');
});

test('a tab that is absent resolves to nothing rather than being guessed', () => {
  assert.equal(resolveTab('Keywords', ['Opportunities']), '');
});

test('both names land in the same place once read', () => {
  assert.equal(tableKey('Data - Google Ads Summary'), tableKey('Google Ads Summary'));
  assert.equal(tableKey('Data - Campaigns'), 'campaigns');
});

test('the filtered view would have produced exactly the zeros that were seen', () => {
  // Row 1 of the visible tab is the caption, row 2 the real header, row 3 a
  // TOTAL. Read as-is, "Cost" is not a column at all, so spend reads zero
  // while the sheet plainly shows 46,608.
  const view = toTable([
    ['Date range', '2026-09-01', 'to', '2026-11-01'],
    ['Date', 'Cost', 'Impressions', 'Clicks'],
    ['TOTAL', 46608.01, 856658, 11311],
    ['2026-09-01', 628.16, 11555, 183]
  ]);
  assert.ok(!view.headers.includes('Cost'));
  const s = summary({ google_ads_summary: view }, '2026-09-01', '2026-11-01');
  assert.equal(s.ads.Cost ?? 0, 0);
});
