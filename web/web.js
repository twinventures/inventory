// CONFIG: use Render URL; override via console if needed.
const API_BASE = localStorage.getItem('API_BASE') || 'https://inventory-t49h.onrender.com';

const fmtCurrency = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const fmtInt = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
let chart = null;

function $(sel){ return document.querySelector(sel); }

async function fetchJSON(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }});
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return r.json();
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
  const labels = (summary.totalsByLocation || []).map(x => x.location);
  const qtys = (summary.totalsByLocation || []).map(x => toNum(x.total_qty));
  const ctxEl = $('#chart1');
  if (!ctxEl) return;

  if (chart) chart.destroy();
  chart = new Chart(ctxEl.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Total Qty by Location', data: qtys }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  $('#topItems').innerHTML = (summary.topItems || [])
    .map(x => `<li>${x.sku} – ${x.name} • <strong>${naira(x.value)}</strong></li>`).join('');
  $('#lowStock').innerHTML = (summary.lowStock || [])
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

// -------- FLOW --------
async function loadFilters(){
  // use /locations (not /filters)
  const locs = await fetchJSON('/locations');
  renderLocationsSelect(locs);
  // chipLocations falls back to summary (set there)
}

async function refresh(){
  try{
    $('#refresh')?.setAttribute('aria-busy','true');

    const val = $('#location').value;
    const locId = val ? Number(val) : null;
    const qs = locId ? `?location_id=${locId}` : ''; // <-- snake_case param

    const [rows, summary] = await Promise.all([
      fetchJSON(`/inventory${qs}`),
      fetchJSON('/summary')
    ]);

    renderRows(rows);
    renderAnalytics(summary);
  }catch(err){
    console.error(err);
    alert('Failed to load data. Check API_BASE, CORS, and that your backend is up.');
  }finally{
    $('#refresh')?.removeAttribute('aria-busy');
  }
}

$('#refresh').addEventListener('click', refresh);
$('#location').addEventListener('change', refresh);

// Dev helper to switch API at runtime:
// localStorage.setItem('API_BASE','https://inventory-xxxxx.onrender.com'); location.reload();

(async function init(){
  await loadFilters();
  await refresh();
})();
