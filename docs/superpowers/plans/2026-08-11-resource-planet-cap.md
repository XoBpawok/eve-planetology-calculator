# Ліміт кількості планет на ресурс Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user cap, per resource, how many planets in the top-N
selection may extract that resource (e.g. max 1 planet of fuel), with the
optimizer falling back to the next-highest-revenue (planet, resource) pair
globally when a cap is hit.

**Architecture:** Replace the two-step `bestResourcePerPlanet` +
`topNPlanets` pipeline in `src/optimizer.mjs` with a single greedy
selection function, `selectTopPlanets`, that scores every (planet,
resource) row and walks them in revenue-descending order, skipping rows
whose planet is already selected or whose resource has hit its cap. Wire a
small number input per resource into the existing `#resource-select`
checklist in `app.js`, read it the same way existing checklist filters are
read, and persist it alongside `savedFilters` in localStorage.

**Tech Stack:** Vanilla JS (ES modules), Node's built-in `node:test` +
`node:assert/strict`, no build step, no framework.

## Global Constraints

- No build step, no new dependencies — plain ES modules only.
- `node --test src/*.test.mjs` must pass after every task.
- Ukrainian is the UI language for all user-facing strings.
- Number inputs for planet/drill counts elsewhere in this app use `change`
  (not `input`) to trigger recompute — stay consistent.
- The resource limit input must not toggle the resource checkbox when
  clicked (both live inside the same `<label class="checklist__item">`).

---

### Task 1: `selectTopPlanets` replaces `bestResourcePerPlanet` + `topNPlanets`

**Files:**
- Modify: `src/optimizer.mjs:17-48` (replace `bestResourcePerPlanet` and
  `topNPlanets` with `selectTopPlanets`)
- Test: `src/optimizer.test.mjs:1-73` (replace the two functions' tests
  with tests for `selectTopPlanets`; keep the `computeRowRevenue` and
  `filterRows` tests as-is)

**Interfaces:**
- Consumes: `computeRowRevenue(row, resource, drills, priceKey)` (already
  defined in `src/optimizer.mjs`, unchanged) — returns `number | null`.
- Produces: `selectTopPlanets(rows, resources, drills, priceKey, n,
  resourceLimits = {})` → `Array<{ planetId, region, constellation,
  system, planetName, planetType, resource, richness, outputPerDrill,
  unitsPerHour, price, energy, m3, revenue }>`, sorted by `revenue`
  descending, length ≤ `n`. `resourceLimits` is a plain object mapping
  resource name → positive integer cap; a resource absent from the object
  is uncapped. `resources` is a `Map<string, { avg, low, energy, m3 }>` as
  produced by `parseResources` in `src/csv.mjs` (unchanged).

- [ ] **Step 1: Write the failing tests**

Replace lines 42-73 of `src/optimizer.test.mjs` (the `bestResourcePerPlanet`
and `topNPlanets` tests) with:

```js
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
```

Also update the import line at the top of `src/optimizer.test.mjs`:

```js
import { computeRowRevenue, filterRows, selectTopPlanets } from './optimizer.mjs';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/optimizer.test.mjs`
Expected: FAIL — `selectTopPlanets is not defined` (or import error), since
`src/optimizer.mjs` doesn't export it yet.

- [ ] **Step 3: Replace `bestResourcePerPlanet`/`topNPlanets` with `selectTopPlanets`**

In `src/optimizer.mjs`, delete lines 17-48 (the `bestResourcePerPlanet` and
`topNPlanets` functions) and replace them with:

```js
export function selectTopPlanets(rows, resources, drills, priceKey, n, resourceLimits = {}) {
  const scored = [];
  for (const row of rows) {
    const resource = resources.get(row.resource);
    const revenue = computeRowRevenue(row, resource, drills, priceKey);
    if (revenue === null) continue;
    scored.push({ row, resource, revenue });
  }
  scored.sort((a, b) => b.revenue - a.revenue);

  const selectedPlanetIds = new Set();
  const resourceCounts = new Map();
  const result = [];
  for (const { row, resource, revenue } of scored) {
    if (result.length >= n) break;
    if (selectedPlanetIds.has(row.planetId)) continue;
    const limit = resourceLimits[row.resource];
    const count = resourceCounts.get(row.resource) || 0;
    if (limit != null && count >= limit) continue;

    selectedPlanetIds.add(row.planetId);
    resourceCounts.set(row.resource, count + 1);
    const price = priceKey === 'avg' ? resource.avg : resource.low;
    result.push({
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
      m3: resource.m3,
      revenue,
    });
  }
  return result;
}
```

