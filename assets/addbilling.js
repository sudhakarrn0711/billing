// ========== Notifications System (Due/Overdue) ==========

window._charts = window._charts || {};
window._reportFlags = window._reportFlags || {};

const charts = {};

function initNotifications() {
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");

  if (!btn || !panel) return;

  // Toggle dropdown on click
  btn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
  });

  // Close if clicked outside
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });

  // Initial render
  renderNotifications();
}

// Counts match listed unpaid invoices with a valid due date, across businesses.
function rsInvoiceReminders(invoices, currentDate = new Date()) {
  const today = Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  return (invoices || []).map(inv => {
    const due = String(inv.dueDate || inv.due || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
    const parts = due.split('-').map(Number);
    const utc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    if (new Date(utc).toISOString().slice(0, 10) !== due) return null;
    const paid = (inv.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (!(Number(inv.total) > paid)) return null;
    return { invoice: inv, due, daysLeft: Math.round((utc - today) / 86400000) };
  }).filter(Boolean).sort((a, b) => a.due.localeCompare(b.due));
}
function renderNotifications() {
  const list = document.getElementById('notifList'), badge = document.getElementById('notifBadge');
  if (!list || !badge) return;
  list.replaceChildren();
  const reminders = rsInvoiceReminders(state.invoices), count = reminders.length;
  const overdue = reminders.filter(r => r.daysLeft < 0).length;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
  const button = document.getElementById('notifBtn');
  button?.setAttribute('aria-label', `Invoice reminders: ${count} unpaid invoices with due dates, ${overdue} overdue`);
  if (button) button.title = `${count} unpaid invoice${count === 1 ? '' : 's'} with due dates`;
  const total = document.getElementById('rsNotificationTotal');
  if (total) total.textContent = String(count);
  const summary = document.getElementById('rsNotificationSummary');
  if (summary) summary.textContent = count ? `${count} unpaid · ${overdue} overdue · Across all businesses` : 'No unpaid invoices with a due date.';
  const empty = document.getElementById('noNotif');
  if (empty) empty.classList.toggle('hidden', count > 0);
  reminders.forEach(({ invoice: inv, due, daysLeft }) => {
    const customer = state.customers.find(c => String(c.id) === String(inv.customerId)) || {};
    const li = document.createElement('li');
    li.className = 'rs-notification-row';
    const action = document.createElement('button');
    action.type = 'button'; action.className = 'rs-notification-item';
    const content = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = customer.name || 'Unknown customer';
    const detail = document.createElement('small'); detail.textContent = `Invoice: ${inv.invoiceNumber || inv.id} · Due: ${due}`;
    const businesses = Array.isArray(state.businesses) ? state.businesses : Object.values(state.businesses || {});
    const business = businesses.find(b => String(b.id) === String(inv.businessId));
    const businessLabel = document.createElement('span');
    businessLabel.className = 'rs-reminder-business';
    businessLabel.textContent = business?.name || inv.businessName || 'Unknown business';
    content.append(name, businessLabel, detail);
    const status = document.createElement('span');
    status.className = 'rs-pill rs-reminder-status ' + (daysLeft < 0 ? 'rs-reminder-overdue' : daysLeft === 0 ? 'rs-reminder-today' : daysLeft === 1 ? 'rs-reminder-tomorrow' : 'rs-reminder-upcoming');
    status.textContent = daysLeft < 0 ? 'Overdue' : daysLeft === 0 ? 'Due today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d left`;
    action.append(content, status); li.append(action);
    action.onclick = () => { openEditInvoice(inv.id); document.getElementById('notifPanel').classList.add('hidden'); };
    list.append(li);
  });
}

// Hook into existing render functions
const oldRenderInvoices = renderInvoices;
renderInvoices = function () {
  oldRenderInvoices();
  renderNotifications(); // refresh alerts whenever invoices change
};

// Init after DB load
document.addEventListener("DOMContentLoaded", initNotifications);


// ========== PROGRESS BARS (Revenue, Credit, Invoice) ==========

// 1) Revenue Goal Circular Ring
// Animate Revenue Goal Circular Ring
/* Compact goal: current-month invoice totals for the selected business.
 * Shares REPORTS_MONTHLY_GOAL with the existing financial forecast.
 * The old entry point is retained for billing.js compatibility.
 */
function rsMonthlyRevenueGoalData(invoices, businessId, now = new Date()) {
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const current = (invoices || []).reduce((sum, inv) => {
    if (businessId && businessId !== 'all' && String(inv.businessId) !== String(businessId)) return sum;
    if (/^(void|cancelled)$/i.test(inv.status || '')) return sum;
    if (String(inv.date || '').slice(0, 7) !== month) return sum;
    const amount = Number(inv.total);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  return { current: Math.max(0, current), month };
}

function updateRevenueGoalProgress(current, goal) {
  const circle = document.getElementById('revGoalProgress');
  const text = document.getElementById('revGoalText');
  if (!circle || !text) return;
  const select = document.getElementById('bizSelect');
  const selected = String(select?.value || 'all');
  const monthlyCard = document.getElementById('rsMonthlyGoalCard');
  if (monthlyCard && typeof state !== 'undefined' && Array.isArray(state.invoices)) {
    current = rsMonthlyRevenueGoalData(state.invoices, selected).current;
    goal = REPORTS_MONTHLY_GOAL;
  }
  current = Number.isFinite(Number(current)) ? Math.max(0, Number(current)) : 0;
  goal = Number.isFinite(Number(goal)) ? Math.max(0, Number(goal)) : 0;
  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round(current / goal * 100))) : 0;
  const circumference = 2 * Math.PI * Number(circle.getAttribute('r') || 50);
  circle.setAttribute('stroke-dasharray', String(circumference));
  circle.setAttribute('stroke-dashoffset', String(circumference * (1 - pct / 100)));
  text.textContent = goal > 0 ? pct + '%' : '—';
  document.getElementById('revGoalRing')?.setAttribute('aria-label', goal > 0 ? 'Monthly goal progress: ' + pct + ' percent' : 'Monthly target not set');
  const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2}).format(value);
  for (const [id, value] of [['rsGoalAchieved',current],['rsGoalTarget',goal],['rsGoalRemaining',Math.max(0,goal-current)]]) {
    const el = document.getElementById(id);
    if (el) el.textContent = money(value);
  }
  const scope = document.getElementById('rsMonthlyGoalScope');
  if (scope) scope.textContent = new Date().toLocaleDateString('en-IN',{month:'short',year:'numeric'}) + ' · ' + (selected === 'all' ? 'All businesses' : select?.selectedOptions?.[0]?.textContent.trim() || 'Selected business') + ' · Invoiced';
  const status = document.getElementById('rsGoalStatus');
  if (status) status.textContent = goal <= 0 ? 'Set REPORTS_MONTHLY_GOAL to a positive amount.' : current >= goal ? 'Monthly target achieved.' : money(goal-current) + ' to reach this month’s target.';
  if (monthlyCard) monthlyCard.dataset.complete = String(goal > 0 && current >= goal);
}

function rsRefreshMonthlyRevenueGoal() {
  if (typeof state !== 'undefined' && Array.isArray(state.invoices)) updateRevenueGoalProgress(0, REPORTS_MONTHLY_GOAL);
}
(function () {
  function init() {
    document.getElementById('bizSelect')?.addEventListener('change', () => requestAnimationFrame(rsRefreshMonthlyRevenueGoal));
    rsRefreshMonthlyRevenueGoal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else queueMicrotask(init);
  window.addEventListener('rs:data-loaded',rsRefreshMonthlyRevenueGoal);
  window.addEventListener('rs:mutation',() => requestAnimationFrame(rsRefreshMonthlyRevenueGoal));
})();

/* Identity colours: sorting a chart does not change an entity's colour.
 * Delay severity remains available in the original summary/table.
 */
const rsDashboardColourPalette = ['#8b5cf6','#14b8a6','#3b82f6','#f59e0b','#ec4899','#f97316','#06b6d4','#6366f1','#84cc16','#d946ef','#10b981','#eab308'];
const rsDashboardColourAssignments = {customer:new Map(),business:new Map()};
function rsDashboardEntityColour(kind, id, entities) {
  const map = rsDashboardColourAssignments[kind];
  (entities || []).forEach(entity => {
    const key = String(entity.id ?? entity.name ?? 'unknown');
    if (!map.has(key)) map.set(key,rsDashboardColourPalette[map.size % rsDashboardColourPalette.length]);
  });
  const key = String(id ?? 'unknown');
  if (!map.has(key)) map.set(key,rsDashboardColourPalette[map.size % rsDashboardColourPalette.length]);
  return map.get(key);
}

// 2) Customer Credit Usage Bar
function renderCustomerCreditBars() {
  document.querySelectorAll(".cust-credit-bar").forEach(el => el.remove()); // cleanup

  state.customers.forEach(cust => {
    const row = document.getElementById(`custRow-${cust.id}`);
    if (!row) return;

    const outstanding = state.invoices
      .filter(inv => inv.customerId === cust.id)
      .reduce((s, inv) => s + ((inv.total || 0) - (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0)), 0);

    const pct = cust.creditLimit > 0 ? Math.min(100, Math.round((outstanding / cust.creditLimit) * 100)) : 0;

    const bar = document.createElement("div");
    bar.className = "cust-credit-bar mt-1 h-1.5 bg-gray-700 rounded overflow-hidden";
    bar.innerHTML = `<div class="h-full ${pct < 50 ? 'bg-green-400' : pct < 80 ? 'bg-orange-400' : 'bg-red-400'}" style="width:${pct}%"></div>`;
    row.querySelector("td:last-child").appendChild(bar);
  });
}

// 3) Invoice Payment Bar
function renderInvoicePaymentBar(inv) {
  const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const total = inv.total || 0;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  let barColor = "bg-green-400";
  if (pct < 50) barColor = "bg-red-400";
  else if (pct < 80) barColor = "bg-orange-400";

  // Create unique ID so multiple rows work independently
  const barId = "bar-" + Math.random().toString(36).substr(2, 9);

  // Initially width=0, then animate to pct%
  setTimeout(() => {
    const bar = document.getElementById(barId);
    if (bar) bar.style.width = pct + "%";
  }, 50);

  return `
    <div class="h-2 bg-gray-700 rounded mt-1 overflow-hidden">
      <div id="${barId}" class="h-2 ${barColor} transition-all duration-700 ease-in-out" style="width:0%"></div>
    </div>`;
}

/* ===========================
   REPORTS (Isolated Namespace)
   =========================== */

const REPORTS_MONTHLY_GOAL = 500000; // ₹ monthly goal used in burn forecast
const Reports = {
  charts: {},    // store Chart.js instances to destroy cleanly
  initialized: false,
  current: null, // current report tab
};

function reports_safeEl(id) { return document.getElementById(id); }
function reports_showViewReports() {
  const target = reports_safeEl('view-reports');
  if (!target) return;
  // Hide all other views (non-destructive)
  document.querySelectorAll("section[id^='view-']").forEach(s => s.classList.add('hidden'));
  target.classList.remove('hidden');
}

function reports_destroyCharts() {
  [...new Set(Object.values(Reports.charts))].forEach(ch => { try { ch.destroy(); } catch (e) { } });
  Reports.charts = {};
}

function reports_formatINR(n) {
  try { return formatINR ? formatINR(n) : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0); }
  catch { return `₹${(n || 0).toLocaleString('en-IN')}`; }
}

