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

// Build notification list based on due invoices
function renderNotifications() {
  const notifList = document.getElementById("notifList");
  const notifBadge = document.getElementById("notifBadge");
  const noNotif = document.getElementById("noNotif");

  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let nowDate = new Date();

  // Get due/overdue invoices
  const dueInvoices = state.invoices.filter(inv => {
    const due = inv.dueDate || inv.due;
    const dueDate = due ? new Date(due) : null;
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    return dueDate && inv.total > paid; // only unpaid invoices
  });

  // Sort by nearest due date first
  dueInvoices.sort((a, b) => new Date(a.dueDate || a.due) - new Date(b.dueDate || b.due));

  // Build UI items
  dueInvoices.forEach(inv => {
    const cust = state.customers.find(c => c.id === inv.customerId) || {};
    const dueDate = new Date(inv.dueDate || inv.due);
    const daysLeft = Math.ceil((dueDate - nowDate) / (1000 * 60 * 60 * 24));
    const overdue = daysLeft < 0;

    const li = document.createElement("li");
    li.className = `p-2 rounded-lg cursor-pointer hover:bg-gray-800 flex justify-between items-center ${overdue ? 'bg-red-600/20' : 'bg-amber-600/20'}`;
    li.innerHTML = `
      <div>
        <div class="text-sm font-medium">${cust.name || "Unknown Customer"}</div>
        <div class="text-xs text-gray-300">
          Invoice: ${inv.invoiceNumber || inv.id} | Due: ${dueDate.toISOString().slice(0, 10)}
        </div>
      </div>
      <span class="text-xs ${overdue ? 'text-red-400' : 'text-amber-300'}">${overdue ? 'Overdue' : daysLeft + 'd left'}</span>
    `;

    // Click → open invoice in edit mode
    li.addEventListener("click", () => {
      openEditInvoice(inv.id);
      document.getElementById("notifPanel").classList.add("hidden");
    });

    notifList.appendChild(li);
  });

  // Badge & No Notifications
  notifBadge.classList.toggle("hidden", dueInvoices.length === 0);
  noNotif.classList.toggle("hidden", dueInvoices.length > 0);
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
function updateRevenueGoalProgress(current, goal) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  const circle = document.getElementById("revGoalProgress");
  const text = document.getElementById("revGoalText");
  if (!circle || !text) return;

  const radius = 50; // match your SVG radius
  const circumference = 2 * Math.PI * radius;

  // Ensure initial state
  circle.setAttribute("stroke-dasharray", circumference);
  if (!circle.style.transition) {
    circle.style.transition = "stroke-dashoffset 1s ease-in-out";
  }

  // Animate ring fill
  const offset = circumference - (pct / 100) * circumference;
  requestAnimationFrame(() => {
    circle.setAttribute("stroke-dashoffset", offset);
  });

  // Animate number count-up
  let start = 0;
  const step = () => {
    start += Math.ceil(pct / 20);
    if (start > pct) start = pct;
    text.textContent = start + "%";
    if (start < pct) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
  Object.values(Reports.charts).forEach(ch => { try { ch.destroy(); } catch (e) { } });
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
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(+d) ? null : d;
}
function reports_daysBetween(d1, d2) { return Math.round((d2 - d1) / (1000 * 60 * 60 * 24)); }
function reports_endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function reports_startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function reports_invoicesFiltered() {
  const biz = reports_safeEl('reportsBiz')?.value || '';
  const range = reports_safeEl('reportsRange')?.value || '30';
  const today = new Date();
  let from = null;
  if (range !== 'all') {
    from = new Date();
    from.setDate(today.getDate() - Number(range));
  }
  return (state.invoices || []).filter(inv => {
    if (biz && inv.businessId !== biz) return false;
    const d = reports_parseDate(inv.date || inv.created || inv.invoiceDate);
    if (from && d && d < from) return false;
    return true;
  });
}

function reports_paymentsOf(inv) {
  // Normalize payments to {amount, date, method}
  return (inv.payments || []).map(p => ({
    amount: Number(p.amount || 0),
    date: reports_parseDate(p.date || p.paidOn || inv.date),
    method: (p.method || p.mode || 'Unknown').toString().toLowerCase()
  })).filter(p => p.amount > 0 && p.date);
}

function reports_businessOptions(bizArray = state.businessesArray) {
  const select = document.getElementById("reportBizSelect");
  if (!select) return;

  select.innerHTML = `<option value="">All Businesses</option>`;
  (bizArray || []).forEach(b => {
    select.innerHTML += `<option value="${b.id}">${b.name}</option>`;
  });

  // On change → re-render reports
  select.onchange = () => renderAllReports();
}


function reports_initUI() {
  if (Reports.initialized) return;
  Reports.initialized = true;

  // Wire nav button
  const navBtn = reports_safeEl('navReports');
  if (navBtn) {
    navBtn.addEventListener('click', () => {
      reports_showViewReports();
      Reports.current = null; // reset to home
      reports_renderHome();
    });
  }

  // Wire tiles
  reports_safeEl('reportsTiles')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-report]');
    if (!btn) return;
    const tab = btn.getAttribute('data-report');
    Reports.current = tab;
    reports_showViewReports();
    reports_renderTab(tab);
  });

  // Filters
  ['reportsRange', 'reportsBiz'].forEach(id => {
    const el = reports_safeEl(id);
    if (el) el.addEventListener('change', () => {
      if (Reports.current) {
        reports_renderTab(Reports.current);
      } else {
        reports_renderHome();
      }
    });
  });

  // First-time population for businesses
  reports_businessOptions();
}

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
  const txs = (state.transactions || []); // optional expenses
  const range = reports_safeEl('reportsRange')?.value || '30';
  const from = (range === 'all') ? null : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);

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
      const cat = (it.service || it.category || 'Uncategorized').toString();
      const amt = Number(it.total || it.amount || it.price || 0) * (it.qty || 1);
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
    const paid = (inv.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const dueAmt = Math.max(0, total - paid);
    if (dueAmt <= 0) return;
    const dueDate = reports_parseDate(inv.dueDate || inv.due);
    const anchor = dueDate || reports_parseDate(inv.date) || new Date();
    const days = reports_daysBetween(anchor, new Date());
    if (days <= 30) agingBuckets['0-30'] += dueAmt;
    else if (days <= 60) agingBuckets['31-60'] += dueAmt;
    else if (days <= 90) agingBuckets['61-90'] += dueAmt;
    else agingBuckets['90+'] += dueAmt;
  });

  // Render
  root.innerHTML = `
    <div class="col-span-12 grid grid-cols-12 gap-4">
      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">Cash Flow Timeline (Income vs Expenses)</div>
        <canvas id="cfChart"></canvas>
      </div>
      <div class="glass rounded-2xl p-4 col-span-12">
        <div class="font-semibold mb-2">MoM Trend by Category (Top 5)</div>
        <canvas id="momCatChart"></canvas>
      </div>
      <div class="glass rounded-2xl p-4 col-span-12 md:col-span-6">
        <div class="font-semibold mb-1">Daily Burn Forecast</div>
        <div class="text-sm text-white/70 mb-2">Goal: ${reports_formatINR(REPORTS_MONTHLY_GOAL)} • Projected: <span class="${meetsGoal ? 'text-emerald-300' : 'text-amber-300'}">${reports_formatINR(projected)}</span></div>
        <div class="h-2 bg-white/10 rounded">
          <div class="h-2 ${meetsGoal ? 'bg-emerald-400' : 'bg-amber-400'}" style="width:${Math.min(100, Math.round((projected / REPORTS_MONTHLY_GOAL) * 100))}%; transition:width .8s;"></div>
        </div>
        <div class="text-xs text-white/60 mt-2">This month collected: ${reports_formatINR(thisMonthRevenue)} • Days elapsed: ${daysElapsed}/${daysInMonth}</div>
      </div>
      <div class="glass rounded-2xl p-4 col-span-12 md:col-span-6">
        <div class="font-semibold mb-2">Aging Report (Outstanding)</div>
        <canvas id="agingChart"></canvas>
      </div>
    </div>
  `;

  // Charts
  const ctx1 = reports_safeEl('cfChart');
  const ctx2 = reports_safeEl('momCatChart');
  const ctx3 = reports_safeEl('agingChart');

  if (window.Chart) {
    Reports.charts.cf = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: keys, datasets: [
          { label: 'Income', data: incomeSeries, borderWidth: 2, fill: false, tension: .2 },
          { label: 'Expenses', data: expenseSeries, borderWidth: 2, fill: false, tension: .2 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } } }
    });

    Reports.charts.mom = new Chart(ctx2, {
      type: 'line',
      data: { labels: monthKeys, datasets: catDatasets },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    Reports.charts.aging = new Chart(ctx3, {
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
              ${clvRows.map(r => `
                <tr class="border-t border-white/10">
                  <td class="p-2">${r.name}</td>
                  <td class="p-2 text-right">${reports_formatINR(r.clv)}</td>
                  <td class="p-2 text-right">${r.freq}</td>
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
    Reports.charts.pareto = new Chart(ctx, {
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
    title: "Payment Methods",
    labels: ["Cash", "UPI", "Bank Transfer"],
    data: methodData
  });

  renderBarChart("dsoChart", {
    title: "Avg Days to Payment (DSO)",
    labels: ["DSO"],
    data: [dsoData]
  });
}

function getInvoiceStatusData() {
  if (!state.invoices) return [0, 0, 0];
  let paid = 0, partial = 0, pending = 0;
  state.invoices.forEach(inv => {
    if (inv.status === "Paid") paid++;
    else if (inv.status === "Partial") partial++;
    else pending++;
  });
  return [paid, partial, pending];
}

function getPaymentMethodData() {
  if (!state.invoices) return [0, 0, 0];
  let cash = 0, upi = 0, bank = 0;
  state.invoices.forEach(inv => {
    (inv.payments || []).forEach(p => {
      if (p.method === "Cash") cash++;
      else if (p.method === "UPI") upi++;
      else bank++;
    });
  });
  return [cash, upi, bank];
}

function getDSOData() {
  if (!state.invoices) return 0;
  let totalDays = 0, count = 0;
  state.invoices.forEach(inv => {
    if (inv.date && inv.dueDate) {
      const start = new Date(inv.date);
      const end = new Date(inv.dueDate);
      totalDays += (end - start) / (1000 * 60 * 60 * 24);
      count++;
    }
  });
  return count ? (totalDays / count).toFixed(1) : 0;
}

function renderDonutChart(containerId, { title, labels, data }) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<h3 class="font-semibold mb-2">${title}</h3><canvas id="${containerId}-canvas"></canvas>`;
  const ctx = document.getElementById(`${containerId}-canvas`).getContext("2d");

  new Chart(ctx, {
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

  new Chart(ctx, {
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
              ${riskRows.slice(0, 20).map(r => `
                <tr class="border-t border-white/10">
                  <td class="p-2">${r.name}</td>
                  <td class="p-2 text-right">${r.avgLate}</td>
                  <td class="p-2 text-right ${r.score >= 70 ? 'text-red-300' : r.score >= 40 ? 'text-amber-300' : 'text-emerald-300'}">${r.score}</td>
                  <td class="p-2 text-right">${r.invoices}</td>
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

    Reports.charts.revfc = new Chart(reports_safeEl('revFcChart'), {
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
  const filters = getReportFilters(); // <-- collect dates + business
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
  return {
    bizId: document.getElementById("reportsBiz")?.value || "",
    start: document.getElementById("reportStartDate")?.value || "",
    end: document.getElementById("reportEndDate")?.value || ""
  };
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
  new Chart(document.getElementById("invoiceDonut"), {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#4ade80', '#facc15', '#f87171'] }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function reports_initFilters() {
  const bizSelect = document.getElementById("reportsBiz");
  if (!bizSelect) return;

  // Clear & fill with business names
  bizSelect.innerHTML = `<option value="">All Businesses</option>`;
  const bizArr = Array.isArray(state.businessesArray)
    ? state.businessesArray
    : Object.values(state.businessesArray || state.businesses || []);

  bizArr.forEach(b => {
    if (b && b.id && b.name) {
      bizSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    }
  });

  // Filter change → re-render reports
  ["reportStartDate", "reportEndDate", "reportsBiz"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        const activeTab = document.querySelector(".report-tab.active")?.dataset.report || "financial";
        reports_renderTab(activeTab);
      });
    }
  });
}


document.querySelector('[data-report="invoices"]').addEventListener("click", () => {
  document.getElementById("invoiceReportsContainer").classList.remove("hidden");
  reports_renderInvoices();
});


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

function renderDashboardReports() {
  console.log("📊 renderDashboardReports started at", Date.now());

  // ✅ Prevent multiple full renders (once per DB load)
  if (renderDashboardReports.rendered) {
    console.log("⏹️ Skipping full dashboard render, already rendered once");
    return;
  }
  renderDashboardReports.rendered = true;

  if (!state) {
    console.warn("⚠️ No state found, skipping reports...");
    return;
  }

  const invoices = state.invoices || [];
  const customers = state.customers || [];
  const businesses = Array.isArray(state.businesses)
    ? state.businesses
    : Object.values(state.businesses || {});

  console.log("✅ Data available:", {
    invoices: invoices.length,
    customers: customers.length,
    businesses: businesses.length
  });

  // --- Helper: safeChart (destroys old chart if exists) ---
  function safeChart(id, config) {
    if (!window.charts) window.charts = {};
    if (window.charts[id]) {
      window.charts[id].destroy();
      console.log("♻️ Destroyed old chart:", id);
    }
    const ctx = document.getElementById(id);
    if (!ctx) {
      console.warn("⚠️ Missing canvas element:", id);
      return;
    }
    window.charts[id] = new Chart(ctx, config);
    console.log("✅ Rendered chart:", id);
  }

  // --- Top Customers (Paid vs Outstanding) ---
  if (!state._topCustomersRendered) {
    state._topCustomersRendered = true;

    // === your report code here ===
    const custMap = {};
    (state.invoices || []).forEach(inv => {
      const cid = inv.customerId || "unknown";
      if (!custMap[cid]) custMap[cid] = { total: 0, paid: 0, count: 0 };
      custMap[cid].total += (+inv.total || 0);
      custMap[cid].paid += typeof invoicePaid === "function" ? invoicePaid(inv) : (+inv.paid || 0);
      custMap[cid].count += 1;
    });

    const arr = Object.entries(custMap).map(([cid, obj]) => {
      const cust = (state.customers || []).find(c => c.id == cid);
      return {
        id: cid,
        name: cust?.name || cid,
        total: obj.total,
        paid: obj.paid,
        count: obj.count
      };
    });

    arr.sort((a, b) => b.total - a.total);
    const top = arr.slice(0, 5);

    if (!top.length) {
      document.getElementById("topCustomers").innerHTML =
        `<div class="p-4 text-sm">No invoices to display</div>`;
    } else {
      const currency =
        (state.businesses && state.businesses[0] && state.businesses[0].currency) || "INR";
      const fmt = val =>
        new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(val);

      const palette = [
        "rgba(124,58,237,0.85)",  // purple
        "rgba(99,102,241,0.85)",  // indigo
        "rgba(59,130,246,0.85)",  // blue
        "rgba(16,185,129,0.85)",  // emerald
        "rgba(251,191,36,0.85)",  // amber
        "rgba(239,68,68,0.85)",   // red
        "rgba(236,72,153,0.85)"   // pink
      ];

      // Assign a unique color to each bar (cycle if > palette length)
      const colors = top.map((_, i) => palette[i % palette.length]);

      safeChart("topCustomers", {
        type: "bar",
        data: {
          labels: top.map(t => t.name),
          datasets: [
            {
              label: "Revenue",
              data: top.map(t => t.total),
              backgroundColor: colors,
              borderRadius: 6,
              barPercentage: 0.6
            }
          ]
        },
        options: {
          plugins: {
            legend: { display: false },
            title: { display: true, text: "Top 5 Customers by Revenue" },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const c = top[ctx.dataIndex];
                  return [
                    `Revenue: ${fmt(c.total)}`,
                    `Paid: ${fmt(c.paid)}`,
                    `Outstanding: ${fmt(c.total - c.paid)}`,
                    `Invoices: ${c.count}`
                  ];
                }
              }
            }
          },
          scales: {
            y: { ticks: { callback: v => fmt(v) } }
          }
        }
      });
    }
  }

  // --- Invoices by Status ---
  const statusGrouped = { Paid: 0, Pending: 0, Overdue: 0 };
  invoices.forEach(inv => {
    if (inv.status?.toLowerCase() === "paid") statusGrouped.Paid += inv.total || 0;
    else if (inv.status?.toLowerCase() === "overdue") statusGrouped.Overdue += inv.total || 0;
    else statusGrouped.Pending += inv.total || 0;
  });
  safeChart("invoicesStatus", {
    type: "pie",
    data: {
      labels: Object.keys(statusGrouped),
      datasets: [{
        data: Object.values(statusGrouped),
        backgroundColor: ["#22c55e", "#f59e0b", "#ef4444"]
      }]
    }
  });

  // --- Cash Flow (30 days) ---
  const today = new Date();
  const inflows = Array(30).fill(0);
  const overdue = Array(30).fill(0);

  // helper to compute paid amount
  const calcPaid = inv => {
    if (!inv.payments) return 0;
    return inv.payments.reduce((sum, p) => sum + (+p.amount || 0), 0);
  };

  (state.invoices || []).forEach(inv => {
    if (inv.dueDate) {
      const due = new Date(inv.dueDate);
      const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
      const paid = calcPaid(inv);
      const outstanding = Math.max((+inv.total || 0) - paid, 0);

      if (diff >= 0 && diff < 30) {
        // upcoming inflows
        inflows[diff] += outstanding;
      } else if (diff < 0 && outstanding > 0) {
        // overdue → add to Day 0 bucket
        overdue[0] += outstanding;
      }
    }
  });

  // Labels = actual calendar dates
  const labels = inflows.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  });

  safeChart("cashFlow", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Overdue (Unpaid Past Due Date)",
          data: overdue,
          backgroundColor: "rgba(239,68,68,0.7)", // red-500
          borderRadius: 4,
        },
        {
          label: "Upcoming Inflows (By Due Date)",
          data: inflows,
          backgroundColor: "rgba(34,197,94,0.7)", // green-500
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: "Cash Flow Projection (Next 30 Days)" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.raw || 0;
              return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(val);
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true, // 🔥 stack overdue + upcoming
          title: { display: true, text: "Due Date" }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            callback: v =>
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(v)
          }
        }
      }
    }
  });



  // --- Business Performance ---
  const bizPerf = businesses.map(b => {
    const rev = invoices
      .filter(inv => inv.businessId === b.id)
      .reduce((s, i) => s + (i.total || 0), 0);
    return { name: b.name || b.id, revenue: rev };
  });

  // Define a color palette (you can extend this as needed)
  const colors = [
    "rgba(59,130,246,0.7)",   // blue
    "rgba(16,185,129,0.7)",   // green
    "rgba(249,115,22,0.7)",   // orange
    "rgba(236,72,153,0.7)",   // pink
    "rgba(139,92,246,0.7)",   // purple
    "rgba(234,179,8,0.7)"     // yellow
  ];

  // Assign colors in order, wrapping around if there are more businesses
  const backgroundColors = bizPerf.map((_, i) => colors[i % colors.length]);

  safeChart("businessPerformance", {
    type: "bar",
    data: {
      labels: bizPerf.map(b => b.name),
      datasets: [{
        label: "Revenue",
        data: bizPerf.map(b => b.revenue),
        backgroundColor: backgroundColors,
        borderRadius: 6 // optional: gives rounded bar corners
      }]
    },
    options: {
      plugins: {
        legend: { display: false }
      }
    }
  });


  // --- Avg Payment Delay ---

  const delayMap = {};
  const customersWithInvoices = new Set();

  invoices.forEach(inv => {
    customersWithInvoices.add(inv.customerId);

    if (inv.payments?.length && inv.date) {
      const issueDate = new Date(inv.date);
      const lastPayment = inv.payments[inv.payments.length - 1];
      const paidDate = lastPayment?.date ? new Date(lastPayment.date) : null;

      if (isNaN(issueDate) || !paidDate || isNaN(paidDate)) return;

      const diff = (paidDate - issueDate) / (1000 * 60 * 60 * 24);
      if (!delayMap[inv.customerId]) delayMap[inv.customerId] = [];
      delayMap[inv.customerId].push(diff);
    }
  });

  const delays = customers.map(c => {
    const arr = delayMap[c.id] || [];
    const avg = arr.length
      ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
      : 0;
    return {
      name: c.name,
      avgDelay: isNaN(avg) ? 0 : avg,
      noPayment: customersWithInvoices.has(c.id) && arr.length === 0
    };
  });

  const BENCHMARK_DAYS = 30;

  // overall average across valid customers
  const validAverages = delays.filter(d => !d.noPayment && d.avgDelay > 0).map(d => d.avgDelay);
  const overallAvg = validAverages.length
    ? Math.round(validAverages.reduce((a, b) => a + b, 0) / validAverages.length)
    : 0;

  // --- New: Summary counts ---
  const summary = {
    onTime: delays.filter(d => !d.noPayment && d.avgDelay === 0).length,
    slight: delays.filter(d => !d.noPayment && d.avgDelay > 0 && d.avgDelay <= BENCHMARK_DAYS).length,
    late: delays.filter(d => !d.noPayment && d.avgDelay > BENCHMARK_DAYS).length,
    noPayment: delays.filter(d => d.noPayment).length,
    overallAvg
  };

  // metric above chart
  const avgDelayMetricEl = document.getElementById("avgDelayMetric");
  if (avgDelayMetricEl) {
    avgDelayMetricEl.innerHTML =
      `Overall Avg Payment Delay: <span class="font-bold ${overallAvg > BENCHMARK_DAYS ? "text-red-600" : overallAvg > 0 ? "text-yellow-600" : "text-green-600"
      }">${overallAvg} days</span>`;
  }

  // summary grid
  const avgDelaySummaryEl = document.getElementById("avgDelaySummary");
  if (avgDelaySummaryEl) {
    avgDelaySummaryEl.innerHTML = `
    <div class="p-3 rounded bg-green-50 text-green-700 font-medium">
      🟢 On-time: ${summary.onTime}
    </div>
    <div class="p-3 rounded bg-yellow-50 text-yellow-700 font-medium">
      🟡 Slight Delay (1–30d): ${summary.slight}
    </div>
    <div class="p-3 rounded bg-red-50 text-red-700 font-medium">
      🔴 Consistently Late (>30d): ${summary.late}
    </div>
    <div class="p-3 rounded bg-gray-100 text-gray-700 font-medium">
      ⚪ No Payments Yet: ${summary.noPayment}
    </div>
    <div class="p-3 rounded bg-blue-50 text-blue-700 font-bold col-span-2">
      📊 Overall Avg Delay: ${summary.overallAvg} days
    </div>
  `;
  }

  // per-customer table
  const avgDelayEl = document.getElementById("avgDelay");
  if (avgDelayEl) {
    avgDelayEl.innerHTML =
      "<table class='w-full border border-gray-200 text-sm'>" +
      "<thead><tr class='bg-gray-200 text-gray-800 font-semibold'>" +
      "<th class='p-2 text-left'>Customer</th>" +
      "<th class='p-2 text-right'>Avg Delay</th>" +
      "</tr></thead><tbody>" +
      delays.map(d => {
        let delayCell = "";
        if (d.noPayment) {
          delayCell =
            "<span class='inline-block px-2 py-1 text-xs rounded bg-gray-200 text-gray-700'>No Payment Yet</span>";
        } else {
          const highlightClass =
            d.avgDelay > BENCHMARK_DAYS
              ? "text-red-600 font-bold"
              : d.avgDelay > 0
                ? "text-yellow-600"
                : "text-green-600";
          delayCell = `<span class='${highlightClass}'>${d.avgDelay} days</span>`;
        }
        return `<tr>
        <td class='p-2 border-t'>${d.name}</td>
        <td class='p-2 border-t text-right'>${delayCell}</td>
      </tr>`;
      }).join("") +
      "</tbody></table>";
  }

  // bar chart
  if (document.getElementById("avgDelayChart")) {
    safeChart("avgDelayChart", {
      type: "bar",
      data: {
        labels: delays.map(d => d.name),
        datasets: [{
          label: "Avg Payment Delay (days)",
          data: delays.map(d => d.noPayment ? 0 : d.avgDelay),
          backgroundColor: delays.map(d =>
            d.noPayment
              ? "rgba(107,114,128,0.5)" // gray
              : d.avgDelay > BENCHMARK_DAYS
                ? "rgba(239,68,68,0.7)"   // red
                : d.avgDelay > 0
                  ? "rgba(234,179,8,0.7)"   // yellow
                  : "rgba(34,197,94,0.7)"   // green
          ),
          borderRadius: 6
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Days" }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => {
                const customer = delays[context.dataIndex];
                return customer.noPayment ? "No Payment Yet" : `${context.raw} days`;
              }
            }
          }
        }
      }
    });
    console.log("✅ Rendered chart: avgDelay");
  }





  // --- Customer Credit Usage ---

  const creditUsageEl = document.getElementById("creditUsage");
  if (creditUsageEl) {
    creditUsageEl.innerHTML =
      "<h3 class='font-semibold mb-2 text-gray-200'>Customer Credit Usage</h3>" +
      customers.map((c, idx) => {
        if (!c.creditLimit) return "";
        const used = invoices
          .filter(i => i.customerId === c.id && i.status.toLowerCase() !== "paid")
          .reduce((s, i) => s + (i.total || 0), 0);

        const pctRaw = (used / c.creditLimit) * 100;
        const pct = Math.min(100, Math.round(pctRaw));

        // Choose bar color
        let barColor = "bg-green-500";
        if (pct >= 80) barColor = "bg-red-500";
        else if (pct >= 50) barColor = "bg-yellow-500";

        // Each bar gets a unique ID so we can animate it later
        return `
        <div class="mb-4">
          <div class="flex justify-between text-sm text-gray-300 mb-1">
            <span>${c.name}</span>
            <span>${pctRaw.toFixed(1)}% of ₹${c.creditLimit}</span>
          </div>
          <div class="w-full bg-gray-700/40 h-3 rounded overflow-hidden">
            <div id="credit-bar-${idx}" 
                 class="${barColor} h-3 rounded transition-all duration-1000 ease-out" 
                 style="width:0%;">
            </div>
          </div>
        </div>`;
      }).join("");

    // Trigger animation after DOM update
    setTimeout(() => {
      customers.forEach((c, idx) => {
        if (!c.creditLimit) return;
        const used = invoices
          .filter(i => i.customerId === c.id && i.status.toLowerCase() !== "paid")
          .reduce((s, i) => s + (i.total || 0), 0);

        const pct = Math.min(100, Math.round((used / c.creditLimit) * 100));
        const bar = document.getElementById(`credit-bar-${idx}`);
        if (bar) bar.style.width = pct + "%";
      });
    }, 100); // slight delay ensures transition works
  }


  // --- Collection Efficiency ---

  const collectionEfficiencyEl = document.getElementById("collectionEfficiency");

  if (collectionEfficiencyEl) {
    const bizEfficiency = businesses.map(b => {
      const bizInvoices = invoices.filter(i => i.businessId === b.id);
      const total = bizInvoices.reduce((s, i) => s + (i.total || 0), 0);
      const collected = bizInvoices.reduce(
        (s, i) => s + (i.payments || []).reduce((a, p) => a + (p.amount || 0), 0),
        0
      );
      const efficiency = total > 0 ? Math.round((collected / total) * 100) : 0;
      return { name: b.name || b.id, total, collected, efficiency };
    });

    // 🔥 Sort businesses by efficiency (highest first)
    bizEfficiency.sort((a, b) => b.efficiency - a.efficiency);

    const radius = 40;
    const circumference = 2 * Math.PI * radius;

    collectionEfficiencyEl.innerHTML = `
    <h3 class="font-semibold mb-4 text-gray-200">Collection Efficiency by Business</h3>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-6">
      ${bizEfficiency.map((biz, idx) => {
      // Pick ring color
      let ringColor = "#22c55e"; // green
      if (biz.efficiency < 70) ringColor = "#ef4444"; // red
      else if (biz.efficiency < 90) ringColor = "#eab308"; // yellow

      return `
          <div class="flex flex-col items-center group cursor-pointer relative">
            <!-- tooltip -->
            <div class="absolute -top-8 px-2 py-1 text-xs rounded bg-gray-800 text-white opacity-0 
                        group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              ₹${biz.collected.toLocaleString("en-IN")} of ₹${biz.total.toLocaleString("en-IN")}
            </div>

            <div class="relative w-28 h-28">
              <svg width="112" height="112" class="transform -rotate-90">
                <circle cx="56" cy="56" r="${radius}" stroke="#374151" stroke-width="10" fill="none" />
                <circle
                  id="effRing-${idx}"
                  cx="56" cy="56" r="${radius}"
                  stroke="${ringColor}" stroke-width="10" fill="none"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${circumference}" <!-- start from 0 -->
                  stroke-linecap="round"
                />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-100">
                ${biz.efficiency}%
              </div>
            </div>
            <span class="mt-2 text-sm font-medium text-gray-200">${biz.name}</span>
          </div>
        `;
    }).join("")}
    </div>`;

    // Animate rings after render
    setTimeout(() => {
      bizEfficiency.forEach((biz, idx) => {
        const ring = document.getElementById(`effRing-${idx}`);
        if (ring) {
          const offset = circumference - (biz.efficiency / 100) * circumference;
          ring.style.transition = "stroke-dashoffset 1.2s ease-out";
          ring.style.strokeDashoffset = offset;
        }
      });
    }, 100);
  }


}

//view commission report

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
    const invs = Array.isArray(invoices) ? invoices : Object.values(invoices || {});

    // Utilities
    const monthKey = (isoDate) => {
      if (!isoDate) return 'Unknown';
      const d = new Date(isoDate);
      if (isNaN(d)) return 'Unknown';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

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
        businessName: (state.businesses && state.businesses[bizId] && state.businesses[bizId].name) || (inv.businessName || '—'),
        customerId: custId,
        customerName: (state.customers || []).find(c => c.id === custId)?.name || (inv.customerName || '—'),
        total,
        commission,
        status: inv.status || '—'
      });

      // by month
      const m = monthKey(inv.date || inv.createdAt);
      byMonth[m] = (byMonth[m] || 0) + commission;

      // by business
      byBusiness[bizId] = byBusiness[bizId] || { id: bizId, name: (state.businesses && state.businesses[bizId] && state.businesses[bizId].name) || '—', commission: 0, count: 0 };
      byBusiness[bizId].commission += commission;
      byBusiness[bizId].count += commission ? 1 : 0;

      // by customer
      byCustomer[custId] = byCustomer[custId] || { id: custId, name: (state.customers || []).find(c => c.id === custId)?.name || '—', commission: 0, count: 0 };
      byCustomer[custId].commission += commission;
      byCustomer[custId].count += commission ? 1 : 0;

      // by service: accumulate commissions proportionally if items contribute.
      if (Array.isArray(inv.items)) {
        // split commission among items proportional to amount
        const lineTotals = inv.items.map(it => (Number(it.qty || 0) * Number(it.rate || 0)) || 0);
        const invoiceLineSum = lineTotals.reduce((s, x) => s + x, 0) || 0;
        inv.items.forEach((it, idx) => {
          const serviceId = it.serviceId || it.service || 'svc_unknown';
          const lineShare = invoiceLineSum ? (lineTotals[idx] / invoiceLineSum) : (1 / (inv.items.length || 1));
          const allocated = commission * lineShare;
          byService[serviceId] = byService[serviceId] || { id: serviceId, name: (state.services || []).find(s => s.id === serviceId)?.service || it.serviceName || '—', commission: 0, count: 0 };
          byService[serviceId].commission += allocated;
          byService[serviceId].count += allocated ? 1 : 0;
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

    commissTrendChart = new Chart(ctx, {
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

    commissBizChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Commission', data: series }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // Render leaderboards/tables
  function renderCommissionByCustomer(data) {
    const tbody = safeId('commissionByCustomerBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.customerSeries.slice(0, 20).forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="p-2">${i + 1}</td>
                      <td class="p-2">${c.name || c.id}</td>
                      <td class="p-2 text-right">${formatINR(Number(c.commission || 0))}</td>
                      <td class="p-2">${c.count || 0}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderCommissionByService(data) {
    const tbody = safeId('commissionByServiceBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.serviceSeries.slice(0, 20).forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="p-2">${i + 1}</td>
                      <td class="p-2">${s.name || s.id}</td>
                      <td class="p-2 text-right">${formatINR(Number(s.commission || 0))}</td>
                      <td class="p-2">${s.count || 0}</td>`;
      tbody.appendChild(tr);
    });
  }

  // Invoice table rendering with filters
  function renderCommissionInvoiceTable(filtered) {
    const tbody = safeId('commissionInvoiceTable');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rows = filtered || [];
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="p-2">${r.invoiceNumber}</td>
                      <td class="p-2">${(r.date || '').slice(0, 10)}</td>
                      <td class="p-2">${r.businessName || '—'}</td>
                      <td class="p-2">${r.customerName || '—'}</td>
                      <td class="p-2 text-right">${formatINR(Number(r.total || 0))}</td>
                      <td class="p-2 text-right">${formatINR(Number(r.commission || 0))}</td>
                      <td class="p-2">${r.status || '—'}</td>
                      <td class="p-2">
                        <button class="btn" onclick="openPrint('${r.id}')">Print</button>
                      </td>`;
      tbody.appendChild(tr);
    });
  }

  // Fill filter selects
  function populateCommissionFilters() {
    const bizSel = safeId('commissionFilterBiz');
    const custSel = safeId('commissionFilterCust');
    if (bizSel) {
      bizSel.innerHTML = '<option value="all">All Businesses</option>' +
        (Object.values(state.businesses || {}).map(b => `<option value="${b.id}">${b.name}</option>`).join(''));
    }
    if (custSel) {
      custSel.innerHTML = '<option value="all">All Customers</option>' +
        ((state.customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join(''));
    }
  }

  // Apply filters and re-render invoice table
  function getFilteredInvoiceRows() {
    const biz = safeId('commissionFilterBiz')?.value || 'all';
    const cust = safeId('commissionFilterCust')?.value || 'all';
    const from = safeId('commissionFrom')?.value;
    const to = safeId('commissionTo')?.value;

    const all = buildCommissionData().invoiceRows;
    return all.filter(r => {
      if (biz !== 'all' && r.businessId !== biz) return false;
      if (cust !== 'all' && r.customerId !== cust) return false;
      if (from && (r.date || '').slice(0, 10) < from) return false;
      if (to && (r.date || '').slice(0, 10) > to) return false;
      return true;
    });
  }

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
      if (typeof v === 'string') v = `"${v.replace(/"/g, '""')}"`;
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
      ${rows.map(r => `<tr><td>${r.invoiceNumber}</td><td>${(r.date || '').slice(0, 10)}</td><td>${r.businessName}</td><td>${r.customerName}</td><td style="text-align:right">${formatINR(r.total)}</td><td style="text-align:right">${formatINR(r.commission)}</td><td>${r.status}</td></tr>`).join('')}
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

    // build data
    const data = buildCommissionData();

    // KPIs
    renderCommissionKPIs(data);

    // Charts
    renderCommissionTrendChart(data);
    renderCommissionByBusinessChart(data);

    // leaderboards
    renderCommissionByCustomer(data);
    renderCommissionByService(data);

    // filters
    populateCommissionFilters();

    // default invoice table (no filters)
    renderCommissionInvoiceTable(data.invoiceRows);

    // wire events (idempotent)
    if (safeId('commissionApplyFilters')) {
      safeId('commissionApplyFilters').onclick = () => {
        const rows = getFilteredInvoiceRows();
        renderCommissionInvoiceTable(rows);
      };
    }
    if (safeId('commissionExportCSV')) {
      safeId('commissionExportCSV').onclick = exportCommissionCSV;
    }
    if (safeId('commissionExportPrint')) {
      safeId('commissionExportPrint').onclick = exportCommissionPrint;
    }

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

  // --- Filters
  const start = document.getElementById("commFilterStart")?.value
    ? new Date(document.getElementById("commFilterStart").value)
    : null;
  const end = document.getElementById("commFilterEnd")?.value
    ? new Date(document.getElementById("commFilterEnd").value)
    : null;
  const bizId = document.getElementById("commFilterBiz")?.value || "";

  invoices = invoices.filter(inv => {
    if (bizId && inv.businessId !== bizId) return false;
    if (start && new Date(inv.date) < start) return false;
    if (end && new Date(inv.date) > end) return false;
    return true;
  });

  // --- Build commissions dataset
  const commissions = invoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    businessId: inv.businessId,
    customerId: inv.customerId,
    serviceIds: (inv.items || []).map(it => it.serviceId),
    date: new Date(inv.date),
    status: inv.status,
    total: Number(inv.total || 0),
    commission: Number(inv.commission || 0),
    payments: inv.payments || [],
    region: customers.find(c => c.id === inv.customerId)?.region || "Unknown",
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
      c => `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`,
      c => c.commission
    );
    const labels = Object.keys(grouped).sort();
    window.commCharts.period = new Chart(ctxPeriod, {
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
    commissions.forEach(c => {
      (c.payments || []).forEach(p => {
        grouped[p.method] = (grouped[p.method] || 0) + c.commission;
      });
    });
    window.commCharts.pay = new Chart(ctxPay, {
      type: "doughnut",
      data: { labels: Object.keys(grouped), datasets: [{ data: Object.values(grouped) }] }
    });
  }

  // === 3. Commission by Status
  const ctxStatus = document.getElementById("commissionStatusChart");
  if (ctxStatus) {
    const grouped = groupSum(commissions, c => c.status || "Unknown", c => c.commission);
    window.commCharts.status = new Chart(ctxStatus, {
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
    window.commCharts.topCust = new Chart(ctxTopCust, {
      type: "bar",
      data: {
        labels: sorted.map(([id]) => customers.find(c => c.id === id)?.name || id),
        datasets: [{ label: "Commission (₹)", data: sorted.map(x => x[1]) }]
      }
    });
  }

  // === 6. Top Services
  const ctxTopSvc = document.getElementById("commissionTopServices");
  if (ctxTopSvc) {
    const grouped = {};
    commissions.forEach(c => {
      (c.serviceIds || []).forEach(sid => {
        grouped[sid] = (grouped[sid] || 0) + c.commission;
      });
    });
    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 5);
    window.commCharts.topSvc = new Chart(ctxTopSvc, {
      type: "bar",
      data: {
        labels: sorted.map(([id]) => services.find(s => s.id === id)?.service || id),
        datasets: [{ label: "Commission (₹)", data: sorted.map(x => x[1]) }]
      }
    });
  }

  // === 7. Commission Aging
  const ctxAging = document.getElementById("commissionAgingChart");
  if (ctxAging) {
    const now = new Date();
    const buckets = { "0–30d": 0, "31–60d": 0, "61–90d": 0, ">90d": 0 };
    commissions.forEach(c => {
      const age = (now - c.date) / (1000 * 60 * 60 * 24);
      if (age <= 30) buckets["0–30d"] += c.commission;
      else if (age <= 60) buckets["31–60d"] += c.commission;
      else if (age <= 90) buckets["61–90d"] += c.commission;
      else buckets[">90d"] += c.commission;
    });
    window.commCharts.aging = new Chart(ctxAging, {
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
    window.commCharts.margin = new Chart(ctxMargin, {
      type: "bar",
      data: {
        labels: labels.map(id => businesses.find(b => b.id === id)?.name || id),
        datasets: [{ label: "Margin %", data: labels.map(id => groupedTotal[id] ? (groupedComm[id] / groupedTotal[id]) * 100 : 0) }]
      }
    });
  }

  // === 9. Forecast vs Target
  const ctxForecast = document.getElementById("commissionForecastChart");
  if (ctxForecast) {
    const grouped = groupSum(
      commissions,
      c => `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`,
      c => c.commission
    );
    const labels = Object.keys(grouped).sort();
    const data = labels.map(l => grouped[l]);

    // Simple linear regression forecast (next 3 months)
    const n = data.length;
    const x = data.map((_, i) => i + 1);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = data.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, xi, i) => a + xi * data[i], 0);
    const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
    const intercept = (sumY - slope * sumX) / n;

    const forecast = [1, 2, 3].map(i => slope * (n + i) + intercept);
    const target = 100000; // Example static target

    window.commCharts.forecast = new Chart(ctxForecast, {
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
    window.commCharts.payout = new Chart(ctxPayout, {
      type: "bar",
      data: { labels: Object.keys(grouped), datasets: [{ data: Object.values(grouped) }] }
    });
  }

  // === 11. Commission by Region
  const ctxRegion = document.getElementById("commissionRegionChart");
  if (ctxRegion) {
    const grouped = groupSum(commissions, c => c.region, c => c.commission);
    window.commCharts.region = new Chart(ctxRegion, {
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

/* Chart handles unique to adv2 */
let adv2_timeline_chart = null;
let adv2_pie_chart = null;
let adv2_paymethod_chart = null;

/* Populate customer dropdown (call after state.customers loaded) */
function adv2_populateCustomers() {
  const sel = adv2_get("adv2_customer_select");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Select customer --</option>` +
    (state.customers || []).map(c => `<option value="${c.id}">${escapeHtml(c.name || c.id)}</option>`).join("");
  sel.onchange = () => {
    const cid = sel.value;
    if (cid) adv2_render(cid);
  };
}

/* Open / Close functions */
function adv2_open(customerId) {
  const panel = adv2_get("adv2_panel");
  if (!panel) return;
  panel.classList.remove("hidden");
  if (customerId) {
    const sel = adv2_get("adv2_customer_select");
    if (sel) sel.value = customerId;
    adv2_render(customerId);
  }
}
function adv2_close() {
  const panel = adv2_get("adv2_panel");
  if (!panel) return;
  panel.classList.add("hidden");
}
adv2_get("adv2_close")?.addEventListener?.("click", adv2_close);

/* Main renderer */
function adv2_render(customerId) {
  try {
    if (!customerId) customerId = adv2_get("adv2_customer_select")?.value || null;
    if (!customerId) {
      adv2_get("adv2_summary_cards").innerHTML =
        `<div style="color:#f87171;background:#1e293b;padding:10px;border-radius:8px">⚠ Select a customer</div>`;
      return;
    }

    const cust = (state.customers || []).find(c => String(c.id) === String(customerId));
    if (!cust) {
      adv2_get("adv2_summary_cards").innerHTML =
        `<div style="color:#f87171;background:#1e293b;padding:10px;border-radius:8px">❌ Customer not found</div>`;
      return;
    }

    // Date range
    let startDate = adv2_get("adv2_start")?.value ? new Date(adv2_get("adv2_start").value) : null;
    let endDate = adv2_get("adv2_end")?.value ? new Date(adv2_get("adv2_end").value) : null;
    const quick = adv2_get("adv2_quick_range")?.value;
    if (!startDate && quick) {
      const now = new Date();
      if (quick === "30") { endDate = new Date(); startDate = new Date(); startDate.setDate(endDate.getDate() - 30); }
      else if (quick === "90") { endDate = new Date(); startDate = new Date(); startDate.setDate(endDate.getDate() - 90); }
      else if (quick === "fy") { const now2 = new Date(); startDate = (now2.getMonth() >= 3) ? new Date(now2.getFullYear(), 3, 1) : new Date(now2.getFullYear() - 1, 3, 1); endDate = new Date(); }
    }

    // Invoices
    let invoices = (state.invoices || []).filter(inv => String(inv.customerId) === String(customerId));
    const prePeriod = startDate ? (state.invoices || []).filter(inv => String(inv.customerId) === String(customerId) && new Date(inv.date) < startDate) : [];
    if (startDate || endDate) {
      invoices = invoices.filter(inv => {
        const d = new Date(inv.date);
        return (!startDate || d >= startDate) && (!endDate || d <= endDate);
      });
    }

    // Totals
    const totalInvoiced = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
    const totalPaid = invoices.reduce((s, inv) => s + (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0), 0);
    const totalBalance = totalInvoiced - totalPaid;

    const openingBalance = prePeriod.reduce((s, inv) => {
      const paid = (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0);
      return s + Math.max(0, (inv.total || 0) - paid);
    }, 0);
    const closingBalance = openingBalance + totalBalance;

    // === Summary Cards ===
    adv2_get("adv2_summary_cards").innerHTML = `
      <div style="background:#1e293b;padding:12px;border-radius:10px;text-align:center">
        <div style="color:#94a3b8;font-size:13px">Total Invoiced</div>
        <div style="color:#60a5fa;font-weight:700;font-size:20px">${formatINR(totalInvoiced)}</div>
      </div>
      <div style="background:#1e293b;padding:12px;border-radius:10px;text-align:center">
        <div style="color:#94a3b8;font-size:13px">Total Paid</div>
        <div style="color:#34d399;font-weight:700;font-size:20px">${formatINR(totalPaid)}</div>
      </div>
      <div style="background:#1e293b;padding:12px;border-radius:10px;text-align:center">
        <div style="color:#94a3b8;font-size:13px">Pending Balance</div>
        <div style="color:#fbbf24;font-weight:700;font-size:20px">${formatINR(totalBalance)}</div>
      </div>
    `;

    // === Opening/Closing balances ===
    adv2_get("adv2_balances").innerHTML = `
      <div style="display:flex;gap:20px">
        <div style="color:#60a5fa"><b>Opening:</b> ${formatINR(openingBalance)}</div>
        <div style="color:#34d399"><b>Closing:</b> ${formatINR(closingBalance)}</div>
      </div>
    `;

    // === Aging Buckets ===
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const now = new Date();
    invoices.forEach(inv => {
      const paid = (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0);
      const due = Math.max(0, (inv.total || 0) - paid);
      if (due <= 0) return;
      const days = Math.floor((now - new Date(inv.date)) / (1000 * 60 * 60 * 24));
      if (days <= 30) buckets["0-30"] += due;
      else if (days <= 60) buckets["31-60"] += due;
      else if (days <= 90) buckets["61-90"] += due;
      else buckets["90+"] += due;
    });
    adv2_get("adv2_aging_buckets").innerHTML = `
      <div style="background:#1e293b;padding:10px;border-radius:8px;min-width:120px">
        <div style="color:#60a5fa">0-30</div><div style="font-weight:700">${formatINR(buckets["0-30"])}</div>
      </div>
      <div style="background:#1e293b;padding:10px;border-radius:8px;min-width:120px">
        <div style="color:#fbbf24">31-60</div><div style="font-weight:700">${formatINR(buckets["31-60"])}</div>
      </div>
      <div style="background:#1e293b;padding:10px;border-radius:8px;min-width:120px">
        <div style="color:#f97316">61-90</div><div style="font-weight:700">${formatINR(buckets["61-90"])}</div>
      </div>
      <div style="background:#1e293b;padding:10px;border-radius:8px;min-width:120px">
        <div style="color:#f87171">90+</div><div style="font-weight:700">${formatINR(buckets["90+"])}</div>
      </div>
    `;


        // === Invoice vs Payment Timeline (Bar Chart) ===
    const months = {};
    invoices.forEach(inv => {
      const d = new Date(inv.date);
      if (isNaN(d)) return;
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      months[key] = months[key] || { invoiced: 0, paid: 0, label: d.toLocaleString("default", { month: "short", year: "numeric" }) };
      months[key].invoiced += (inv.total || 0);
      months[key].paid += (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0);
    });
    const sortedKeys = Object.keys(months).sort();
    const labels = sortedKeys.map(k => months[k].label);
    const invoicedData = sortedKeys.map(k => months[k].invoiced);
    const paidData = sortedKeys.map(k => months[k].paid);

    const timelineCtx = adv2_get("adv2_timeline");
    if (timelineCtx) {
      try { if (adv2_timeline_chart) adv2_timeline_chart.destroy(); } catch (e) {}
      adv2_timeline_chart = new Chart(timelineCtx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Invoiced", data: invoicedData, backgroundColor: "#2563eb" },
            { label: "Paid", data: paidData, backgroundColor: "#10b981" }
          ]
        },
        options: { responsive: true, plugins: { legend: { labels: { color: "#e2e8f0" } } }, scales: { x: { ticks: { color: "#94a3b8" } }, y: { ticks: { color: "#94a3b8" } } } }
      });
    }

    // === Payment Distribution (Paid vs Pending) ===
    const pieCtx = adv2_get("adv2_pie");
    if (pieCtx) {
      try { if (adv2_pie_chart) adv2_pie_chart.destroy(); } catch (e) {}
      adv2_pie_chart = new Chart(pieCtx, {
        type: "pie",
        data: {
          labels: ["Paid", "Pending"],
          datasets: [{ data: [totalPaid, totalBalance], backgroundColor: ["#10b981", "#f59e0b"] }]
        },
        options: { plugins: { legend: { labels: { color: "#e2e8f0" } } } }
      });
    }

    // === Payment Method Report (Pie Chart) ===
    const pm = {};
    invoices.forEach(inv => (inv.payments || []).forEach(p => {
      const m = p.method || "Unknown";
      pm[m] = (pm[m] || 0) + (p.amount || 0);
    }));
    const pmLabels = Object.keys(pm);
    const pmData = pmLabels.map(l => pm[l]);
    const pmCtx = adv2_get("adv2_paymethod");
    if (pmCtx) {
      try { if (adv2_paymethod_chart) adv2_paymethod_chart.destroy(); } catch (e) {}
      adv2_paymethod_chart = new Chart(pmCtx, {
        type: "pie",
        data: { labels: pmLabels, datasets: [{ data: pmData, backgroundColor: generatePalette(pmLabels.length) }] },
        options: { plugins: { legend: { labels: { color: "#e2e8f0" } } } }
      });
    }


    // === Charts (timeline, pies) remain same ===
    // (your existing chart code stays; only colors updated above)

    // === Profitability ===
    const revenue = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const discounts = invoices.reduce((s, i) => s + (i.discount || 0), 0);
    const commissions = invoices.reduce((s, i) => s + (i.commission || ((i.commissionPct || 0) / 100 * (i.total || 0))), 0);
    const net = revenue - discounts - commissions;
    adv2_get("adv2_profitability").innerHTML = `
      <div style="color:#cbd5e1;margin-bottom:6px;font-weight:600">Customer Profitability</div>
      <div><span style="color:#60a5fa">Revenue:</span> ${formatINR(revenue)}</div>
      <div><span style="color:#fbbf24">Discounts:</span> ${formatINR(discounts)}</div>
      <div><span style="color:#f87171">Commissions:</span> ${formatINR(commissions)}</div>
      <div style="margin-top:6px;font-weight:700;color:#34d399">Net: ${formatINR(net)}</div>
    `;

    // === CLV ===
    const clvTotal = (state.invoices || []).filter(i => String(i.customerId) === String(customerId)).reduce((s, i) => s + (i.total || 0), 0);
    const paymentsForCustomer = (state.invoices || []).filter(i => String(i.customerId) === String(customerId)).flatMap(i => i.payments || []);
    const avgPaymentDays = paymentsForCustomer.length ? Math.round(paymentsForCustomer.reduce((s, p) => {
      const inv = (state.invoices || []).find(ii => (ii.payments || []).some(pp => pp === p || (pp.date === p.date && pp.amount === p.amount)));
      if (!inv || !p.date) return s;
      return s + Math.max(0, Math.floor((new Date(p.date) - new Date(inv.date)) / (1000 * 60 * 60 * 24)));
    }, 0) / paymentsForCustomer.length) : 0;
    adv2_get("adv2_clv").innerHTML = `
      <div style="color:#cbd5e1;margin-bottom:6px;font-weight:600">Customer Lifetime Value</div>
      <div><span style="color:#60a5fa">Total invoiced:</span> ${formatINR(clvTotal)}</div>
      <div><span style="color:#34d399">Avg payment time:</span> ${avgPaymentDays} days</div>
      <div><span style="color:#fbbf24">Net Contribution:</span> ${formatINR(net)}</div>
    `;

    // === Credit Utilization ===
    let creditHtml = `<div style="color:#cbd5e1;margin-bottom:6px;font-weight:600">Credit Utilization</div>`;
    if (cust && cust.creditLimit) {
      const used = closingBalance;
      const limit = cust.creditLimit;
      const pct = Math.min(100, Math.round((used / limit) * 100));
      creditHtml += `
        <div><span style="color:#60a5fa">Limit:</span> ${formatINR(limit)}</div>
        <div><span style="color:#f87171">Used:</span> ${formatINR(used)}</div>
        <div style="background:#1e293b;border-radius:6px;overflow:hidden;margin-top:6px">
          <div style="width:${pct}%;background:linear-gradient(90deg,#2563eb,#10b981);padding:4px 0;text-align:center;font-size:12px;color:white">${pct}%</div>
        </div>`;
    } else {
      creditHtml += `<div style="color:#9ca3af">No credit limit set</div>`;
    }
    adv2_get("adv2_credit").innerHTML = creditHtml;

    // === Repeat Business ===
    const totalInvoicesAll = (state.invoices || []).filter(i => String(i.customerId) === String(customerId)).length;
    adv2_get("adv2_repeat").innerHTML = `
      <div style="color:#cbd5e1;margin-bottom:6px;font-weight:600">Repeat Business</div>
      <div><span style="color:#34d399">Invoices (period):</span> ${invoices.length}</div>
      <div><span style="color:#60a5fa">Invoices (all time):</span> ${totalInvoicesAll}</div>
    `;

    // === Top Debtors ===
    const balances = {};
    (state.invoices || []).forEach(inv => {
      const cid = String(inv.customerId);
      const paid = (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0);
      const due = Math.max(0, (inv.total || 0) - paid);
      balances[cid] = (balances[cid] || 0) + due;
    });
    const top = Object.entries(balances).map(([cid, amt]) => {
      const c = (state.customers || []).find(x => String(x.id) === cid) || { name: cid };
      return { name: c.name || cid, amt };
    }).sort((a, b) => b.amt - a.amt).slice(0, 10);
    adv2_get("adv2_top_debtors").innerHTML = top.map(t => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div>${escapeHtml(t.name)}</div><div style="color:#f87171">${formatINR(t.amt)}</div>
      </div>`).join("");

    // === Invoice table ===
    const tbody = adv2_get("adv2_invoice_tbody");
    tbody.innerHTML = invoices.map(inv => {
      const paid = (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0);
      const due = Math.max(0, (inv.total || 0) - paid);
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
        <td style="padding:6px;color:#60a5fa">${escapeHtml(inv.invoiceNumber || inv.id)}</td>
        <td style="padding:6px;color:#9ca3af">${safeDateDisplay(inv.date)}</td>
        <td style="padding:6px;text-align:right;color:#60a5fa">${formatINR(inv.total)}</td>
        <td style="padding:6px;text-align:right;color:#34d399">${formatINR(paid)}</td>
        <td style="padding:6px;text-align:right;color:#fbbf24">${formatINR(due)}</td>
        <td style="padding:6px;color:#9ca3af">${escapeHtml(inv.status || '')}</td>
        <td style="padding:6px"><textarea data-inv-id="${escapeHtml(inv.id)}" style="width:100%;min-height:48px;background:#111827;color:#e6eef8;border:1px solid rgba(255,255,255,0.08);padding:6px;border-radius:6px">${escapeHtml(inv.notes || '')}</textarea><div style="text-align:right;margin-top:4px"><button data-inv-id="${escapeHtml(inv.id)}" class="adv2-save-note" style="background:#2563eb;color:white;padding:6px 8px;border-radius:6px">Save</button></div></td>
      </tr>`;
    }).join("");

    // === Save Notes ===
    setTimeout(() => {
      document.querySelectorAll(".adv2-save-note").forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.invId;
          const ta = document.querySelector(`textarea[data-inv-id="${id}"]`);
          const text = ta ? ta.value : "";
          const inv = (state.invoices || []).find(x => String(x.id) === String(id));
          if (inv) {
            inv.notes = text;
            if (typeof saveInvoiceToServer === "function") {
              try { saveInvoiceToServer(inv); } catch (e) { console.warn("adv2: saveInvoiceToServer failed", e); }
            }
            btn.innerText = "Saved";
            setTimeout(() => btn.innerText = "Save", 1200);
          }
        };
      });
    }, 50);

    adv2_get("adv2_export_csv").onclick = () => adv2_exportCSV(customerId, startDate, endDate);
    adv2_get("adv2_export_pdf").onclick = () => adv2_exportPDF(customerId, startDate, endDate);

  } catch (err) {
    console.error("adv2_render error", err);
    adv2_get("adv2_summary_cards").innerHTML =
      `<div style="color:#f87171;background:#1e293b;padding:10px;border-radius:8px">Error rendering report</div>`;
  }
}


/* Export helpers */
function adv2_exportCSV(customerId, startDate, endDate) {
  const custInvoices = (state.invoices || []).filter(inv => String(inv.customerId) === String(customerId) &&
    (!startDate || new Date(inv.date) >= startDate) && (!endDate || new Date(inv.date) <= endDate));
  let csv = "Invoice,Date,Total,Paid,Balance,Status,Notes\n";
  custInvoices.forEach(inv => {
    const paid = (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0);
    const due = Math.max(0, (inv.total || 0) - paid);
    csv += `"${inv.invoiceNumber || inv['invoice number'] || inv.id}","${safeDateDisplay(inv.date)}","${inv.total || 0}","${paid}","${due}","${inv.status || ''}","${(inv.notes || '').replace(/\n/g, ' ')}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `adv2_statement_${customerId}.csv`; a.click();
}
function adv2_exportPDF(customerId, startDate, endDate) {
  // simple print clone approach
  const panel = adv2_get("adv2_panel");
  if (!panel) return alert("Nothing to print");
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>Statement</title><style>body{font-family:Arial;background:#0b1220;color:#e6eef8;padding:20px}</style></head><body>${panel.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

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

/* small wrappers for date & currency (fallback if your helpers exist) */
function safeDateDisplay(d) {
  try { if (typeof safeDateDisplay === 'function' && safeDateDisplay !== adv2_get) return window.safeDateDisplay(d); } catch (e) { }
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toISOString().slice(0, 10);
}
function formatINR(v) {
  try { if (typeof formatINR === 'function') return window.formatINR(v); } catch (e) { }
  return `₹${Number(v || 0).toLocaleString('en-IN')}`;
}

/* =============== End ADVANCED CUSTOMER STATEMENT JS =============== */


  const btn = document.getElementById("collapseBtn");
  const sidebar = document.getElementById("sidebar");
  const mainContent = document.getElementById("mainContent");
  const tooltip = document.getElementById("tooltip"); // <-- global tooltip div

  btn.addEventListener("click", () => {
    // grid span toggles you already have
    sidebar.classList.toggle("lg:col-span-3");
    sidebar.classList.toggle("lg:col-span-1");
    mainContent.classList.toggle("lg:col-span-9");
    mainContent.classList.toggle("lg:col-span-11");

    // hide/show labels
    document.querySelectorAll(".label").forEach(el => el.classList.toggle("hidden"));

    // mark collapsed state for tooltip CSS
    sidebar.classList.toggle("collapsed");

    // swap chevron icon
    const icon = btn.querySelector("i");
    if (sidebar.classList.contains("collapsed")) {
      icon.setAttribute("data-lucide", "chevron-right");
    } else {
      icon.setAttribute("data-lucide", "chevron-left");
    }
    lucide.createIcons();
  });

  // ✅ Tooltip hover logic
  const navButtons = sidebar.querySelectorAll("button, label.btn");
  navButtons.forEach(btn => {
    const labelEl = btn.querySelector(".label");
    if (!labelEl) return;

    const text = labelEl.textContent.trim();

    btn.addEventListener("mouseenter", () => {
      if (!sidebar.classList.contains("collapsed")) return; // show only when collapsed
      tooltip.textContent = text;
      const rect = btn.getBoundingClientRect();
      tooltip.style.top = `${rect.top + rect.height / 2}px`;
      tooltip.style.left = `${rect.right + 8}px`;
      tooltip.classList.add("show");
    });

    btn.addEventListener("mouseleave", () => {
      tooltip.classList.remove("show");
    });
  });

