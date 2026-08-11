import { parseResources, parsePlanetRows } from './src/csv.mjs';
import { filterRows, selectTopPlanets } from './src/optimizer.mjs';
import { applyFuel, computeProfitBreakdown } from './src/economics.mjs';
import { renderPlanetsTableHtml, renderSummaryHtml } from './src/render.mjs';

const STORAGE_KEY = 'eve-pi-optimizer-state-v1';

const state = {
  resources: new Map(),
  rows: [],
  priceOverrides: new Map(),
  savedFilters: null,
  resourceIcons: new Map(),
  lastManualPriceEditAt: null,
  echoesLatestDate: null,
};

// This week's average market price and an icon per item, sourced from the
// echoes.mobi community API. echoes.mobi doesn't send Access-Control-Allow-Origin,
// so the browser can't fetch it cross-origin directly; scripts/fetch-echoes-prices.mjs
// fetches it server-side (in CI, on every deploy) and writes this same-origin
// file instead. Used to keep "Середня ціна" current without hand-editing the
// bundled CSV, and to show an icon next to each resource name.
const ECHOES_PRICES_URL = './data/echoes-prices.json';

// Before the price-override feature existed, this is when the bundled CSV's
// market-lowest prices were last taken from the game by hand.
const MANUAL_PRICE_FALLBACK_DATE = new Date(2026, 6, 24);

function formatDateUk(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

function setPanelTitle(el, label, constellation) {
  el.textContent = '';
  el.appendChild(document.createTextNode(label));
  if (constellation) {
    const span = document.createElement('span');
    span.className = 'panel__title-suffix';
    span.textContent = ` - ${constellation}`;
    el.appendChild(span);
  }
}

const els = {
  planetsCount: document.getElementById('planets-count'),
  drillsCount: document.getElementById('drills-count'),
  regionSelect: document.getElementById('region-select'),
  constellationSelect: document.getElementById('constellation-select'),
  resourceSelect: document.getElementById('resource-select'),
  commissionEnabled: document.getElementById('commission-enabled'),
  commissionCustom: document.getElementById('commission-custom'),
  subscriptionEnabled: document.getElementById('subscription-enabled'),
  subscriptionMillions: document.getElementById('subscription-millions'),
  fuelEnabled: document.getElementById('fuel-enabled'),
  fuelModules: document.getElementById('fuel-modules'),
  resultsAvg: document.getElementById('results-avg'),
  resultsLow: document.getElementById('results-low'),
  priceList: document.getElementById('price-list'),
  priceResetAll: document.getElementById('price-reset-all'),
  filtersResetAll: document.getElementById('filters-reset-all'),
  panelTitleAvg: document.getElementById('panel-title-avg'),
  panelTitleLow: document.getElementById('panel-title-low'),
};

// Groups rows by constellation once, so each candidate constellation can be
// scored independently without re-scanning the full row set every time.
function groupByConstellation(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.constellation)) map.set(row.constellation, []);
    map.get(row.constellation).push(row);
  }
  return map;
}

// The whole point of the tool is picking ONE constellation to base every drill in,
// not cherry-picking planets across several at once. So for each candidate
// constellation we independently rank its own top-N planets, then keep whichever
// constellation comes out most profitable as a self-contained operation.
function computeBestConstellationResult({
  rowsByConstellation,
  candidateConstellations,
  resources,
  drills,
  priceKey,
  n,
  resourceLimits,
  gjNeededPerHour,
  fuelEnabled,
  financeOptions,
}) {
  const candidates = candidateConstellations.length
    ? candidateConstellations.filter((c) => rowsByConstellation.has(c))
    : [...rowsByConstellation.keys()];

  let winner = null;
  for (const constellation of candidates) {
    const rows = rowsByConstellation.get(constellation);
    const top = selectTopPlanets(rows, resources, drills, priceKey, n, resourceLimits);
    const { adjustedPlanets, fuelFromExtraction, fuelPurchaseCost } = applyFuel(
      top,
      resources,
      priceKey,
      gjNeededPerHour,
      fuelEnabled
    );
    const breakdown = computeProfitBreakdown(adjustedPlanets, fuelPurchaseCost, fuelFromExtraction, financeOptions);
    if (!winner || breakdown.netMonth > winner.breakdown.netMonth) {
      winner = { constellation, adjustedPlanets, breakdown };
    }
  }
  return winner;
}