function reports_monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function reports_dateOnlyKey(d) { return d.toISOString().slice(0, 10); }
function reports_parseDate(v) {
  if (!v) return null;
  const day=reports_calendarDay(v);if(!day)return null;const d=new Date(day+'T12:00:00');
  return isNaN(+d) ? null : d;
}
function reports_daysBetween(d1, d2) { return Math.round((d2 - d1) / (1000 * 60 * 60 * 24)); }
function reports_endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function reports_startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function reports_invoicesFiltered() {
  const f=getReportFilters();if(f.valid===false)return [];
  return (state.invoices||[]).filter(inv=>!inv.archivedAt&&!/^(void|cancelled)$/i.test(inv.status||'')&&(!f.bizId||String(inv.businessId)===String(f.bizId))&&reports_dateMatches(inv.date||inv.invoiceDate,f));
}

function reports_paymentsOf(inv) {
  const f=getReportFilters();return (Array.isArray(inv.payments)?inv.payments:[]).filter(p=>reports_dateMatches(p.date||p.paidOn,f)).map(p=>({amount:Number(p.amount||0),date:reports_parseDate(p.date||p.paidOn),method:String(p.method||p.mode||'Not recorded').trim().toLowerCase()})).filter(p=>p.amount>0&&p.date);
}

function reports_businessOptions() { return window.rsReportsSyncBusiness?.(); }


function reports_initUI() { return window.rsReportsInit?.(); }

function reports_renderHome() {
  const root = reports_safeEl('reportsRoot');
  if (!root) return;
  reports_destroyCharts();
  root.innerHTML = `
    <div class="col-span-12 glass rounded-2xl p-4">
      <div class="text-white/70">Select a report category from above to view detailed analytics.</div>
      <ul class="list-disc pl-5 text-white/70 mt-2 text-sm space-y-1">
        <li>Financial: Cash Flow, MoM by Category, Burn Forecast, Aging</li>
        <li>Customer: Pareto (Top customers), CLV (est.)</li>
        <li>Invoices: Status breakdown, Payment methods, DSO</li>
        <li>Forecast: 6-month trend → next 3-month projection, Risk scores</li>
      </ul>
    </div>
  `;
}

/* -----------------------------
   Financial Reports
   ----------------------------- */
