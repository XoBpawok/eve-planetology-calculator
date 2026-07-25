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
