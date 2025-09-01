// CONFIG: use Render URL; override via console if needed.
const API_BASE = localStorage.getItem('API_BASE') || 'https://inventory-t49h.onrender.com';

const fmtCurrency = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const fmtInt = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
let chart = null;
let lastRows = [];


function $(sel){ return document.querySelector(sel); }

async function fetchJSON(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }});
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return r.json();
}

async function safeFetchJSON(path) {
  try { return await fetchJSON(path); }
  catch (e) { console.error('GET', path, e); return null; }
}


function naira(n){ const v = Number(n)||0; return v ? fmtCurrency.format(v) : ''; }
function toNum(n){ return Number(n)||0; }

// -------- RENDERERS --------
function renderRows(rows){
  const tbody = $('#rows');
  tbody.innerHTML = rows.map(r => {
    const sku = r.sku ?? '';
    const name = r.name ?? r.item ?? '';
    const category = r.category ?? r.cat ?? '';
    const location = r.location ?? '';
    const qty = toNum(r.qty);
    const cpu = r.cost_per_unit ?? r.cpu ?? r.unit_cost ?? 0;
    const value = r.value ?? (toNum(cpu) * qty);
    return `
      <tr>
        <td>${sku}</td>
        <td>${name}</td>
        <td>${category}</td>
        <td>${location}</td>
        <td>${fmtInt.format(qty)}</td>
        <td>${naira(cpu)}</td>
        <td>${naira(value)}</td>
      </tr>
    `;
  }).join('');
}

function renderAnalytics(summary){
  const totals = summary.totalsByLocation || summary.totals || [];
  const low    = summary.lowStock       || summary.low    || [];
  const top    = summary.topItems       || summary.top    || [];

  const labels = totals.map(x => x.location);
  const qtys   = totals.map(x => toNum(x.total_qty));
  const ctxEl = $('#chart1');

  if (!ctxEl) return;

  if (chart) chart.destroy();
  chart = new Chart(ctxEl.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Total Qty by Location', data: qtys }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  $('#topItems').innerHTML = top
  .map(x => `<li>${x.sku} – ${x.name} • <strong>${naira(x.value)}</strong></li>`).join('');
  $('#lowStock').innerHTML = low
  .map(x => `<li class="${toNum(x.qty)<5?'bad':''}">${x.sku} – ${x.name} @ ${x.location} • ${fmtInt.format(toNum(x.qty))}</li>`).join('');


  // chips
  if (summary.locationsCount != null) $('#chipLocations').textContent = `${fmtInt.format(summary.locationsCount)} locations`;
  if (summary.itemsCount != null) $('#chipItems').textContent = `${fmtInt.format(summary.itemsCount)} items`;
}

function renderLocationsSelect(locs){
  const sel = $('#location');
  sel.innerHTML = `<option value="">All locations</option>` +
    (locs||[]).map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}


function exportCsv() {
  const headers = ['SKU','Item','Category','Location','Qty','CostPerUnit','Value'];
  const lines = [headers.join(',')];

  for (const r of lastRows) {
    const out = [
      r.sku ?? '',
      (r.item ?? r.name ?? ''),
      (r.category ?? r.cat ?? ''),
      (r.location ?? ''),
      (toNum(r.qty)),
      (r.cost_per_unit ?? r.cpu ?? r.unit_cost ?? 0),
      (r.value ?? (toNum(r.cost_per_unit ?? r.cpu ?? r.unit_cost ?? 0) * toNum(r.qty)))
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    lines.push(out);
  }
  const csv = '\uFEFF' + lines.join('\n'); // BOM for Excel

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'inventory-export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// -------- FLOW --------
async function loadFilters(){
  // use /locations (not /filters)
  const locs = await fetchJSON('/locations');
  renderLocationsSelect(locs);
  // chipLocations falls back to summary (set there)
}

async function refresh(){
  $('#refresh')?.setAttribute('aria-busy','true');

  const val = $('#location').value;
  const locId = val ? Number(val) : null;
  const qs = locId ? `?locationId=${locId}` : '';

  // Try inventory; if it fails, fall back to /items so the table still shows.
  let rows = await safeFetchJSON(`/inventory${qs}`);
  if (!rows) {
    const items = await safeFetchJSON('/items');
    rows = (items || []).map(it => ({
      sku: it.sku, item: it.name, category: '', location: '', qty: 0, cost_per_unit: 0, value: 0
    }));
  }

  // Try /summary; if it fails, use /reports/summary; if that fails, use empty data.
  let summary = await safeFetchJSON('/summary')
           || await safeFetchJSON('/reports/summary')
           || { totalsByLocation: [], lowStock: [], topItems: [] };

  lastRows = rows || [];
  renderRows(lastRows);
  renderAnalytics(summary);
  $('#refresh')?.removeAttribute('aria-busy');
}


$('#refresh').addEventListener('click', refresh);
$('#location').addEventListener('change', refresh);
$('#exportCsv').addEventListener('click', exportCsv);


// Dev helper to switch API at runtime:
// localStorage.setItem('API_BASE','https://inventory-xxxxx.onrender.com'); location.reload();

(async function init(){
  await loadFilters();
  await refresh();
})();