function selectedCommissionRate() {
  const checked = document.querySelector('input[name="commission-rate"]:checked');
  if (!checked) return 0;
  if (checked.value === 'custom') {
    return (Number(els.commissionCustom.value) || 0) / 100;
  }
  return Number(checked.value);
}

// Checkbox-list widgets replace native <select multiple> so a plain click on
// one item toggles just that item, instead of wiping out the rest of the selection.
function checklistValues(container) {
  return Array.from(container.querySelectorAll('input[type="checkbox"]')).map((i) => i.value);
}

function checkedChecklistValues(container) {
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((i) => i.value);
}

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
    span.title = value;
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

// Patches icons onto an already-rendered resource checklist in place (no rebuild),
// so it doesn't clobber checkboxes the user has already toggled while the
// echoes.mobi request was still in flight.
function refreshResourceIcons() {
  els.resourceSelect.querySelectorAll('.checklist__item').forEach((item) => {
    if (item.querySelector('.checklist__icon')) return;
    const input = item.querySelector('input');
    const iconUrl = state.resourceIcons.get(input.value);
    if (!iconUrl) return;
    const img = document.createElement('img');
    img.src = iconUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.className = 'checklist__icon';
    item.insertBefore(img, item.querySelector('span'));
  });
}

let pendingSavedConstellations = null;

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.savedFilters = parsed.filters || null;
    if (parsed.priceOverrides) {
      state.priceOverrides = new Map(Object.entries(parsed.priceOverrides));
    }
    if (parsed.lastManualPriceEditAt) {
      state.lastManualPriceEditAt = parsed.lastManualPriceEditAt;
    }
    if (parsed.planetsCount) els.planetsCount.value = parsed.planetsCount;
    if (parsed.drillsCount) els.drillsCount.value = parsed.drillsCount;
  } catch {
    state.savedFilters = null;
  }
}

