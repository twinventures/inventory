// === CONFIG: point this at your cloud API later ===
const API_BASE = (window.API_BASE_OVERRIDE) || "https://inventory-t49h.onrender.com";

// Helpers
const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat();

async function api(path, params = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...params
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Backend adapters (mirror your Electron window.api)
const windowApi = {
  async listLocations() { return api("/locations"); },
  async listInventory(locationId = null) {
    const q = locationId ? `?location_id=${locationId}` : "";
    return api(`/inventory${q}`);
  },
  async summary() { return api("/summary"); }
};

// UI renderers (copy from your renderer.js with minimal tweaks)
function renderRows(rows) {
  const tb = $('#tbody');
  tb.innerHTML = rows.map(r =>
    `<tr>
      <td>${r.sku}</td>
      <td>${r.name}</td>
      <td>${r.location}</td>
      <td>${Number(r.qty)||0}</td>
    </tr>`
  ).join('');
}

function renderLocationsSelect(locs) {
  const sel = $('#location');
  sel.innerHTML = `<option value="">All locations</option>` +
    locs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  sel.onchange = refresh;
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

// Chips you added
function updateChips(locationsCount, itemsCount) {
  const cl = document.getElementById('chipLocations');
  const ci = document.getElementById('chipItems');
  if (cl) cl.textContent = `${locationsCount} locations`;
  if (ci) ci.textContent = `${itemsCount} items`;
}

async function refresh() {
  const locationId = $('#location').value ? Number($('#location').value) : null;
  const rows = await windowApi.listInventory(locationId);
  renderRows(rows);
  const summary = await windowApi.summary();
  renderAnalytics(summary);
  updateChips(summary.locationsCount, summary.itemsCount);
}

(async function boot() {
  const locs = await windowApi.listLocations();
  renderLocationsSelect(locs);
  await refresh();
})();
