
const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
let chart;

async function loadFilters() {
  const { locations } = await window.api.filters();
  const sel = $('#location');
  sel.innerHTML = `<option value="">All locations</option>` + locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}
function renderRows(rows) {
  $('#rows').innerHTML = rows.map(r => `
    <tr>
      <td>${r.sku}</td>
      <td>${r.item}</td>
      <td>${r.category}</td>
      <td>${r.location}</td>
      <td>${r.qty}</td>
      <td>${fmt.format(r.cost_per_unit)}</td>
      <td>${fmt.format(r.value)}</td>
    </tr>
  `).join('');
}

function renderAnalytics(summary) {
  const canvas = document.getElementById('chart1');
  if (!canvas) return;
  const labels = summary.totalsByLocation.map(x => x.location);
  const qtys = summary.totalsByLocation.map(x => Number(x.total_qty) || 0);
  if (window.chart) window.chart.destroy();
  const ctx = canvas.getContext('2d');
  window.chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Total Qty by Location', data: qtys }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
  document.getElementById('topItems').innerHTML =
    summary.topItems.map(x => `<li>${x.sku} – ${x.name} • <strong>${fmt.format(Number(x.value)||0)}</strong></li>`).join('');
  document.getElementById('lowStock').innerHTML =
    summary.lowStock.map(x => `<li class="${x.qty<5?'bad':''}">${x.sku} – ${x.name} @ ${x.location} • ${x.qty}</li>`).join('');
}

function updateChips(locationsCount, itemsCount) {
  const cl = document.getElementById('chipLocations');
  const ci = document.getElementById('chipItems');
  if (cl) cl.textContent = `${locationsCount} locations`;
  if (ci) ci.textContent = `${itemsCount} items`;
}

async function exportCsv() {
  const rows = await window.api.listInventory(null);
  if (!rows || !rows.length) return;

  const headers = ['SKU','Item','Category','Location','Qty','CostPerUnit','Value'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = [
      r.sku,
      r.item,
      r.category,
      r.location,
      r.qty,
      r.cost_per_unit,
      r.value
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    lines.push(line);
  }
  const csv = lines.join('\n');

  await window.api.saveTextFile({
    defaultPath: 'inventory-export.csv',
    content: csv
  });
}



async function refresh() {
  const locationId = $('#location').value ? Number($('#location').value) : null;
  const rows = await window.api.listInventory(locationId);
  renderRows(rows);
  const summary = await window.api.summary();
  console.log('SUMMARY:', summary);``
  renderAnalytics(summary);
  const filtersData = await window.api.filters();
  updateChips(filtersData.locations.length, await window.api.itemCount());

}
document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('exportCsv').addEventListener('click', exportCsv);
document.getElementById('location').addEventListener('change', refresh);

(async function init() {
  await loadFilters();
  await refresh();
})();




