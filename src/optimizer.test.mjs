import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRowRevenue, filterRows, bestResourcePerPlanet, topNPlanets } from './optimizer.mjs';

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

test('bestResourcePerPlanet keeps only the highest-revenue resource per planet', () => {
  const rows = [
    { planetId: 'P1', region: 'R', constellation: 'C', system: 'S', planetName: 'P1n', planetType: 'Barren', resource: 'A', richness: 'Medium', output: 1 },
    { planetId: 'P1', region: 'R', constellation: 'C', system: 'S', planetName: 'P1n', planetType: 'Barren', resource: 'B', richness: 'Rich', output: 10 },
    { planetId: 'P2', region: 'R', constellation: 'C', system: 'S', planetName: 'P2n', planetType: 'Lava', resource: 'A', richness: 'Medium', output: 5 },
  ];
  const resources = new Map([
    ['A', { name: 'A', m3: 0.01, avg: 100, low: 90, energy: null }],
    ['B', { name: 'B', m3: 0.01, avg: 5, low: 5, energy: null }],
  ]);
  const result = bestResourcePerPlanet(rows, resources, 1, 'avg');
  assert.equal(result.length, 2);
  const p1 = result.find((r) => r.planetId === 'P1');
  const p2 = result.find((r) => r.planetId === 'P2');
  assert.equal(p1.resource, 'A'); // 1*1*100=100 beats 10*1*5=50
  assert.equal(p1.revenue, 100);
  assert.equal(p1.unitsPerHour, 1);
  assert.equal(p1.price, 100);
  assert.equal(p2.resource, 'A');
  assert.equal(p2.revenue, 500);
});

test('topNPlanets sorts by revenue descending and slices to n', () => {
  const planets = [{ revenue: 10 }, { revenue: 50 }, { revenue: 30 }];
  assert.deepEqual(topNPlanets(planets, 2).map((p) => p.revenue), [50, 30]);
});

test('topNPlanets returns everything when n exceeds the list length', () => {
  const planets = [{ revenue: 10 }, { revenue: 50 }];
  assert.equal(topNPlanets(planets, 10).length, 2);
});
