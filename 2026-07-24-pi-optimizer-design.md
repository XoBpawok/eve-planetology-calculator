# EVE PI Resource Optimizer — Design

## Purpose

A small static web tool to find the most profitable set of planets/resources to
extract Planetary Interaction (PI) materials from, across one or more EVE
Online regions/constellations, accounting for market price, extraction
mechanics (drills, planet limits), and operating costs (sales commission,
constellation subscription fee, fuel).

## Inputs (baked into the build, static assets)

- `resources.csv` — one row per resource: name, cubic metres per unit,
  average market price (ISK/unit), lowest market price (ISK/unit), `energy`
  (GJ per unit; empty for resources with no fuel value).
- `Eve Planetary Production.xlsx - Planetary Production.csv` — one row per
  (planet, resource): Planet ID, Region, Constellation, System, Planet Name,
  Planet Type, Resource, Richness, Output (units/hour per drill).

Both files ship alongside the site and are loaded via `fetch()` on page load.
The site must be served over HTTP (e.g. `python -m http.server`), not opened
via `file://`, since `fetch()` of local files is blocked under that scheme.

## Architecture

Single static site, no backend:
- `index.html` — page shell, controls, results containers.
- `app.js` — CSV parsing, filtering, optimization, economics, rendering.
- `style.css` — layout.

No build step, no framework, no server-side state. Every control change
triggers an immediate, synchronous recompute (data is small enough once
parsed into memory).

## Controls

| Control | Type | Default | Notes |
|---|---|---|---|
| Кількість планет (N) | number | 6 | top-N planets selected |
| Кількість бурів на планету (D) | number | 26 | multiplies every row's output |
| Регіони | multi-select | all | filters candidate rows |
| Сузір'я | multi-select | all | filters candidate rows; narrows to selected regions if any are chosen |
| Комісія продажу | checkbox + radio | off / "контракт 8%" / "ринок 13%" | when checkbox off, commission = 0 |
| Абонплата за сузір'я | checkbox + number (ISK, millions) | on, 500 | editable amount, entered in millions (e.g. `500` → 500,000,000 ISK), charged once per 30-day month, global (independent of N/filters) |
| Пальне | checkbox + number of modules (1 or 2) | on, 1 | global requirement, independent of N |

Each cost checkbox independently zeroes out its line item in the profit
breakdown when unchecked — this satisfies "можливість не обраховувати
комісії, податки та витрати на пальне."

## Core optimization algorithm (unchanged from prior manual calculations)

For each price mode (`avg`, `low`), computed independently:

1. Filter rows to selected regions/constellations (no selection = all).
2. Drop rows whose resource isn't in `resources.csv`.
3. Per row: `ISK/hour = Output(units/hour/drill) × D × price_per_unit`.
4. Per planet (unique key = Planet ID): keep the row with the highest
   ISK/hour (one resource extracted per planet at a time).
5. Sort planets by that value descending, take the top N.
6. `gross_before_fuel = Σ ISK/hour of the top N planets`.

This produces the same two "top-N planets" tables as the manual
calculations already validated for constellation `0FC-ZX` and the top-5
constellations from the full dataset.

## Fuel calculation

`GJ_needed_per_hour = modules × 9000 / 24 = modules × 375 GJ/hour` (global,
independent of N).

For each price mode, starting from the top-N selection produced above:

1. Among the top-N resources, take those with `energy > 0`.
2. Sort them by ISK/GJ (`price_per_unit / energy`) ascending — cheapest
   opportunity cost first.
3. Walk this list, diverting units from each resource's hourly output to
   cover `GJ_needed_per_hour`: `divert_units = min(available_units/hour,
   remaining_GJ / energy_per_unit)`. Diverted units are removed from that
   resource's sellable output (this is the "lost income" — it simply never
   enters `gross`) and `remaining_GJ` is reduced accordingly.
4. If `remaining_GJ > 0` after exhausting all energy-bearing top-N
   resources, buy the shortfall on the market: find the resource with the
   lowest ISK/GJ across **all** of `resources.csv` (same price mode), and
   `fuel_purchase_cost = remaining_GJ × that_ISK_per_GJ`. This is a real
   cash cost, reported separately from the opportunity-cost fuel.

`gross = gross_before_fuel − Σ(diverted_units × price)` for each affected
planet (i.e., gross already reflects fuel self-sufficiency; no separate
subtraction needed for that part).

## Profit formula

Per price mode:

```
gross    = Σ (sellable units of each top-N resource × price)   // after fuel diversion
after_c  = commission_enabled ? gross × (1 − commission_rate) : gross
net_hour = after_c − (fuel_enabled ? fuel_purchase_cost : 0)
                    − (subscription_enabled ? subscription_fee / 720 : 0)   // 720h = 30d
net_day  = net_hour × 24
net_month= net_hour × 720
```

`commission_rate` = 0.08 (contract) or 0.13 (market), selected by radio.
`subscription_fee` = user-entered millions × 1,000,000, default 500,000,000,
charged once per 30-day month (displayed as a monthly figure and as an
hourly-equivalent deduction for the hourly net).

## Results UI

Two tables side by side (avg price / low price), each row = one selected
planet (Planet Name, System, Resource, Richness, Output/hour/drill,
ISK/hour). Below each table, a cost breakdown block:

```
Валовий дохід (до пального):     X ISK/год
Пальне з видобутку (опортюн-кост, вже враховано вище): −Y ISK/год  [info line]
Пальне докуплене:                −Z ISK/год
Комісія (−8%/−13%):              −C ISK/год
Абонплата (500,000,000 / міс):   −S ISK/год (еквівалент)
─────────────────────────────────
Чистий прибуток:                  N ISK/год | ISK/добу | ISK/місяць
```

If no planets remain after filtering, show "немає даних для обраних
фільтрів" instead of empty tables. If N exceeds the number of available
planets after filtering, just use all of them (no error).

## Testing

Manual verification in browser against the numbers already hand-calculated
in this conversation:
- Constellation `0FC-ZX`, N=6, D=22 and D=26, no economics — matches prior
  per-planet tables.
- Full dataset, top-5 constellations, N=6, D=26 — matches prior per-
  constellation tables.
- Spot-check fuel/commission/subscription math by hand for one scenario
  (e.g. N=6, D=26, 1 module, market commission, default subscription).