function reports_renderFinancial() {
  const root = reports_safeEl('reportsRoot');
  if (!root) return;
  reports_destroyCharts();

  const invs = reports_invoicesFiltered();
  const payments = invs.flatMap(reports_paymentsOf);
  const txs = reports_expensesFiltered(); // optional, scoped expense entries
  const range = reports_safeEl('reportsRange')?.value || '30';
  const from = null; // Date bounds were applied by reports_expensesFiltered().

  // 1) Cash Flow Timeline (income vs expenses)
  const incomeByDay = {};
  payments.forEach(p => {
    const key = reports_dateOnlyKey(p.date);
    incomeByDay[key] = (incomeByDay[key] || 0) + p.amount;
  });

  const expenseByDay = {};
  txs.filter(t => t && (t.type === 'expense' || t.type === 'debit')).forEach(t => {
    const d = reports_parseDate(t.date);
    if (!d) return;
    if (from && d < from) return;
    const key = reports_dateOnlyKey(d);
    expenseByDay[key] = (expenseByDay[key] || 0) + Number(t.amount || 0);
  });

  const allKeysSet = new Set([...Object.keys(incomeByDay), ...Object.keys(expenseByDay)]);
  const keys = Array.from(allKeysSet).sort();
  const incomeSeries = keys.map(k => incomeByDay[k] || 0);
  const expenseSeries = keys.map(k => expenseByDay[k] || 0);

  // 2) MoM Trend by Category (service-wise revenue)
  // Derive per item revenue by month
  const catMonth = {}; // {month: {service: amount}}
  invs.forEach(inv => {
    const d = reports_parseDate(inv.date || inv.invoiceDate) || new Date();
    const mk = reports_monthKey(d);
    (inv.items || []).forEach(it => {
      const service=(state.services||[]).find(s=>String(s.id)===String(it.serviceId));
      const cat = String(it.serviceName||it.service||it.category||service?.name||service?.service||'Uncategorized');
      const explicit=it.total!==undefined&&it.total!==null&&it.total!==''?it.total:it.amount;
      const amt = explicit!==undefined&&explicit!==null&&explicit!==''?Number(explicit)||0:(Number(it.rate??it.price)||0)*(Number(it.qty)||1)*(1+(Number(it.tax)||0)/100);
      catMonth[mk] = catMonth[mk] || {};
      catMonth[mk][cat] = (catMonth[mk][cat] || 0) + amt;
    });
  });
  const monthKeys = Object.keys(catMonth).sort();
  // top 5 services overall
  const totalsByCat = {};
  monthKeys.forEach(m => {
    Object.entries(catMonth[m]).forEach(([c, v]) => {
      totalsByCat[c] = (totalsByCat[c] || 0) + v;
    });
  });
  const topCats = Object.entries(totalsByCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const catDatasets = topCats.map((cat, i) => ({
    label: cat, data: monthKeys.map(m => (catMonth[m] && catMonth[m][cat]) || 0),
    borderWidth: 2, fill: false, tension: 0.2
  }));

  // 3) Daily Burn Forecast (is monthly goal achievable?)
  const now = new Date();
  const monthStart = reports_startOfMonth(now);
  const eom = reports_endOfMonth(now);
  const daysElapsed = Math.max(1, reports_daysBetween(monthStart, now) + 1);
  const daysInMonth = reports_daysBetween(monthStart, eom) + 1;
  const thisMonthRevenue = payments
    .filter(p => {
      const d = p.date; return d && d >= monthStart && d <= eom;
    })
    .reduce((s, p) => s + p.amount, 0);
  const projected = (thisMonthRevenue / daysElapsed) * daysInMonth;
  const meetsGoal = projected >= REPORTS_MONTHLY_GOAL;

  // 4) Aging Report: buckets of outstanding
  const agingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  invs.forEach(inv => {
    const total = Number(inv.total || 0);
    const paid = (inv.payments || []).filter(p=>{const day=reports_calendarDay(p.date||p.paidOn);return day&&day<=getReportFilters().end;}).reduce((s, p) => s + Number(p.amount || 0), 0);
    const dueAmt = Math.max(0, total - paid);
    if (dueAmt <= 0) return;
    const dueDate = reports_parseDate(inv.dueDate || inv.due);
    const anchor = dueDate || reports_parseDate(inv.date) || new Date();
    const days = reports_daysBetween(anchor, reports_parseDate(getReportFilters().end));
    if (days <= 30) agingBuckets['0-30'] += dueAmt;
    else if (days <= 60) agingBuckets['31-60'] += dueAmt;
    else if (days <= 90) agingBuckets['61-90'] += dueAmt;
    else agingBuckets['90+'] += dueAmt;
  });

  // Render
  root.innerHTML = `
    <div class="col-span-12 grid grid-cols-12 gap-4">
      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">Cash Flow · Period Invoice Payments &amp; Expenses</div>
        <canvas id="cfChart"></canvas>
      </div>
      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">Monthly Service Line Values (Top 5)</div>
        <canvas id="momCatChart"></canvas>
      </div>
      <div class="glass rounded-2xl p-4 col-span-12 md:col-span-6 rs-finish-projection">
        <h3>Monthly Collection Goal Projection</h3>
        <p class="rs-finish-projection-basis">Illustrative monthly goal · projection from the existing collection run rate</p>
        <div class="rs-finish-projection-metrics"><span>Illustrative goal <strong data-tone="violet">${reports_formatINR(REPORTS_MONTHLY_GOAL)}</strong></span><span>Projected <strong data-tone="${meetsGoal?'teal':'amber'}">${reports_formatINR(projected)}</strong></span></div>
        <div class="rs-finish-progress" role="progressbar" aria-label="Projected collections compared with illustrative monthly goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,Math.max(0,Math.round((projected / REPORTS_MONTHLY_GOAL) * 100)))}"><span style="width:${Math.min(100, Math.round((projected / REPORTS_MONTHLY_GOAL) * 100))}%"></span></div>
        <div class="rs-finish-projection-metrics"><span>Applied this month <strong data-tone="blue">${reports_formatINR(thisMonthRevenue)}</strong></span><span>Days elapsed <strong data-tone="pink">${daysElapsed}/${daysInMonth}</strong></span><span class="rs-finish-pill" data-tone="${meetsGoal?'teal':'amber'}">${meetsGoal?'Projection meets illustrative goal':'Projection below illustrative goal'}</span></div>
        <p class="rs-finish-projection-basis">Payments applied on the period’s invoices. This is a projection, not a guaranteed collection.</p>
      </div>
      <div class="glass rounded-2xl p-4 col-span-12 md:col-span-6">
        <div class="font-semibold mb-2">Invoice Ageing (Outstanding)</div>
        <canvas id="agingChart"></canvas>
      </div>
    </div>
  `;

  // Charts
  const ctx1 = reports_safeEl('cfChart');
  const ctx2 = reports_safeEl('momCatChart');
  const ctx3 = reports_safeEl('agingChart');

  if (window.Chart) {
    Reports.charts.cf = reports_drawChart(ctx1, {
      type: 'line',
      data: {
        labels: keys, datasets: [
          { label: 'Income', data: incomeSeries, borderWidth: 2, fill: false, tension: .2 },
          { label: 'Expenses', data: expenseSeries, borderWidth: 2, fill: false, tension: .2 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } } }
    });

    Reports.charts.mom = reports_drawChart(ctx2, {
      type: 'line',
      data: { labels: monthKeys, datasets: catDatasets },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    Reports.charts.aging = reports_drawChart(ctx3, {
      type: 'bar',
      data: { labels: Object.keys(agingBuckets), datasets: [{ label: 'Outstanding', data: Object.values(agingBuckets) }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }
}

/* -----------------------------
   Customer Insights
   ----------------------------- */
function reports_renderCustomers() {
  const root = reports_safeEl('reportsRoot');
  if (!root) return;
  reports_destroyCharts();

  const invs = reports_invoicesFiltered();
  const byCust = {};
  invs.forEach(inv => {
    const cid = inv.customerId || 'unknown';
    byCust[cid] = byCust[cid] || { revenue: 0, first: null, last: null, count: 0 };
    byCust[cid].revenue += Number(inv.total || 0);
    const d = reports_parseDate(inv.date) || new Date();
    byCust[cid].first = (!byCust[cid].first || d < byCust[cid].first) ? d : byCust[cid].first;
    byCust[cid].last = (!byCust[cid].last || d > byCust[cid].last) ? d : byCust[cid].last;
    byCust[cid].count++;
  });

  // Pareto
  const custRows = Object.entries(byCust).map(([cid, obj]) => {
    const cust = (state.customers || []).find(c => c.id === cid);
    return { id: cid, name: cust?.name || 'Unknown', revenue: obj.revenue };
  }).sort((a, b) => b.revenue - a.revenue);

  const totalRev = custRows.reduce((s, r) => s + r.revenue, 0) || 1;
  let cum = 0;
  const labels = [];
  const bars = [];
  const line = [];
  custRows.forEach((r, i) => {
    labels.push(r.name);
    bars.push(r.revenue);
    cum += r.revenue;
    line.push(Math.round((cum / totalRev) * 100));
  });
  // 20:80 stat
  const topCount = Math.max(1, Math.round(custRows.length * 0.2));
  const topShare = Math.round((custRows.slice(0, topCount).reduce((s, r) => s + r.revenue, 0) / totalRev) * 100);

  // CLV estimate: avg invoice value * purchase frequency per month * retention months (~12 default)
  const RETENTION_MONTHS = 12;
  const byCustCLV = {};
  invs.forEach(inv => {
    const cid = inv.customerId || 'unknown';
    byCustCLV[cid] = byCustCLV[cid] || { total: 0, months: new Set(), count: 0 };
    byCustCLV[cid].total += Number(inv.total || 0);
    const d = reports_parseDate(inv.date) || new Date();
    byCustCLV[cid].months.add(reports_monthKey(d));
    byCustCLV[cid].count++;
  });
  const clvRows = Object.entries(byCustCLV).map(([cid, obj]) => {
    const cust = (state.customers || []).find(c => c.id === cid);
    const avgInvoice = obj.count ? obj.total / obj.count : 0;
    const monthsActive = obj.months.size || 1;
    const freqPerMonth = obj.count / monthsActive;
    const clv = avgInvoice * freqPerMonth * RETENTION_MONTHS;
    return { name: cust?.name || 'Unknown', clv: Math.round(clv), freq: freqPerMonth.toFixed(2) };
  }).sort((a, b) => b.clv - a.clv).slice(0, 10);

  // Render
  root.innerHTML = `
    <div class="col-span-12 grid grid-cols-12 gap-4">
      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">Pareto: Top Customers Contribution</div>
        <div class="text-sm text-white/70 mb-2">Top 20% ≈ <span class="text-emerald-300">${topShare}%</span> of revenue</div>
        <canvas id="paretoChart"></canvas>
      </div>
      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">Top 10 Estimated CLV</div>
        <div class="overflow-auto">
          <table class="min-w-[600px] w-full text-sm">
            <thead><tr class="text-white/60">
              <th class="text-left p-2">Customer</th>
              <th class="text-right p-2">Estimated CLV</th>
              <th class="text-right p-2">Purchase Freq./Month</th>
            </tr></thead>
            <tbody>
              ${clvRows.map((r, index) => `
                <tr class="border-t border-white/10">
                  <td class="p-2">${reports_escape(r.name)}</td>
                  <td class="p-2 text-right">${reports_metricPill(reports_formatINR(r.clv), index)}</td>
                  <td class="p-2 text-right">${reports_metricPill(r.freq, index + 2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.Chart) {
    const ctx = reports_safeEl('paretoChart');
    Reports.charts.pareto = reports_drawChart(ctx, {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Revenue', data: bars },
          { type: 'line', label: 'Cumulative %', data: line, yAxisID: 'y1', tension: .2 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { title: { display: true, text: 'Revenue' } },
          y1: { position: 'right', min: 0, max: 100, ticks: { callback: v => `${v}%` } }
        }
      }
    });
  }
}

/* -----------------------------
   Invoice Reports
   ----------------------------- */

let invoiceChart, paymentChart; // store chart instances globally

function reports_renderInvoices() {
  const root = document.getElementById("reportsRoot");
  if (!root) return;

  reports_destroyCharts();
  // Clear old reports
  root.innerHTML = "";

  // Create 3 separate blocks for charts
  root.innerHTML = `
    <div class="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div id="invoiceStatusChart" class="bg-white/10 p-4 rounded-xl"></div>
      <div id="paymentMethodChart" class="bg-white/10 p-4 rounded-xl"></div>
      <div id="dsoChart" class="bg-white/10 p-4 rounded-xl"></div>
    </div>
  `;

  // Prepare data safely
  const statusData = getInvoiceStatusData();
  const methodData = getPaymentMethodData();
  const dsoData = getDSOData();

  // Render each chart
  renderDonutChart("invoiceStatusChart", {
    title: "Invoice Status Breakdown",
    labels: ["Paid", "Partial", "Pending"],
    data: statusData
  });

  renderDonutChart("paymentMethodChart", {
    title: "Payment Applications (Count)",
    labels: ["Cash", "UPI", "Bank / other"],
    data: methodData
  });

  renderBarChart("dsoChart", {
    title: "Average Invoice Payment Terms (Days)",
    labels: ["DSO"],
    data: [dsoData]
  });
}

function getInvoiceStatusData() {
  const values=[0,0,0],end=getReportFilters().end;
  reports_invoicesFiltered().forEach(inv=>{const paid=(inv.payments||[]).filter(p=>{const date=reports_calendarDay(p.date||p.paidOn);return date&&(!end||date<=end);}).reduce((s,p)=>s+(Number(p.amount)||0),0),total=Number(inv.total)||0;values[paid>=total?0:paid>0?1:2]++;});return values;
}

function getPaymentMethodData() {
  const values=[0,0,0];reports_invoicesFiltered().forEach(inv=>reports_paymentsOf(inv).forEach(p=>values[p.method==='cash'?0:p.method==='upi'?1:2]++));return values;
}

function getDSOData() {
  const values=reports_invoicesFiltered().map(inv=>{const issue=reports_calendarDay(inv.date),due=reports_calendarDay(inv.dueDate||inv.due);return issue&&due&&due>=issue?RanSanLedger.days(due,issue):null;}).filter(v=>v!==null);return values.length?(values.reduce((s,n)=>s+n,0)/values.length).toFixed(1):null;
}

function renderDonutChart(containerId, { title, labels, data }) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<h3 class="font-semibold mb-2">${title}</h3><canvas id="${containerId}-canvas"></canvas>`;
  const ctx = document.getElementById(`${containerId}-canvas`).getContext("2d");

  reports_drawChart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: ["#22c55e", "#f97316", "#ef4444"] }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
}

function renderBarChart(containerId, { title, labels, data }) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<h3 class="font-semibold mb-2">${title}</h3><canvas id="${containerId}-canvas"></canvas>`;
  const ctx = document.getElementById(`${containerId}-canvas`).getContext("2d");

  reports_drawChart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: ["#3b82f6"] }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}







/* -----------------------------
   Forecast & Predictive
   ----------------------------- */
function reports_renderForecast() {
  const root = reports_safeEl('reportsRoot');
  if (!root) return;
  reports_destroyCharts();

  const invs = reports_invoicesFiltered();
  // Revenue by month (using payments as realized revenue)
  const byMonth = {};
  invs.forEach(inv => {
    const pays = reports_paymentsOf(inv);
    pays.forEach(p => {
      const m = reports_monthKey(p.date);
      byMonth[m] = (byMonth[m] || 0) + p.amount;
    });
  });

  const months = Object.keys(byMonth).sort();
  const values = months.map(m => byMonth[m]);

  // Forecast next 3 months using simple linear regression y = a + b*x
  // x = 1..n
  const n = values.length;
  let nextMonths = [], forecastVals = [];
  if (n >= 2) {
    const xs = values.map((_, i) => i + 1);
    const sumX = xs.reduce((s, x) => s + x, 0);
    const sumY = values.reduce((s, y) => s + y, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const b = (n * sumXY - sumX * sumY) / Math.max(1, (n * sumX2 - sumX * sumX));
    const a = (sumY - b * sumX) / n;

    for (let k = 1; k <= 3; k++) {
      const x = n + k;
      const y = Math.max(0, a + b * x);
      forecastVals.push(y);
    }

    // Generate next 3 month labels
    if (months.length) {
      const lastLabel = months[months.length - 1]; // YYYY-MM
      const [yy, mm] = lastLabel.split('-').map(Number);
      let y = yy, m = mm;
      for (let k = 1; k <= 3; k++) {
        m++; if (m > 12) { m = 1; y++; }
        nextMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      }
    }
  }

  // Collection Risk Score (by customer): based on average delay after due date
  const riskRows = [];
  (state.customers || []).forEach(c => {
    const custInvs = invs.filter(inv => inv.customerId === c.id);
    let lateDays = [];
    custInvs.forEach(inv => {
      const due = reports_parseDate(inv.dueDate || inv.due);
      const pays = reports_paymentsOf(inv);
      const lastPay = pays.reduce((max, p) => (!max || p.date > max) ? p.date : max, null);
      if (due && lastPay) {
        const diff = reports_daysBetween(due, lastPay);
        if (diff > 0) lateDays.push(diff);
      } else if (due) {
        // unpaid past due counts as late until today
        const diff = reports_daysBetween(due, new Date());
        if (diff > 0) {
          lateDays.push(diff);
        }
      }
    });
    const avgLate = lateDays.length ? lateDays.reduce((s, d) => s + d, 0) / lateDays.length : 0;
    // score 0..100 (0 best, 100 worst). Cap at 90+ days -> 100
    const score = Math.max(0, Math.min(100, Math.round((avgLate / 90) * 100)));
    if (custInvs.length) riskRows.push({
      name: c.name || 'Unknown', score, avgLate: Math.round(avgLate), invoices: custInvs.length
    });
  });
  riskRows.sort((a, b) => b.score - a.score);

  // Render
  root.innerHTML = `
    <div class="col-span-12 grid grid-cols-12 gap-4">
      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">Revenue Forecast (next 3 months)</div>
        <canvas id="revFcChart"></canvas>
      </div>

      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">Collection Risk Scores (higher = riskier)</div>
        <div class="overflow-auto">
          <table class="min-w-[600px] w-full text-sm">
            <thead><tr class="text-white/60">
              <th class="text-left p-2">Customer</th>
              <th class="text-right p-2">Avg Days Late</th>
              <th class="text-right p-2">Risk Score (0–100)</th>
              <th class="text-right p-2">#Invoices</th>
            </tr></thead>
            <tbody>
              ${riskRows.slice(0, 20).map((r, index) => `
                <tr class="border-t border-white/10">
                  <td class="p-2">${reports_escape(r.name)}</td>
                  <td class="p-2 text-right">${reports_metricPill(r.avgLate, index + 1)}</td>
                  <td class="p-2 text-right ${r.score >= 70 ? 'text-red-300' : r.score >= 40 ? 'text-amber-300' : 'text-emerald-300'}">${reports_metricPill(r.score, index, r.score >= 70 ? 'rose' : r.score >= 40 ? 'amber' : 'teal')}</td>
                  <td class="p-2 text-right">${reports_metricPill(r.invoices, index + 3)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.Chart) {
    const allLabels = months.concat(nextMonths);
    const allData = values.concat(forecastVals.map(v => null));
    const fcData = new Array(values.length).fill(null).concat(forecastVals);

    Reports.charts.revfc = reports_drawChart(reports_safeEl('revFcChart'), {
      data: {
        labels: allLabels,
        datasets: [
          { type: 'line', label: 'Actual', data: values, borderWidth: 2, tension: .2, spanGaps: true },
          { type: 'line', label: 'Forecast', data: fcData, borderWidth: 2, borderDash: [6, 6], tension: .2 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
}

/* -----------------------------
   Router for tabs
   ----------------------------- */
function reports_renderTab(tab) {
  Reports.current=['financial','customers','invoices','forecast'].includes(tab)?tab:null;
  const filters=getReportFilters();
  if(window.rsReportsBeforeRender&&!window.rsReportsBeforeRender(Reports.current,filters))return;
  reports_destroyCharts();
  if (tab === 'financial') return reports_renderFinancial(filters);
  if (tab === 'customers') return reports_renderCustomers(filters);
  if (tab === 'invoices') return reports_renderInvoices(filters);
  if (tab === 'forecast') return reports_renderForecast(filters);
  reports_renderHome(filters);
}


/* -----------------------------
   Bootstrapping
   ----------------------------- */
// Initialize once DOM is ready
document.addEventListener('DOMContentLoaded', reports_initUI);

// Refresh business options after your DB/state loads.
// If you have a place after loadDB(), call reports_businessOptions() there too.
// Otherwise, we also refresh whenever invoices re-render (non-invasive).
const __oldRenderInvoicesForReports = typeof renderInvoices === 'function' ? renderInvoices : null;
if (__oldRenderInvoicesForReports) {
  renderInvoices = function (...args) {
    const res = __oldRenderInvoicesForReports.apply(this, args);
    // update filters (business list) on any invoice render
    reports_businessOptions();
    return res;
  };
}


function getReportFilters() {
  if(window.rsReportsScope)return window.rsReportsScope();
  const value=document.getElementById('bizSelect')?.value||'';return {bizId:value==='all'?'':value,start:document.getElementById('reportStartDate')?.value||'',end:document.getElementById('reportEndDate')?.value||'',valid:true};
}



function renderInvoiceReports(data) {
  const container = document.getElementById("invoiceReports");
  if (!container) return;
  container.innerHTML = "";

  // Filter invoices by business + date range
  const { bizId, start, end } = getReportFilters();
  let invoices = data.invoices || [];

  if (bizId) invoices = invoices.filter(inv => inv.businessId === bizId);
  if (start) invoices = invoices.filter(inv => new Date(inv.date) >= new Date(start));
  if (end) invoices = invoices.filter(inv => new Date(inv.date) <= new Date(end));

  // Invoice Status Breakdown (Donut)
  const statusCounts = { Paid: 0, Partial: 0, Pending: 0 };
  invoices.forEach(inv => {
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    if (paid >= (inv.total || 0)) statusCounts.Paid++;
    else if (paid > 0) statusCounts.Partial++;
    else statusCounts.Pending++;
  });

  container.innerHTML += `
    <h3 class="font-bold mt-4 mb-2">Invoice Status Breakdown</h3>
    <canvas id="invoiceDonut"></canvas>
  `;

  // Using Chart.js for Donut
  reports_drawChart(document.getElementById("invoiceDonut"), {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#4ade80', '#facc15', '#f87171'] }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function reports_initFilters() { return window.rsReportsInit?.(); }



/* Report-only date/scope/chart helpers; other report sections keep their code. */
function reports_calendarDay(value){const day=window.RanSanLedger?RanSanLedger.day(value):String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day?day:'';}
function reports_dateMatches(value,f=getReportFilters()){const day=reports_calendarDay(value);return f.valid!==false&&!!day&&(!f.start||day>=f.start)&&(!f.end||day<=f.end);}
function reports_expensesFiltered(){const f=getReportFilters();return (state.transactions||[]).filter(t=>t&&['expense','debit'].includes(String(t.type).toLowerCase())&&(!f.bizId||String(t.businessId)===String(f.bizId))&&reports_dateMatches(t.date,f));}
function reports_escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function reports_metricPill(value, index=0, tone=''){const colours=['violet','teal','blue','amber','pink','orange'];return '<span class="rs-reports-metric-pill" data-tone="'+(tone||colours[index%colours.length])+'">'+reports_escape(value)+'</span>';}
function reports_drawChart(canvas,config){if(window.rsReportsDrawChart){const chart=window.rsReportsDrawChart(canvas,config);if(chart)Reports.charts[chart.canvas.id]=chart;return chart;}if(typeof window.Chart!=='function')return null;config.options={...config.options,maintainAspectRatio:false};const chart=new Chart(canvas,config);if(chart.canvas)Reports.charts[chart.canvas.id]=chart;return chart;}

// Put this at the top of addbilling.js (after Chart.js is loaded)
if (window.Chart) {
  Chart.defaults.color = "#e5e7eb";
  Chart.defaults.plugins.legend.labels.color = "#e5e7eb";
  Chart.defaults.plugins.tooltip.titleColor = "#f9fafb";
  Chart.defaults.plugins.tooltip.bodyColor = "#f9fafb";
  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(17,17,17,0.8)";
  Chart.defaults.backgroundColor = "transparent";
}

let dashboardRendered = false;

// Make sure global charts object exists
// Make sure global charts object exists
let dashboardRenderTimer = null;

/* Dashboard reports use one read-only business scope. Existing entry points stay available. */
function rsDashboardDay(value) {
  const day = String(value || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const parsed = new Date(day + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === day ? day : '';
}
function rsDashboardLocalDay(date = new Date()) {
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
}
function rsDashboardMoney(value) {
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(value)||0);
}
function rsDashboardBuildModel(source, businessId = 'all', now = new Date()) {
  const cents = value => Math.round((Number(value)||0)*100);
  const all = !businessId || String(businessId).toLowerCase() === 'all';
  const allBusinesses = Array.isArray(source.businesses) ? source.businesses : Object.values(source.businesses || {});
  const allCustomers = source.customers || [];
  const invoices = (source.invoices || []).filter(inv =>
    (all || String(inv.businessId) === String(businessId)) && !/^(void|cancelled)$/i.test(inv.status || '')
  );
  const businessMap = new Map(allBusinesses.filter(b => all || String(b.id) === String(businessId)).map(b=>[String(b.id),b]));
  invoices.forEach(inv => {if (!businessMap.has(String(inv.businessId))) businessMap.set(String(inv.businessId),{id:inv.businessId,name:inv.businessName || String(inv.businessId || 'Unknown business')});});
  const businesses = Array.from(businessMap.values());
  const customerIds = new Set(invoices.map(inv=>String(inv.customerId)));
  const customers = allCustomers.filter(c=>customerIds.has(String(c.id)));
  customerIds.forEach(id=>{if(!customers.some(c=>String(c.id)===id))customers.push({id,name:id});});
  const today = rsDashboardLocalDay(now);
  const dayNumber = value => Date.parse(value+'T12:00:00Z')/86400000;
  function invoiceTotal(inv) {return Math.max(0,cents(inv.total))/100;}
  function invoicePaid(inv) {
    const payments = Array.isArray(inv.payments) ? inv.payments : [];
    const paid = payments.length ? payments.reduce((sum,p)=>sum+cents(p.amount),0) : cents(inv.paid);
    return Math.max(0,Math.min(cents(inv.total),paid))/100;
  }
  function outstanding(inv) {return Math.max(0,cents(invoiceTotal(inv))-cents(invoicePaid(inv)))/100;}
  const statusCounts={Paid:0,Pending:0,Overdue:0}, statusValues={Paid:0,Pending:0,Overdue:0};
  invoices.forEach(inv=>{
    const due=rsDashboardDay(inv.dueDate||inv.due);
    const kind=outstanding(inv)<=0?'Paid':due&&due<today?'Overdue':'Pending';
    statusCounts[kind]++;statusValues[kind]+=cents(invoiceTotal(inv));
  });
  Object.keys(statusValues).forEach(k=>statusValues[k]/=100);
  const months=Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
    return {key:rsDashboardLocalDay(d).slice(0,7),label:d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),invoiced:0,collected:0};
  });
  invoices.forEach(inv=>{
    const issue=rsDashboardDay(inv.date),month=months.find(m=>m.key===issue.slice(0,7));
    if(month&&issue<=today)month.invoiced+=cents(invoiceTotal(inv));
    (inv.payments||[]).forEach(p=>{
      const date=rsDashboardDay(p.date||inv.date),bucket=months.find(m=>m.key===date.slice(0,7));
      if(bucket&&date<=today)bucket.collected+=cents(p.amount);
    });
  });
  months.forEach(m=>{m.invoiced/=100;m.collected/=100;});
  const top=customers.map(c=>{
    const rows=invoices.filter(inv=>String(inv.customerId)===String(c.id));
    return {id:c.id,name:c.name||String(c.id),total:rows.reduce((s,i)=>s+cents(invoiceTotal(i)),0)/100,paid:rows.reduce((s,i)=>s+cents(invoicePaid(i)),0)/100,count:rows.length};
  }).sort((a,b)=>b.total-a.total).slice(0,5);
  const cashDays=Array.from({length:30},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i);
    return {date:rsDashboardLocalDay(d),label:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),inflow:0,overdue:0};
  });
  let undatedOutstanding=0;
  invoices.forEach(inv=>{
    const balance=outstanding(inv),due=rsDashboardDay(inv.dueDate||inv.due);
    if(!due){undatedOutstanding+=cents(balance);return;}
    const diff=Math.round(dayNumber(due)-dayNumber(today));
    if(diff<0)cashDays[0].overdue+=cents(balance);
    else if(diff<30)cashDays[diff].inflow+=cents(balance);
  });
  cashDays.forEach(d=>{d.inflow/=100;d.overdue/=100;});
  const performance=businesses.map(b=>{
    const rows=invoices.filter(i=>String(i.businessId)===String(b.id));
    const total=rows.reduce((s,i)=>s+cents(invoiceTotal(i)),0)/100;
    const collected=rows.reduce((s,i)=>s+cents(invoicePaid(i)),0)/100;
    return {id:b.id,name:b.name||String(b.id),total,collected,outstanding:Math.max(0,cents(total)-cents(collected))/100,efficiency:total>0?collected/total*100:null};
  });
  const total=performance.reduce((s,b)=>s+cents(b.total),0)/100, collected=performance.reduce((s,b)=>s+cents(b.collected),0)/100;
  const delays=customers.map(c=>{
    const rows=invoices.filter(i=>String(i.customerId)===String(c.id)), samples=[];
    rows.forEach(inv=>{
      const issue=rsDashboardDay(inv.date);
      const dates=(inv.payments||[]).filter(p=>Number(p.amount)>0).map(p=>rsDashboardDay(p.date)).filter(d=>d&&d<=today&&d>=issue).sort();
      if(issue&&dates.length)samples.push(Math.round(dayNumber(dates[dates.length-1])-dayNumber(issue)));
    });
    return {id:c.id,name:c.name||String(c.id),avgDelay:samples.length?Math.round(samples.reduce((s,v)=>s+v,0)/samples.length):null,noPayment:!rows.some(i=>(i.payments||[]).some(p=>Number(p.amount)>0)||Number(i.paid)>0),samples:samples.length};
  });
  return {businessId:String(businessId),all,invoices,customers,businesses,allCustomers,allBusinesses,today,months,top,cashDays,undatedOutstanding:undatedOutstanding/100,statusCounts,statusValues,performance,delays,invoiceTotal,invoicePaid,outstanding,efficiency:total>0?collected/total*100:null,total,collected};
}
function rsDashboardScope() {
  const selected=String(document.getElementById('bizSelect')?.value||'all');
  return rsDashboardBuildModel(state,selected);
}
/* Coordinate shared overview canvases with billing.js, which keeps its own chart handles. */
function rsDashboardReleaseOverviewCharts() {
  for (const id of ['revChart','statusChart']) {
    const canvas=document.getElementById(id);
    const chart=(canvas&&window.Chart?.getChart?.(canvas))||window.charts?.[id];
    if(chart&&typeof chart.destroy==='function')chart.destroy();
    if(window.charts)delete window.charts[id];
  }
}
function rsInstallDashboardChartBridge() {
  const original=window.renderCharts;
  if(typeof original!=='function'||original.rsDashboardBridge)return;
  const bridge=function(){
    rsDashboardReleaseOverviewCharts();
    const result=original.apply(this,arguments);
    try {rsRenderDashboardOverviewCharts();} catch(error) {rsDashboardReportError(error);}
    return result;
  };
  bridge.rsDashboardBridge=true;
  window.renderCharts=bridge;
}
/* Install before loadDB can finish, rather than waiting for window.load. */
rsInstallDashboardChartBridge();

function rsDashboardReportError(error) {
  console.error('RanSan dashboard rendering failed:',error);
  const notice=document.getElementById('rsDashboardRenderError');
  if(notice){notice.hidden=false;notice.textContent='Dashboard display error: '+(error?.message||String(error))+'. Please share this message if it continues.';}
}
function renderDashboardReports() {
  try {
    const notice=document.getElementById('rsDashboardRenderError');
    if(notice){notice.hidden=true;notice.textContent='';}
    return rsRenderDashboardReportsContent();
  } catch(error) {
    /* Data may already be loaded. Do not turn a report error into a loadDB error. */
    rsDashboardReportError(error);
  }
}

function rsDashboardDrawChart(id,config) {
  if(!window.Chart)return;
  const canvas=document.getElementById(id);if(!canvas)return;
  const existing=Chart.getChart?.(canvas)||window.charts?.[id];
  if(existing)existing.destroy();
  config.options={...config.options,responsive:true,maintainAspectRatio:false};
  const dark=!document.body.classList.contains('theme-minimal'),ink=dark?'#b7c5da':'#475569';
  config.options.plugins={...config.options.plugins,legend:{position:'bottom',...config.options.plugins?.legend,labels:{boxWidth:10,font:{size:10},color:ink,...config.options.plugins?.legend?.labels}}};
  for(const axis of Object.values(config.options.scales||{})){
    axis.ticks={maxTicksLimit:6,...axis.ticks,color:ink,font:{size:10}};
    axis.grid={...axis.grid,color:dark?'#ffffff0d':'#0f172a0d'};
  }
  window.charts=window.charts||{};
  window.charts[id]=new Chart(canvas,config);
}
function rsRenderDashboardOverviewCharts(model=rsDashboardScope()) {
  rsDashboardDrawChart('revChart',{
    type:'bar',data:{labels:model.months.map(m=>m.label),datasets:[
      {label:'Invoiced',data:model.months.map(m=>m.invoiced),backgroundColor:'#8b5cf6',borderRadius:4},
      {label:'Invoice payments',data:model.months.map(m=>m.collected),backgroundColor:'#14b8a6',borderRadius:4}
    ]},options:{scales:{y:{beginAtZero:true,ticks:{callback:v=>new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(v)}}},plugins:{tooltip:{callbacks:{label:c=>c.dataset.label+': '+rsDashboardMoney(c.raw)}}}}
  });
  rsDashboardDrawChart('statusChart',{type:'doughnut',data:{labels:Object.keys(model.statusCounts),datasets:[{data:Object.values(model.statusCounts),backgroundColor:['#14b8a6','#f59e0b','#fb7185'],borderWidth:0}]},options:{cutout:'70%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.label+': '+c.raw+' invoices'}}}}});
}
function rsRenderDashboardReportsContent() {
  if(typeof state==='undefined')return;
  rsRefreshMonthlyRevenueGoal();
  const model=rsDashboardScope(),money=rsDashboardMoney,esc=escapeHtml;
  const select=document.getElementById('bizSelect'),scope=document.getElementById('rsDashboardScopeLabel');
  if(scope)scope.textContent=(model.all?'All businesses · Consolidated':select?.selectedOptions?.[0]?.textContent.trim()||'Selected business')+' · All-time invoices';
  const empty=document.getElementById('rsDashboardEmpty');if(empty)empty.hidden=model.invoices.length>0;
  rsRenderDashboardOverviewCharts(model);
  const topColours=model.top.map(c=>rsDashboardEntityColour('customer',c.id,model.allCustomers));
  rsDashboardDrawChart('topCustomers',{type:'bar',data:{labels:model.top.map(c=>c.name),datasets:[{label:'Invoiced',data:model.top.map(c=>c.total),backgroundColor:topColours,borderRadius:5,maxBarThickness:32}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const c=model.top[ctx.dataIndex];return ['Invoiced: '+money(c.total),'Paid / allocated: '+money(c.paid),'Outstanding: '+money(c.total-c.paid),'Invoices: '+c.count]}}}},scales:{y:{beginAtZero:true},x:{ticks:{maxRotation:0}}}}});
  rsDashboardDrawChart('invoicesStatus',{type:'doughnut',data:{labels:Object.keys(model.statusValues),datasets:[{data:Object.values(model.statusValues),backgroundColor:['#14b8a6','#f59e0b','#fb7185'],borderWidth:0}]},options:{cutout:'70%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.label+': '+money(c.raw)}}}}});
  const note=document.getElementById('rsCashFlowNote');if(note)note.textContent='Overdue balances appear on today’s bar; future bars show unpaid amounts by due date.'+(model.undatedOutstanding>0?' '+money(model.undatedOutstanding)+' has no valid due date and is excluded.':'');
  rsDashboardDrawChart('cashFlow',{type:'bar',data:{labels:model.cashDays.map(d=>d.label),datasets:[{label:'Overdue',data:model.cashDays.map(d=>d.overdue),backgroundColor:'#fb7185',borderRadius:3},{label:'Due next 30 days',data:model.cashDays.map(d=>d.inflow),backgroundColor:'#14b8a6',borderRadius:3}]},options:{scales:{x:{stacked:true,ticks:{maxTicksLimit:5,maxRotation:0}},y:{stacked:true,beginAtZero:true}},plugins:{tooltip:{callbacks:{label:c=>c.dataset.label+': '+money(c.raw)}}}}});
  const businessColours=model.performance.map(b=>rsDashboardEntityColour('business',b.id,model.allBusinesses));
  rsDashboardDrawChart('businessPerformance',{type:'bar',data:{labels:model.performance.map(b=>b.name),datasets:[{label:'Invoiced',data:model.performance.map(b=>b.total),rsEntityIds:model.performance.map(b=>b.id),backgroundColor:businessColours,borderRadius:5,maxBarThickness:36}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.raw)}}},scales:{y:{beginAtZero:true},x:{ticks:{maxRotation:0}}}}});
  const valid=model.delays.filter(d=>d.avgDelay!==null),avg=valid.length?Math.round(valid.reduce((s,d)=>s+d.avgDelay,0)/valid.length):null;
  const metric=document.getElementById('avgDelayMetric');if(metric)metric.textContent='Average: '+(avg===null?'No dated payment history':avg+' days');
  const summary=document.getElementById('avgDelaySummary');
  if(summary){
    const cards=[
      ['same-day','Same-day',valid.filter(d=>d.avgDelay===0).length],
      ['slight','1–30 days',valid.filter(d=>d.avgDelay>0&&d.avgDelay<=30).length],
      ['late','Over 30 days',valid.filter(d=>d.avgDelay>30).length],
      ['unknown','No dated history',model.delays.filter(d=>d.avgDelay===null).length]
    ];
    summary.innerHTML=cards.map(([kind,label,count])=>'<div class="rs-delay-tile rs-delay-'+kind+'"><span class="rs-delay-tile-dot" aria-hidden="true"></span><span class="rs-delay-tile-label">'+label+': <strong>'+count+'</strong></span></div>').join('')+
      '<div class="rs-delay-tile rs-delay-overall"><span class="rs-delay-tile-dot" aria-hidden="true"></span><span class="rs-delay-tile-label">Overall Avg Delay: <strong>'+(avg===null?'No dated history':avg+' days')+'</strong></span></div>';
  }
  const delayTable=document.getElementById('avgDelay');
  if(delayTable){
    const rows=model.delays.map(d=>{
      const kind=d.avgDelay===null?'unknown':d.avgDelay===0?'same-day':d.avgDelay<=30?'slight':'late';
      const label=d.avgDelay===null?(d.noPayment?'No payments yet':'Dates unavailable'):d.avgDelay+' days';
      return '<tr><td>'+esc(d.name)+'</td><td><span class="rs-delay-value rs-delay-'+kind+'">'+label+'</span></td></tr>';
    }).join('');
    delayTable.innerHTML='<table><thead><tr><th scope="col">Customer</th><th scope="col">Avg delay</th></tr></thead><tbody>'+(rows||'<tr><td colspan="2">No customers with invoices in this scope.</td></tr>')+'</tbody></table>';
  }
  const delayRows=[...valid].sort((a,b)=>b.avgDelay-a.avgDelay).slice(0,10);
  const delayColours=delayRows.map(d=>rsDashboardEntityColour('customer',d.id,model.allCustomers));
  rsDashboardDrawChart('avgDelayChart',{type:'bar',data:{labels:delayRows.map(d=>d.name),datasets:[{label:'Days from invoice to latest payment',data:delayRows.map(d=>d.avgDelay),rsEntityIds:delayRows.map(d=>d.id),backgroundColor:delayColours,borderRadius:4,maxBarThickness:28}]},options:{scales:{y:{beginAtZero:true,title:{display:true,text:'Days'}},x:{ticks:{maxRotation:0}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw+' days'}}}}});
  const credit=document.getElementById('creditUsage');
  if(credit){
    const rows=model.customers.filter(c=>Number(c.creditLimit)>0);
    credit.innerHTML='<h3>Customer Credit Usage</h3><p class="rs-report-caption">Outstanding in selected scope / customer credit limit</p><div class="rs-credit-list">'+(rows.length?rows.map(c=>{
      const used=model.invoices.filter(i=>String(i.customerId)===String(c.id)).reduce((s,i)=>s+model.outstanding(i),0);
      const limit=Number(c.creditLimit),pct=used/limit*100;
      const colour=rsDashboardEntityColour('customer',c.id,model.allCustomers);
      return '<div class="rs-credit-item" style="--rs-credit-colour:'+colour+';--rs-progress-colour:'+colour+'">'+
        '<div class="rs-credit-label"><span class="rs-credit-customer"><i class="rs-credit-dot" aria-hidden="true"></i>'+esc(c.name||String(c.id))+'</span><strong>'+money(used)+' / '+money(limit)+'</strong></div>'+
        '<progress max="100" value="'+Math.min(100,pct)+'" style="accent-color:'+colour+'" aria-label="'+esc(c.name||String(c.id))+' credit used" aria-valuetext="'+pct.toFixed(1)+' percent used"></progress>'+
        '<small>'+pct.toFixed(1)+'% used</small></div>';
    }).join(''):'<p class="rs-report-caption">No customer credit limits in this scope.</p>')+'</div>';
  }
  const efficiency=document.getElementById('collectionEfficiency');if(efficiency){
    function efficiencyCard(b){
      const pct=b.efficiency;
      const colour=b.id===undefined?'#64748b':rsDashboardEntityColour('business',b.id,model.allBusinesses);
      return '<article class="rs-efficiency-item" style="--rs-efficiency-colour:'+colour+';--rs-efficiency-tint:'+colour+'14;--rs-efficiency-border:'+colour+'55;--rs-progress-colour:'+colour+'">'+
        '<div class="rs-efficiency-label"><strong><i class="rs-efficiency-dot" aria-hidden="true"></i>'+esc(b.name)+'</strong><b>'+(pct===null?'—':pct.toFixed(1)+'%')+'</b></div>'+
        '<progress max="100" value="'+(pct??0)+'" style="accent-color:'+colour+'" aria-label="'+esc(b.name)+' invoice collection percentage"></progress>'+
        '<p>'+money(b.collected)+' covered / '+money(b.total)+' invoiced</p><small>'+(pct===null?'No invoice value in this scope.':'Outstanding: '+money(b.outstanding))+'</small></article>';
    }
    efficiency.innerHTML='<h3>Collection Efficiency by Business</h3><p class="rs-report-caption">Recorded invoice payments ÷ invoiced value × 100. Includes allocated advances; unallocated advances are excluded.</p><div class="rs-efficiency-grid">'+(model.all?efficiencyCard({name:'Overall · weighted',total:model.total,collected:model.collected,outstanding:Math.max(0,model.total-model.collected),efficiency:model.efficiency}):'')+model.performance.map(efficiencyCard).join('')+'</div><details class="rs-report-details"><summary>How this works</summary><p>₹80,000 covered against ₹1,00,000 invoiced = 80%. This is invoice coverage, not a measure of how quickly customers pay. Each invoice’s covered amount is capped at its total so overpayments cannot raise the rate above 100%. Cancelled/void invoices are excluded. With no invoice value, the percentage is shown as —. Each colour identifies a business and matches its Business Performance chart colour. The weighted overall card uses a neutral slate colour; colours do not indicate collection risk.</p></details>';
  }
  renderDashboardReports.rendered=true; // Compatibility only: never blocks a refresh.
}

/* Refresh after the existing business/data/view handlers; do not mutate shared state. */
(function(){
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;renderDashboardReports();});}
  function init(){
    document.getElementById('bizSelect')?.addEventListener('change',schedule);
    for(const event of ['rs:data-loaded','rs:mutation','rs:finance-changed'])window.addEventListener(event,schedule);
    window.addEventListener('rs:sync',event=>{if(event.detail?.phase==='saved'&&['getall','financeget'].includes(event.detail.action))schedule();});
    rsInstallDashboardChartBridge();
    const originalShow=window.showView;
    if(typeof originalShow==='function')window.showView=function(name){const result=originalShow.apply(this,arguments);if(name==='dashboard')schedule();return result;};
    schedule();
  }
  if(document.readyState==='complete')queueMicrotask(init);
  else window.addEventListener('load',init,{once:true});
})();


//view commission report

/* Commission-only helpers: one business/customer/period scope for charts, rows and exports. */
const rsCommissionChartHandles={};
const rsCommissionColourMaps=new Map();
function rsCommissionRange(now=new Date()) {
  const day=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const mode=document.getElementById('rsCommissionPeriod')?.value||'month';
  let from=document.getElementById('commissionFrom')?.value||'',to=document.getElementById('commissionTo')?.value||'';
  if(mode==='month'){from=day(new Date(now.getFullYear(),now.getMonth(),1));to=day(now);}
  else if(mode==='year'){from=now.getFullYear()+'-01-01';to=day(now);}
  else if(mode==='all'){from='';to='';}
  return {mode,from,to,business:String(document.getElementById('commissionFilterBiz')?.value||'all'),customer:String(document.getElementById('commissionFilterCust')?.value||'all')};
}
function rsCommissionScopeInvoices(invoices, scope=rsCommissionRange()) {
  const rows=Array.isArray(invoices)?invoices:Object.values(invoices||{});
  return rows.filter(inv=>{
    if(/^(void|cancelled)$/i.test(inv.status||''))return false;
    if(scope.business!=='all'&&String(inv.businessId)!==scope.business)return false;
    if(scope.customer!=='all'&&String(inv.customerId)!==scope.customer)return false;
    const date=rsDashboardDay(inv.date||inv.createdAt);
    if((scope.from||scope.to)&&!date)return false;
    return (!scope.from||date>=scope.from)&&(!scope.to||date<=scope.to);
  });
}
function rsCommissionCustomersForBusiness(source,business) {
  const customers=Array.isArray(source.customers)?source.customers:Object.values(source.customers||{});
  if(!business||business==='all')return customers;
  const linked=new Set((source.invoices||[]).filter(i=>String(i.businessId)===String(business)).map(i=>String(i.customerId)));
  return customers.filter(c=>String(c.businessId)===String(business)||linked.has(String(c.id)));
}
function rsCommissionColours(id,labels,entityIds) {
  const palette=['#8b5cf6','#14b8a6','#3b82f6','#f59e0b','#ec4899','#f97316','#06b6d4','#6366f1','#84cc16','#d946ef','#10b981','#eab308'];
  let kind=/ByBusiness|Margin/.test(id)?'business':/TopCustomers/.test(id)?'customer':null;
  const entities=kind==='business'?Object.values(state.businesses||{}):state.customers||[];
  if(kind)return labels.map((label,index)=>{const entity=entities.find(e=>String(e.name||e.id)===String(label));return rsDashboardEntityColour(kind,entityIds?.[index]??entity?.id??label,entities);});
  const namespace=/TopServices/.test(id)?'service':id;
  if(!rsCommissionColourMaps.has(namespace))rsCommissionColourMaps.set(namespace,new Map());
  const map=rsCommissionColourMaps.get(namespace);
  return labels.map((label,index)=>{const key=String(entityIds?.[index]??label);if(!map.has(key))map.set(key,palette[map.size%palette.length]);return map.get(key);});
}
function rsCommissionDraw(canvas,config) {
  if(typeof canvas==='string')canvas=document.getElementById(canvas);
  if(!canvas||!window.Chart)return null;
  const previous=Chart.getChart?.(canvas)||rsCommissionChartHandles[canvas.id];
  previous?.destroy?.();
  const dark=!document.body.classList.contains('theme-minimal');
  const ink=dark?'#b8c6db':'#475569';
  config.options={...config.options,responsive:true,maintainAspectRatio:false};
  config.options.plugins={...config.options.plugins,legend:{position:'bottom',...config.options.plugins?.legend,labels:{boxWidth:10,color:ink,font:{size:10},...config.options.plugins?.legend?.labels}}};
  if(config.type==='bar')config.options.plugins.legend.display=false;
  for(const axis of Object.values(config.options.scales||{})){
    axis.ticks={maxTicksLimit:6,maxRotation:0,...axis.ticks,color:ink,font:{size:10}};
    axis.grid={...axis.grid,color:dark?'#ffffff0d':'#0f172a0d'};
  }
  for(const [index,dataset]of (config.data.datasets||[]).entries()){
    const colours=rsCommissionColours(canvas.id,config.data.labels||[],dataset.rsEntityIds);
    if(config.type==='line'){
      const line=['#8b5cf6','#f59e0b','#fb7185'][index%3];
      dataset.borderColor=line;dataset.backgroundColor=line+'18';dataset.pointBackgroundColor=colours;dataset.pointRadius=3;dataset.borderWidth=2;dataset.tension=.25;
    }else{
      dataset.backgroundColor=colours;dataset.borderColor=colours;dataset.hoverBackgroundColor=colours;
      dataset.borderWidth=config.type==='bar'?1:0;if(config.type==='bar'){dataset.borderRadius=5;dataset.maxBarThickness=30;}
    }
  }
  return rsCommissionChartHandles[canvas.id]=new Chart(canvas,config);
}

/* Keep commission category colours when existing theme handlers update charts. */
(function(){
  if(!window.Chart||window.rsCommissionPaletteInstalled)return;
  window.rsCommissionPaletteInstalled=true;
  const ids=new Set(['commissionTrendChart','commissionByBusinessChart','commissionPeriodChart','commissionPaymentChart','commissionStatusChart','commissionTopCustomers','commissionTopServices','commissionAgingChart','commissionMarginChart','commissionForecastChart','commissionPayoutChart','commissionRegionChart']);
  Chart.register({id:'rsCommissionCategoryColours',beforeUpdate(chart){
    if(!ids.has(chart.canvas?.id)||typeof state==='undefined')return;
    for(const [index,dataset]of (chart.data.datasets||[]).entries()){
      const colours=rsCommissionColours(chart.canvas.id,chart.data.labels||[],dataset.rsEntityIds);
      if(chart.config.type==='line'){const colour=['#8b5cf6','#f59e0b','#fb7185'][index%3];dataset.borderColor=colour;dataset.backgroundColor=colour+'18';dataset.pointBackgroundColor=colours;}
      else{dataset.backgroundColor=colours;dataset.borderColor=colours;dataset.hoverBackgroundColor=colours;}
    }
  }});
})();

/* Commission Report Module ------------------------------------------------- */
/* Usage:
   1) Add the HTML snippet above to index.html
   2) Paste this JS into billing.js (after state is available)
   3) Call renderCommissionReport() when the user opens the "Commission Report" tab
*/

(function () {
  // local chart handles
  let commissTrendChart = null;
  let commissBizChart = null;

  function safeId(id) { return document.getElementById(id); }

  // Build derived commission data from state.invoices
  function buildCommissionData(filteredInvoicesList) {
    const invoices = filteredInvoicesList || (state.invoices || []);
    // normalize invoices array
    const invs = rsCommissionScopeInvoices(invoices);

    // Utilities
    const monthKey = isoDate => rsDashboardDay(isoDate).slice(0,7) || 'Undated';

    // aggregates
    const byMonth = {};
    const byBusiness = {};
    const byCustomer = {};
    const byService = {}; // aggregate by serviceId via items
    const invoiceRows = [];

    for (const inv of invs) {
      const commission = Number(inv.commission || 0);
      const total = Number(inv.total || 0);
      const bizId = inv.businessId || 'unknown';
      const custId = inv.customerId || 'unknown';

      // invoice row for drilldown
      invoiceRows.push({
        id: inv.id,
        invoiceNumber: inv['invoice number'] || inv.invoiceNumber || inv.id,
        date: inv.date || inv.createdAt || '',
        businessId: bizId,
        businessName: (Object.values(state.businesses || {}).find(b=>String(b.id)===String(bizId))?.name) || (inv.businessName || '—'),
        customerId: custId,
        customerName: (state.customers || []).find(c => String(c.id) === String(custId))?.name || (inv.customerName || '—'),
        total,
        commission,
        status: inv.status || '—'
      });

      // by month
      const m = monthKey(inv.date || inv.createdAt);
      byMonth[m] = (byMonth[m] || 0) + commission;

      // by business
      byBusiness[bizId] = byBusiness[bizId] || { id: bizId, name: (Object.values(state.businesses || {}).find(b=>String(b.id)===String(bizId))?.name) || '—', commission: 0, count: 0 };
      byBusiness[bizId].commission += commission;
      byBusiness[bizId].count += commission ? 1 : 0;

      // by customer
      byCustomer[custId] = byCustomer[custId] || { id: custId, name: (state.customers || []).find(c => String(c.id) === String(custId))?.name || '—', commission: 0, count: 0 };
      byCustomer[custId].commission += commission;
      byCustomer[custId].count += commission ? 1 : 0;

      // by service: accumulate commissions proportionally if items contribute.
      if (Array.isArray(inv.items)) {
        // split commission among items proportional to amount
        const lineTotals = inv.items.map(it => Math.max(0,(Number(it.qty || 0) * Number(it.rate || 0)) || 0));
        const invoiceLineSum = lineTotals.reduce((s, x) => s + x, 0) || 0;
        const countedServices = new Set();
        inv.items.forEach((it, idx) => {
          const serviceId = it.serviceId || it.service || 'svc_unknown';
          const lineShare = invoiceLineSum ? (lineTotals[idx] / invoiceLineSum) : (1 / (inv.items.length || 1));
          const allocated = commission * lineShare;
          byService[serviceId] = byService[serviceId] || { id: serviceId, name: (state.services || []).find(s => String(s.id) === String(serviceId))?.service || it.serviceName || '—', commission: 0, count: 0 };
          byService[serviceId].commission += allocated;
          if (allocated && !countedServices.has(String(serviceId))) byService[serviceId].count += 1;
          countedServices.add(String(serviceId));
        });
      }
    }

    // Convert objects into sorted arrays
    const months = Object.keys(byMonth).sort();
    const monthSeries = months.map(m => ({ month: m, commission: byMonth[m] || 0 }));

    const businessSeries = Object.values(byBusiness).sort((a, b) => b.commission - a.commission);
    const customerSeries = Object.values(byCustomer).sort((a, b) => b.commission - a.commission);
    const serviceSeries = Object.values(byService).sort((a, b) => b.commission - a.commission);

    // Totals
    const totalCommission = invoiceRows.reduce((s, r) => s + Number(r.commission || 0), 0);
    const highestSingle = invoiceRows.reduce((m, r) => Math.max(m, Number(r.commission || 0)), 0);
    const avgPerInvoice = invoiceRows.length ? (totalCommission / invoiceRows.length) : 0;

    return {
      invoiceRows,
      monthSeries,
      businessSeries,
      customerSeries,
      serviceSeries,
      totalCommission,
      highestSingle,
      avgPerInvoice
    };
  }

  // Render KPIs
  function renderCommissionKPIs(data) {
    if (safeId('kpiTotalCommission')) safeId('kpiTotalCommission').textContent = formatINR(Number(data.totalCommission || 0));
    // this month
    const ym = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const thisMonthVal = (data.monthSeries.find(m => m.month === ym) || {}).commission || 0;
    if (safeId('kpiThisMonth')) safeId('kpiThisMonth').textContent = formatINR(thisMonthVal);
    if (safeId('kpiHighest')) safeId('kpiHighest').textContent = formatINR(Number(data.highestSingle || 0));
    if (safeId('kpiAvg')) safeId('kpiAvg').textContent = formatINR(Number(data.avgPerInvoice || 0));
  }

  // Chart helpers (uses Chart.js already on page)
  function renderCommissionTrendChart(data) {
    const ctx = document.getElementById('commissionTrendChart');
    if (!ctx) return;
    const labels = data.monthSeries.map(s => s.month);
    const series = data.monthSeries.map(s => Number(s.commission || 0));

    // destroy old
    if (commissTrendChart) { commissTrendChart.destroy(); commissTrendChart = null; }

    commissTrendChart = rsCommissionDraw(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Commission',
          data: series,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderCommissionByBusinessChart(data) {
    const ctx = document.getElementById('commissionByBusinessChart');
    if (!ctx) return;

    const labels = data.businessSeries.map(b => b.name || b.id);
    const series = data.businessSeries.map(b => Number(b.commission || 0));

    if (commissBizChart) { commissBizChart.destroy(); commissBizChart = null; }

    commissBizChart = rsCommissionDraw(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Commission', data: series, rsEntityIds:data.businessSeries.map(b=>b.id) }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // Render leaderboards and drilldown using text nodes, preserving the same IDs.
  function tableRow(tbody, values) {
    const tr=document.createElement('tr');
    values.forEach(value=>{const td=document.createElement('td');td.className='p-2';td.textContent=String(value??'—');tr.appendChild(td);});
    tbody.appendChild(tr);return tr;
  }
  // Presentation only: preserve table values, identity colours and invoice actions.
  function rsCommissionCellBadge(cell,value,className) {
    const badge=document.createElement('span');badge.className=className;
    badge.textContent=String(value??'—');cell.replaceChildren(badge);return badge;
  }
  function rsCommissionCustomerBadge(cell,id,name) {
    const colour=rsDashboardEntityColour('customer',id??name,state.customers);
    const tone=Math.max(0,rsDashboardColourPalette.indexOf(colour));
    return rsCommissionCellBadge(cell,name,'rs-commission-customer-pill rs-commission-customer-tone-'+tone);
  }
  function renderCommissionByCustomer(data) {
    const body=safeId('commissionByCustomerBody');if(!body)return;body.replaceChildren();
    data.customerSeries.slice(0,20).forEach((c,i)=>{const tr=tableRow(body,[i+1,c.name||c.id,formatINR(c.commission),c.count]);rsCommissionCustomerBadge(tr.cells[1],c.id,c.name||c.id);rsCommissionCellBadge(tr.cells[3],c.count,'rs-commission-count rs-commission-count-customer');});
    if(!data.customerSeries.length){const tr=tableRow(body,['No customers for this selection']);tr.cells[0].colSpan=4;}
  }
  function renderCommissionByService(data) {
    const body=safeId('commissionByServiceBody');if(!body)return;body.replaceChildren();
    data.serviceSeries.slice(0,20).forEach((c,i)=>{const tr=tableRow(body,[i+1,c.name||c.id,formatINR(c.commission),c.count]);rsCommissionCellBadge(tr.cells[3],c.count,'rs-commission-count rs-commission-count-service');});
    if(!data.serviceSeries.length){const tr=tableRow(body,['No services for this selection']);tr.cells[0].colSpan=4;}
  }
  function renderCommissionInvoiceTable(filtered) {
    const body=safeId('commissionInvoiceTable');if(!body)return;body.replaceChildren();
    for(const r of filtered||[]){
      const tr=tableRow(body,[r.invoiceNumber,String(r.date||'').slice(0,10),r.businessName,r.customerName,formatINR(r.total),formatINR(r.commission),r.status]);
      rsCommissionCustomerBadge(tr.cells[3],r.customerId,r.customerName);
      rsCommissionCellBadge(tr.cells[4],formatINR(r.total),'rs-commission-total-pill');
      const status=document.createElement('span');
      const statusText=String(r.status||'—'),statusKey=statusText.toLowerCase();
      status.className='rs-commission-status rs-commission-status-'+(statusKey==='paid'?'paid':statusKey==='overdue'?'overdue':/pending|partial|credit/.test(statusKey)?'pending':'neutral');status.textContent=statusText;tr.cells[6].replaceChildren(status);
      const business=document.createElement('span');business.className='rs-commission-business-pill';business.textContent=r.businessName||'—';tr.cells[2].replaceChildren(business);
      const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='btn';button.textContent='View / Print';button.onclick=()=>openPrint(r.id);td.appendChild(button);tr.appendChild(td);
    }
    if(!(filtered||[]).length){const tr=tableRow(body,['No invoices for this selection']);tr.cells[0].colSpan=8;}
  }

  // Fill filter selects
  function populateCommissionFilters() {
    const business=safeId('commissionFilterBiz'),customer=safeId('commissionFilterCust');
    const oldBiz=business?.value||'all',oldCustomer=customer?.value||'all';
    function fill(select,rows,label,previous){
      if(!select)return;
      select.replaceChildren(new Option(label,'all'));
      rows.forEach(row=>select.add(new Option(row.name||String(row.id),String(row.id))));
      select.value=Array.from(select.options).some(o=>o.value===String(previous))?String(previous):'all';
    }
    fill(business,Object.values(state.businesses||{}),'All Businesses',oldBiz);
    fill(customer,rsCommissionCustomersForBusiness(state,business?.value||'all'),'All Customers',oldCustomer);
  }

  // Apply filters and re-render invoice table
  function getFilteredInvoiceRows() {return buildCommissionData().invoiceRows;}

  // Exports: CSV and Print
  function exportCommissionCSV() {
    const data = buildCommissionData();
    const rows = data.invoiceRows.map(r => ({
      invoiceNumber: r.invoiceNumber,
      date: (r.date || '').slice(0, 10),
      business: r.businessName,
      customer: r.customerName,
      total: Number(r.total || 0),
      commission: Number(r.commission || 0),
      status: r.status
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(',')].concat(rows.map(row => headers.map(h => {
      let v = row[h]; if (v === null || v === undefined) v = '';
      // escape commas/newlines
      if (typeof v === 'string') {if (/^[\s]*[=+@-]/.test(v)) v="'"+v;v = `"${v.replace(/"/g, '""')}"`;}
      return v;
    }).join(','))).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `commission_report_${(new Date()).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCommissionPrint() {
    // Simple printable window: quick layout
    const data = buildCommissionData();
    const rows = data.invoiceRows;
    const html = `
      <html><head>
      <title>Commission Report</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:6px;border:1px solid #ddd;text-align:left}</style>
      </head><body>
      <h2>Commission Report</h2>
      <p>Total Commission: ${formatINR(data.totalCommission)}</p>
      <table><thead><tr><th>Invoice</th><th>Date</th><th>Business</th><th>Customer</th><th>Total</th><th>Commission</th><th>Status</th></tr></thead>
      <tbody>
      ${rows.map(r => `<tr><td>${escapeHtml(r.invoiceNumber)}</td><td>${(r.date || '').slice(0, 10)}</td><td>${escapeHtml(r.businessName)}</td><td>${escapeHtml(r.customerName)}</td><td style="text-align:right">${formatINR(r.total)}</td><td style="text-align:right">${formatINR(r.commission)}</td><td>${escapeHtml(r.status)}</td></tr>`).join('')}
      </tbody></table></body></html>
    `;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    // optionally call w.print(); but leave to user to confirm print
  }

  // Master render function (idempotent)
  window.renderCommissionReport = function renderCommissionReport() {
    // show view (hide others) — do not modify existing show/hide logic, but if you have a helper, use it.
    // If your app has highlightActive or view switching, call that; otherwise simply show section:
    // Example: hide other known views (conservative: don't hide anything app-wide), instead show this panel:
    const view = safeId('view-commission-report');
    if (!view) {
      console.warn('Commission Report view not found in DOM.');
      return;
    }
    // show it
    view.classList.remove('hidden');

    // Local preparation avoids legacy initializers resetting business/customer choices.
    populateCommissionFilters();
    const range=rsCommissionRange();
    if(safeId('commissionFrom')){safeId('commissionFrom').disabled=false;safeId('commissionFrom').readOnly=false;safeId('commissionFrom').value=range.from;}
    if(safeId('commissionTo')){safeId('commissionTo').disabled=false;safeId('commissionTo').readOnly=false;safeId('commissionTo').value=range.to;}
    if(range.from&&range.to&&range.from>range.to){showToast('Start date must be on or before end date.','error');return;}
    const label=safeId('rsCommissionPeriodLabel');
    if(label)label.textContent=(safeId('commissionFilterBiz')?.selectedOptions[0]?.textContent||'All Businesses')+' · '+(safeId('commissionFilterCust')?.selectedOptions[0]?.textContent||'All Customers')+' · '+(range.from||'Beginning')+' → '+(range.to||'Latest');
    const data=buildCommissionData();

    // KPIs
    renderCommissionKPIs(data);

    // Charts
    renderCommissionTrendChart(data);
    renderCommissionByBusinessChart(data);

    // leaderboards
    renderCommissionByCustomer(data);
    renderCommissionByService(data);

    // All report components use the already-populated scope.

    // default invoice table (no filters)
    renderCommissionInvoiceTable(data.invoiceRows);

    // wire events (idempotent)
    if (safeId('commissionApplyFilters')) {
      safeId('commissionApplyFilters').onclick = () => {
        window.renderCommissionReport();

      };
    }
    if (safeId('commissionExportCSV')) {
      safeId('commissionExportCSV').onclick = exportCommissionCSV;
    }
    if (safeId('commissionExportPrint')) {
      safeId('commissionExportPrint').onclick = exportCommissionPrint;
    }

    const refresh=()=>window.renderCommissionReport();
    if(safeId('commissionFilterBiz'))safeId('commissionFilterBiz').onchange=()=>{populateCommissionFilters();refresh();};
    if(safeId('commissionFilterCust'))safeId('commissionFilterCust').onchange=refresh;
    if(safeId('rsCommissionPeriod'))safeId('rsCommissionPeriod').onchange=refresh;
    for(const id of ['commissionFrom','commissionTo'])if(safeId(id))safeId(id).onchange=()=>{if(safeId('rsCommissionPeriod'))safeId('rsCommissionPeriod').value='custom';refresh();};
    renderCommissionAdvancedReports();
    console.log('✅ Commission report rendered');
  };

  // expose a helper to refresh data when invoices change
  window.refreshCommissionReport = function () {
    if (document.getElementById('view-commission-report') && !document.getElementById('view-commission-report').classList.contains('hidden')) {
      renderCommissionReport();
    }
  };

  // If your app calls renderAll() after saves, you can call refreshCommissionReport() from there
  // Example (if you have a central save callback): window.refreshCommissionReport();
})();

function renderCommissionAdvancedReports() {
  console.log("📊 Rendering Advanced Commission Reports...");

  // --- Normalize state safely
  const businesses = Object.values(state.businesses || {});
  const customers = Array.isArray(state.customers) ? state.customers : Object.values(state.customers || {});
  const services = Array.isArray(state.services) ? state.services : Object.values(state.services || {});
  let invoices = Array.isArray(state.invoices) ? state.invoices : Object.values(state.invoices || {});

  invoices = rsCommissionScopeInvoices(invoices);

  // --- Build commissions dataset
  const commissions = invoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    businessId: inv.businessId,
    customerId: inv.customerId,
    serviceIds: (inv.items || []).map(it => it.serviceId),
    date: new Date(String(inv.date||inv.createdAt||'').slice(0,10)+'T12:00:00Z'),
    status: inv.status,
    total: Number(inv.total || 0),
    commission: Number(inv.commission || 0),
    payments: inv.payments || [],
    region: customers.find(c => String(c.id) === String(inv.customerId))?.region?.trim?.() || "Region not recorded",
    agent: inv.agent || "Unassigned"
  }));

  // --- Reset old charts
  if (window.commCharts) {
    Object.values(window.commCharts).forEach(c => c?.destroy?.());
  }
  window.commCharts = {};

  // --- Utility
  const groupSum = (arr, keyFn, valFn) => {
    const out = {};
    arr.forEach(item => {
      const key = keyFn(item);
      out[key] = (out[key] || 0) + valFn(item);
    });
    return out;
  };

  // === 1. Commission by Time Period (Monthly)
  const ctxPeriod = document.getElementById("commissionPeriodChart");
  if (ctxPeriod) {
    const grouped = groupSum(
      commissions,
      c => Number.isFinite(c.date.getTime())?`${c.date.getUTCFullYear()}-${String(c.date.getUTCMonth() + 1).padStart(2, "0")}`:'Undated',
      c => c.commission
    );
    const labels = Object.keys(grouped).sort();
    window.commCharts.period = rsCommissionDraw(ctxPeriod, {
      type: "line",
      data: {
        labels,
        datasets: [{ label: "Commission (₹)", data: labels.map(l => grouped[l]) }]
      }
    });
  }

  // === 2. Commission by Payment Mode
  const ctxPay = document.getElementById("commissionPaymentChart");
  if (ctxPay) {
    const grouped = {};
    commissions.forEach(c=>{
      const payments=c.payments.filter(p=>Number(p.amount)>0);
      const totalPaid=payments.reduce((sum,p)=>sum+Number(p.amount),0);
      const coverage=c.total>0?Math.min(1,totalPaid/c.total):0;
      const allocated=c.commission*coverage;
      payments.forEach(p=>{const method=p.method||p.mode||'Payment mode not recorded';grouped[method]=(grouped[method]||0)+(totalPaid?allocated*Number(p.amount)/totalPaid:0);});
      const remaining=c.commission-allocated;if(remaining)grouped['Not allocated from invoice payments']=(grouped['Not allocated from invoice payments']||0)+remaining;
    });
    window.commCharts.pay = rsCommissionDraw(ctxPay, {
      type: "doughnut",
      data: { labels: Object.keys(grouped), datasets: [{ data: Object.values(grouped) }] }
    });
  }

  // === 3. Commission by Status
  const ctxStatus = document.getElementById("commissionStatusChart");
  if (ctxStatus) {
    const grouped = groupSum(commissions, c => c.status || "Unknown", c => c.commission);
    window.commCharts.status = rsCommissionDraw(ctxStatus, {
      type: "pie",
      data: { labels: Object.keys(grouped), datasets: [{ data: Object.values(grouped) }] }
    });
  }

  // === 4. Commission Recovery Ratio
  const totalCommission = commissions.reduce((a, b) => a + b.commission, 0);
  const recovered = commissions.reduce((a, b) => a + (b.payments?.length ? b.commission : 0), 0);
  const ratio = totalCommission ? (recovered / totalCommission) * 100 : 0;
  const recoveryEl = document.getElementById("commissionRecovery");
  if (recoveryEl) recoveryEl.textContent = ratio.toFixed(1) + "%";

  // === 5. Top Customers
  const ctxTopCust = document.getElementById("commissionTopCustomers");
  if (ctxTopCust) {
    const grouped = groupSum(commissions, c => c.customerId, c => c.commission);
    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 5);
    window.commCharts.topCust = rsCommissionDraw(ctxTopCust, {
      type: "bar",
      data: {
        labels: sorted.map(([id]) => customers.find(c => String(c.id) === String(id))?.name || id),
        datasets: [{ label: "Commission (₹)", data: sorted.map(x => x[1]), rsEntityIds:sorted.map(x=>x[0]) }]
      }
    });
  }

  // === 6. Top Services
  const ctxTopSvc = document.getElementById("commissionTopServices");
  if (ctxTopSvc) {
    const grouped = {};
    invoices.forEach(inv=>{
      const items=Array.isArray(inv.items)?inv.items:[];
      const lineAmounts=items.map(it=>Math.max(0,Number(it.qty||0)*Number(it.rate||0)));
      const sum=lineAmounts.reduce((a,b)=>a+b,0);
      items.forEach((it,index)=>{const id=it.serviceId||it.service||'svc_unknown';grouped[id]=(grouped[id]||0)+Number(inv.commission||0)*(sum?lineAmounts[index]/sum:1/items.length);});
    });
    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 5);
    window.commCharts.topSvc = rsCommissionDraw(ctxTopSvc, {
      type: "bar",
      data: {
        labels: sorted.map(([id]) => services.find(s => String(s.id) === String(id))?.service || id),
        datasets: [{ label: "Commission (₹)", data: sorted.map(x => x[1]), rsEntityIds:sorted.map(x=>x[0]) }]
      }
    });
  }

  // === 7. Commission Aging
  const ctxAging = document.getElementById("commissionAgingChart");
  if (ctxAging) {
    const now = new Date();
    const buckets = { "0–30d": 0, "31–60d": 0, "61–90d": 0, ">90d": 0 };
    commissions.forEach(c => {
      if(!Number.isFinite(c.date.getTime()))return;
      const age = (now - c.date) / (1000 * 60 * 60 * 24);
      if (age <= 30) buckets["0–30d"] += c.commission;
      else if (age <= 60) buckets["31–60d"] += c.commission;
      else if (age <= 90) buckets["61–90d"] += c.commission;
      else buckets[">90d"] += c.commission;
    });
    window.commCharts.aging = rsCommissionDraw(ctxAging, {
      type: "bar",
      data: { labels: Object.keys(buckets), datasets: [{ data: Object.values(buckets) }] }
    });
  }

  // === 8. Business Commission Margin
  const ctxMargin = document.getElementById("commissionMarginChart");
  if (ctxMargin) {
    const groupedComm = groupSum(commissions, c => c.businessId, c => c.commission);
    const groupedTotal = groupSum(commissions, c => c.businessId, c => c.total);
    const labels = Object.keys(groupedComm);
    window.commCharts.margin = rsCommissionDraw(ctxMargin, {
      type: "bar",
      data: {
        labels: labels.map(id => businesses.find(b => String(b.id) === String(id))?.name || id),
        datasets: [{ label: "Margin %", rsEntityIds:labels, data: labels.map(id => groupedTotal[id] ? (groupedComm[id] / groupedTotal[id]) * 100 : 0) }]
      }
    });
  }

  // === 9. Forecast vs Target
  const ctxForecast = document.getElementById("commissionForecastChart");
  if (ctxForecast) {
    const grouped = groupSum(
      commissions,
      c => Number.isFinite(c.date.getTime())?`${c.date.getUTCFullYear()}-${String(c.date.getUTCMonth() + 1).padStart(2, "0")}`:'Undated',
      c => c.commission
    );
    const labels = Object.keys(grouped).filter(label=>label!=='Undated').sort();
    const data = labels.map(l => grouped[l]);

    // Simple linear regression forecast (next 3 months)
    const n = data.length;
    const x = data.map((_, i) => i + 1);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = data.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, xi, i) => a + xi * data[i], 0);
    const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
    const intercept = n ? (sumY - slope * sumX) / n : 0;

    const forecast = [1, 2, 3].map(i => n ? Math.max(0,slope * (n + i) + intercept) : null);
    const target = 100000; // Example static target

    window.commCharts.forecast = rsCommissionDraw(ctxForecast, {
      type: "line",
      data: {
        labels: [...labels, "M+1", "M+2", "M+3"],
        datasets: [
          { label: "Actual", data: data.concat([null, null, null]), borderColor: "blue" },
          { label: "Forecast", data: [...Array(data.length).fill(null), ...forecast], borderColor: "orange" },
          { label: "Target", data: [...Array(data.length + 3).fill(target)], borderColor: "red", borderDash: [5, 5] }
        ]
      }
    });
  }

  // === 10. Commission Payout by Agent
  const ctxPayout = document.getElementById("commissionPayoutChart");
  if (ctxPayout) {
    const grouped = groupSum(commissions, c => c.agent, c => c.commission);
    window.commCharts.payout = rsCommissionDraw(ctxPayout, {
      type: "bar",
      data: { labels: Object.keys(grouped), datasets: [{ data: Object.values(grouped) }] }
    });
  }

  // === 11. Commission by Region
  const ctxRegion = document.getElementById("commissionRegionChart");
  if (ctxRegion) {
    const grouped = groupSum(commissions, c => c.region, c => c.commission);
    window.commCharts.region = rsCommissionDraw(ctxRegion, {
      type: "doughnut",
      data: { labels: Object.keys(grouped), datasets: [{ data: Object.values(grouped) }] }
    });
  }

  console.log("✅ Advanced Commission Reports rendered");
}

/* =============== ADVANCED CUSTOMER STATEMENT - JS (standalone) =============== */

/* Helper to get element by id, but do not override existing safeEl */
function adv2_get(id) {
  if (!id) return null;
  if (typeof document !== "undefined" && document.getElementById(id)) return document.getElementById(id);
  if (typeof safeEl === "function") return safeEl(id);
  return null;
}

/* Statement implementation is isolated in statement-workspace.js. Public names remain. */
function adv2_populateCustomers() { return window.rsStatementPopulate?.(); }
function adv2_open(customerId) { return window.rsStatementOpenAdvanced?.(customerId); }
function adv2_close() { return window.rsStatementCloseAdvanced?.(); }
function adv2_render(customerId) { return window.rsStatementRenderAdvanced?.(customerId); }
function adv2_exportCSV() { return window.rsStatementExport?.('advanced', 'csv'); }
function adv2_exportPDF() { return window.rsStatementExport?.('advanced', 'pdf'); }

/* Utilities */
function smallCardHTML(title, value) {
  return `<div style="background:#081025;padding:12px;border-radius:10px;color:#e6eef8"><div style="color:#9aa6b2">${escapeHtml(title)}</div><div style="font-weight:700">${escapeHtml(value)}</div></div>`;
}
function chartOpts() {
  return { plugins: { legend: { labels: { color: '#e6eef8' } } }, scales: { x: { ticks: { color: '#e6eef8' } }, y: { ticks: { color: '#e6eef8' } } } };
}
function generatePalette(n) {
  const preset = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#7c3aed'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(preset[i % preset.length]);
  return out;
}
function escapeHtml(s) { if (s === null || s === undefined) return ''; return String(s).replaceAll ? s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* Preserve public helper names, without recursively calling themselves. */
function safeDateDisplay(value) {
  if (window.RanSanLedger) return window.RanSanLedger.day(value);
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}
function formatINR(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',minimumFractionDigits:2}).format(Number(value)||0);
}

/* =============== End ADVANCED CUSTOMER STATEMENT JS =============== */


// Responsive sidebar behavior is owned by layout.js.

/* Restore identity palettes after chart updates, including theme changes. */
(function () {
  function install() {
    if (!window.Chart || window.rsDashboardIdentityColoursInstalled) return;
    window.rsDashboardIdentityColoursInstalled = true;
    Chart.register({
      id:'rsDashboardIdentityColours',
      beforeUpdate(chart) {
        const kind = chart.canvas?.id === 'avgDelayChart' ? 'customer' : chart.canvas?.id === 'businessPerformance' ? 'business' : null;
        if (!kind || typeof state === 'undefined') return;
        const entities = kind === 'customer' ? state.customers || [] : Object.values(state.businesses || {});
        for (const dataset of chart.data.datasets || []) {
          const colours = (chart.data.labels || []).map((label,index) => {
            const entity = entities.find(e => String(e.name || e.id) === String(label));
            return rsDashboardEntityColour(kind,dataset.rsEntityIds?.[index] ?? entity?.id ?? label,entities);
          });
          dataset.backgroundColor = colours;
          dataset.hoverBackgroundColor = colours;
          dataset.borderColor = colours;
        }
      }
    });
  }
  install();
})();
