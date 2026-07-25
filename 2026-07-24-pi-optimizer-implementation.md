# EVE PI Resource Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, no-backend web page that ranks the most profitable planets/resources to extract PI materials from, across selected EVE Online regions/constellations, with configurable drills, planet count, sale commission, constellation subscription fee, and fuel economics.

**Architecture:** Vanilla JS ES modules, no framework, no build step. Business logic lives in small pure-function modules under `src/` (CSV parsing, optimization, economics, HTML-string rendering), each covered by `node:test` unit tests. `app.js` is the only file that touches the DOM/`fetch` and wires the pure modules together; it is verified manually in a browser per the design spec's testing section.

**Tech Stack:** Plain HTML/CSS/JS (ES modules), Node.js built-in test runner (`node --test`, no npm install required — Node 18+ ships it). No package.json needed.

## Global Constraints

- No backend, no build step, no npm dependencies.
- Source files under `src/` use the `.mjs` extension so both the browser (`<script type="module">` / `import`) and `node --test` treat them as ES modules unambiguously.
- Serve the site over HTTP for manual testing (e.g. `python -m http.server 8000`), never open `index.html` via `file://` — `fetch()` of local files is blocked under that scheme.
- All money values are ISK. Month = 30 days = 720 hours; hourly-equivalent of a monthly charge = `monthly / 720`.
- Commission rates: contract = 0.08, market = 0.13. Commission is disabled by default.
- Fuel: `GJ_needed_per_hour = modules × 9000 / 24 = modules × 375`. Modules ∈ {1, 2}. Fuel is enabled by default with 1 module.
- Subscription fee: user-entered value in **millions**, multiplied by 1,000,000 to get ISK. Default 500 (→ 500,000,000 ISK), charged once per 720-hour month. Enabled by default.
- Default planet count N = 6. Default drills per planet D = 26.
- One resource is extracted per planet at a time; the optimizer always picks each planet's single best-revenue resource.
- Two independent computations are produced per interaction: one using average price, one using lowest price (`priceKey` = `'avg'` or `'low'`).

---

## File Structure

- `src/csv.mjs` — CSV line/file parsing, pure functions.
- `src/csv.test.mjs` — tests for the above.
- `src/optimizer.mjs` — row filtering, revenue calc, best-resource-per-planet, top-N selection.
- `src/optimizer.test.mjs` — tests for the above.
- `src/economics.mjs` — fuel allocation, commission/subscription/net-profit math.
- `src/economics.test.mjs` — tests for the above.
- `src/render.mjs` — pure HTML-string builders for the results tables/summary.
- `src/render.test.mjs` — tests for the above.
- `index.html` — page shell and controls.
- `style.css` — layout/styling.
- `app.js` — DOM wiring, fetches data, calls the `src/*` modules, renders results. Not unit tested (manual browser verification only, per design).
- `data/resources.csv` — copy of the user-provided `resources.csv`.
- `data/planetary-production.csv` — copy of the user-provided `Eve Planetary Production.xlsx - Planetary Production.csv`.

---

### Task 1: CSV parsing (`src/csv.mjs`)

**Files:**
- Create: `src/csv.mjs`
- Test: `src/csv.test.mjs`

**Interfaces:**
- Produces:
  - `parseCsvLine(line: string): string[]` — splits one CSV line into fields, honoring double-quoted fields (including embedded commas and doubled `""` escapes).
  - `parseResources(csvText: string): Map<string, {name: string, m3: number, avg: number|null, low: number|null, energy: number|null}>` — keyed by resource name.
  - `parsePlanetRows(csvText: string): Array<{planetId: string, region: string, constellation: string, system: string, planetName: string, planetType: string, resource: string, richness: string, output: number}>`.

- [ ] **Step 1: Write the failing tests**