`computeRowRevenue` and `filterRows` (lines 1-15) stay unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/optimizer.test.mjs`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full test suite to check nothing else broke**

Run: `node --test src/*.test.mjs`
Expected: PASS (this only touches `optimizer.mjs`; `economics.test.mjs`,
`csv.test.mjs`, `render.test.mjs` are unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/optimizer.mjs src/optimizer.test.mjs
git commit -m "feat: add per-resource cap support to planet selection

Replace bestResourcePerPlanet + topNPlanets with a single selectTopPlanets
that greedily fills the top-N by revenue across ALL (planet, resource)
pairs, honoring an optional per-resource cap and falling back to the next
best pair globally (not just the same planet) when a cap is hit."
```

---

### Task 2: Wire per-resource limit inputs into the UI

**Files:**
- Modify: `app.js` (see specific line ranges below)
- Modify: `style.css` (add limit-input styling near `.checklist__icon`,
  `style.css:397-404`)

**Interfaces:**
- Consumes: `selectTopPlanets(rows, resources, drills, priceKey, n,
  resourceLimits)` from Task 1.
- Produces: no new exports (this is all internal to `app.js`); adds a new
  internal helper `resourceLimitValues(container)`.

- [ ] **Step 1: Add `resourceLimitValues` helper**

In `app.js`, right after `checkedChecklistValues` (currently
`app.js:133-135`), add:

```js
// Reads the per-resource planet caps from the number inputs rendered
// alongside each resource checkbox. Empty inputs mean "no cap" and are
// omitted from the result entirely.
function resourceLimitValues(container) {
  const limits = {};
  container.querySelectorAll('.checklist__limit').forEach((input) => {
    if (input.value === '') return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 1) return;
    limits[input.dataset.resource] = value;
  });
  return limits;
}
```

- [ ] **Step 2: Extend `renderChecklistOptions` to optionally render a limit input**

Replace the current `renderChecklistOptions` function (`app.js:137-161`)
with:

```js
function renderChecklistOptions(container, values, isChecked, getIconUrl, getLimit) {
  container.innerHTML = '';
  for (const value of values) {
    const label = document.createElement('label');
    label.className = 'checklist__item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.checked = isChecked(value);
    label.appendChild(input);
    const iconUrl = getIconUrl?.(value);
    if (iconUrl) {
      const img = document.createElement('img');
      img.src = iconUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.className = 'checklist__icon';
      label.appendChild(img);
    }
    const span = document.createElement('span');
    span.className = 'checklist__label';
    span.textContent = value;
    label.appendChild(span);
    if (getLimit) {
      const limitInput = document.createElement('input');
      limitInput.type = 'number';
      limitInput.className = 'checklist__limit';
      limitInput.min = '1';
      limitInput.step = '1';
      limitInput.placeholder = '∞';
      limitInput.title = 'Максимум планет з цим ресурсом';
      limitInput.dataset.resource = value;
      const limit = getLimit(value);
      if (limit != null) limitInput.value = limit;
      label.appendChild(limitInput);
    }
    container.appendChild(label);
  }
}
```

(This adds `className = 'checklist__label'` to the existing `span` so it
can be targeted independently from the new limit input in CSS — a plain
`span` selector would otherwise also match nothing new, but naming it
keeps the flex layout rules unambiguous.)

- [ ] **Step 3: Pass a `getLimit` callback when rendering the resource checklist**

In `populateFilterOptions` (`app.js:260-276`), the resource checklist call
currently reads:

```js
  renderChecklistOptions(
    els.resourceSelect,
    resourceNames,
    (v) => (savedResources ? savedResources.has(v) : true),
    (v) => state.resourceIcons.get(v)
  );
```

Replace it with:

```js
  const savedLimits = state.savedFilters?.resourceLimits || {};
  renderChecklistOptions(
    els.resourceSelect,
    resourceNames,
    (v) => (savedResources ? savedResources.has(v) : true),
    (v) => state.resourceIcons.get(v),
    (v) => (Object.prototype.hasOwnProperty.call(savedLimits, v) ? savedLimits[v] : null)
  );
```

In `resetFiltersToDefault` (`app.js:278-286`), the resource checklist call
currently reads:

```js
  renderChecklistOptions(els.resourceSelect, resourceNames, () => true, (v) => state.resourceIcons.get(v));
```

Replace it with:

```js
  renderChecklistOptions(els.resourceSelect, resourceNames, () => true, (v) => state.resourceIcons.get(v), () => null);
```

(The region and constellation calls in both functions are untouched — they
don't pass a 5th argument, so `getLimit` stays `undefined` and no limit
input is rendered for them.)

- [ ] **Step 4: Persist resource limits alongside filters**

In `persistState` (`app.js:202-215`), the `filters` object currently
reads:

```js
    filters: {
      regions: checkedChecklistValues(els.regionSelect),
      constellations: checkedChecklistValues(els.constellationSelect),
      resources: checkedChecklistValues(els.resourceSelect),
    },
```

Replace it with:

```js
    filters: {
      regions: checkedChecklistValues(els.regionSelect),
      constellations: checkedChecklistValues(els.constellationSelect),
      resources: checkedChecklistValues(els.resourceSelect),
      resourceLimits: resourceLimitValues(els.resourceSelect),
    },
```

`loadPersistedState` (`app.js:183-200`) already assigns
`state.savedFilters = parsed.filters || null` wholesale, so
`savedFilters.resourceLimits` is picked up automatically — no change
needed there.

- [ ] **Step 5: Feed resource limits into the optimizer**

In `computeAndRender` (`app.js:363-417`), after the existing line that
reads:

```js
  const resources = checkedChecklistValues(els.resourceSelect);
```

add:

```js
  const resourceLimits = resourceLimitValues(els.resourceSelect);
```

Then in `computeBestConstellationResult` (`app.js:83-116`), replace the
body that currently reads:

```js
  let winner = null;
  for (const constellation of candidates) {
    const rows = rowsByConstellation.get(constellation);
    const best = bestResourcePerPlanet(rows, resources, drills, priceKey);
    const top = topNPlanets(best, n);
    const { adjustedPlanets, fuelFromExtraction, fuelPurchaseCost } = applyFuel(
```

with:

```js
  let winner = null;
  for (const constellation of candidates) {
    const rows = rowsByConstellation.get(constellation);
    const top = selectTopPlanets(rows, resources, drills, priceKey, n, resourceLimits);
    const { adjustedPlanets, fuelFromExtraction, fuelPurchaseCost } = applyFuel(
```

and add `resourceLimits` to that function's destructured parameter object
(the `{ rowsByConstellation, candidateConstellations, resources, drills,
priceKey, n, gjNeededPerHour, fuelEnabled, financeOptions }` signature at
`app.js:83-93`) — insert `resourceLimits,` after `n,`.

Then update its call site inside `computeAndRender` (where
`computeBestConstellationResult({...})` is invoked, currently at
`app.js:389-399`) to also pass `resourceLimits,` after `n,`.

Finally, update the import at the top of `app.js` (line 2) from:

```js
import { filterRows, bestResourcePerPlanet, topNPlanets } from './src/optimizer.mjs';
```

to:

```js
import { filterRows, selectTopPlanets } from './src/optimizer.mjs';
```

- [ ] **Step 6: Style the limit input**

In `style.css`, after the `.checklist__icon` rule (`style.css:397-404`),
add:

```css
.checklist__label {
  flex: 1 1 auto;
  min-width: 0;
}

.checklist__limit {
  flex: none;
  width: 2.75rem;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text);
  font-size: 0.82rem;
  padding: 0.1rem 0.3rem;
  text-align: center;
}

.checklist__limit:focus {
  outline: none;
  border-color: var(--cyan);
}
```

- [ ] **Step 7: Manually verify in the browser**

Run: `python3 -m http.server 8000` from the project root, then open
`http://localhost:8000/`.

Check:
1. Each row in "Ресурси для видобутку" shows a small number field with a
   "∞" placeholder.
2. Clicking directly in the number field does not toggle that resource's
   checkbox.
3. Pick a resource that appears as the top choice for several planets in
   the current results (e.g. widen N until you see duplicates of the same
   resource across rows — if every resource is already unique at your
   current N, temporarily raise "Кількість планет" until a resource
   repeats). Set its limit to `1` and confirm the results table now shows
   that resource on only one row, with the freed slot(s) filled by the
   next-best (planet, resource) pairs — the freed slot should NOT
   necessarily reuse a resource from the same planet that got dropped.
4. Reload the page and confirm the limit value you set is still there
   (persisted via localStorage) and results still reflect it.
5. Click "Скинути фільтри" and confirm the limit field goes back to empty
   (no cap) and results update accordingly.

Expected: all five checks behave as described. If step 3's fallback looks
wrong (e.g. still shows two rows of the capped resource, or drops below N
when a valid fallback exists), stop and re-check the wiring in Step 5
before continuing.

- [ ] **Step 8: Commit**

```bash
git add app.js style.css
git commit -m "feat: add per-resource planet cap input to resource checklist

Each resource in the extraction checklist gets an optional numeric cap on
how many planets in the top-N may extract it, persisted with the other
filters and fed into selectTopPlanets."
```

---

## Self-Review

**Spec coverage:**
- UI number input per resource, empty = unlimited, min 1, doesn't toggle
  checkbox, `change`-triggered recompute → Task 2, Steps 1-3, 6-7.
- `selectTopPlanets` replacing the two-function pipeline, global
  revenue-priority fallback, no-limit parity, short-selection-when-no-
  fallback → Task 1, all steps.
- Persistence alongside `savedFilters`, reset via "Скинути фільтри" →
  Task 2, Steps 3-4.
- `render.mjs`/`economics.mjs`/`csv.mjs` untouched → confirmed, no task
  modifies them.

**Placeholder scan:** No TBD/TODO markers; every step has literal code or
literal shell commands to run.

**Type consistency:** `selectTopPlanets(rows, resources, drills, priceKey,
n, resourceLimits)` signature matches between Task 1's implementation and
every Task 2 call site. `resourceLimitValues(container)` returns a plain
object (`{ [resourceName]: number }`), matching what `selectTopPlanets`
expects for `resourceLimits` and what `persistState`/`renderChecklistOptions`
read/write under `savedFilters.resourceLimits`.