function persistState() {
  const payload = {
    filters: {
      regions: checkedChecklistValues(els.regionSelect),
      constellations: checkedChecklistValues(els.constellationSelect),
      resources: checkedChecklistValues(els.resourceSelect),
      resourceLimits: resourceLimitValues(els.resourceSelect),
    },
    priceOverrides: Object.fromEntries(state.priceOverrides),
    lastManualPriceEditAt: state.lastManualPriceEditAt,
    planetsCount: els.planetsCount.value,
    drillsCount: els.drillsCount.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

// Resources map used for the "Мінімальна ціна" column: the file's lowest-market-price
// column is replaced by the user's own price where they've entered one.
function effectiveLowResources() {
  if (state.priceOverrides.size === 0) return state.resources;
  const map = new Map();
  for (const [name, resource] of state.resources) {
    map.set(name, state.priceOverrides.has(name) ? { ...resource, low: state.priceOverrides.get(name) } : resource);
  }
  return map;
}

async function loadData() {
  const [resourcesText, rowsText] = await Promise.all([
    fetch('data/resources.csv').then((r) => r.text()),
    fetch('data/planetary-production.csv').then((r) => r.text()),
  ]);
  state.resources = parseResources(resourcesText);
  state.rows = parsePlanetRows(rowsText);
}

function constellationsForRegions(regions) {
  const rows = regions.length
    ? state.rows.filter((r) => regions.includes(r.region))
    : state.rows;
  return [...new Set(rows.map((r) => r.constellation))].sort();
}

function populateConstellationOptions() {
  const selectedRegions = checkedChecklistValues(els.regionSelect);
  const constellations = constellationsForRegions(selectedRegions);
  if (pendingSavedConstellations) {
    const saved = pendingSavedConstellations;
    pendingSavedConstellations = null;
    renderChecklistOptions(els.constellationSelect, constellations, (value) => saved.has(value));
    return;
  }
  const previousValues = checklistValues(els.constellationSelect);
  const previouslyChecked = new Set(checkedChecklistValues(els.constellationSelect));
  // Only items the user explicitly unchecked stay excluded; anything new defaults to checked.
  const previouslyExcluded = new Set(previousValues.filter((v) => !previouslyChecked.has(v)));
  renderChecklistOptions(els.constellationSelect, constellations, (value) => !previouslyExcluded.has(value));
}

function populateFilterOptions() {
  const regions = [...new Set(state.rows.map((r) => r.region))].sort();
  const savedRegions = state.savedFilters?.regions ? new Set(state.savedFilters.regions) : null;
  renderChecklistOptions(els.regionSelect, regions, (v) => (savedRegions ? savedRegions.has(v) : true));
  if (state.savedFilters?.constellations) {
    pendingSavedConstellations = new Set(state.savedFilters.constellations);
  }
  populateConstellationOptions();
  const resourceNames = [...new Set(state.rows.map((r) => r.resource))].sort();
  const savedResources = state.savedFilters?.resources ? new Set(state.savedFilters.resources) : null;
  const savedLimits = state.savedFilters?.resourceLimits || {};
  renderChecklistOptions(
    els.resourceSelect,
    resourceNames,
    (v) => (savedResources ? savedResources.has(v) : true),
    (v) => state.resourceIcons.get(v),
    (v) => (Object.prototype.hasOwnProperty.call(savedLimits, v) ? savedLimits[v] : null)
  );
}

function resetFiltersToDefault() {
  const regions = [...new Set(state.rows.map((r) => r.region))].sort();
  renderChecklistOptions(els.regionSelect, regions, () => true);
  const constellations = constellationsForRegions([]);
  renderChecklistOptions(els.constellationSelect, constellations, () => true);
  const resourceNames = [...new Set(state.rows.map((r) => r.resource))].sort();
  renderChecklistOptions(els.resourceSelect, resourceNames, () => true, (v) => state.resourceIcons.get(v), () => null);
  computeAndRender();
}

async function fetchEchoesResourceData() {
  const prices = new Map();
  let latestDate = null;
  try {
    const response = await fetch(ECHOES_PRICES_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) return { prices, latestDate };
    const data = await response.json();
    for (const item of data.resources ?? []) {
      const name = item.name?.trim();
      if (!name) continue;
      prices.set(name, { avgPrice: item.avgPrice ?? null, iconUrl: item.iconUrl ?? null });
    }
    const parsedLatestDate = data.latestDate ? new Date(data.latestDate) : null;
    if (parsedLatestDate && !Number.isNaN(parsedLatestDate.getTime())) latestDate = parsedLatestDate;
  } catch {
    // Offline, blocked, or data/echoes-prices.json is missing — keep the CSV's
    // average price and skip icons rather than failing the whole page.
  }
  return { prices, latestDate };
}

function applyEchoesResourceData({ prices, latestDate }) {
  for (const [name, resource] of state.resources) {
    const entry = prices.get(name);
    if (!entry) continue;
    if (entry.avgPrice !== null) resource.avg = entry.avgPrice;
    if (entry.iconUrl) state.resourceIcons.set(name, entry.iconUrl);
  }
  if (latestDate) state.echoesLatestDate = latestDate;
}

function populatePriceList() {
  const resourceNames = [...state.resources.keys()].sort();
  els.priceList.innerHTML = '';
  for (const name of resourceNames) {
    const resource = state.resources.get(name);
    const overridden = state.priceOverrides.has(name);

    const row = document.createElement('div');
    row.className = 'price-row' + (overridden ? ' price-row--overridden' : '');

    const iconUrl = state.resourceIcons.get(name);
    if (iconUrl) {
      const img = document.createElement('img');
      img.src = iconUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.className = 'price-row__icon';
      row.appendChild(img);
    }

    const label = document.createElement('span');
    label.className = 'price-row__name';
    label.textContent = name;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.min = '0';
    input.className = 'price-row__input';
    input.dataset.resource = name;
    input.value = overridden ? state.priceOverrides.get(name) : resource.low ?? '';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'price-row__reset';
    resetBtn.title = 'Скинути до стандартної ціни';
    resetBtn.dataset.resource = name;
    resetBtn.textContent = '↺';

    row.append(label, input, resetBtn);
    els.priceList.appendChild(row);
  }
}

function computeAndRender() {
  const n = Number(els.planetsCount.value) || 0;
  const drills = Number(els.drillsCount.value) || 0;
  const regions = checkedChecklistValues(els.regionSelect);
  const constellations = checkedChecklistValues(els.constellationSelect);
  const resources = checkedChecklistValues(els.resourceSelect);
  const resourceLimits = resourceLimitValues(els.resourceSelect);
  const commissionEnabled = els.commissionEnabled.checked;
  const commissionRate = selectedCommissionRate();
  const subscriptionEnabled = els.subscriptionEnabled.checked;
  const subscriptionFeeIsk = Number(els.subscriptionMillions.value || 0) * 1_000_000;
  const fuelEnabled = els.fuelEnabled.checked;
  const modules = Number(els.fuelModules.value) || 0;
  const gjNeededPerHour = (modules * 9000) / 24;

  // Region/resource filters narrow the candidate pool; constellation isn't applied
  // as a flat filter here because each candidate constellation is scored on its own.
  const filtered = filterRows(state.rows, { regions, resources });
  const rowsByConstellation = groupByConstellation(filtered);
  const financeOptions = { commissionEnabled, commissionRate, subscriptionEnabled, subscriptionFeeIsk };

  const targets = [
    ['avg', els.resultsAvg, state.resources, els.panelTitleAvg],
    ['low', els.resultsLow, effectiveLowResources(), els.panelTitleLow],
  ];

  for (const [priceKey, container, resourcesForKey, titleEl] of targets) {
    const winner = computeBestConstellationResult({
      rowsByConstellation,
      candidateConstellations: constellations,
      resources: resourcesForKey,
      drills,
      priceKey,
      n,
      resourceLimits,
      gjNeededPerHour,
      fuelEnabled,
      financeOptions,
    });

    container.innerHTML = winner
      ? renderPlanetsTableHtml(winner.adjustedPlanets) + renderSummaryHtml(winner.breakdown)
      : renderPlanetsTableHtml([]);

    const label =
      priceKey === 'avg'
        ? state.echoesLatestDate
          ? `Середньозважена ціна, згідно EVE.MOBI API, станом на ${formatDateUk(state.echoesLatestDate)}`
          : 'Середня ціна'
        : `Мінімальна ціна на ринку (станом на ${formatDateUk(
            state.lastManualPriceEditAt ? new Date(state.lastManualPriceEditAt) : MANUAL_PRICE_FALLBACK_DATE
          )})`;
    setPanelTitle(titleEl, label, winner?.constellation);
  }

  persistState();
}

function attachListeners() {
  const controls = [
    els.planetsCount,
    els.drillsCount,
    els.constellationSelect,
    els.resourceSelect,
    els.commissionEnabled,
    els.commissionCustom,
    els.subscriptionEnabled,
    els.subscriptionMillions,
    els.fuelEnabled,
    els.fuelModules,
    ...document.querySelectorAll('input[name="commission-rate"]'),
  ];
  for (const el of controls) {
    el.addEventListener('change', computeAndRender);
  }
  els.regionSelect.addEventListener('change', () => {
    populateConstellationOptions();
    computeAndRender();
  });

  document.querySelectorAll('.checklist-actions button[data-checklist]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const container = document.getElementById(btn.dataset.checklist);
      const checked = btn.dataset.action === 'all';
      container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = checked;
      });
      container.dispatchEvent(new Event('change'));
    });
  });

  els.filtersResetAll.addEventListener('click', resetFiltersToDefault);

  els.priceList.addEventListener('input', (e) => {
    const input = e.target.closest('.price-row__input');
    if (!input) return;
    const name = input.dataset.resource;
    const resource = state.resources.get(name);
    const value = Number(input.value);
    if (input.value === '' || Number.isNaN(value) || value === resource.low) {
      state.priceOverrides.delete(name);
    } else {
      state.priceOverrides.set(name, value);
      state.lastManualPriceEditAt = new Date().toISOString();
    }
    input.closest('.price-row').classList.toggle('price-row--overridden', state.priceOverrides.has(name));
    computeAndRender();
  });

  els.priceList.addEventListener('click', (e) => {
    const btn = e.target.closest('.price-row__reset');
    if (!btn) return;
    const name = btn.dataset.resource;
    const resource = state.resources.get(name);
    state.priceOverrides.delete(name);
    const row = btn.closest('.price-row');
    row.querySelector('.price-row__input').value = resource.low ?? '';
    row.classList.remove('price-row--overridden');
    computeAndRender();
  });

  els.priceResetAll.addEventListener('click', () => {
    state.priceOverrides.clear();
    populatePriceList();
    computeAndRender();
  });
}

async function init() {
  await loadData();
  loadPersistedState();
  populateFilterOptions();
  populatePriceList();
  attachListeners();
  computeAndRender();

  const echoesData = await fetchEchoesResourceData();
  if (echoesData.prices.size > 0) {
    applyEchoesResourceData(echoesData);
    refreshResourceIcons();
    populatePriceList();
    computeAndRender();
  }
}

init();