Create `src/csv.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/csv.test.mjs`
Expected: FAIL — `src/csv.mjs` does not exist yet (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

Create `src/csv.mjs`:

```js
export function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function splitLines(text) {
  return text.split(/\r\n|\n/).filter((line) => line.length > 0);
}

function toNullableFloat(field) {
  if (field === undefined || field === '') return null;
  return parseFloat(field);
}

export function parseResources(csvText) {
  const lines = splitLines(csvText);
  const resources = new Map();
  for (const line of lines.slice(1)) {
    const [name, m3, avg, low, energy] = parseCsvLine(line);
    const trimmedName = name.trim();
    resources.set(trimmedName, {
      name: trimmedName,
      m3: parseFloat(m3),
      avg: toNullableFloat(avg),
      low: toNullableFloat(low),
      energy: toNullableFloat(energy),
    });
  }
  return resources;
}

export function parsePlanetRows(csvText) {
  const lines = splitLines(csvText);
  const rows = [];
  for (const line of lines.slice(1)) {
    const [planetId, region, constellation, system, planetName, planetType, resource, richness, output] =
      parseCsvLine(line);
    if (!planetId) continue;
    rows.push({
      planetId: planetId.trim(),
      region: region.trim(),
      constellation: constellation.trim(),
      system: system.trim(),
      planetName: planetName.trim(),
      planetType: planetType.trim(),
      resource: resource.trim(),
      richness: richness.trim(),
      output: parseFloat(output.replace(',', '.')),
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/csv.test.mjs`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/csv.mjs src/csv.test.mjs
git commit -m "feat: add CSV parsing for resources and planet production data"
```

---

### Task 2: Optimization core (`src/optimizer.mjs`)

**Files:**
- Create: `src/optimizer.mjs`
- Test: `src/optimizer.test.mjs`

**Interfaces:**
- Consumes: planet rows shaped like `parsePlanetRows`'s output; resources shaped like `parseResources`'s output (`Map<string, {avg, low, energy, ...}>`).
- Produces:
  - `computeRowRevenue(row: {output: number}, resource: {avg: number|null, low: number|null}|undefined, drills: number, priceKey: 'avg'|'low'): number|null`.
  - `filterRows(rows: Array<{region: string, constellation: string}>, opts?: {regions?: string[], constellations?: string[]}): Array` — empty/omitted arrays mean "no filter".
  - `bestResourcePerPlanet(rows, resources: Map, drills: number, priceKey: 'avg'|'low'): Array<{planetId, region, constellation, system, planetName, planetType, resource, richness, outputPerDrill: number, unitsPerHour: number, price: number, energy: number|null, revenue: number}>` — one entry per distinct `planetId`, the highest-revenue resource on that planet.
  - `topNPlanets(bestPerPlanet: Array<{revenue: number}>, n: number): Array` — sorted by `revenue` descending, sliced to `n`.

- [ ] **Step 1: Write the failing tests**

Create `src/optimizer.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/optimizer.test.mjs`
Expected: FAIL — `src/optimizer.mjs` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/optimizer.mjs`:

```js
export function computeRowRevenue(row, resource, drills, priceKey) {
  if (!resource) return null;
  const price = priceKey === 'avg' ? resource.avg : resource.low;
  if (price === null || price === undefined) return null;
  return row.output * drills * price;
}

export function filterRows(rows, { regions = [], constellations = [] } = {}) {
  return rows.filter((row) => {
    if (regions.length > 0 && !regions.includes(row.region)) return false;
    if (constellations.length > 0 && !constellations.includes(row.constellation)) return false;
    return true;
  });
}

export function bestResourcePerPlanet(rows, resources, drills, priceKey) {
  const best = new Map();
  for (const row of rows) {
    const resource = resources.get(row.resource);
    const revenue = computeRowRevenue(row, resource, drills, priceKey);
    if (revenue === null) continue;
    const existing = best.get(row.planetId);
    if (existing && revenue <= existing.revenue) continue;
    const price = priceKey === 'avg' ? resource.avg : resource.low;
    best.set(row.planetId, {
      planetId: row.planetId,
      region: row.region,
      constellation: row.constellation,
      system: row.system,
      planetName: row.planetName,
      planetType: row.planetType,
      resource: row.resource,
      richness: row.richness,
      outputPerDrill: row.output,
      unitsPerHour: row.output * drills,
      price,
      energy: resource.energy,
      revenue,
    });
  }
  return Array.from(best.values());
}

export function topNPlanets(bestPerPlanet, n) {
  return [...bestPerPlanet].sort((a, b) => b.revenue - a.revenue).slice(0, n);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/optimizer.test.mjs`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/optimizer.mjs src/optimizer.test.mjs
git commit -m "feat: add planet revenue, filtering, and top-N selection"
```

---

### Task 3: Economics — fuel, commission, subscription (`src/economics.mjs`)

**Files:**
- Create: `src/economics.mjs`
- Test: `src/economics.test.mjs`

**Interfaces:**
- Consumes: planet entries shaped like `bestResourcePerPlanet`/`topNPlanets` output (`{planetId, unitsPerHour, price, energy, revenue, ...}`); resources shaped like `parseResources`'s output.
- Produces:
  - `cheapestFuelRate(resources: Map, priceKey: 'avg'|'low'): {name: string, iskPerGJ: number}|null`.
  - `allocateFuel(topPlanets: Array, resources: Map, priceKey: 'avg'|'low', gjNeededPerHour: number): {adjustedPlanets: Array<{...topPlanets[i], divertedUnits: number, sellableRevenue: number}>, fuelFromExtraction: number, fuelPurchaseCost: number, gjRemaining: number}`.
  - `applyFuel(topPlanets: Array, resources: Map, priceKey: 'avg'|'low', gjNeededPerHour: number, fuelEnabled: boolean): same shape as allocateFuel's return` — when `fuelEnabled` is false, returns every planet's full `revenue` as `sellableRevenue` with `divertedUnits: 0` and zero fuel costs.
  - `computeProfitBreakdown(adjustedPlanets: Array<{sellableRevenue: number}>, fuelPurchaseCost: number, fuelFromExtraction: number, options: {commissionEnabled?: boolean, commissionRate?: number, subscriptionEnabled?: boolean, subscriptionFeeIsk?: number}): {gross, commission, fuelFromExtraction, fuelPurchaseHour, subscriptionHour, netHour, netDay, netMonth}`.

- [ ] **Step 1: Write the failing tests**

Create `src/economics.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cheapestFuelRate, allocateFuel, applyFuel, computeProfitBreakdown } from './economics.mjs';

test('cheapestFuelRate finds the lowest ISK/GJ among energy-bearing resources', () => {
  const resources = new Map([
    ['Heavy Water', { name: 'Heavy Water', avg: 79, low: 74, energy: 2 }],
    ['Liquid Ozone', { name: 'Liquid Ozone', avg: 439, low: 475, energy: 13 }],
    ['Base Metals', { name: 'Base Metals', avg: 1055, low: 999, energy: null }],
  ]);
  const result = cheapestFuelRate(resources, 'avg');
  assert.equal(result.name, 'Liquid Ozone');
  assert.ok(Math.abs(result.iskPerGJ - 439 / 13) < 1e-9);
});

test('cheapestFuelRate returns null when no resource carries energy', () => {
  const resources = new Map([['Base Metals', { name: 'Base Metals', avg: 1055, low: 999, energy: null }]]);
  assert.equal(cheapestFuelRate(resources, 'avg'), null);
});

test('allocateFuel diverts the cheapest ISK/GJ planet first and can fully cover the need', () => {
  const topPlanets = [
    { planetId: 'P1', resource: 'Liquid Ozone', unitsPerHour: 1000, price: 439, energy: 13, revenue: 439000 },
    { planetId: 'P2', resource: 'Oxygen Isotopes', unitsPerHour: 1000, price: 4535, energy: 83, revenue: 4535000 },
  ];
  const resources = new Map([
    ['Liquid Ozone', { name: 'Liquid Ozone', avg: 439, low: 475, energy: 13 }],
    ['Oxygen Isotopes', { name: 'Oxygen Isotopes', avg: 4535, low: 3700, energy: 83 }],
  ]);
  // Liquid Ozone ISK/GJ (33.77) is cheaper than Oxygen Isotopes (54.64) -> divert from P1 first.
  const result = allocateFuel(topPlanets, resources, 'avg', 130); // 130 GJ = 10 units of Liquid Ozone
  assert.equal(result.gjRemaining, 0);
  assert.equal(result.fuelPurchaseCost, 0);
  const p1 = result.adjustedPlanets.find((p) => p.planetId === 'P1');
  const p2 = result.adjustedPlanets.find((p) => p.planetId === 'P2');
  assert.equal(p1.divertedUnits, 10);
  assert.equal(p2.divertedUnits, 0);
  assert.ok(Math.abs(result.fuelFromExtraction - 10 * 439) < 1e-9);
  assert.ok(Math.abs(p1.sellableRevenue - (439000 - 10 * 439)) < 1e-9);
  assert.equal(p2.sellableRevenue, 4535000);
});

test('allocateFuel buys the shortfall on the market when extraction cannot cover it', () => {
  const topPlanets = [
    { planetId: 'P1', resource: 'Base Metals', unitsPerHour: 1000, price: 1055, energy: null, revenue: 1055000 },
  ];
  const resources = new Map([
    ['Base Metals', { name: 'Base Metals', avg: 1055, low: 999, energy: null }],
    ['Liquid Ozone', { name: 'Liquid Ozone', avg: 439, low: 475, energy: 13 }],
  ]);
  const result = allocateFuel(topPlanets, resources, 'avg', 130); // no energy resource among topPlanets
  assert.equal(result.gjRemaining, 0);
  assert.ok(Math.abs(result.fuelPurchaseCost - 130 * (439 / 13)) < 1e-9);
  assert.equal(result.adjustedPlanets[0].divertedUnits, 0);
  assert.equal(result.adjustedPlanets[0].sellableRevenue, 1055000);
});

test('applyFuel skips diversion and cost entirely when disabled', () => {
  const topPlanets = [{ planetId: 'P1', unitsPerHour: 100, price: 10, energy: 5, revenue: 1000 }];
  const result = applyFuel(topPlanets, new Map(), 'avg', 1000, false);
  assert.equal(result.fuelPurchaseCost, 0);
  assert.equal(result.fuelFromExtraction, 0);
  assert.equal(result.adjustedPlanets[0].sellableRevenue, 1000);
  assert.equal(result.adjustedPlanets[0].divertedUnits, 0);
});

test('applyFuel delegates to allocateFuel when enabled', () => {
  const topPlanets = [{ planetId: 'P1', resource: 'Liquid Ozone', unitsPerHour: 1000, price: 439, energy: 13, revenue: 439000 }];
  const resources = new Map([['Liquid Ozone', { name: 'Liquid Ozone', avg: 439, low: 475, energy: 13 }]]);
  const result = applyFuel(topPlanets, resources, 'avg', 130, true);
  assert.equal(result.adjustedPlanets[0].divertedUnits, 10);
});

test('computeProfitBreakdown applies commission and subscription and rolls up day/month totals', () => {
  const adjustedPlanets = [{ sellableRevenue: 100000 }, { sellableRevenue: 50000 }];
  const breakdown = computeProfitBreakdown(adjustedPlanets, 1000, 500, {
    commissionEnabled: true,
    commissionRate: 0.08,
    subscriptionEnabled: true,
    subscriptionFeeIsk: 500_000_000,
  });
  assert.equal(breakdown.gross, 150000);
  assert.ok(Math.abs(breakdown.commission - 150000 * 0.08) < 1e-9);
  assert.ok(Math.abs(breakdown.subscriptionHour - 500_000_000 / 720) < 1e-6);
  const expectedNetHour = 150000 * 0.92 - 1000 - 500_000_000 / 720;
  assert.ok(Math.abs(breakdown.netHour - expectedNetHour) < 1e-6);
  assert.ok(Math.abs(breakdown.netDay - expectedNetHour * 24) < 1e-6);
  assert.ok(Math.abs(breakdown.netMonth - expectedNetHour * 720) < 1e-6);
});

test('computeProfitBreakdown zeroes commission and subscription when disabled', () => {
  const adjustedPlanets = [{ sellableRevenue: 100000 }];
  const breakdown = computeProfitBreakdown(adjustedPlanets, 0, 0, {
    commissionEnabled: false,
    subscriptionEnabled: false,
  });
  assert.equal(breakdown.commission, 0);
  assert.equal(breakdown.subscriptionHour, 0);
  assert.equal(breakdown.netHour, 100000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/economics.test.mjs`
Expected: FAIL — `src/economics.mjs` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/economics.mjs`:

```js
export function cheapestFuelRate(resources, priceKey) {
  let best = null;
  for (const resource of resources.values()) {
    if (!resource.energy) continue;
    const price = priceKey === 'avg' ? resource.avg : resource.low;
    if (price === null || price === undefined) continue;
    const iskPerGJ = price / resource.energy;
    if (!best || iskPerGJ < best.iskPerGJ) {
      best = { name: resource.name, iskPerGJ };
    }
  }
  return best;
}

export function allocateFuel(topPlanets, resources, priceKey, gjNeededPerHour) {
  const candidates = topPlanets
    .filter((p) => p.energy)
    .map((p) => ({ ...p, iskPerGJ: p.price / p.energy }))
    .sort((a, b) => a.iskPerGJ - b.iskPerGJ);

  let remaining = gjNeededPerHour;
  const divertedUnitsByPlanet = new Map();
  let fuelFromExtraction = 0;

  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const maxUnitsByGJ = remaining / candidate.energy;
    const divertUnits = Math.min(candidate.unitsPerHour, maxUnitsByGJ);
    if (divertUnits <= 0) continue;
    divertedUnitsByPlanet.set(candidate.planetId, divertUnits);
    fuelFromExtraction += divertUnits * candidate.price;
    remaining -= divertUnits * candidate.energy;
  }

  let fuelPurchaseCost = 0;
  if (remaining > 0) {
    const cheapest = cheapestFuelRate(resources, priceKey);
    if (cheapest) {
      fuelPurchaseCost = remaining * cheapest.iskPerGJ;
      remaining = 0;
    }
  }

  const adjustedPlanets = topPlanets.map((p) => {
    const diverted = divertedUnitsByPlanet.get(p.planetId) || 0;
    return {
      ...p,
      divertedUnits: diverted,
      sellableRevenue: p.revenue - diverted * p.price,
    };
  });

  return { adjustedPlanets, fuelFromExtraction, fuelPurchaseCost, gjRemaining: remaining };
}

