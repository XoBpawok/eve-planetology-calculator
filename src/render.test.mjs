import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPlanetsTableHtml, renderSummaryHtml } from './render.mjs';

test('renderPlanetsTableHtml shows an empty-state message when there are no planets', () => {
  const html = renderPlanetsTableHtml([]);
  assert.match(html, /Немає даних/);
});

test('renderPlanetsTableHtml renders one row per planet with its key figures', () => {
  const html = renderPlanetsTableHtml([
    {
      planetName: '30-YOU IV',
      system: '30-YOU',
      resource: 'Opulent Compound',
      richness: 'Perfect',
      outputPerDrill: 39.25,
      sellableRevenue: 887835,
    },
  ]);
  assert.match(html, /30-YOU IV/);
  assert.match(html, /30-YOU</);
  assert.match(html, /Opulent Compound/);
  assert.match(html, /Perfect/);
  assert.match(html, /39\.25/);
});

test('renderPlanetsTableHtml escapes HTML-sensitive characters in data', () => {
  const html = renderPlanetsTableHtml([
    {
      planetName: '<script>',
      system: 'S',
      resource: 'R',
      richness: 'Medium',
      outputPerDrill: 1,
      sellableRevenue: 1,
    },
  ]);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;/);
});

test('renderSummaryHtml includes labeled net profit figures', () => {
  const html = renderSummaryHtml({
    gross: 100000,
    fuelFromExtraction: 1000,
    fuelPurchaseHour: 2000,
    commission: 8000,
    subscriptionHour: 5000,
    netHour: 84000,
    netDay: 2016000,
    netMonth: 60480000,
  });
  assert.match(html, /Чистий прибуток/);
  const normalized = html.replace(/[^0-9-]/g, '');
  assert.match(normalized, /84000/);
  assert.match(normalized, /2016000/);
  assert.match(normalized, /60480000/);
});
