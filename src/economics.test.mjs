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