export function applyFuel(topPlanets, resources, priceKey, gjNeededPerHour, fuelEnabled) {
  if (!fuelEnabled) {
    return {
      adjustedPlanets: topPlanets.map((p) => ({ ...p, divertedUnits: 0, sellableRevenue: p.revenue })),
      fuelFromExtraction: 0,
      fuelPurchaseCost: 0,
      gjRemaining: 0,
    };
  }
  return allocateFuel(topPlanets, resources, priceKey, gjNeededPerHour);
}

export function computeProfitBreakdown(adjustedPlanets, fuelPurchaseCost, fuelFromExtraction, options) {
  const {
    commissionEnabled = false,
    commissionRate = 0,
    subscriptionEnabled = false,
    subscriptionFeeIsk = 0,
  } = options;

  const gross = adjustedPlanets.reduce((sum, p) => sum + p.sellableRevenue, 0);
  const commission = commissionEnabled ? gross * commissionRate : 0;
  const afterCommission = gross - commission;
  const subscriptionHour = subscriptionEnabled ? subscriptionFeeIsk / 720 : 0;
  const netHour = afterCommission - fuelPurchaseCost - subscriptionHour;

  return {
    gross,
    commission,
    fuelFromExtraction,
    fuelPurchaseHour: fuelPurchaseCost,
    subscriptionHour,
    netHour,
    netDay: netHour * 24,
    netMonth: netHour * 720,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/economics.test.mjs`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/economics.mjs src/economics.test.mjs
git commit -m "feat: add fuel allocation and profit breakdown economics"
```

---

### Task 4: HTML rendering (`src/render.mjs`)

**Files:**
- Create: `src/render.mjs`
- Test: `src/render.test.mjs`

**Interfaces:**
- Consumes: `adjustedPlanets` shaped like `applyFuel`/`allocateFuel`'s output (`{planetName, system, resource, richness, outputPerDrill, sellableRevenue, ...}`); `breakdown` shaped like `computeProfitBreakdown`'s output.
- Produces:
  - `renderPlanetsTableHtml(adjustedPlanets: Array): string` — HTML `<table>`, or an empty-state `<p>` when the array is empty.
  - `renderSummaryHtml(breakdown): string` — HTML `<dl>` cost breakdown block.

- [ ] **Step 1: Write the failing tests**

Create `src/render.test.mjs`:

```js
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
  const normalized = html.replace(/[^0-9-]/g, ' ');
  assert.match(normalized, /84000/);
  assert.match(normalized, /2016000/);
  assert.match(normalized, /60480000/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/render.test.mjs`
Expected: FAIL — `src/render.mjs` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/render.mjs`:

```js
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatIsk(value) {
  return Math.round(value).toLocaleString('uk-UA');
}

export function renderPlanetsTableHtml(adjustedPlanets) {
  if (adjustedPlanets.length === 0) {
    return '<p class="empty">Немає даних для обраних фільтрів</p>';
  }
  const rows = adjustedPlanets
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.planetName)}</td>
      <td>${escapeHtml(p.system)}</td>
      <td>${escapeHtml(p.resource)}</td>
      <td>${escapeHtml(p.richness)}</td>
      <td>${p.outputPerDrill.toFixed(2)}</td>
      <td>${formatIsk(p.sellableRevenue)}</td>
    </tr>`
    )
    .join('');
  return `<table>
    <thead><tr>
      <th>Планета</th><th>Система</th><th>Ресурс</th><th>Багатство</th>
      <th>Вихід/год/бур</th><th>ISK/год</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderSummaryHtml(breakdown) {
  return `<dl class="summary">
    <dt>Валовий дохід</dt><dd>${formatIsk(breakdown.gross)} ISK/год</dd>
    <dt>Пальне з видобутку (інфо, вже враховано вище)</dt><dd>-${formatIsk(breakdown.fuelFromExtraction)} ISK/год</dd>
    <dt>Пальне докуплене</dt><dd>-${formatIsk(breakdown.fuelPurchaseHour)} ISK/год</dd>
    <dt>Комісія</dt><dd>-${formatIsk(breakdown.commission)} ISK/год</dd>
    <dt>Абонплата</dt><dd>-${formatIsk(breakdown.subscriptionHour)} ISK/год</dd>
    <dt>Чистий прибуток / год</dt><dd>${formatIsk(breakdown.netHour)}</dd>
    <dt>Чистий прибуток / добу</dt><dd>${formatIsk(breakdown.netDay)}</dd>
    <dt>Чистий прибуток / місяць</dt><dd>${formatIsk(breakdown.netMonth)}</dd>
  </dl>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/render.test.mjs`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/render.mjs src/render.test.mjs
git commit -m "feat: add HTML rendering for results tables and profit summary"
```

---

### Task 5: Page wiring, data assets, and manual verification

**Files:**
- Create: `data/resources.csv` (copy of `resources.csv`)
- Create: `data/planetary-production.csv` (copy of `Eve Planetary Production.xlsx - Planetary Production.csv`)
- Create: `index.html`
- Create: `style.css`
- Create: `app.js`

**Interfaces:**
- Consumes: `parseResources`, `parsePlanetRows` (Task 1); `filterRows`, `bestResourcePerPlanet`, `topNPlanets` (Task 2); `applyFuel`, `computeProfitBreakdown` (Task 3); `renderPlanetsTableHtml`, `renderSummaryHtml` (Task 4).
- Produces: nothing consumed by later tasks — this is the final integration point.

- [ ] **Step 1: Copy the data files into `data/`**

```bash
mkdir -p data
cp resources.csv data/resources.csv
cp "Eve Planetary Production.xlsx - Planetary Production.csv" data/planetary-production.csv
```

- [ ] **Step 2: Verify the copies are byte-identical to the originals**

Run: `diff resources.csv data/resources.csv && diff "Eve Planetary Production.xlsx - Planetary Production.csv" data/planetary-production.csv && echo COPIES_OK`
Expected: `COPIES_OK` printed, no diff output.

- [ ] **Step 3: Create `index.html`**

```html
<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <title>EVE PI Resource Optimizer</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Оптимізатор видобутку ресурсів PI</h1>

  <section class="controls">
    <div class="control-group">
      <label for="planets-count">Кількість планет</label>
      <input type="number" id="planets-count" min="1" value="6" />

      <label for="drills-count">Кількість бурів на планету</label>
      <input type="number" id="drills-count" min="1" value="26" />
    </div>

    <div class="control-group">
      <label for="region-select">Регіони</label>
      <select id="region-select" multiple size="6"></select>

      <label for="constellation-select">Сузір'я</label>
      <select id="constellation-select" multiple size="6"></select>
    </div>

    <div class="control-group">
      <label>
        <input type="checkbox" id="commission-enabled" />
        Враховувати комісію продажу
      </label>
      <label>
        <input type="radio" name="commission-rate" value="0.08" checked />
        Контракт (8%)
      </label>
      <label>
        <input type="radio" name="commission-rate" value="0.13" />
        Ринок (13%)
      </label>
    </div>

    <div class="control-group">
      <label>
        <input type="checkbox" id="subscription-enabled" checked />
        Враховувати абонплату
      </label>
      <label for="subscription-millions">Абонплата (млн ISK / місяць)</label>
      <input type="number" id="subscription-millions" min="0" value="500" />
    </div>

    <div class="control-group">
      <label>
        <input type="checkbox" id="fuel-enabled" checked />
        Враховувати витрати на пальне
      </label>
      <label for="fuel-modules">Кількість модулів (1 або 2)</label>
      <input type="number" id="fuel-modules" min="1" max="2" value="1" />
    </div>
  </section>

  <section class="results">
    <div>
      <h2>Середня ціна</h2>
      <div id="results-avg"></div>
    </div>
    <div>
      <h2>Мінімальна ціна</h2>
      <div id="results-low"></div>
    </div>
  </section>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `style.css`**

```css
body {
  font-family: system-ui, sans-serif;
  margin: 2rem;
  color: #1a1a1a;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #ccc;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 12rem;
}

.results {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.results > div {
  flex: 1;
  min-width: 20rem;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 1rem;
}

th, td {
  border: 1px solid #ccc;
  padding: 0.35rem 0.5rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

th:first-child, td:first-child,
th:nth-child(2), td:nth-child(2),
th:nth-child(3), td:nth-child(3),
th:nth-child(4), td:nth-child(4) {
  text-align: left;
}

.summary {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem 1rem;
}

.summary dt {
  color: #555;
}

.summary dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.empty {
  color: #777;
  font-style: italic;
}
```

- [ ] **Step 5: Create `app.js`**

```js
import { parseResources, parsePlanetRows } from './src/csv.mjs';
import { filterRows, bestResourcePerPlanet, topNPlanets } from './src/optimizer.mjs';
import { applyFuel, computeProfitBreakdown } from './src/economics.mjs';
import { renderPlanetsTableHtml, renderSummaryHtml } from './src/render.mjs';

const state = { resources: new Map(), rows: [] };

const els = {
  planetsCount: document.getElementById('planets-count'),
  drillsCount: document.getElementById('drills-count'),
  regionSelect: document.getElementById('region-select'),
  constellationSelect: document.getElementById('constellation-select'),
  commissionEnabled: document.getElementById('commission-enabled'),
  subscriptionEnabled: document.getElementById('subscription-enabled'),
  subscriptionMillions: document.getElementById('subscription-millions'),
  fuelEnabled: document.getElementById('fuel-enabled'),
  fuelModules: document.getElementById('fuel-modules'),
  resultsAvg: document.getElementById('results-avg'),
  resultsLow: document.getElementById('results-low'),
};

function selectedCommissionRate() {
  const checked = document.querySelector('input[name="commission-rate"]:checked');
  return checked ? Number(checked.value) : 0;
}

function selectedValues(selectEl) {
  return Array.from(selectEl.selectedOptions).map((o) => o.value);
}

async function loadData() {
  const [resourcesText, rowsText] = await Promise.all([
    fetch('data/resources.csv').then((r) => r.text()),
    fetch('data/planetary-production.csv').then((r) => r.text()),
  ]);
  state.resources = parseResources(resourcesText);
  state.rows = parsePlanetRows(rowsText);
}

function populateFilterOptions() {
  const regions = [...new Set(state.rows.map((r) => r.region))].sort();
  const constellations = [...new Set(state.rows.map((r) => r.constellation))].sort();
  for (const region of regions) {
    const opt = document.createElement('option');
    opt.value = region;
    opt.textContent = region;
    els.regionSelect.appendChild(opt);
  }
  for (const constellation of constellations) {
    const opt = document.createElement('option');
    opt.value = constellation;
    opt.textContent = constellation;
    els.constellationSelect.appendChild(opt);
  }
}

function computeAndRender() {
  const n = Number(els.planetsCount.value) || 0;
  const drills = Number(els.drillsCount.value) || 0;
  const regions = selectedValues(els.regionSelect);
  const constellations = selectedValues(els.constellationSelect);
  const commissionEnabled = els.commissionEnabled.checked;
  const commissionRate = selectedCommissionRate();
  const subscriptionEnabled = els.subscriptionEnabled.checked;
  const subscriptionFeeIsk = Number(els.subscriptionMillions.value || 0) * 1_000_000;
  const fuelEnabled = els.fuelEnabled.checked;
  const modules = Number(els.fuelModules.value) || 0;
  const gjNeededPerHour = (modules * 9000) / 24;

  const filtered = filterRows(state.rows, { regions, constellations });

  const targets = [
    ['avg', els.resultsAvg],
    ['low', els.resultsLow],
  ];

  for (const [priceKey, container] of targets) {
    const best = bestResourcePerPlanet(filtered, state.resources, drills, priceKey);
    const top = topNPlanets(best, n);
    const { adjustedPlanets, fuelFromExtraction, fuelPurchaseCost } = applyFuel(
      top,
      state.resources,
      priceKey,
      gjNeededPerHour,
      fuelEnabled
    );
    const breakdown = computeProfitBreakdown(adjustedPlanets, fuelPurchaseCost, fuelFromExtraction, {
      commissionEnabled,
      commissionRate,
      subscriptionEnabled,
      subscriptionFeeIsk,
    });
    container.innerHTML = renderPlanetsTableHtml(adjustedPlanets) + renderSummaryHtml(breakdown);
  }
}

function attachListeners() {
  const controls = [
    els.planetsCount,
    els.drillsCount,
    els.regionSelect,
    els.constellationSelect,
    els.commissionEnabled,
    els.subscriptionEnabled,
    els.subscriptionMillions,
    els.fuelEnabled,
    els.fuelModules,
    ...document.querySelectorAll('input[name="commission-rate"]'),
  ];
  for (const el of controls) {
    el.addEventListener('change', computeAndRender);
  }
}

async function init() {
  await loadData();
  populateFilterOptions();
  attachListeners();
  computeAndRender();
}

init();
```

- [ ] **Step 6: Serve the site locally**

Run: `python3 -m http.server 8000` (from the project root, in the background or a separate terminal)
Expected: server listening on `http://localhost:8000/`.

- [ ] **Step 7: Manually verify against the known 0FC-ZX figures (no economics)**

In a browser, open `http://localhost:8000/index.html`. Set:
- Кількість планет = 6, Кількість бурів = 26
- Сузір'я = `0FC-ZX` only
- Uncheck "Враховувати комісію продажу", "Враховувати абонплату", "Враховувати витрати на пальне"

Expected "Середня ціна" table (top row first): `30-YOU IV / Opulent Compound / Perfect / 39.25 / 887 835`, and the table's 6 rows matching, in order: 30-YOU IV, LP1M-Q V, LP1M-Q VIII, MKIG-5 IX, E-JCUS V, LP1M-Q III — these are the same six planets and revenue figures already hand-verified earlier in this project (see `docs/superpowers/specs/2026-07-24-pi-optimizer-design.md`).

- [ ] **Step 8: Manually verify one economics scenario by hand**

With the same filter (0FC-ZX, N=6, D=26), check "Враховувати комісію продажу" (ринок, 13%), "Враховувати абонплату" (500 млн), "Враховувати витрати на пальне" (1 модуль). Confirm in the browser:
- `gross` in the "Середня ціна" summary equals the sum of the 6 planets' `ISK/год` column (after any fuel diversion) — cross-check by adding the visible table column.
- `Комісія` ≈ `gross × 0.13`.
- `Абонплата` ≈ `500,000,000 / 720` ≈ `694,444`.
- `Пальне докуплене` + `Пальне з видобутку` together account for `375 GJ/год` (1 module × 9000 / 24) worth of fuel at the cheapest available ISK/GJ rate among the 6 selected resources (or the market fallback if none of them carry `energy`).
- `Чистий прибуток / год` equals `gross × 0.87 − Пальне докуплене − 694,444`.

- [ ] **Step 9: Run the full unit test suite one more time**

Run: `node --test src/`
Expected: PASS — all tests from Tasks 1-4 green (25 tests total).

- [ ] **Step 10: Commit**

```bash
git add data/resources.csv data/planetary-production.csv index.html style.css app.js
git commit -m "feat: wire up the PI optimizer web page and data assets"
```

---

## Self-Review Notes

- **Spec coverage:** N/D controls (Task 5 Step 3), region/constellation multi-select filters (Task 2 `filterRows` + Task 5 wiring), avg/low dual computation (Task 5 `computeAndRender` loop), one-resource-per-planet + top-N (Task 2), commission on/off + 8%/13% (Task 3 + Task 5), subscription on/off + editable millions, default 500 (Task 3 `subscriptionFeeIsk` + Task 5 `#subscription-millions`), fuel on/off + 1/2 modules + cheapest-first self-sufficiency + market shortfall purchase (Task 3 `allocateFuel`/`applyFuel`), empty-state message (Task 4 `renderPlanetsTableHtml`), N-exceeds-available handled implicitly by `Array.prototype.slice` in `topNPlanets`.
- **Placeholder scan:** none found — every step has runnable code and concrete expected output.
- **Type consistency:** `price`, `energy`, `unitsPerHour`, `revenue`, `planetId` field names are produced in Task 2 and consumed unchanged in Task 3; `sellableRevenue`, `divertedUnits` are produced in Task 3 and consumed unchanged in Task 4; `priceKey` is always the string literal `'avg'` or `'low'` throughout.
