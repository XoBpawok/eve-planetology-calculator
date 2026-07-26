export function computeRowRevenue(row, resource, drills, priceKey) {
  if (!resource) return null;
  const price = priceKey === 'avg' ? resource.avg : resource.low;
  if (price === null || price === undefined) return null;
  return row.output * drills * price;
}

export function filterRows(rows, { regions = [], constellations = [], resources = [] } = {}) {
  return rows.filter((row) => {
    if (regions.length > 0 && !regions.includes(row.region)) return false;
    if (constellations.length > 0 && !constellations.includes(row.constellation)) return false;
    if (resources.length > 0 && !resources.includes(row.resource)) return false;
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
      m3: resource.m3,
      revenue,
    });
  }
  return Array.from(best.values());
}

export function topNPlanets(bestPerPlanet, n) {
  return [...bestPerPlanet].sort((a, b) => b.revenue - a.revenue).slice(0, n);
}
