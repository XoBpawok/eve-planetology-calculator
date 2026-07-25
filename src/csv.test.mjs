import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvLine, parseResources, parsePlanetRows } from './csv.mjs';

test('parseCsvLine splits plain comma-separated fields', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('parseCsvLine keeps commas inside quoted fields intact', () => {
  assert.deepEqual(
    parseCsvLine('40033094,Wicked Creek,"24,84",end'),
    ['40033094', 'Wicked Creek', '24,84', 'end']
  );
});

test('parseCsvLine treats a trailing comma as an empty final field', () => {
  assert.deepEqual(parseCsvLine('a,b,'), ['a', 'b', '']);
});

test('parseResources reads a row with missing price and energy as null', () => {
  const csv =
    'Resource,cubic metre per 1,price avarage,price lowest,energy\r\n' +
    'Polytextiles,0.02,320,,\r\n';
  const resources = parseResources(csv);
  assert.deepEqual(resources.get('Polytextiles'), {
    name: 'Polytextiles',
    m3: 0.02,
    avg: 320,
    low: null,
    energy: null,
  });
});

test('parseResources reads a row with all fields present', () => {
  const csv =
    'Resource,cubic metre per 1,price avarage,price lowest,energy\r\n' +
    'Heavy Water,0.01,79,74,2\r\n';
  const resources = parseResources(csv);
  assert.deepEqual(resources.get('Heavy Water'), {
    name: 'Heavy Water',
    m3: 0.01,
    avg: 79,
    low: 74,
    energy: 2,
  });
});

test('parsePlanetRows converts comma-decimal quoted Output to a number', () => {
  const csv =
    'Planet ID,Region,Constellation,System,Planet Name,Planet Type,Resource,Richness,Output,\r\n' +
    '40033094,Wicked Creek,0FC-ZX,MKIG-5,MKIG-5 I,Lava,Gleaming Alloy,Medium,"24,84",\r\n';
  const rows = parsePlanetRows(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].output, 24.84);
  assert.equal(rows[0].planetName, 'MKIG-5 I');
  assert.equal(rows[0].constellation, '0FC-ZX');
  assert.equal(rows[0].resource, 'Gleaming Alloy');
});
