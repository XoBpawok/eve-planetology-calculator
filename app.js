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
