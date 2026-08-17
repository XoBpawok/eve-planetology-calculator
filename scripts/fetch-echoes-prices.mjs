#!/usr/bin/env node
// Fetches this week's average prices + icons from the echoes.mobi API and
// writes them to data/echoes-prices.json. Runs server-side (in CI or by
// hand) because echoes.mobi does not send Access-Control-Allow-Origin, so
// the browser can't call it directly from the deployed page — see
// app.js's loadEchoesResourceData for the client side of this split.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ECHOES_API_URL = 'https://echoes.mobi/api/items?categoryName=Planetary%20Resources&itemsPerPage=300';
const OUTPUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'echoes-prices.json');

async function fetchEchoesItems() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ECHOES_API_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`echoes.mobi responded with HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const items = await fetchEchoesItems();

  const resourcesByName = new Map();
  let latestDate = null;
  for (const item of items) {
    const name = item.name?.trim();
    if (!name) continue;
    const avgPrice = Number(item.weekly_average_price);
    const dateUpdated = item.date_updated ?? null;
    const resource = {
      name,
      avgPrice: Number.isFinite(avgPrice) ? avgPrice : null,
      iconUrl: item.icon_url || null,
    };
    const existing = resourcesByName.get(name);
    // echoes.mobi sometimes lists the same resource name twice (e.g. a stale
    // zero-price duplicate); keep whichever entry actually has a price.
    if (!existing || (!existing.avgPrice && resource.avgPrice)) {
      resourcesByName.set(name, resource);
    }
    const updatedAt = dateUpdated ? new Date(dateUpdated) : null;
    if (updatedAt && !Number.isNaN(updatedAt.getTime()) && (!latestDate || updatedAt > latestDate)) {
      latestDate = updatedAt;
    }
  }
  const resources = [...resourcesByName.values()];

  const payload = {
    fetchedAt: new Date().toISOString(),
    latestDate: latestDate ? latestDate.toISOString() : null,
    resources,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${resources.length} resource prices to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((err) => {
  // Don't fail the build over a flaky third-party API — the previously
  // committed data/echoes-prices.json just stays in place and gets served
  // as-is until the next successful run.
  console.warn('Skipping price refresh: could not fetch echoes.mobi data:', err.message);
});
