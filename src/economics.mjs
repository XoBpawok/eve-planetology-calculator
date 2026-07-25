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
