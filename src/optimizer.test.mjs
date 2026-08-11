import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRowRevenue, filterRows, selectTopPlanets } from './optimizer.mjs';

test('computeRowRevenue multiplies output by drills and the chosen price', () => {
  const row = { output: 1.62 };
  const resource = { avg: 10798, low: 10200 };
  assert.equal(computeRowRevenue(row, resource, 26, 'avg'), 1.62 * 26 * 10798);
  assert.equal(computeRowRevenue(row, resource, 26, 'low'), 1.62 * 26 * 10200);
});

test('computeRowRevenue returns null when the chosen price is missing', () => {
  const row = { output: 1 };
  const resource = { avg: null, low: 320 };
  assert.equal(computeRowRevenue(row, resource, 26, 'avg'), null);
});

test('computeRowRevenue returns null when the resource is unknown', () => {
  assert.equal(computeRowRevenue({ output: 1 }, undefined, 26, 'avg'), null);
});

test('filterRows filters by region and by constellation, empty means no filter', () => {
  const rows = [
    { region: 'Wicked Creek', constellation: '0FC-ZX' },
    { region: 'Cache', constellation: 'MRC-29' },
  ];
  assert.deepEqual(filterRows(rows, { regions: ['Cache'] }), [rows[1]]);
  assert.deepEqual(filterRows(rows, { constellations: ['0FC-ZX'] }), [rows[0]]);
  assert.deepEqual(filterRows(rows), rows);
  assert.deepEqual(filterRows(rows, { regions: [], constellations: [] }), rows);
});

test('filterRows filters by resource, empty means no filter', () => {
  const rows = [
    { region: 'R', constellation: 'C', resource: 'Base Metals' },
    { region: 'R', constellation: 'C', resource: 'Noble Gas' },
  ];
  assert.deepEqual(filterRows(rows, { resources: ['Noble Gas'] }), [rows[1]]);
  assert.deepEqual(filterRows(rows, { resources: [] }), rows);
});

test('selectTopPlanets picks each planet\'s best resource and returns top n by revenue, descending', () => {
  const rows = [
    { planetId: 'P1', region: 'R', constellation: 'C', system: 'S', planetName: 'P1n', planetType: 'Barren', resource: 'A', richness: 'Medium', output: 1 },
    { planetId: 'P1', region: 'R', constellation: 'C', system: 'S', planetName: 'P1n', planetType: 'Barren', resource: 'B', richness: 'Rich', output: 10 },
    { planetId: 'P2', region: 'R', constellation: 'C', system: 'S', planetName: 'P2n', planetType: 'Lava', resource: 'A', richness: 'Medium', output: 5 },
  ];
  const resources = new Map([
    ['A', { name: 'A', m3: 0.01, avg: 100, low: 90, energy: null }],
    ['B', { name: 'B', m3: 0.02, avg: 5, low: 5, energy: null }],
  ]);
  const result = selectTopPlanets(rows, resources, 1, 'avg', 10);
  assert.equal(result.length, 2);
  // P2/A = 5*1*100 = 500 beats P1/A = 1*1*100 = 100 (P1/B = 10*1*5 = 50, so P1's best is A)
  assert.deepEqual(result.map((r) => r.planetId), ['P2', 'P1']);
  assert.equal(result[0].resource, 'A');
  assert.equal(result[0].revenue, 500);
  assert.equal(result[1].resource, 'A');
  assert.equal(result[1].revenue, 100);
  assert.equal(result[1].unitsPerHour, 1);
  assert.equal(result[1].price, 100);
  assert.equal(result[1].m3, 0.01);
});

test('selectTopPlanets slices to n and returns everything when n exceeds available planets', () => {
  const rows = [
    { planetId: 'P1', resource: 'A', output: 1 },
    { planetId: 'P2', resource: 'A', output: 2 },
    { planetId: 'P3', resource: 'A', output: 3 },
  ];
  const resources = new Map([['A', { avg: 10, low: 10, energy: null, m3: 0.01 }]]);
  assert.equal(selectTopPlanets(rows, resources, 1, 'avg', 2).length, 2);
  assert.equal(selectTopPlanets(rows, resources, 1, 'avg', 10).length, 3);
});

test('selectTopPlanets falls back to the next-best (planet, resource) pair globally when a resource cap is hit', () => {
  // P1/Fuel=900 and P2/Fuel=800 both want Fuel; cap=1 means only the higher one gets it.
  // P2's fallback is its own Ore=750. P3/Ore=700 is uncapped and would rank between them.
  const rows = [
    { planetId: 'P1', resource: 'Fuel', output: 9 },
    { planetId: 'P2', resource: 'Fuel', output: 8 },
    { planetId: 'P2', resource: 'Ore', output: 7.5 },
    { planetId: 'P3', resource: 'Ore', output: 7 },
  ];
  const resources = new Map([
    ['Fuel', { avg: 100, low: 100, energy: 1, m3: 0.4 }],
    ['Ore', { avg: 100, low: 100, energy: null, m3: 0.1 }],
  ]);
  const result = selectTopPlanets(rows, resources, 1, 'avg', 10, { Fuel: 1 });
  assert.deepEqual(
    result.map((r) => [r.planetId, r.resource, r.revenue]),
    [
      ['P1', 'Fuel', 900],
      ['P2', 'Ore', 750],
      ['P3', 'Ore', 700],
    ]
  );
});

test('selectTopPlanets returns fewer than n when no fallback exists for a capped-out planet', () => {
  // Both planets only produce Fuel; cap=1 leaves P2 with nothing to fall back to.
  const rows = [
    { planetId: 'P1', resource: 'Fuel', output: 9 },
    { planetId: 'P2', resource: 'Fuel', output: 8 },
  ];
  const resources = new Map([['Fuel', { avg: 100, low: 100, energy: 1, m3: 0.4 }]]);
  const result = selectTopPlanets(rows, resources, 1, 'avg', 10, { Fuel: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].planetId, 'P1');
});
