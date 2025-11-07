// ===============================
// billing.js (updated — CORS-safe + consistent)
// ===============================
// 🔑 Backend API constants (must match code.gs)
//const API_BASE = "https://script.google.com/macros/s/AKfycbxsgylO0fJkiGHNcM24r77i1kivh4xcNMJtP1wKa1FC1Klwsr4cbZXBKBgLwkUNWRAFJQ/exec";
//const API_BASE = getBillingURL();



const API_BASE = "https://script.google.com/macros/s/AKfycbzb_JqZPoLb6gS39l8nBDZoi9F00q1kRT1bhtRGpAmrrePHhT3JL_AwY-AC1V5NL89xvw/exec"; // <-- Replace with deployed URL

// --- Environment Helpers ---
// ---- ENV Handling ----
function getBillingEnv() {
  return localStorage.getItem("billing_env") || "test";
}
function setBillingEnv(env) {
  localStorage.setItem("billing_env", env);
}

const envSwitch = document.getElementById("envSwitch");
const envLabel = document.getElementById("envLabel");

if (envSwitch && envLabel) {
  const currentEnv = getBillingEnv();
  envSwitch.checked = currentEnv === "live";
  envLabel.textContent = currentEnv === "live" ? "Live" : "Test";
  envLabel.style.color = currentEnv === "live" ? "#27ae60" : "#e74c3c";

  envSwitch.addEventListener("change", e => {
    const newEnv = e.target.checked ? "live" : "test";
    setBillingEnv(newEnv);

    // ✅ Update text & color instantly
    envLabel.textContent = newEnv === "live" ? "Live" : "Test";
    envLabel.style.color = newEnv === "live" ? "#27ae60" : "#e74c3c";

    // ✅ Delay reload so user sees instant change
    setTimeout(() => location.reload(), 300);
  });
}

async function billingApi(action, data = {}, method = "GET") {
  const env = getBillingEnv();
  if (method === "GET") {
    const q = new URLSearchParams({ ...data, action, env });
    const res = await fetch(`${API_BASE}?${q}`);
    return res.json();
  } else {
    const q = new URLSearchParams({ action, env });
    const res = await fetch(`${API_BASE}?${q}`, {
      method: "POST", body: JSON.stringify(data)
    });
    return res.json();
  }
}



// Default single environment config (kept for compatibility)
const RUN_ENV = "test";
const API_KEYS = { test: "", live: "" };
const API_KEY = "";



async function apiGet(action, params = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set("action", action);
  url.searchParams.set("apiKey", API_KEY);
  url.searchParams.set("env", "test");

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ---- Utilities kept from your original file (uid, formatINR, etc.) ----
function uid() { return Math.random().toString(36).slice(2, 10); }
function formatINR(n) { return "₹" + (Math.round(n) || 0).toLocaleString("en-IN"); }
function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }
function agingBucket(days) { if (days <= 30) return "0-30"; if (days <= 60) return "31-60"; if (days <= 90) return "61-90"; return "90+"; }
const now = () => new Date();
function safeEl(id) { return document.getElementById(id); }

// state (unchanged)
const state = { businesses: {}, currentBiz: "all", customers: [], invoices: [] };

// ================= Fetch helper =================
// signature: fetchServerData(action, payload = {}, env = RUN_ENV, timeoutMs = 15000)
// - If payload empty -> GET (no custom headers) to avoid preflight
// - If payload non-empty -> POST with application/json (doOptions on server will handle preflight)

// Unified fetch helper — supports GET/POST, JSON, timeout
async function fetchServerData(action, payload = {}, timeoutMs = 15000) {
  const env = getBillingEnv();  // <-- fetch current env
  let url = `${API_BASE}?action=${encodeURIComponent(action)}&env=${env}`;
  const hasPayload = payload && Object.keys(payload).length > 0;

  const options = { method: hasPayload ? "POST" : "GET" };
  if (options.method === "POST") {
    options.body = JSON.stringify(payload);
  } else {
    const qs = new URLSearchParams(payload).toString();
    if (qs) url += "&" + qs;
  }

  console.log(`➡️ fetchServerData() [${env}] calling:`, url, options);

  try {
    const res = await fetch(url, options);
    const text = await res.text();
    console.log("⬅️ Raw response:", res.status, text);

    if (!res.ok) throw new Error(text || res.statusText);
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);

    return data;
  } catch (err) {
    console.error("fetchServerData error:", err);
    throw err;
  }
}






// ================= Data loader (uses fetchServerData) =================


async function loadDB() {
  // Show loader at start
  showInitialLoader();

  try {
    const data = await fetchServerData("getall");

    // 🧹 Normalize invoices so we only keep `invoiceNumber`
    const cleanInvoices = (data.invoices || []).map(inv => {
      if (inv.invoiceNumber) {
        delete inv["invoice number"];
      } else if (inv["invoice number"]) {
        inv.invoiceNumber = inv["invoice number"];
        delete inv["invoice number"];
      }
      return inv;
    });

    // ✅ Set state after cleaning
    state.businesses = arrayToMapById(data.businesses || []);
    state.customers = data.customers || [];
    state.services = data.services || [];
    state.invoices = cleanInvoices;

    console.log("✅ DB loaded:", state);

    // ✅ Refresh UI
    populateBizSelects();
    renderAll();
    renderBusinessButtons(Object.values(state.businesses));
    populateLedgerCustomerSelect();
    initLedgerFilters();
    renderCommissionReport()
    renderCommissionAdvancedReports();
    adv2_populateCustomers();
    adv2_open();
    renderCustomerLedger('');

    // 📊 Render Dashboard Reports once state is ready
    const reports = document.getElementById("dashboardReports");
    if (reports) {
      console.log("📊 Rendering Dashboard Reports after DB load...");
      renderDashboardReports();
    }

  } catch (err) {
    console.error("loadDB error", err);
    showToast("❌ Failed to load data from server", "error");
  } finally {
    // Hide loader after all done (even on error)
    hideInitialLoader();
  }
}



function showInitialLoader() {
  const loader = document.getElementById("initialLoader");
  if (loader) loader.classList.remove("hidden");
}

function hideInitialLoader() {
  const loader = document.getElementById("initialLoader");
  if (loader) loader.classList.add("hidden");
}


function renderBusinessButtons(businesses) {
  const container = document.getElementById("businessButtons");
  if (!container) return;
  container.innerHTML = "";

  if (!state.currentBizCustomers) state.currentBizCustomers = "all";

  const labelEl = safeEl("customerFilterLabel");

  function updateLabel(bizId) {
    if (!labelEl) return;
    if (bizId === "all") {
      labelEl.innerHTML = "";
    } else {
      const biz = state.businesses[bizId];
      labelEl.innerHTML = `
        Showing customers for: 
        <span class="font-semibold">${biz?.name || bizId}</span>
        <button class="ml-2 text-rose-400 hover:text-rose-300" onclick="clearCustomerFilter()">
          ✖
        </button>
      `;
      // Edit button added separately
      const editBtn = document.createElement("button");
      editBtn.textContent = "✏️ Edit";
      editBtn.className = "ml-2 text-cyan-400 hover:text-cyan-300";
      editBtn.onclick = () => openBizEditor(biz);
      labelEl.appendChild(editBtn);
    }
  }

  function makeBtn(label, bizId, isAll = false) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = `btn ${state.currentBizCustomers === bizId
      ? "bg-brand-500 text-white border-brand-400"
      : "bg-white/5 hover:bg-white/10 border border-white/10"
      }`;
    btn.onclick = () => {
      state.currentBizCustomers = bizId;
      if (isAll) {
        renderCustomers(state.customers);
      } else {
        const filtered = state.customers.filter(c => c.businessId === bizId);
        renderCustomers(filtered);
      }
      renderBusinessButtons(businesses); // refresh buttons
      updateLabel(bizId); // update label
    };
    return btn;
  }

  // All button
  container.appendChild(makeBtn("All", "all", true));

  // Per-business buttons
  businesses.forEach(biz => {
    container.appendChild(makeBtn(biz.name, biz.id, false));
  });

  // Set label initially
  updateLabel(state.currentBizCustomers);
}


function clearCustomerFilter() {
  state.currentBizCustomers = "all";
  renderCustomers(state.customers);
  renderBusinessButtons(Object.values(state.businesses));
}




// --- helper used above ---
function arrayToMapById(arr) {
  const map = {};
  (arr || []).forEach(item => { if (item && item.id) map[item.id] = item; });
  return map;
}

// ================= Replace direct fetch calls with fetchServerData =================

// saveCustomer -> use fetchServerData POST
function saveCustomer(env, cust) {
  if (!cust) throw new Error('no customer body');
  cust = JSON.parse(JSON.stringify(cust));

  if (!cust.businessId) throw new Error('businessId is required');

  const existing = readRows(env, 'customers');

  // Check duplicate by (businessId + name)
  const dup = existing.find(r =>
    r.businessId == cust.businessId &&
    r.name.toLowerCase().trim() == cust.name.toLowerCase().trim() &&
    r.id !== cust.id // allow update of same record
  );

  if (dup) {
    return { ok: false, error: "Customer name already exists for this business." };
  }

  if (!cust.id) {
    cust.id = 'cust_' + Utilities.getUuid();
    cust.createdAt = (new Date()).toISOString();
    appendRow(env, 'customers', cust);
    return { ok: true, customer: cust };
  } else {
    const updated = updateRowById(env, 'customers', cust.id, cust);
    return { ok: updated, customer: cust };
  }
}

async function saveCustomerToServer(customerObj) {
  if (!customerObj || !customerObj.businessId) {
    throw new Error("BusinessId is required when saving customer");
  }

  const safeCustomer = {
    ...customerObj,
    creditLimit: customerObj.creditLimit || 0,
    creditDays: customerObj.creditDays || 0,
    notes: customerObj.notes || ""
  };

  const res = await fetchServerData("savecustomer", safeCustomer);
  if (res && res.error) throw new Error(res.error);
  return res.customer || res;
}


async function handleSaveCustomer() {
  const loader = document.getElementById("loader");
  const custId = document.getElementById("custId")?.value || null;

  try {
    loader.classList.remove("hidden");

    // Collect form data
    const customerObj = {
      id: custId || undefined,
      name: document.getElementById("custName").value.trim(),
      phone: document.getElementById("custPhone").value.trim(),
      email: document.getElementById("custEmail").value.trim(),
      businessId: document.getElementById("custService").value,
      creditLimit: parseFloat(document.getElementById("custCredit").value) || 0,
      creditDays: parseInt(document.getElementById("custTermsInput").value) || 0,
      notes: document.getElementById("custNotes").value.trim()
    };

    // Validation
    if (!customerObj.name) throw new Error("Customer name is required");
    if (!customerObj.businessId) throw new Error("Business selection is required");

    // Save or update on server
    const saved = await saveCustomerToServer(customerObj);

    // Update state instantly
    if (custId) {
      const idx = state.customers.findIndex(c => c.id === custId);
      if (idx !== -1) state.customers[idx] = saved;
    } else {
      state.customers.push(saved);
    }

    // Re-render table
    renderCustomers(state.customers);

    // Highlight updated/added row
    setTimeout(() => {
      const row = document.getElementById(`custRow-${saved.id}`);
      if (row) {
        row.classList.add("row-highlight");
        row.addEventListener("animationend", () => row.classList.remove("row-highlight"), { once: true });
      }
    }, 50);

    // Close modal + toast
    closeCustomerModal();
    showToast(custId ? `✅ Customer updated: ${saved.name}` : `✅ Customer added: ${saved.name}`, "success");

  } catch (err) {
    showToast(`❌ Error saving customer: ${err.message}`, "error");
    console.error("handleSaveCustomer error:", err);
  } finally {
    loader.classList.add("hidden");
  }
}






// commitPayment -> use saveInvoiceToServer (already present) to save updated invoice
async function commitPayment(invId, amount, notes) {
  if (!(amount > 0)) return alert('Invalid amount');
  try {
    const inv = state.invoices.find(x => x.id === invId);
    if (!inv) return alert('Invoice not found');
    inv.payments = inv.payments || [];
    inv.payments.push({ id: uid(), amount, notes, createdAt: new Date().toISOString() });

    // save invoice to server (saveInvoice updates existing invoice when id present)
    const saved = await saveInvoiceToServer(inv, RUN_ENV);
    const updated = saved.invoice || saved;
    const idx = state.invoices.findIndex(x => x.id === updated.id);
    if (idx === -1) state.invoices.push(updated); else state.invoices[idx] = updated;
    renderInvoices && renderInvoices();
    alert('Payment recorded.');
  } catch (err) {
    console.error('commitPayment error', err);
    alert('Failed to record payment: ' + (err.message || err));
  }
}


/* ========== UI population & renderers (full) ========== */

function getBizName(id) {
  if (!id || id === "all") return "All Businesses";
  return (state.businesses[id]?.name || id);
}



/* Populate business select dropdown */
function populateBizSelects() {
  // Main filter dropdown
  const sel = safeEl('bizSelect');
  if (sel) {
    const opts = [['all', 'All Businesses'], ...Object.values(state.businesses).map(b => [b.id, b.name])];
    sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    sel.value = state.currentBiz || 'all';
    sel.onchange = () => {
      state.currentBiz = sel.value;
      renderAll();

    };
  }

  function populateServiceBizSelect() {
    const sel = document.getElementById("svcBusiness");
    if (!sel) return;

    sel.innerHTML = Object.values(state.businesses)
      .map(b => `<option value="${b.id}">${b.name}</option>`)
      .join("");
  }

  // Customer modal dropdown
  const custSel = safeEl('custService');
  if (custSel) {
    custSel.innerHTML = `<option value="">Select Business</option>`;
    Object.values(state.businesses).forEach(biz => {
      const opt = document.createElement('option');
      opt.value = biz.id;
      opt.textContent = biz.name;
      custSel.appendChild(opt);
    });

    // Auto-select currentBiz if available
    if (state.currentBiz && state.currentBiz !== 'all') {
      custSel.value = state.currentBiz;
    }
  }

  // Update summary label if exists
  const sumBiz = safeEl('sumBizName');
  if (sumBiz) sumBiz.textContent = getBizName(state.currentBiz);
}


/* Merge services across all businesses for global catalog */
function mergeServicesAll() {
  const out = {};
  for (const [bizId, b] of Object.entries(state.businesses || {})) {
    for (const [cat, arr] of Object.entries(b.services || {})) {
      out[cat] = Array.from(new Set([...(out[cat] || []), ...arr]));
    }
  }
  return out;
}

/* find business that owns a service (first match) */
function findBusinessForService(category, service) {
  for (const [bizId, b] of Object.entries(state.businesses || {})) {
    const list = (b.services?.[category]) || [];
    if (list.includes(service)) return bizId;
  }
  return null;
}

/* Filters + totals */
function filteredInvoices() {
  return state.currentBiz === 'all' ? state.invoices.slice() : state.invoices.filter(i => i.businessId === state.currentBiz);
}

function totals() {
  const invs = filteredInvoices();
  const received = invs.reduce((s, inv) => s + (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0), 0);
  const revenue = invs.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
  const pending = revenue - received;
  const creditOutstanding = invs.filter(i => ['Pending', 'Partial', 'Credit'].includes(i.status)).reduce((s, i) => s + ((i.total || 0) - (i.payments || []).reduce((p, a) => p + (a.amount || 0), 0)), 0);
  const pendingCount = invs.filter(i => i.status !== 'Paid').length;
  const paidCount = invs.filter(i => i.status === 'Paid').length;
  return { revenue, received, pending, creditOutstanding, pendingCount, paidCount };
}

/* render summary */
/* render summary */
function renderSummary() {
  const t = totals();

  // ✅ Animate counters for KPIs
  if (safeEl('sumRevenue')) animateCounter('sumRevenue', t.revenue);
  if (safeEl('sumPending')) animateCounter('sumPending', t.pending);
  if (safeEl('sumReceived')) animateCounter('sumReceived', t.received);
  if (safeEl('sumCredit')) animateCounter('sumCredit', t.creditOutstanding);

  // These are not numeric counters → leave as plain text
  if (safeEl('pendingCount')) safeEl('pendingCount').textContent = `${t.pendingCount} invoices`;
  if (safeEl('paidCount')) safeEl('paidCount').textContent = `${t.paidCount} invoices`;

  // ✅ Progress bar logic (unchanged)
  const goalPct = Math.min(100, Math.round((t.received / Math.max(1, t.revenue)) * 100));
  const gb = safeEl('goalBar');
  if (gb) gb.style.width = goalPct + '%';

  // ✅ Text note (unchanged)
  if (safeEl('creditNote')) {
    safeEl('creditNote').textContent = goalPct < 50
      ? 'Tighten collections'
      : 'Healthy collections';
  }
  updateRevenueGoalProgress(t.revenue, 100000); // goal = ₹5,00,000


  if (document.getElementById('dashboardReports')) {
    //renderDashboardReports();
  }

}




/* pending table */
function renderPending() {
  const tbody = safeEl('pendingTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  const rows = filteredInvoices().map(inv => ({ inv, due: new Date(inv.due), paid: (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0) }))
    .filter(x => x.inv.total > x.paid)
    .sort((a, b) => a.due - b.due);
  for (const { inv, due, paid } of rows) {
    const cust = state.customers.find(c => c.id === inv.customerId) || { name: '—', phone: '' };
    const biz = state.businesses[inv.businessId] || {};
    const outstanding = inv.total - paid;
    const daysOver = Math.max(0, daysBetween(due, now()));
    const aging = agingBucket(daysOver);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2">${inv.id}</td>
      <td class="p-2">${biz.name || '—'}</td>
      <td class="p-2">${cust.name}</td>
      <td class="p-2">${due.toISOString().slice(0, 10)}</td>
      <td class="p-2 text-amber-300">${formatINR(outstanding)}</td>
      <td class="p-2"><span class="badge ${daysOver > 60 ? 'bg-red-500/20 border-red-400/30' : 'bg-white/10'}">${daysOver}d • ${aging}</span></td>
      <td class="p-2 flex items-center gap-2">
        <button class="btn" onclick="recordPayment('${inv.id}')"><i data-lucide='indian-rupee'></i> Receive</button>
        <a class="btn" target="_blank" href="${waLink(biz, cust.phone, waMsg(inv, cust, outstanding))}"><i data-lucide='send'></i> WhatsApp</a>
      </td>`;
    tbody.appendChild(tr);
  }
}

/* invoices */
function renderInvoices() {
  const tbody = safeEl('invoiceTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  const selectedBizId = safeEl('bizSelect')?.value;

  // filter & sort
  let invs = filteredInvoices()
    .filter(inv => !selectedBizId || inv.businessId === selectedBizId)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const inv of invs) {
    const cust = state.customers.find(c => c.id === inv.customerId) || { name: '—', phone: '' };
    const biz = state.businesses[inv.businessId] || { name: 'Multiple' };
    const paid = (inv.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const due = Number(inv.total || 0) - paid;

    // status chip color mapping
    let badgeClass =
      inv.status === 'Paid'
        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-400/30'
        : inv.status === 'Partial'
          ? 'bg-amber-600/20 text-amber-300 border border-amber-400/30'
          : inv.status === 'Credit'
            ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-400/30'
            : 'bg-red-600/20 text-red-300 border border-red-400/30'; // Pending → Red

    const invoiceLabel =
      inv['invoice number'] ||
      inv.invoiceNumber ||
      inv.number ||
      inv.no ||
      inv.id;

    const dateDisplay = inv.date
      ? typeof inv.date === 'string' && inv.date.length >= 10
        ? inv.date.slice(0, 10)
        : safeDateDisplay(inv.date)
      : '';

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-white/5';
    tr.innerHTML = `
      <!-- Bulk select -->
      <td class="p-2">
        <input type="checkbox" class="inv-select" value="${inv.id}">
      </td>
      <td class="p-2">${invoiceLabel}</td>
      <td class="p-2">${biz.name || '—'}</td>
      <td class="p-2">${dateDisplay}</td>
      <td class="p-2">${cust.name}</td>
      <td class="p-2">${(inv.items || []).length}</td>
      <td class="p-2">${formatINR(inv.total)} ${renderInvoicePaymentBar(inv)}</td>
      <td class="p-2 text-emerald-400">${formatINR(Number(inv.commission || 0))}</td>
      <td class="p-2">${formatINR(inv.total)}</td>
      <td class="p-2 text-emerald-300">${formatINR(paid)}</td>
      <td class="p-2 text-amber-300">${formatINR(due)}</td>
      <td class="p-2">
        <span class="px-2 py-1 rounded-full text-xs font-medium ${badgeClass}" 
          title="Paid: ${formatINR(paid)} | Due: ${formatINR(due)}">
          ${inv.status || '—'}
        </span>
      </td>
      <td class="p-2 flex items-center gap-2">
        <button class="p-1.5 rounded-lg hover:bg-blue-600/20 text-blue-400" onclick="openEditInvoice('${inv.id}')" title="Edit Invoice">
          <i data-lucide="pencil"></i>
        </button>
        <button class="p-1.5 rounded-lg hover:bg-emerald-600/20 text-emerald-400" onclick="recordPayment('${inv.id}')" title="Record Payment">
          <i data-lucide="credit-card"></i>
        </button>
        <button class="p-1.5 rounded-lg hover:bg-amber-600/20 text-amber-400" onclick="openPrint('${inv.id}')" title="Print Invoice">
          <i data-lucide="printer"></i>
        </button>
        <button class="p-1.5 rounded-lg hover:bg-indigo-600/20 text-indigo-400" onclick="openBulkPaymentModal('${cust.id}')" title="Record Bulk Payment">
          <i data-lucide="wallet"></i>
        </button>
        <!-- WhatsApp Reminder -->
        <button class="p-1.5 rounded-lg hover:bg-green-600/20 text-green-400" 
          onclick="sendWhatsAppReminder('${inv.id}')"
          title="Send WhatsApp Reminder">
          <i data-lucide="message-circle"></i>
        </button>
        <!-- Delete -->
        <button class="p-1.5 rounded-lg hover:bg-red-600/20 text-red-400" 
          onclick="openDeleteInvoiceModal('${inv.id}', '${invoiceLabel}')"
          title="Delete Invoice">
          <i data-lucide="trash-2"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  }

  // ✅ Summary counters (unchanged)
  const filteredInvs = filteredInvoices().filter(
    inv => !selectedBizId || inv.businessId === selectedBizId
  );

  const totalAmount = filteredInvs.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const commissionTotal = filteredInvs.reduce((s, inv) => s + Number(inv.commission || 0), 0);
  const paidTotal = filteredInvs.reduce(
    (s, inv) => s + (inv.payments || []).reduce((p, a) => p + Number(a.amount || 0), 0),
    0
  );
  const balance = totalAmount - paidTotal;

  if (safeEl('invCommissionKPI')) {
    safeEl('invCommissionKPI').textContent = formatINR(commissionTotal);
  }
  if (safeEl('invAmount')) animateCounter('invAmount', totalAmount);
  if (safeEl('invPaid')) animateCounter('invPaid', paidTotal);
  if (safeEl('invBalance')) animateCounter('invBalance', balance);

  if (window.lucide) {
    lucide.createIcons();
  }
}


// Single invoice delete modal (like service delete flow)
function openDeleteInvoiceModal(invId, invLabel) {
  let container = safeEl('invoiceModuleContainer');
  if (!container) return;

  container.innerHTML = `
    <!-- Fullscreen overlay -->
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="glass rounded-2xl p-6 w-full max-w-[480px] mx-auto shadow-xl">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-red-400 flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i>
            Delete Invoice
          </h3>
          <button type="button" class="btn" onclick="closeDeleteInvoiceModal()">
            <i data-lucide="x"></i>
          </button>
        </div>

        <p class="text-sm text-white/80 mb-2">
          Invoice: <span class="font-semibold">${invLabel}</span>
        </p>

        <p class="text-sm text-red-400 mb-3">
          ⚠️ This action cannot be undone. Please type the invoice number to confirm.
        </p>

        <input id="confirmInvoiceInput"
          placeholder="Type invoice number..."
          class="w-full p-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 text-sm" />

        <div class="flex justify-end gap-2 mt-5">
          <button type="button" class="btn" onclick="closeDeleteInvoiceModal()">Cancel</button>
          <button type="button"
            class="btn bg-red-600/70 hover:bg-red-600/90 text-white font-semibold disabled:opacity-50"
            id="confirmDeleteInvoiceBtn" disabled>
            <i data-lucide="trash-2" class="w-4 h-4"></i> Delete
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  const input = safeEl("confirmInvoiceInput");
  const deleteBtn = safeEl("confirmDeleteInvoiceBtn");

  input.addEventListener("input", () => {
    deleteBtn.disabled = input.value.trim() !== invLabel.trim();
  });

  deleteBtn.onclick = () => {
    deleteInvoice(invId);
    closeDeleteInvoiceModal();
    showToast(`✅ Invoice "${invLabel}" deleted successfully`, "success");
  };
}

function closeDeleteInvoiceModal() {
  const container = safeEl('invoiceModuleContainer');
  if (container) container.innerHTML = "";
}



function openBulkDeleteInvoiceModal() {
  const selected = [...document.querySelectorAll('.inv-select:checked')].map(cb => cb.value);
  if (!selected.length) {
    showToast("⚠️ Please select at least one invoice to delete", "warning");
    return;
  }

  let container = safeEl('invoiceModuleContainer');
  if (!container) return;

  container.innerHTML = `
    <!-- Fullscreen overlay -->
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div id="bulkDeleteModal" class="glass rounded-2xl p-6 w-full max-w-[480px] mx-auto shadow-xl">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-red-400 flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i>
            Delete Invoices
          </h3>
          <button type="button" class="btn" onclick="closeBulkDeleteInvoiceModal()">
            <i data-lucide="x"></i>
          </button>
        </div>

        <p class="text-sm text-white/80 mb-2">
          You have selected <span class="font-semibold">${selected.length}</span> invoice(s) to delete.
        </p>

        <p class="text-sm text-red-400 mb-3">
          ⚠️ This action cannot be undone. Type <b>DELETE</b> to confirm.
        </p>

        <input id="bulkConfirmInput"
          placeholder="Type DELETE here..."
          class="w-full p-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 text-sm" />

        <div class="flex justify-end gap-2 mt-5">
          <button type="button" class="btn" onclick="closeBulkDeleteInvoiceModal()">Cancel</button>
          <button type="button" class="btn bg-red-600/70 hover:bg-red-600/90 text-white font-semibold disabled:opacity-50"
            id="confirmBulkDeleteBtn" disabled>
            <i data-lucide="trash-2" class="w-4 h-4"></i> Delete
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  const input = safeEl("bulkConfirmInput");
  const deleteBtn = safeEl("confirmBulkDeleteBtn");

  input.addEventListener("input", () => {
    deleteBtn.disabled = input.value.trim().toUpperCase() !== "DELETE";
  });

  deleteBtn.onclick = async () => {
    for (const id of selected) {
      await deleteInvoice(id);
    }
    closeBulkDeleteInvoiceModal();
    renderInvoices();
    showToast(`✅ ${selected.length} invoice(s) deleted successfully`, "success");
  };
}

function closeBulkDeleteInvoiceModal() {
  const container = safeEl('invoiceModuleContainer');
  if (container) container.innerHTML = "";
}



// Bulk delete handler
function bulkDeleteInvoices() {
  const selected = [...document.querySelectorAll('.inv-select:checked')].map(cb => cb.value);
  if (!selected.length) {
    showToast("⚠️ Please select at least one invoice to delete", "warning");
    return;
  }

  if (confirm(`Delete ${selected.length} invoice(s)? This cannot be undone.`)) {
    selected.forEach(id => deleteInvoice(id));
    renderInvoices();
    showToast(`✅ ${selected.length} invoice(s) deleted`, "success");
  }
}

async function deleteInvoice(invId) {
  if (!invId) return;

  try {
    const loader = safeEl("loader");
    if (loader) loader.classList.remove("hidden");

    // 🔗 Call backend to delete invoice
    await fetchServerData("deleteinvoice", { id: invId });

    // 🗑️ Remove from local state
    state.invoices = state.invoices.filter(inv => inv.id !== invId);

    // 🔄 Re-render invoices table
    renderInvoices();

    // ✅ Nice toast confirmation
    showToast("✅ Invoice deleted successfully", "success");
  } catch (err) {
    console.error("deleteInvoice error", err);
    showToast("❌ Failed to delete invoice: " + (err.message || err), "error");
  } finally {
    const loader = safeEl("loader");
    if (loader) loader.classList.add("hidden");
  }
}


/**
 * Send WhatsApp reminder for all pending invoices of a customer
 * triggered by selecting any single invoice
 * @param {string} invoiceId - The ID of the selected invoice
 */
async function sendWhatsAppReminder(invoiceId) {
  try {
    const loader = safeEl("loader");
    if (loader) loader.classList.remove("hidden");

    const selectedInvoice = state.invoices.find(i => i.id === invoiceId);
    if (!selectedInvoice) throw new Error("Invoice not found");

    const customer = state.customers.find(c => c.id === selectedInvoice.customerId);
    if (!customer || !customer.phone) throw new Error("Customer not found or phone missing");

    const pendingInvoices = state.invoices.filter(inv =>
      inv.customerId === customer.id &&
      ["pending", "partial", "credit"].includes((inv.status || "pending").toLowerCase())
    );

    if (!pendingInvoices.length) {
      showToast(`✅ No pending invoices for ${customer.name}`, "info");
      return;
    }

    const today = new Date();
    const invoiceNumbers = pendingInvoices.map(inv => {
      const due = new Date(inv.dueDate);
      const overdue = due < today ? " ⚠️" : "";
      return (inv["invoice number"] || inv.invoiceNumber || inv.id) + overdue;
    });

    const totalAmount = pendingInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const totalPaid = pendingInvoices.reduce((sum, inv) =>
      sum + (inv.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
      , 0);
    const totalPending = totalAmount - totalPaid;
    const latestDueDate = new Date(Math.max(...pendingInvoices.map(inv => new Date(inv.dueDate || 0))));

    // Build message with bold headings and overdue ⚠️
    const message =
      `Hi ${customer.name},\n\n` +
      `This is a friendly reminder of your pending invoices: ${invoiceNumbers.join(", ")}\n\n` +
      `*Total Amount:* ₹${totalAmount}\n` +
      `*Paid:* ₹${totalPaid}\n` +
      `*Pending:* ₹${totalPending}\n\n` +
      `Kindly clear the dues at the earliest before due date: ${latestDueDate.toISOString().slice(0, 10)}.\n\n` +
      `Thank you! 🙏`;

    const res = await fetchServerData("sendwhatsappreminder", {
      invoiceId: selectedInvoice.id,
      phone: customer.phone,
      message,
    });

    if (res && res.ok) {
      showToast(`📲 Reminder sent to ${customer.name}`, "success");
    } else {
      showToast("❌ Failed to send WhatsApp reminder: " + (res.error || "Unknown error"), "error");
      console.error("WhatsApp API error:", res);
    }

  } catch (err) {
    console.error("sendWhatsAppReminder error", err);
    showToast("❌ WhatsApp reminder failed: " + err.message, "error");
  } finally {
    const loader = safeEl("loader");
    if (loader) loader.classList.add("hidden");
  }
}



/**
 * Helper to format dates safely
 */
function safeDateDisplay(dateStr) {
  const d = new Date(dateStr);
  return isNaN(d) ? "—" : d.toISOString().slice(0, 10);
}





function openBulkWhatsAppReminderModal() {
  const selected = [...document.querySelectorAll('.inv-select:checked')].map(cb => cb.value);
  if (!selected.length) {
    showToast("⚠️ Please select at least one invoice", "warning");
    return;
  }

  let container = safeEl('invoiceModuleContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div id="bulkWhatsAppModal" class="glass rounded-2xl p-6 w-full max-w-[480px] mx-auto relative">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-emerald-400 flex items-center gap-2">
            <i data-lucide="message-circle" class="w-5 h-5 text-emerald-400"></i>
            Send WhatsApp Reminders
          </h3>
          <button type="button" class="btn" onclick="closeBulkWhatsAppReminderModal()">
            <i data-lucide="x"></i>
          </button>
        </div>

        <p class="text-sm text-white/70 mb-2">
          You have selected <span class="font-semibold">${selected.length}</span> invoice(s).
        </p>

        <p class="text-sm text-emerald-300 mb-3">
          ✅ A payment reminder will be sent via WhatsApp to each customer.
        </p>

        <!-- Preview box -->
        <div class="mb-4">
          <label class="text-white/80 mb-1 block">Preview Message:</label>
          <textarea id="bulkWhatsAppPreview" class="w-full h-32 p-2 rounded-lg bg-white/10 text-white" readonly></textarea>
        </div>

        <!-- Loader / progress -->
        <div id="bulkWhatsAppLoader" class="text-sm text-white/80 mb-2 hidden"></div>

        <div class="flex justify-end gap-2 mt-4">
          <button type="button" class="btn" onclick="closeBulkWhatsAppReminderModal()">Cancel</button>
          <button type="button" class="btn bg-emerald-600/60 hover:bg-emerald-600/80 text-white font-semibold"
            id="confirmBulkWhatsAppBtn">
            <i data-lucide="send"></i> Send
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  const previewBox = safeEl("bulkWhatsAppPreview");
  const sendBtn = safeEl("confirmBulkWhatsAppBtn");
  const loader = safeEl("bulkWhatsAppLoader");

  // Helper: get all pending invoices for a customer (overdue first)
  function getPendingInvoicesByCustomer(customerId) {
    const today = new Date();
    return (state.invoices || [])
      .filter(inv => inv.customerId === customerId)
      .map(inv => {
        const due = inv.dueDate ? new Date(inv.dueDate) : null;
        return { ...inv, isOverdue: due && due < today };
      })
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
  }

  // Helper: build WhatsApp message for a customer
  function buildReminderMessage(customer, pendingInvoices) {
    const invoiceNumbers = pendingInvoices.map(inv => {
      const label = inv["invoice number"] || inv.invoiceNumber || inv.id;
      return inv.isOverdue ? label + " ⚠️" : label;
    });

    const totalAmount = pendingInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const totalPaid = pendingInvoices.reduce((s, inv) =>
      s + (inv.payments || []).reduce((ps, p) => ps + Number(p.amount || 0), 0)
      , 0);
    const totalPending = totalAmount - totalPaid;
    const latestDueDate = new Date(Math.max(...pendingInvoices.map(inv => new Date(inv.dueDate || 0))));

    return (
      `Hi ${customer.name},\n\n` +
      `This is a friendly reminder of your pending invoices: ${invoiceNumbers.join(", ")}\n\n` +
      `*Total Amount:* ₹${totalAmount}\n` +
      `*Paid:* ₹${totalPaid}\n` +
      `*Pending:* ₹${totalPending}\n\n` +
      `Kindly clear the dues at the earliest before due date: ${latestDueDate.toISOString().slice(0, 10)}.\n\n` +
      `Thank you! 🙏`
    );
  }

  // Build preview messages
  const customerIds = [...new Set(selected.map(id => {
    const inv = state.invoices.find(i => i.id === id);
    return inv ? inv.customerId : null;
  }))].filter(Boolean);

  let previewText = "";
  customerIds.forEach(cid => {
    const customer = state.customers.find(c => c.id === cid);
    if (!customer) return;
    const pendingInvoices = getPendingInvoicesByCustomer(cid);
    previewText += buildReminderMessage(customer, pendingInvoices) + "\n\n";
  });

  previewBox.value = previewText;

  // Send reminders
  sendBtn.onclick = async () => {
    if (loader) loader.classList.remove("hidden");

    try {
      for (let i = 0; i < customerIds.length; i++) {
        const customerId = customerIds[i];
        const customer = state.customers.find(c => c.id === customerId);
        if (!customer || !customer.phone) continue;

        const pendingInvoices = getPendingInvoicesByCustomer(customerId);
        const message = buildReminderMessage(customer, pendingInvoices);

        if (loader) loader.textContent = `📲 Sending reminder ${i + 1} of ${customerIds.length} to ${customer.name}...`;

        // Send consolidated reminder
        await fetchServerData("sendwhatsappreminder", {
          invoiceId: pendingInvoices[0].id, // optional tracking
          phone: customer.phone,
          message
        });

        await new Promise(r => setTimeout(r, 800)); // small delay for API
      }

      closeBulkWhatsAppReminderModal();
      showToast(`📲 ${customerIds.length} reminder(s) sent successfully`, "success");
    } catch (err) {
      console.error(err);
      showToast("❌ Failed to send WhatsApp reminders", "error");
    } finally {
      if (loader) {
        ListItemText
        loader.classList.add("hidden");
        loader.textContent = "";
      }
    }
  };
}




function closeBulkWhatsAppReminderModal() {
  const container = safeEl('invoiceModuleContainer');
  if (container) container.innerHTML = "";
}



/* --- Open Modal with Prefilled Data --- */
function buildServiceOptions(selectedId) {
  return (state.services || [])
    .map(s => `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${s.service}</option>`)
    .join("");
}

function openEditInvoice(invId) {
  const inv = state.invoices.find(i => i.id === invId);
  if (!inv) return;

  // Show modal
  safeEl("editInvoiceModal").classList.remove("hidden");
  safeEl("editInvoiceTitle").textContent = `Edit Invoice (${inv["invoice number"] || inv.invoiceNumber || inv.id})`;

  // Customer dropdown (read-only)
  safeEl("editInvCustomer").innerHTML = (state.customers || [])
    .map(c => `<option value="${c.id}" ${c.id === inv.customerId ? "selected" : ""}>${c.name}</option>`)
    .join("");
  safeEl("editInvCustomer").disabled = true;

  // Dates
  const toDateInput = (val) => !val ? "" : new Date(val).toISOString().slice(0, 10);
  safeEl("editInvDate").value = toDateInput(inv.date);
  safeEl("editInvDue").value = toDateInput(inv.dueDate);

  // ✅ Commission (NEW)
  if (safeEl("editCommissionInput")) {
    safeEl("editCommissionInput").value = inv.commission || 0;
  }

  // Items
  const tbody = safeEl("editItemBody");
  tbody.innerHTML = "";
  (inv.items || []).forEach(it => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-white/10";
    tr.innerHTML = `
      <td class="p-2"><select class="serv bg-white/10 rounded-lg p-1">${buildServiceOptions(it.serviceId)}</select></td>
      <td class="p-2"><input type="text" class="desc bg-white/10 rounded-lg p-1 w-full" value="${it.desc || ""}" /></td>
      <td class="p-2"><input type="number" class="qty bg-white/10 rounded-lg p-1 w-20" value="${it.qty || 0}" /></td>
      <td class="p-2"><input type="number" class="rate bg-white/10 rounded-lg p-1 w-24" value="${it.rate || 0}" /></td>
      <td class="p-2 text-right amount">${(it.qty * it.rate).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);

    // live updates
    const qtyInp = tr.querySelector(".qty");
    const rateInp = tr.querySelector(".rate");
    qtyInp.addEventListener("input", updateEditTotals);
    rateInp.addEventListener("input", updateEditTotals);
  });

  // Notes
  safeEl("editInvNotes").value = inv.notes || "";

  state.editingInvoiceId = invId;
  updateEditTotals();
}


// ✅ Central function to recalc totals in Edit Invoice modal
function updateEditTotals() {
  let subtotal = 0;

  document.querySelectorAll("#editItemBody tr").forEach(tr => {
    const qty = parseFloat(tr.querySelector(".qty").value) || 0;
    const rate = parseFloat(tr.querySelector(".rate").value) || 0;
    const amount = qty * rate;

    tr.querySelector(".amount").textContent = amount.toFixed(2);
    subtotal += amount;
  });

  // If totals container doesn’t exist, create it
  // If totals container doesn’t exist, create it
  let totalsBox = document.getElementById("editInvoiceTotals");
  if (!totalsBox) {
    totalsBox = document.createElement("div");
    totalsBox.id = "editInvoiceTotals";
    totalsBox.className = "mt-4 p-3 rounded-xl bg-white/5 text-gray-200 space-y-2";

    // ❌ OLD: modal-body (not in your HTML)
    // document.querySelector("#editInvoiceModal .modal-body").appendChild(totalsBox);

    // ✅ NEW: insert right after Items table
    const itemsTable = document.querySelector("#editInvoiceModal #editItemBody");
    itemsTable.parentElement.appendChild(totalsBox);

    totalsBox.innerHTML = `
  <div class="flex justify-between">
    <span>Subtotal</span>
    <span id="subtotalValue">₹0.00</span>
  </div>
  <div class="flex justify-between items-center">
    <span>Discount</span>
    <input id="discountInput" type="number" 
      class="bg-transparent border border-gray-500 rounded px-2 w-24 text-right"
      value="${inv.discount || 0}" min="0" />
  </div>
  <div class="flex justify-between items-center">
    <span>Commission</span>
    <input id="editCommissionInput" type="number"
      class="bg-transparent border border-emerald-500 rounded px-2 w-24 text-right"
      value="${inv.commission || 0}" min="0" />
  </div>
  <div class="flex justify-between font-bold text-lg text-emerald-300">
    <span>Grand Total</span>
    <span id="grandTotalValue">₹0.00</span>
  </div>
`;


    document.getElementById("discountInput").addEventListener("input", updateEditTotals);
  }


  const discount = parseFloat(document.getElementById("discountInput").value) || 0;
  const grandTotal = Math.max(0, subtotal - discount);

  document.getElementById("subtotalValue").textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById("grandTotalValue").textContent = `₹${grandTotal.toFixed(2)}`;
}



async function saveEditedInvoice() {
  const invId = state.editingInvoiceId;
  const inv = state.invoices.find(i => i.id === invId);
  if (!inv) return alert("Invoice not found");

  // show loader (guard in case loader id differs)
  try { document.getElementById("loader").classList.remove("hidden"); } catch (e) { }

  // Read fields
  const newDateRaw = safeEl("editInvDate")?.value;
  const newDueRaw = safeEl("editInvDue")?.value;
  const newNotes = safeEl("editInvNotes")?.value || "";

  // Collect items & compute subtotal
  const items = [];
  let subtotal = 0;
  document.querySelectorAll("#editItemBody tr").forEach(tr => {
    const serviceId = tr.querySelector(".serv")?.value;
    const service = state.services.find(s => s.id === serviceId);
    const desc = tr.querySelector(".desc")?.value || "";
    const qty = parseFloat(tr.querySelector(".qty")?.value || "0") || 0;
    const rate = parseFloat(tr.querySelector(".rate")?.value || "0") || 0;
    const amount = qty * rate;
    subtotal += amount;
    items.push({
      serviceId,
      serviceName: service ? service.service : "",
      desc,
      qty,
      rate
    });
  });

  // Read discount and commission (robust parsing)
  const discount = parseFloat(safeEl("discountInput")?.value || "0") || 0;
  const newCommission = parseFloat(safeEl("editCommissionInput")?.value || "0") || 0;

  // Compute total (consistent with your edit totals UI)
  const total = Math.max(0, subtotal - discount);

  // Build update object (ensure dueDate property exists)
  const toISO = (dstr) => {
    if (!dstr) return "";
    // prefer your helper if present
    if (typeof toISTISOString === "function") return toISTISOString(dstr);
    try { return new Date(dstr).toISOString(); } catch (e) { return dstr; }
  };

  const updateObj = {
    ...inv,
    date: newDateRaw ? toISO(newDateRaw) : inv.date,
    dueDate: newDueRaw ? toISO(newDueRaw) : inv.dueDate,
    notes: newNotes,
    items,
    subtotal,
    discount,
    total,
    commission: newCommission
  };

  console.log("🔁 saveEditedInvoice payload:", updateObj);

  try {
    // send to server (your helper)
    const res = await fetchServerData("saveInvoice", updateObj);

    // handle response shape flexibly
    const savedInv = res && (res.invoice || res) || null;
    if (!savedInv) throw new Error("Server returned invalid response when saving invoice.");

    // update local state
    state.invoices = state.invoices || [];
    const idx = state.invoices.findIndex(i => i.id === invId);
    if (idx >= 0) {
      state.invoices[idx] = savedInv;
    } else {
      state.invoices.push(savedInv);
    }

    // Close modal and refresh UI
    try { closeEditInvoice(); } catch (e) { }
    renderInvoices();
    showToast("✅ Invoice updated", "success");
  } catch (err) {
    console.error("❌ Failed to update invoice:", err);
    showToast("Failed to update invoice: " + (err && err.message ? err.message : String(err)), "error");
  } finally {
    // hide loader (guard)
    try { document.getElementById("loader").classList.add("hidden"); } catch (e) { }
  }
}





/* Close Modal */
function closeEditInvoice() {
  safeEl("editInvoiceModal").classList.add("hidden");
  state.editingInvoiceId = null;
}

/* Add Item Row */
function addEditItemRow(item = {}) {
  const tbody = safeEl("editItemBody");
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="border p-1">
      <select class="serv w-full border rounded p-1">
        ${state.services.map(s =>
    `<option value="${s.id}" ${s.id === item.serviceId ? "selected" : ""}>${s.service}</option>`
  ).join("")}
      </select>
    </td>
    <td class="border p-1"><input class="desc w-full border rounded p-1" value="${item.desc || ""}"></td>
    <td class="border p-1"><input type="number" class="qty w-full border rounded p-1" value="${item.qty || 1}" oninput="recalcEditTotals()"></td>
    <td class="border p-1"><input type="number" class="rate w-full border rounded p-1" value="${item.rate || 0}" oninput="recalcEditTotals()"></td>
    <td class="border p-1 text-right amt">0</td>
    <td class="border p-1"><button onclick="this.closest('tr').remove(); recalcEditTotals()">🗑</button></td>
  `;
  tbody.appendChild(tr);
  recalcEditTotals();
}

/* Recalc Totals */
function recalcEditTotals() {
  let subtotal = 0;
  document.querySelectorAll("#editItemBody tr").forEach(tr => {
    const qty = +tr.querySelector(".qty").value || 0;
    const rate = +tr.querySelector(".rate").value || 0;
    const amt = qty * rate;
    subtotal += amt;
    tr.querySelector(".amt").textContent = amt.toFixed(2);
  });
  safeEl("editSubtotal").textContent = subtotal.toFixed(2);
  safeEl("editTotal").textContent = subtotal.toFixed(2);
}

/* Update Invoice */
async function updateInvoice() {
  const invId = state.editingInvoiceId;
  const inv = state.invoices.find(i => i.id === invId);
  if (!inv) return;

  const items = Array.from(document.querySelectorAll("#editItemBody tr")).map(tr => ({
    serviceId: tr.querySelector(".serv").value,
    serviceName: tr.querySelector(".serv").selectedOptions[0].text,
    desc: tr.querySelector(".desc").value,
    qty: +tr.querySelector(".qty").value,
    rate: +tr.querySelector(".rate").value
  }));

  const total = items.reduce((s, it) => s + it.qty * it.rate, 0);

  const updatedInv = {
    ...inv,
    date: safeEl("editInvDate").value ? toISTSheetDate(safeEl("editInvDate").value) : inv.date,
    dueDate: safeEl("editInvDue").value ? toISTSheetDate(safeEl("editInvDue").value) : inv.dueDate,
    items,
    total,
    notes: safeEl("editInvNotes").value || inv.notes
  };

  try {
    showLoader();
    const saved = await saveInvoiceToServer(updatedInv, RUN_ENV);
    const idx = state.invoices.findIndex(i => i.id === invId);
    if (idx >= 0) state.invoices[idx] = saved.invoice;
    renderAll();
    closeEditInvoice();
    hideLoader();
    showToast("✅ Invoice updated", "success");
  } catch (err) {
    hideLoader();
    console.error("updateInvoice error", err);
    showToast("❌ Failed to update invoice: " + err.message, "error");
  }
}

/* customers */
function renderCustomers(customers = state.customers) {
  const tbody = safeEl('customerTable');
  if (!tbody) return;

  const serviceFilter = safeEl('custServiceFilter')?.value || 'all';
  const businessFilter = safeEl('bizSelect')?.value || ''; // business filter
  tbody.innerHTML = '';

  for (const c of customers) {
    // Filter by selected business
    if (businessFilter && c.businessId !== businessFilter) continue;

    // Find services used by this customer
    const custInvs = state.invoices.filter(i => i.customerId === c.id);
    const servicesUsed = new Set();
    custInvs.forEach(inv => (inv.items || []).forEach(it => servicesUsed.add(`${it.category}→${it.service}`)));
    const serviceList = Array.from(servicesUsed).map(s => s.split('→')[1]).join(', ') || '—';

    // Filter by service if selected
    if (serviceFilter !== 'all' && serviceFilter) {
      const found = Array.from(servicesUsed).some(s => s.split('→')[1] === serviceFilter || s.split('→')[0] === serviceFilter);
      if (!found) continue;
    }

    // Outstanding & Credit Usage %
    const outstanding = custInvs.reduce(
      (s, inv) => s + ((inv.total || 0) - (inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0)),
      0
    );
    const creditLimit = c.creditLimit || 0;
    const usagePct = creditLimit > 0 ? Math.min(100, Math.round((outstanding / creditLimit) * 100)) : 0;

    // Color based on usage %
    let usageColor = "bg-green-400";
    if (usagePct >= 80) usageColor = "bg-red-400";
    else if (usagePct >= 50) usageColor = "bg-orange-400";

    // Row creation
    // Row creation with animated progress bar
    const tr = document.createElement('tr');
    tr.id = `custRow-${c.id}`;
    tr.innerHTML = `
  <td class="p-2">${c.name}</td>
  <td class="p-2">+${c.phone || ''}</td>
  <td class="p-2">${serviceList}</td>
  <td class="p-2">${formatINR(c.creditLimit || 0)}</td>
  <td class="p-2">${c.creditDays || '—'}</td>
  <td class="p-2 text-amber-300">
    ${formatINR(outstanding)}
    <div class="h-1.5 bg-gray-700 rounded mt-1 overflow-hidden">
      <div class="h-1.5 ${usageColor} credit-bar-fill" style="width:0%;"></div>
    </div>
  </td>
  <td class="p-2 flex items-center gap-2">
    <button class="btn editBtn" data-id="${c.id}" title="Edit"><i data-lucide="pencil"></i></button>
    <button class="btn deleteBtn" data-id="${c.id}" title="Delete"><i data-lucide="trash-2"></i></button>
  </td>
`;
    tbody.appendChild(tr);

    // Animate bar fill after row added
    setTimeout(() => {
      const bar = tr.querySelector(".credit-bar-fill");
      if (bar) bar.style.width = usagePct + "%";
    }, 50);
  }

  // Reinitialize Lucide icons
  if (window.lucide) lucide.createIcons();

  // Attach Edit handlers
  tbody.querySelectorAll(".editBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const cust = customers.find(x => x.id === id);
      if (cust) openCustomerEditor(cust);
    });
  });

  // Attach Delete handlers
  tbody.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      deleteCustomer(id);
    });
  });

  // Refresh service filter
  if (safeEl('custServiceFilter')) {
    const services = mergeServicesAll();
    const vals = ['all', ...Object.values(services).flat()];
    const unique = ['all', ...Array.from(new Set(vals.slice(1)))];
    safeEl('custServiceFilter').innerHTML = unique.map(v => `<option value="${v}">${v === 'all' ? 'All Services' : v}</option>`).join('');
    safeEl('custServiceFilter').onchange = () => renderCustomers(customers);
  }
}




function openCustomerEditor(cust) {
  populateBizSelects();

  // Fill form fields
  safeEl("custName").value = cust.name || "";
  safeEl("custPhone").value = cust.phone || "";
  safeEl("custEmail").value = cust.email || "";
  safeEl("custCredit").value = cust.creditLimit || 0;
  safeEl("custTermsInput").value = cust.creditDays || 0;
  safeEl("custNotes").value = cust.notes || "";

  // Set business dropdown
  const bizSelect = safeEl("custService");
  if (bizSelect) bizSelect.value = cust.businessId || "";

  // Store ID for update
  let idField = safeEl("custId");
  if (!idField) {
    idField = document.createElement("input");
    idField.type = "hidden";
    idField.id = "custId";
    safeEl("customerModal").appendChild(idField);
  }
  idField.value = cust.id;

  // Change Save → Update
  const saveBtn = document.getElementById("custSaveBtn");
  if (saveBtn) saveBtn.textContent = cust ? "Update" : "Save";

  // Show modal
  safeEl("customerModal").classList.remove("hidden");
}



/* Service catalog */
// Render service catalog dynamically
function renderServiceCatalog(services) {
  const wrap = document.getElementById('serviceCatalog');
  if (!wrap) return;

  wrap.innerHTML = '';

  if (!services || services.length === 0) {
    wrap.innerHTML = '<p class="text-center text-gray-400">No services found.</p>';
    return;
  }

  // Group by business name instead of category
  const grouped = {};
  services.forEach(s => {
    const bizName = state.businesses[s.businessId]?.name || 'Unknown Business';
    if (!grouped[bizName]) grouped[bizName] = [];
    grouped[bizName].push(s);
  });

  for (const [bizName, list] of Object.entries(grouped)) {
    const card = document.createElement('div');
    card.className = 'col-span-12 md:col-span-12 lg:col-span-6 glass rounded-2xl p-4';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide='folder-tree' class='w-4 h-4'></i>
          <div class="font-semibold">${bizName}</div>
        </div>
        <span class="badge">${list.length} service${list.length > 1 ? 's' : ''}</span>
      </div>
      <div class="mt-3 space-y-2">
        ${list.map(s => `
<div class='flex items-center justify-between text-sm bg-white/5 border border-white/10 rounded-xl p-2'>
  <span class="flex-1 truncate">${s.service}</span>
  <div class="flex gap-2 flex-shrink-0">
    <!-- Add button -->
    <button class='btn bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
      onclick="prefillItem('${bizName.replace(/'/g, "\\'")}', '${s.service.replace(/'/g, "\\'")}')">
      <i data-lucide='plus'></i> Add
    </button>

    <!-- Delete button (custom modal confirm) -->
    <button class='btn bg-red-600/20 text-red-400 hover:bg-red-600/30'
      onclick="openInlineDeleteServiceModal('${s.id}', '${s.service.replace(/'/g, "\\'")}')">
      <i data-lucide='trash-2'></i> Delete
    </button>
  </div>
</div>
        `).join('')}
      </div>
    `;
    wrap.appendChild(card);
  }

  if (window.lucide) lucide.createIcons();
}

function openInlineDeleteServiceModal(svcId, svcName) {
  let container = safeEl('serviceModuleContainer');
  if (!container) return;

  container.innerHTML = `
    <div id="inlineDeleteModal" class="glass rounded-2xl p-6 w-full max-w-[480px] mx-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-red-400 flex items-center gap-2">
          <i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i>
          Delete Service
        </h3>
        <button type="button" class="btn" id="closeInlineDeleteBtn">
          <i data-lucide="x"></i>
        </button>
      </div>

      <p class="mt-2 text-sm text-white/70">Service: <span class="font-semibold text-white">${svcName}</span></p>

      <!-- Warning text -->
      <p class="mt-3 text-sm text-red-400 flex items-center gap-1">
        <i data-lucide="alert-octagon" class="w-4 h-4"></i>
        This action cannot be undone. Type the service name below to confirm.
      </p>

      <!-- Confirmation input -->
      <input id="inlineConfirmName"
        placeholder="Type service name here..."
        class="w-full mt-2 bg-white/5 border border-white/10 rounded-xl p-2 text-sm" />

      <!-- Action buttons -->
      <div class="flex justify-end gap-2 mt-5" id="inlineDeleteActions">
        <button type="button" class="btn" id="cancelInlineDeleteBtn">Cancel</button>
        <button type="button"
          class="btn bg-red-600/60 hover:bg-red-600/80 text-white font-semibold disabled:opacity-50"
          id="inlineDeleteBtn" disabled>
          <i data-lucide="trash-2"></i> Delete
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  // Handlers
  safeEl("closeInlineDeleteBtn").onclick = closeInlineDeleteModal;
  safeEl("cancelInlineDeleteBtn").onclick = closeInlineDeleteModal;

  const input = safeEl("inlineConfirmName");
  const deleteBtn = safeEl("inlineDeleteBtn");

  // Enable delete only when name matches
  input.addEventListener("input", () => {
    deleteBtn.disabled = input.value.trim() !== svcName.trim();
  });

  deleteBtn.onclick = () => {
    deleteService(svcId);
    closeInlineDeleteModal();
    showToast(`✅ Service "${svcName}" deleted successfully`, "success");
  };
}

function closeInlineDeleteModal() {
  const container = safeEl("serviceModuleContainer");
  if (container) container.innerHTML = "";
}





// Initialize state from sheets
function initializeState(customers, services) {
  // Initialize empty state first
  state = {
    businesses: {},
    services: services || [], // make sure services array exists
  };

  // Build businesses object
  customers.forEach(c => {
    if (!state.businesses[c.businessId]) {
      state.businesses[c.businessId] = {
        id: c.businessId,
        name: c.name,
        customers: [],
      };
    }
    state.businesses[c.businessId].customers.push(c);
  });

  // Populate dropdown
  populateBusinessDropdown();

  // Only render services if we have any
  if (state.services.length > 0) {
    renderServiceCatalog(state.services);
  }
}



/* Charts (uses Chart.js) */
let revChart, statusChart, catChart;
function renderCharts() {
  const months = Array.from({ length: 6 }).map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); return d.toLocaleString('en-US', { month: 'short' }); });
  const byMonth = Array(6).fill(0), collectedMonth = Array(6).fill(0);
  const invs = filteredInvoices();
  const ref = new Date();
  for (const inv of invs) {
    const d = new Date(inv.date);
    const idx = 5 - ((ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth()));
    if (idx >= 0 && idx < 6) { byMonth[idx] += (inv.total || 0); collectedMonth[idx] += (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0); }
  }
  [revChart, statusChart, catChart].forEach(c => { if (c) try { c.destroy(); } catch (e) { } });
  const revCtx = safeEl('revChart'); if (revCtx) revChart = new Chart(revCtx, { type: 'bar', data: { labels: months, datasets: [{ label: 'Invoiced', data: byMonth }, { label: 'Collected', data: collectedMonth }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
  const statuses = ['Paid', 'Partial', 'Pending', 'Credit'];
  const counts = statuses.map(s => invs.filter(i => i.status === s).length);
  const statusCtx = safeEl('statusChart'); if (statusCtx) statusChart = new Chart(statusCtx, { type: 'doughnut', data: { labels: statuses, datasets: [{ data: counts }] }, options: { plugins: { legend: { position: 'bottom' } } } });
  const catMap = {};
  for (const inv of invs) { for (const it of (inv.items || [])) { catMap[it.category] = (catMap[it.category] || 0) + (it.qty * it.rate * (1 + (it.tax || 0) / 100)); } }
  const catLabels = Object.keys(catMap), catVals = Object.values(catMap);
  const catCtx = safeEl('catChart'); if (catCtx) catChart = new Chart(catCtx, { type: 'bar', data: { labels: catLabels, datasets: [{ label: 'Amount', data: catVals }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true } } } });
}

/* ========== Invoice Form Helpers ========== */

function populateCustomerSelect() {
  const sel = safeEl('invCustomer');
  if (!sel) return;

  // 🔑 get selected business id from dropdown
  const selectedBizId = safeEl('bizSelect')?.value || '';

  // 🔑 filter customers by business
  const filteredCustomers = (state.customers || []).filter(c =>
    !selectedBizId || c.businessId === selectedBizId
  );

  // populate dropdown
  sel.innerHTML = filteredCustomers
    .map(c => `<option value='${c.id}'>${c.name}</option>`)
    .join('');

  // event + metadata
  sel.onchange = () => updateCustMeta();
  updateCustMeta();

  // set defaults
  const today = new Date().toISOString().slice(0, 10);
  if (safeEl('invDate')) safeEl('invDate').value = today;

  // calculate due date from selected customer’s creditDays
  const c = filteredCustomers.find(x => x.id === sel.value);
  const due = new Date();
  due.setDate(due.getDate() + (c?.creditDays || 30));
  if (safeEl('invDue')) safeEl('invDue').value = due.toISOString().slice(0, 10);
}


function updateCustMeta() {
  const sel = safeEl('invCustomer');
  if (!sel) return;
  const c = state.customers.find(x => x.id === sel.value);
  safeEl('custCreditLimit') && (safeEl('custCreditLimit').textContent = c ? formatINR(c.creditLimit || 0) : '—');
  safeEl('custTerms') && (safeEl('custTerms').textContent = c ? c.creditDays : '—');
}

function getAvailableServices() {
  return mergeServicesAll();
}

function addItemRow(prefServ = '', bizId = null) {
  const tbody = safeEl('itemBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class='p-2'>
      <select class='serv w-full bg-white/5 border border-white/10 rounded-xl p-2'>
        <option value="" disabled selected>Select service</option>
      </select>
    </td>
    <td class='p-2'>
      <input class='desc w-full bg-white/5 border border-white/10 rounded-xl p-2' placeholder='Description'/>
    </td>
    <td class='p-2'>
      <input type='number' class='qty w-20 text-right bg-white/5 border border-white/10 rounded-xl p-2' value='1' oninput='recalcTotals()'/>
    </td>
    <td class='p-2'>
      <input type='number' class='rate w-28 text-right bg-white/5 border border-white/10 rounded-xl p-2' value='0' oninput='recalcTotals()'/>
    </td>
    <td class='p-2 amount text-right'>₹0</td>
    <td class='p-2'>
      <button class='btn' onclick='this.closest("tr").remove(); recalcTotals();'>
        <i data-lucide="trash-2"></i>
      </button>
    </td>
  `;

  tbody.appendChild(tr);

  // ✅ use currently selected business, unless explicitly overridden
  const activeBizId = bizId || safeEl('bizSelect')?.value || '';

  // pass the active business + preferred service
  populateServiceSelect(tr, prefServ, activeBizId);

  recalcTotals();
  try { lucide.createIcons(); } catch (e) { }
}





function populateServiceSelect(tr, prefServ = '', bizId = null) {
  const serv = tr.querySelector('.serv');
  if (!serv) return;

  // ✅ Always prefer passed bizId, otherwise current bizSelect
  let selectedBizId = bizId || safeEl('bizSelect')?.value || '';
  console.log("populateServiceSelect → selectedBizId:", selectedBizId);

  const allServices = Array.isArray(state.services)
    ? state.services
    : Object.values(state.services || {});

  // ✅ Filter properly (don’t fall back to “all” for first row)
  const filteredServices = allServices.filter(
    s => String(s.businessId).trim() === String(selectedBizId).trim()
  );

  console.log("Filtered services:", filteredServices);

  if (!filteredServices.length) {
    serv.innerHTML = `<option disabled selected>No services for this business</option>`;
    return;
  }

  serv.innerHTML = filteredServices
    .map(s => `<option value="${s.id}" ${s.id === prefServ ? 'selected' : ''}>
                 ${s.service || '(no name)'} ${s.price ? `(${formatINR(s.price)})` : ''}
               </option>`)
    .join('');

  serv.onchange = () => {
    const selected = allServices.find(s => s.id === serv.value);
    if (selected) {
      tr.querySelector('.rate').value = selected.price || 0;
      tr.querySelector('.desc').value = selected.notes || '';
      recalcTotals();
    }
  };

  // ✅ trigger once to auto-fill
  serv.dispatchEvent(new Event('change'));
}





function prefillItem(cat, serv) {
  showView('invoices');
  addItemRow(cat, serv);
}

function recalcTotals() {
  let subtotal = 0;

  const rows = safeEl('itemBody')?.querySelectorAll('tr') || [];
  rows.forEach(tr => {
    const qty = parseFloat(tr.querySelector('.qty')?.value || 0);
    const rate = parseFloat(tr.querySelector('.rate')?.value || 0);
    const amount = !isNaN(qty) && !isNaN(rate) ? qty * rate : 0;
    subtotal += amount;
    const amountCell = tr.querySelector('.amount');
    if (amountCell) amountCell.textContent = formatINR(amount);
  });

  // ✅ Subtotal
  if (safeEl('invSubTotal')) safeEl('invSubTotal').textContent = formatINR(subtotal);

  // ✅ Discount
  const discount = parseFloat(safeEl('discount')?.value || 0);
  const total = Math.max(0, subtotal - (isNaN(discount) ? 0 : discount));

  // ✅ Invoice Grand Total (form total)
  if (safeEl('invGrandTotal')) safeEl('invGrandTotal').textContent = formatINR(total);
}




function resetInvoiceForm() {
  const form = safeEl('invoiceForm');
  if (form) form.reset();

  // Clear all rows
  const tbody = safeEl('itemBody');
  if (tbody) tbody.innerHTML = '';

  // ✅ Do not auto-add first row anymore
  populateCustomerSelect();
  recalcTotals();
}




/* build invoice object (local helper) */
function makeInvoice({
  businessId,
  date,
  due,
  customerId,
  items,
  discount = 0,
  asCredit = false,
  paidNow = 0,
  notes = ''
}) {
  const dStr = date || toISTISOString(new Date());
  const dueStr = due || toISTISOString(new Date());

  const invoiceNumber = generateInvoiceNumber(businessId);

  const subtotal = (items || []).reduce((s, it) => s + (it.qty * it.rate), 0);
  const taxtotal = (items || []).reduce((s, it) => s + (it.qty * it.rate * (it.tax || 0) / 100), 0);
  const total = Math.max(0, subtotal + taxtotal - (discount || 0));

  const payments = [];
  if (paidNow > 0) {
    payments.push({
      date: toISTISOString(new Date()),
      amount: paidNow,
      method: 'Cash'
    });
  }

  const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const status =
    paid >= total ? 'Paid'
      : (paid > 0 ? 'Partial'
        : (asCredit ? 'Credit' : 'Pending'));

  return {
    id: `inv_${crypto.randomUUID()}`,   // unique id
    businessId,
    date: dStr,
    due: dueStr,
    customerId,
    items,
    discount,
    subtotal,
    taxtotal,
    total,
    payments,
    notes,
    status,
    invoiceNumber // ✅ always camelCase
  };
}





/* ========== Save invoice (create) ========== */

async function saveInvoiceToServer(invoiceObj) {
  const safeInvoice = {
    ...invoiceObj,
    items: invoiceObj.items || [],
    payments: (invoiceObj.payments || []).map(p => ({
      ...p,
      date: typeof p.date === "string" ? p.date : toISTISOString(p.date)
    })),
    date: typeof invoiceObj.date === "string" ? invoiceObj.date : toISTISOString(invoiceObj.date),
    due: typeof invoiceObj.due === "string" ? invoiceObj.due : toISTISOString(invoiceObj.due)
  };

  const res = await fetchServerData("saveinvoice", safeInvoice);
  if (res && res.error) throw new Error(res.error);
  return res.invoice || res;
}


// ---------- Date Helpers ----------
function toISTISOString(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d)) return "";
  // Convert to IST and output like "2025-08-29T15:42:00"
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace(" ", "T");
}



// ---- Date Helpers ----
function safeToIST(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function safeToISO(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toISOString();
}


async function saveInvoice() {
  // Collect basic fields
  const custId = safeEl('invCustomer')?.value;
  const dateRaw = safeEl('invDate')?.value;   // from date input
  const dueRaw = safeEl('invDue')?.value;
  const discount = +(safeEl('discount')?.value || 0);
  const asCredit = !!safeEl('asCredit')?.checked;
  const takePaymentNow = !!safeEl('takePaymentNow')?.checked;
  const notes = safeEl('invNotes')?.value || '';

  // === COMMISSION: robust read
  // Your HTML had an input with id="invCommission" and also a KPI div with the same id.
  // We try to read a numeric value in a forgiving way (works whether the element is an input or a plain div).
  let commission = 0;
  try {
    const commEl = safeEl('invCommission');
    if (commEl) {
      if ('value' in commEl) {
        // input/textarea/select
        commission = parseFloat(commEl.value || '0') || 0;
      } else {
        // fallback: read text content and strip non-numeric characters (e.g. "₹1,200")
        const txt = commEl.textContent || '';
        commission = parseFloat(txt.replace(/[^\d.\-]/g, '')) || 0;
      }
    }
  } catch (e) {
    commission = 0;
  }

  // ✅ Collect items safely (same logic you already used)
  const items = Array.from(document.querySelectorAll('#itemBody tr'))
    .map(tr => {
      const servSel = tr.querySelector('.serv');
      const descInp = tr.querySelector('.desc');
      const qtyInp = tr.querySelector('.qty');
      const rateInp = tr.querySelector('.rate');

      if (!servSel || !qtyInp || !rateInp) return null;

      return {
        serviceId: servSel.value,
        serviceName: servSel.options[servSel.selectedIndex]?.text || '',
        desc: descInp?.value || '',
        qty: +qtyInp.value || 0,
        rate: +rateInp.value || 0
      };
    })
    .filter(x => x && x.qty > 0 && x.rate > 0);

  if (!items.length) {
    alert('Add at least one line item.');
    return;
  }

  // ✅ Business from dropdown
  const businessId = safeEl('bizSelect')?.value;
  if (!businessId || businessId === "all") {
    alert('Please select a business before saving invoice.');
    return;
  }

  // ✅ Convert dates to IST-safe ISO
  const now = new Date();
  const dateIST = dateRaw ? toISTISOString(dateRaw) : toISTISOString(now);
  const dueIST = dueRaw ? toISTISOString(dueRaw) : "";

  // Build invoice object (let backend assign id/number normally)
  // Make sure to include commission in the object we send
  let inv = makeInvoice({
    id: "",
    number: "",
    businessId,
    date: dateIST,
    dueDate: dueIST,
    customerId: custId,
    items,
    discount,
    asCredit,
    commission: commission,   // <-- Commission included
    paidNow: 0,
    notes
  });

  // ensure id/number are stripped
  delete inv.id;
  delete inv.number;

  // ✅ enforce correct property before sending
  inv.dueDate = dueIST;

  // If makeInvoice doesn't copy commission, set it explicitly
  if (typeof inv.commission === 'undefined') inv.commission = commission;

  // === Payment handling (optional immediate payment)
  if (takePaymentNow) {
    // Use prompt for quick flow (existing pattern). Prefer modal in future.
    const defaultAmount = Number(inv.total || 0);
    const amt = prompt('Enter amount received now:', defaultAmount > 0 ? String(defaultAmount) : '');
    const num = parseFloat(amt || '0') || 0;
    if (num > 0) {
      inv.payments = inv.payments || [];
      inv.payments.push({
        date: toISTISOString(new Date()),   // IST timestamp
        amount: num,
        method: 'Cash'                      // you may change to a select field later
      });
    }
    // Recompute status based on payments
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    inv.status = paid >= (inv.total || 0) ? 'Paid'
      : (paid > 0 ? 'Partial'
        : (asCredit ? 'Credit' : 'Pending'));
  }

  // Remove local id/number before sending (your previous pattern)
  try {
    delete inv.id;
  } catch (e) { }
  try {
    delete inv.number;
  } catch (e) { }

  console.log("Final invoice payload →", inv);

  // === Save to server
  try {
    showLoader();
    const saved = await saveInvoiceToServer(inv, RUN_ENV);
    // server may return { invoice: {...} } or the invoice object directly
    const savedInv = saved && saved.invoice ? saved.invoice : (saved || null);

    if (!savedInv) {
      throw new Error('Invalid response from server when saving invoice.');
    }

    // Update local state (keep existing pattern)
    state.invoices = state.invoices || [];
    state.invoices.push(savedInv);

    // Re-render everything
    renderAll();

    // Open print for the newly saved invoice (existing behavior)
    try { openPrint(savedInv.id); } catch (e) { }

    showToast("✅ Invoice saved successfully!", "success");
  } catch (err) {
    console.error("saveInvoice error", err);
    showToast("❌ Failed to save invoice: " + (err && err.message ? err.message : String(err)), "error");
  } finally {
    hideLoader();
  }
}





function generateInvoiceNumber(bizId) {
  let biz = null;

  if (state.businesses) {
    if (state.businesses[bizId]) {
      biz = state.businesses[bizId]; // map
    } else if (Array.isArray(state.businesses)) {
      biz = state.businesses.find(b => b.id === bizId); // array
    } else if (typeof state.businesses === "object") {
      biz = Object.values(state.businesses).find(b => b.id === bizId); // object fallback
    }
  }

  const prefix = biz?.prefix || "INV";
  const year = new Date().getFullYear().toString().slice(-2);

  // Filter invoices for same business + year
  const invoices = (state.invoices || []).filter(
    inv => inv.businessId === bizId && (inv.invoiceNumber || "").includes(`-${year}-`)
  );

  let maxNum = 0;
  for (const inv of invoices) {
    const parts = (inv.invoiceNumber || "").split("-");
    const numPart = parts[parts.length - 1];
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }

  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(4, "0");

  console.log("Invoice prefix resolved:", bizId, "=>", prefix);

  return `${prefix}-${year}-${padded}`;
}




/* ========== Record payment (update invoice) ========== */

async function recordPayment(invId) {
  const idx = state.invoices.findIndex(x => x.id === invId);
  if (idx === -1) { alert('Invoice not found'); return; }
  const inv = state.invoices[idx];
  const due = (inv.total || 0) - (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  openPaymentModal(invId); return; // payment handled in modal)) return;
  inv.payments = inv.payments || [];
  inv.payments.push({ date: new Date().toISOString(), amount: num, method: 'UPI' });
  const paid = inv.payments.reduce((s, p) => s + (p.amount || 0), 0);
  inv.status = paid >= inv.total ? 'Paid' : (paid > 0 ? 'Partial' : (inv.status === 'Credit' ? 'Credit' : 'Pending'));

  // update on server (saveInvoice will update since inv.id exists)
  try {
    const saved = await saveInvoiceToServer(inv, RUN_ENV);
    const updatedInv = saved.invoice || saved;
    // replace in state
    state.invoices[idx] = updatedInv;
    renderAll();
    alert('Payment recorded and saved to server.');
  } catch (err) {
    console.error('recordPayment save error', err);
    alert('Failed to record payment: ' + err.message);
  }
}

/* ========== Transactions / Ledger ========== */

function buildTransactions() {
  const tx = [];
  for (const inv of state.invoices) {
    const biz = state.businesses[inv.businessId];
    const cust = state.customers.find(c => c.id === inv.customerId) || { name: '—', phone: '' };

    // Invoice transaction
    tx.push({
      date: inv.date,
      type: 'Invoice',
      ref: inv.id,
      businessId: inv.businessId,  // ✅ add businessId
      business: biz?.name || (inv.businessId === 'multi' ? 'Multiple' : '—'),
      customer: cust.name,
      amount: inv.total,
      method: '-'
    });

    // Payment transactions
    (inv.payments || []).forEach(p => {
      tx.push({
        date: p.date,
        type: 'Payment',
        ref: inv.id,
        businessId: inv.businessId,  // ✅ add businessId
        business: biz?.name || (inv.businessId === 'multi' ? 'Multiple' : '—'),
        customer: cust.name,
        amount: p.amount,
        method: p.method || ' — '
      });
    });
  }

  // Sort latest first
  tx.sort((a, b) => new Date(b.date) - new Date(a.date));
  return tx;
}


function safeDateDisplay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function renderTransactions() {
  const tx = buildTransactions();
  const tbody = safeEl('txTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  const selectedBizId = safeEl('bizSelect')?.value || '';

  let totalInvoiced = 0, totalPayments = 0;

  tx
    .filter(t => !selectedBizId || t.businessId === selectedBizId) // ✅ filter by bizId
    .forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-2">${safeDateDisplay(t.date)}</td>
        <td class="p-2">${t.type}</td>
        <td class="p-2">${t.ref || ''}</td>
        <td class="p-2">${t.business || ''}</td>
        <td class="p-2">${t.customer || ''}</td>
        <td class="p-2 text-right">${formatINR(t.amount)}</td>
        <td class="p-2">${t.method || '-'}</td>
      `;
      tbody.appendChild(tr);

      if (t.type === 'Invoice') {
        totalInvoiced += t.amount;
      } else if (t.type === 'Payment') {
        totalPayments += t.amount;
      }
    });

  // ✅ Animate counters for Transaction summary
  if (safeEl('txTotal')) animateCounter('txTotal', totalInvoiced);
  if (safeEl('txPayments')) animateCounter('txPayments', totalPayments);
  if (safeEl('txCredits')) animateCounter('txCredits', totalInvoiced);
  if (safeEl('txBalance')) animateCounter('txBalance', totalInvoiced - totalPayments);

}


/* ========== Printing & WhatsApp ========== */

function openPrint(invId) {
  const inv = state.invoices.find(x => x.id === invId);
  if (!inv) return;

  const cust = state.customers.find(c => c.id === inv.customerId) || {};
  const bizData = state.businesses[inv.businessId] || {};

  // ✅ Merge with defaults so biz.upi always exists
  const biz = {
    name: 'Your Business Name',
    phone: '8148610567',
    email: 'sudhakarrn0711@gmail.com',
    address: '16/6, Star Illam, Ramarkrishna 1st Cross Street, Porur, Chennai-600116',
    gst: '33AAAAA0000A1Z5',
    website: 'www.ransangroups.com',
    logo: 'assets/ransan_logo.png',
    upi: 'sudhakarrn0711@okicici',
    corporateOffice: 'Corporate Office: No. 123, Anna Salai, Chennai, TN - 600002',
    branchOffice: "Branch Office: (update JSON)",
    ...bizData
  };

  const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const due = (inv.total || 0) - paid;

  // number to words
  function numberToWords(num) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
      'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if (num === 0) return 'Zero';
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
    if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred ' + (num % 100 !== 0 ? numberToWords(num % 100) : '');
    if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand ' + (num % 1000 !== 0 ? numberToWords(num % 1000) : '');
    if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh ' + (num % 100000 !== 0 ? numberToWords(num % 100000) : '');
    return numberToWords(Math.floor(num / 10000000)) + ' Crore ' + (num % 10000000 !== 0 ? numberToWords(num % 10000000) : '');
  }
  const amountInWords = numberToWords(inv.total || 0) + ' Only';

  // ✅ QR Code Section (only if pending due > 0)
  // ✅ QR Code Section (inside openPrint)
  let qrSection = '';
  if (due > 0 && biz.upi) {
    const upiLink = `upi://pay?pa=${biz.upi}&pn=${encodeURIComponent(biz.name)}&am=${due}&cu=INR&tn=Invoice Payment`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(upiLink)}`;

    console.log("✅ UPI Link:", upiLink);
    console.log("✅ QR URL:", qrCodeUrl);

    qrSection = `
    <div class="payment">
      <h3 style="color:#9a22f6;">Scan to Pay</h3>
      <img src="${qrCodeUrl}" id="qrCodeImg"
           alt="QR Code Payment"
           style="margin-top:10px; width:200px; height:200px; border:1px solid #ccc;" />
      <div style="margin-top:5px; font-size:13px; color:#333;">
        Pay via UPI: <b>${biz.upi}</b>
      </div>
    </div>
  `;
  }

  // ✅ Circle Stamp
  let watermark = '';
  if (due <= 0) {
    watermark = `<div class="stamp paid">PAID</div>`;
  } else if (paid > 0 && due > 0) {
    watermark = `<div class="stamp partial">PARTIALLY PAID</div>`;
  } else {
    watermark = `<div class="stamp unpaid">UNPAID</div>`;
  }

  // ✅ Product rows
  const rows = (inv.items || []).map((it, i) => {
    const desc = it.description || it.desc || it.details || "";
    return `
      <tr>
        <td style="border:1px solid #ccc;padding:6px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:6px">${it.serviceName || it.service || ''}</td>
        <td style="border:1px solid #ccc;padding:6px">${desc}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:center">${it.qty}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">₹${(it.rate || 0).toLocaleString('en-IN')}</td>
      </tr>
    `;
  }).join('');

  // ✅ Build HTML
  const html = `
  <html>
  <head>
    <title>Invoice ${inv.invoiceNumber || inv.id}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 10px; color:#333; position: relative; }
      h1,h2,h3 { margin: 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      .header { text-align: center; }
      .brand { font-size: 28px; font-weight: bold; background:#9a22f6; color:#fff; padding:6px 18px; border-radius:8px; display:inline-block; margin-top:8px; }
      .biz-info { text-align: left; }
      .biz-info h2 { font-size:20px; color:#6a11cb; margin-bottom:5px; }
      .biz-info div { margin-bottom:3px; font-size:14px; }
      hr { margin:15px 0; border:0; border-top:1px solid #ccc; }
      .two-col { display: flex; justify-content: space-between; margin-top: 20px; }
      .col { width: 48%; background:#f9f9ff; padding:10px; border-radius:6px; }
      .col h3 { color:#9a22f6; margin-bottom:8px; }
      .summary-table th { background:#6a11cb; color:#fff; text-align:left; }
      .summary-table td, .summary-table th { border:1px solid #ccc; padding:6px; }
      
      
      
      
      .payment { margin-top:20px; text-align:center; }
      .signature { margin-top: 3px; text-align: right; }
      .footer-note { margin-top:40px; text-align:center; font-size:13px; color:#555; }
      .invoice-container { position: relative; z-index: 1; }
      .stamp { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        border: 6px solid; border-radius: 50%; padding: 40px 60px;
        font-size: 32px; font-weight: bold; text-align: center; opacity: 0.15;
        pointer-events: none; z-index: 0; }
      .stamp.paid { border-color: green; color: green; }
      .stamp.partial { border-color: orange; color: orange; }
      .stamp.unpaid { border-color: red; color: red; }
      
      .totals-qr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 20px;
}

.qr-block {
  flex: 1;
  margin-right: 20px;
}

.qr-block img {
  display: block;
  margin: 10px auto;
  width: 120px;
  height: 120px;
  border: 1px solid #ccc;
}

.amount-words {
  margin-top: 10px;
  font-style: italic;
  color: #555;
  text-align: center;
}

.totals {
  width: 280px;
  border: 1px solid #ccc;
  border-radius: 6px;
}

.totals td {
  padding: 6px;
  border: 1px solid #ccc;
  text-align: right;
}
.totals .label {
  font-weight: bold;
  color: #6a11cb;
  text-align: left;
}
.totals .highlight {
  background: #f3e8ff;
  font-weight: bold;
}

/* ✅ Footer at bottom (letterhead style) */
.address-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  font-size: 12px;
  text-align: center;
  color: #222;
  background: #f3e8ff;
  padding: 12px;
  line-height: 1.6;
  border-top: 1px solid #ddd;
}
.address-footer b {
  color: #6a11cb;
}
.address-footer div {
  margin: 2px 0;
}

.letterhead-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 3px solid #6a11cb;  /* professional underline */
  padding: 10px 0;
  background: #fff;                  /* white so it doesn't overlap content */
  z-index: 10;
}

.company-logo {
  height: 60px;
  margin-right: 15px;
}

.company-name {
  font-size: 30px;
  font-weight: bold;
  color: #6a11cb;
  text-transform: uppercase;
  letter-spacing: 2px;
}

/* ✅ Push content down so it doesn’t overlap header */
body {
  margin-top: 120px; /* adjust to match header height */
}


    </style>
  </head>
  <body>
  <div class="invoice-container">
    ${watermark}

<!-- Letterhead Header -->
<div class="letterhead-header">
  <img src="${biz.logo}" alt="Company Logo" class="company-logo" />
  <div class="company-name">RanSan Groups</div>
</div>

    <div class="biz-info">
      <h2>${biz.name}</h2>
      <div><b>Phone:</b> ${biz.phone}</div>
      <div><b>Email:</b> ${biz.email}</div>
      <div><b>Address:</b> ${biz.address}</div>
      ${biz.gst ? `<div><b>GST:</b> ${biz.gst}</div>` : ''}
    </div>
    <hr/>

    <div class="two-col">
      <div class="col">
        <h3>Bill To:</h3>
        <div>Name: ${cust.name || '—'}</div>
        <div>Phone: ${cust.phone || '—'}</div>
        <div>Email: ${cust.email || '—'}</div>
      </div>
      <div class="col">
        <h3>Invoice Details:</h3>
        <div>Invoice No: ${inv.invoiceNumber || inv.id}</div>
        <div>Date: ${inv.date ? inv.date.slice(0, 10) : ''}</div>
        <div>Status: ${inv.status || ''}</div>
      </div>
    </div>

    <div class="section">
      <h3 style="color:#9a22f6;">Product Summary</h3>
      <table class="summary-table">
        <thead>
          <tr><th>S.No</th><th>Item</th><th>Description</th><th>Quantity</th><th>Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

<!-- Totals + QR side by side -->
<div class="totals-qr">
  <div class="qr-block">
    <div class="amount-words">
      Amount in Words: <b>${amountInWords}</b>
    </div>
    ${qrSection}
  </div>
  <table class="totals">
    <tr><td class="label">Total</td><td class="highlight">₹${(inv.total || 0).toLocaleString('en-IN')}</td></tr>
    <tr><td class="label">Paid</td><td>₹${paid.toLocaleString('en-IN')}</td></tr>
    <tr><td class="label">Balance</td><td class="highlight">₹${due.toLocaleString('en-IN')}</td></tr>
  </table>
</div>


    

    

    <div class="signature">
      <div>For: ${biz.name}</div>
      <br/><br/>
      <div>Authorized Signatory</div>
    </div>

<!-- ✅ Letterhead footer -->
<div class="address-footer">
  <div><b>Corporate Office:</b> Showp No 1, Sivagami Nagar, Valanai Colony, Orlem, Malad-W, Mumbai-400064</div>
  <div><b>Branch Office:</b> 16/6. 2nd Floor, Start Illam, Ramakrishna 1st Cross Street, Porur, Chennai-600116</div>
  <div><b>Website:</b> www.ransangroups.com</div>
</div>
  </div>
  </body>
  </html>
  `;

  const printWin = window.open('', '_blank', 'width=800,height=900');
  printWin.document.write(html);
  printWin.document.close();

  // ✅ Ensure print opens reliably
  printWin.onload = () => {
    const qrImg = printWin.document.getElementById('qrCodeImg');
    let printed = false;

    function doPrint() {
      if (!printed) {
        printed = true;
        printWin.focus();
        printWin.print();
        printWin.close();
      }
    }

    if (qrImg) {
      qrImg.onload = () => doPrint();
      // ⏳ fallback: print anyway after 1s
      setTimeout(doPrint, 1000);
    } else {
      doPrint();
    }
  };
}





// Populates the Customer Ledger's customer dropdown and wires change handler.
// If the dropdown isn't present, it safely returns (no error).
function populateLedgerCustomerSelect() {
  const sel = safeEl('ledgerCustomerSelect'); // <-- make sure this matches your HTML id
  if (!sel) return; // Ledger view not mounted yet

  const currentBiz = (state.currentBiz && state.currentBiz !== 'all') ? state.currentBiz : null;

  // Filter customers by current business (or show all if "all")
  const customers = (state.customers || []).filter(c => !currentBiz || c.businessId === currentBiz);

  // Preserve previous selection if possible
  const prev = sel.value || '';

  sel.innerHTML = [
    `<option value="">-- All Customers --</option>`,
    ...customers.map(c => `<option value="${c.id}">${c.name}</option>`)
  ].join('');

  // Try to restore selection, else default to ""
  sel.value = customers.some(c => c.id === prev) ? prev : "";

  // On change → re-render ledger for selected customer ('' = all)
  sel.onchange = () => {
    const customerId = sel.value || '';
    if (typeof renderCustomerLedger === 'function') {
      renderCustomerLedger(customerId);
    }
  };
}



// Central helper (keep as is)
function getInvoiceLabel(inv) {
  return (
    inv['invoice number'] ||  // Google Sheets export field
    inv.invoiceNumber ||      // normalized field
    inv.number ||             // alternate
    inv.no ||                 // alternate
    inv.id                    // fallback (UUID-style)
  );
}

// Enhanced Customer Ledger
function renderCustomerLedger() {
  const tbody = safeEl('ledgerTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  const selectedBizId = safeEl('bizSelect')?.value || '';
  const selectedCustId = safeEl('ledgerCustomerFilter')?.value || '';
  const selectedStatus = safeEl('ledgerStatusFilter')?.value || '';

  // Filter invoices
  let invoices = (state.invoices || []);

  if (selectedBizId && selectedBizId !== 'all') {
    invoices = invoices.filter(inv => inv.businessId === selectedBizId);
  }
  if (selectedCustId) {
    invoices = invoices.filter(inv => inv.customerId === selectedCustId);
  }
  if (selectedStatus) {
    invoices = invoices.filter(inv => (inv.status || 'Pending') === selectedStatus);
  }

  // Sort latest first
  invoices.sort((a, b) => new Date(b.date) - new Date(a.date));

  let totalInvoiced = 0, totalPaid = 0, totalBalance = 0;

  invoices.forEach(inv => {
    const cust = state.customers.find(c => c.id === inv.customerId) || { name: '—' };
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const due = (inv.total || 0) - paid;

    totalInvoiced += inv.total || 0;
    totalPaid += paid;
    totalBalance += due;

    // status badge color
    let badgeClass =
      inv.status === "Paid"
        ? "bg-emerald-600/20 text-emerald-300 border border-emerald-400/30"
        : inv.status === "Partial"
          ? "bg-amber-600/20 text-amber-300 border border-amber-400/30"
          : inv.status === "Credit"
            ? "bg-indigo-600/20 text-indigo-300 border border-indigo-400/30"
            : "bg-red-600/20 text-red-300 border border-red-400/30"; // Pending → Red

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2">${getInvoiceLabel(inv)}</td>
      <td class="p-2">${safeDateDisplay(inv.date)}</td>
      <td class="p-2">${cust.name}</td>
      <td class="p-2 text-right">${formatINR(inv.total)}</td>
      <td class="p-2 text-emerald-300 text-right">${formatINR(paid)}</td>
      <td class="p-2 text-amber-300 text-right">${formatINR(due)}</td>
      <td class="p-2">
        <span class="px-2 py-1 rounded-full text-xs font-medium ${badgeClass}">
          ${inv.status || 'Pending'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // ✅ Add summary row at bottom
  if (invoices.length > 0) {
    const summaryRow = document.createElement('tr');
    summaryRow.className = "font-bold bg-white/5";
    summaryRow.innerHTML = `
      <td class="p-2" colspan="3">Totals</td>
      <td class="p-2 text-right">${formatINR(totalInvoiced)}</td>
      <td class="p-2 text-emerald-300 text-right">${formatINR(totalPaid)}</td>
      <td class="p-2 text-amber-300 text-right">${formatINR(totalBalance)}</td>
      <td class="p-2">—</td>
    `;
    tbody.appendChild(summaryRow);
  }

  // ✅ Update external summary bar with animation
  if (safeEl('custTotalInvoiced')) animateCounter('custTotalInvoiced', totalInvoiced);
  if (safeEl('custTotalPaid')) animateCounter('custTotalPaid', totalPaid);
  if (safeEl('custTotalBalance')) animateCounter('custTotalBalance', totalBalance);


}


// Initialize Ledger filters (populate dropdowns)
function initLedgerFilters() {
  const custSel = safeEl('ledgerCustomerFilter');
  const statusSel = safeEl('ledgerStatusFilter');

  // Populate customer dropdown filtered by business
  function refreshCustomerDropdown() {
    if (!custSel) return;

    const selectedBizId = safeEl('bizSelect')?.value || 'all';
    let customers = state.customers || [];

    if (selectedBizId && selectedBizId !== 'all') {
      customers = customers.filter(c => c.businessId === selectedBizId);
    }

    custSel.innerHTML = `<option value="">-- All Customers --</option>` +
      customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    // 🔄 Always reset back to "All Customers"
    custSel.value = "";
  }

  // Initial population
  refreshCustomerDropdown();

  // Re-populate customers whenever business changes
  const bizSel = safeEl('bizSelect');
  if (bizSel) {
    bizSel.addEventListener('change', () => {
      refreshCustomerDropdown();
      renderCustomerLedger(); // re-render with updated filter
    });
  }

  // Hook dropdowns to re-render ledger
  if (custSel) custSel.onchange = renderCustomerLedger;
  if (statusSel) statusSel.onchange = renderCustomerLedger;
}

let bulkAllocCustomer = null;
let bulkAllocInvoices = [];

// Open modal
function openBulkPaymentModal(customerId) {
  bulkAllocCustomer = state.customers.find(c => c.id === customerId);
  if (!bulkAllocCustomer) return;

  console.log("Checking invoices for customer:", customerId, state.invoices);

  // Get pending/partial invoices for this customer
  bulkAllocInvoices = (state.invoices || []).filter(inv => {
    if (String(inv.customerId) !== String(customerId)) return false;

    const st = (inv.status || "Pending").toLowerCase();
    return st === "pending" || st === "partial" || st === "credit";
  });

  // Sort oldest first (FIFO)
  bulkAllocInvoices.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Fill header
  safeEl("bulkPaymentCustomerName").textContent = bulkAllocCustomer.name;
  safeEl("bulkPaymentAmountInput").value = "";
  safeEl("bulkPaymentRemaining").textContent = formatINR(0);

  // Render invoices
  const tbody = safeEl("bulkPaymentAllocTable");
  tbody.innerHTML = "";
  bulkAllocInvoices.forEach(inv => {
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const due = (inv.total || 0) - paid;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="p-2">${getInvoiceLabel(inv)}</td>
      <td class="p-2">${safeDateDisplay(inv.date)}</td>
      <td class="p-2 text-right">${formatINR(due)}</td>
      <td class="p-2 text-right">
        <input type="number" min="0" max="${due}" value="0"
          class="bg-white/10 border border-white/20 rounded-lg p-1 w-24 text-right bulkAllocInput"
          data-invid="${inv.id}" oninput="bulkRecalcAllocation()">
      </td>
    `;
    tbody.appendChild(tr);
  });

  safeEl("bulkPaymentModal").classList.remove("hidden");
}

// Close modal
function closeBulkPaymentModal() {
  safeEl("bulkPaymentModal").classList.add("hidden");
  bulkAllocCustomer = null;
  bulkAllocInvoices = [];
}

// Auto FIFO allocation
function bulkAutoAllocateFIFO() {
  const amountEntered = parseFloat(safeEl("bulkPaymentAmountInput").value || "0");
  let remaining = amountEntered;

  const inputs = document.querySelectorAll("#bulkPaymentAllocTable .bulkAllocInput");
  inputs.forEach(inp => {
    const inv = bulkAllocInvoices.find(i => i.id === inp.dataset.invid);
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const due = (inv.total || 0) - paid;

    let alloc = 0;
    if (remaining > 0) {
      alloc = Math.min(remaining, due);
      remaining -= alloc;
    }
    inp.value = alloc;
  });

  bulkRecalcAllocation();
}

// Recalc totals
function bulkRecalcAllocation() {
  const amountEntered = parseFloat(safeEl("bulkPaymentAmountInput").value || "0");
  const inputs = document.querySelectorAll("#bulkPaymentAllocTable .bulkAllocInput");

  let totalAllocated = 0;
  inputs.forEach(inp => {
    totalAllocated += parseFloat(inp.value || "0");
  });

  const remaining = amountEntered - totalAllocated;
  safeEl("bulkPaymentRemaining").textContent = formatINR(remaining);
}

// Save allocation
function saveBulkPaymentAllocation() {
  const amountEntered = parseFloat(safeEl("bulkPaymentAmountInput").value || "0");
  if (!amountEntered || !bulkAllocCustomer) {
    alert("Enter a valid amount");
    return;
  }

  const inputs = document.querySelectorAll("#bulkPaymentAllocTable .bulkAllocInput");
  const allocations = [];
  let totalAllocated = 0;

  inputs.forEach(inp => {
    const val = parseFloat(inp.value || "0");
    if (val > 0) {
      allocations.push({ invoiceId: inp.dataset.invid, amount: val });
      totalAllocated += val;
    }
  });

  if (totalAllocated !== amountEntered) {
    alert("Allocated amount must equal payment amount");
    return;
  }

  // Apply via your existing commitPayment()
  allocations.forEach(a => {
    commitPayment(a.invoiceId, a.amount);
  });

  closeBulkPaymentModal();
  renderCustomerLedger();
  renderInvoices();
}




function closePrint() { safeEl('printModal') && safeEl('printModal').classList.add('hidden'); }

function waLink(biz, phone, text) {
  const base = (biz?.waBase || 'https://wa.me').replace(/\/$/, '');
  const ph = String(phone || '').replace(/\D/g, ''); // basic normalize
  return `${base}/${encodeURIComponent(ph)}?text=${encodeURIComponent(text)}`;
}
function waMsg(inv, cust, outstanding) {
  const b = state.businesses[inv.businessId];
  return `Hi ${cust.name},\nInvoice ${inv.id} (${b?.name || ''}) is ${inv.status}. Balance: ${formatINR(outstanding)}. Due on ${inv.due.slice(0, 10)}. Please ignore if paid.`;
}
function bulkWhatsApp() {
  const links = [];
  for (const inv of filteredInvoices()) {
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const due = (inv.total || 0) - paid; if (due <= 0) continue;
    const cust = state.customers.find(c => c.id === inv.customerId); if (!cust) continue;
    const biz = state.businesses[inv.businessId];
    links.push(waLink(biz, cust.phone, waMsg(inv, cust, due)));
  }
  if (!links.length) { alert('No pending invoices.'); return; }
  window.open(links[0], '_blank');
}

/* ========== Customers (client-side only for now) ========== */
/* NOTE: These currently modify client state only. To persist customers to server,
   add a server endpoint (e.g., action=saveCustomer) and call it similarly. */

function addCustomerPrompt() {
  // open customer modal in create mode
  // clear fields
  safeEl('custId') && (safeEl('custId').value = '');
  safeEl('custName') && (safeEl('custName').value = '');
  safeEl('custPhone') && (safeEl('custPhone').value = '');
  safeEl('custEmail') && (safeEl('custEmail').value = '');
  safeEl('custService') && (safeEl('custService').value = '');
  safeEl('custCredit') && (safeEl('custCredit').value = '');
  safeEl('custTermsInput') && (safeEl('custTermsInput').value = 30);
  safeEl('custNotes') && (safeEl('custNotes').value = '');
  openCustomerModal();
  renderAll();
}
function editCustomer(id) {
  const c = state.customers.find(x => x.id === id); if (!c) return;
  const name = prompt('Name', c.name) || c.name;
  const phone = prompt('Phone', c.phone) || c.phone;
  const limit = +(prompt('Credit limit', c.creditLimit) || c.creditLimit);
  const days = +(prompt('Credit days', c.creditDays) || c.creditDays);
  Object.assign(c, { name, phone, creditLimit: limit, creditDays: days });
  renderAll();
}

async function deleteCustomer(id) {
  if (!id) return;

  const loader = document.getElementById("loader");
  try {
    // Confirm before delete
    if (!confirm("Delete this customer?")) return;

    loader.classList.remove("hidden");

    // Pass id + action properly
    const res = await fetchServerData("deletecustomer", { id: id });
    if (!res || !res.ok) throw new Error(res?.error || "Delete failed");

    // Fade-out row effect before removal
    const row = document.getElementById(`custRow-${id}`);
    if (row) {
      row.classList.add("row-fade-out");
      row.addEventListener("animationend", () => {
        state.customers = state.customers.filter(c => c.id !== id);
        renderCustomers(state.customers);
        showToast("🗑️ Customer deleted", "success");
      }, { once: true });
    } else {
      state.customers = state.customers.filter(c => c.id !== id);
      renderCustomers(state.customers);
      showToast("🗑️ Customer deleted", "success");
    }
  } catch (err) {
    showToast(`❌ Error deleting customer: ${err.message}`, "error");
    console.error("deleteCustomer error:", err);
  } finally {
    loader.classList.add("hidden");
  }
}





/* ========== Services & Business CRUD (client-side only unless you add server endpoints) ========== */

function addServiceToBiz() {
  const b = state.businesses[state.currentBiz];
  if (!b) return;

  const cat = prompt('Category name (e.g., Online Services)');
  if (!cat) return;

  const name = prompt('Service name');
  if (!name) return;

  b.services = b.services || {};
  b.services[cat] = Array.from(new Set([...(b.services[cat] || []), name]));

  renderServiceCatalog();
}

// Track which business is being edited

// Store selected business ID
function onBusinessSelect(businessId) {
  renderServices(state.services);
  renderCustomers(state.customers);
  renderInvoices(state.invoices);
  populateStatementCustomerSelect();
  //renderCustomerLedger(state.customerledger);   // ✅ refresh ledger on biz change
}



// Utility to safely get element
function safeEl(id) {
  return document.getElementById(id);
}

// Populate business dropdown
function populateBusinessDropdown() {
  const select = safeEl('bizSelect');
  if (!select || !state.businesses) return;

  // Clear existing options
  select.innerHTML = '';

  // "All" option
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = '-- All Businesses --';
  select.appendChild(optAll);

  // Add businesses dynamically
  Object.values(state.businesses).forEach(biz => {
    const opt = document.createElement('option');
    opt.value = biz.id;              // ✅ use id
    opt.textContent = biz.name;
    select.appendChild(opt);
  });

  // Keep dropdown in sync with state (if already set)
  if (state.currentBiz) {
    select.value = state.currentBiz;
  }

  // Single listener
  select.onchange = e => {
    const selectedBiz = e.target?.value || 'all';
    state.currentBiz = selectedBiz;

    // 🔄 Refresh service catalog
    if (selectedBiz === 'all') {
      renderServiceCatalog(state.services || []);
    } else {
      const filteredServices = (state.services || []).filter(
        s => s.businessId === selectedBiz
      );
      renderServiceCatalog(filteredServices);
    }

    // 🔄 Refresh other views that rely on currentBiz
    if (typeof renderAll === 'function') renderAll();

    // 🔄 Refresh the Customer Ledger:
    populateLedgerCustomerSelect();
    const ledgerSel = safeEl('ledgerCustomerSelect');
    const selectedCustomerId = ledgerSel ? (ledgerSel.value || '') : '';
    if (typeof renderCustomerLedger === 'function') {
      renderCustomerLedger(selectedCustomerId);
    }

    // 🔄 Refresh the Statement Dashboard customers:
    // 🔄 Refresh the Statement Dashboard customers:
    populateStatementCustomers();
    const stmtSel = safeEl('statementCustomerSelect');
    const stmtCustId = stmtSel ? (stmtSel.value || '') : '';
    if (typeof renderStatementDashboard === 'function') {
      renderStatementDashboard(stmtCustId);
    }

    // 🔑 Also refresh invoice form dropdowns if open
    const invCustSel = safeEl('invCustomer');
    if (invCustSel && typeof populateCustomerSelect === 'function') {
      populateCustomerSelect();
    }
    const itemBody = safeEl('itemBody');
    if (itemBody && typeof populateServiceSelect === 'function') {
      itemBody.querySelectorAll('tr').forEach(tr => populateServiceSelect(tr));
    }
  };
}


// Open modal for selected business
function editSelectedBusiness() {
  const bizId = state.currentBiz;
  if (!bizId) {
    alert("Please select a business first");
    return;
  }

  let biz = null;
  if (Array.isArray(state.businesses)) {
    biz = state.businesses.find(b => b.id === bizId);
  } else if (typeof state.businesses === "object") {
    biz = state.businesses[bizId] || null;
  }

  openBizEditor(biz);
}

// Open modal with business details
function openBizEditor(biz = null) {
  const modal = document.getElementById("bizModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  modal.dataset.bizId = biz?.id || "";

  document.getElementById("bizName").value = biz?.name || "";
  document.getElementById("bizPrefix").value = biz?.prefix || "";
  document.getElementById("bizGST").value = biz?.gst || "";
  document.getElementById("bizCurrency").value = biz?.currency || "INR";
  document.getElementById("bizPhone").value = biz?.phone || "";
  document.getElementById("bizEmail").value = biz?.email || "";
  document.getElementById("bizWA").value = biz?.waBase || "https://wa.me";
  document.getElementById("bizFooter").value = biz?.footer || "Thank you for your business";
  document.getElementById("bizNote").value = biz?.note || "";

  const titleEl = modal.querySelector("h3");
  if (titleEl) titleEl.textContent = biz ? "Edit Business" : "Add Business";
}


function closeBizEditor() {
  const modal = document.getElementById("bizModal");
  if (modal) modal.classList.add("hidden");
}



function closeBizEditor() {
  const modal = document.getElementById("bizModal");
  if (modal) modal.classList.add("hidden");
}



function closeBizEditor() {
  document.getElementById("bizModal").classList.add("hidden");
  document.getElementById("bizModal").classList.remove("flex");
  window.currentBiz = null;
}


// === Create new business (client-side only placeholder) ===
function createBusiness() {
  // Create a temporary blank business (no id yet)
  const tempId = "temp_" + uid(); // frontend-only temp id
  state.businesses[tempId] = {
    id: "", // leave empty so backend will assign
    name: "",
    currency: "INR",
    phone: "",
    email: "",
    prefix: "INV",
    gst: "",
    waBase: "https://wa.me",
    footer: "",
    notes: ""
  };
  state.currentBiz = tempId;
  populateBizSelects();
  renderAll();
  openBizEditor();
}

function val(id, def = "") {
  const el = document.getElementById(id);
  return el ? el.value.trim() : def;
}

async function saveBusiness() {
  const modal = document.getElementById("bizModal");
  const bizId = modal.dataset.bizId || "";

  const biz = {
    id: bizId,
    name: val("bizName"),
    currency: val("bizCurrency", "INR"),
    phone: val("bizPhone"),
    email: val("bizEmail"),
    prefix: val("bizPrefix", "INV"),
    gst: val("bizGST"),
    waBase: val("bizWA", "https://wa.me"),
    footer: val("bizFooter"),
    notes: val("bizNote"),
    code: ""
  };

  showLoader();
  try {
    const res = await fetchServerData("savebusiness", biz);
    hideLoader();
    if (res && res.ok) {
      // Update state
      if (typeof state.businesses === "object") {
        state.businesses[res.business.id] = res.business;
      } else if (Array.isArray(state.businesses)) {
        const index = state.businesses.findIndex(b => b.id === res.business.id);
        if (index >= 0) state.businesses[index] = res.business;
        else state.businesses.push(res.business);
      }

      // Refresh dropdown
      populateBusinessDropdown();

      // Auto-select the newly added or edited business
      const select = document.getElementById("bizSelect");
      select.value = res.business.id;
      state.currentBiz = res.business.id;

      renderBusinessButtons(Object.values(state.businesses));
      closeBizEditor();
      showToast(`✅ Business saved: ${res.business.name}`);
    } else {
      throw new Error(res.error || "Unknown error");
    }
  } catch (err) {
    hideLoader();
    console.error("saveBusiness error", err);
    showToast("❌ Failed to save business: " + err.message, "error");
  }
}


async function deleteBusiness() {
  const modal = document.getElementById("bizModal");
  const bizId = modal.dataset.bizId;
  if (!bizId) {
    showToast("No business selected to delete", "error");
    return;
  }

  if (!confirm("Are you sure you want to delete this business?")) return;

  showLoader();
  try {
    const res = await fetchServerData("deletebusiness", { id: bizId });
    hideLoader();
    if (res && res.ok) {
      if (typeof state.businesses === "object") {
        delete state.businesses[bizId];
      } else if (Array.isArray(state.businesses)) {
        state.businesses = state.businesses.filter(b => b.id !== bizId);
      }

      populateBusinessDropdown();
      renderBusinessButtons(Object.values(state.businesses));
      closeBizEditor();
      showToast("🗑️ Business deleted");
    } else {
      throw new Error(res.error || "Delete failed");
    }
  } catch (err) {
    hideLoader();
    console.error("deleteBusiness error", err);
    showToast("❌ Failed to delete: " + err.message, "error");
  }
}





/* ========== Import/Export & Navigation ========== */

function exportData() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'glass-billing-live.json'; a.click(); URL.revokeObjectURL(url); }
safeEl('importFile') && safeEl('importFile').addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const obj = JSON.parse(reader.result); Object.assign(state, obj); renderAll(); populateBizSelects(); } catch { alert('Invalid JSON'); } }; reader.readAsText(file); });

function showView(name) {
  // Hide/show all views
  [
    'dashboard',
    'transactions',
    'invoices',
    'customers',
    'services',
    'reports',
    'customerLedger',
    'statement',
    'commission-report',
    'adv2_panel',
  ].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (!el) return;
    el.classList.toggle('hidden', v !== name);
  });

  // --- View specific logic ---
  if (name === 'reports') {
    if (typeof renderCharts === "function") renderCharts();
  }

  if (name === 'customerLedger') {
    if (typeof populateLedgerCustomers === "function") {
      populateLedgerCustomers();
    }
    const custEl = safeEl('custSelect');
    if (custEl && typeof renderCustomerLedger === "function") {
      renderCustomerLedger(custEl.value || '');
    } else {
      console.warn("custSelect not found or renderCustomerLedger missing");
    }
  }

  if (name === 'statement') {
    if (typeof populateStatementCustomers === "function") {
      populateStatementCustomers();
    }
    const firstCustEl = safeEl("statementCustomerSelect");
    if (firstCustEl && typeof renderStatementDashboard === "function") {
      renderStatementDashboard(firstCustEl.value);
    }
  }

  // --- Sidebar highlight with dynamic color ---
  const color = document.getElementById("colorSelect")?.value || "purple";
  highlightActive(name, color);
}






function openCustomerModal() {
  // fill with businesses from state (your file already has this pattern)
  const sel = document.getElementById("custService");
  sel.innerHTML = Object.values(state.businesses)
    .map(b => `<option value="${b.id}">${b.name}</option>`)
    .join("");
  document.getElementById("customerModal").classList.remove("hidden");
}

function closeCustomerModal() {
  document.getElementById("customerModal").classList.add("hidden");
  const saveBtn = document.getElementById("custSaveBtn");
  if (saveBtn) saveBtn.textContent = "Save"; // reset for next time
  const idField = document.getElementById("custId");
  if (idField) idField.remove(); // remove hidden field
}




/* ========== Render wrapper ========== */

function updateCounters() {
  const invs = filteredInvoices();
  safeEl('invoiceCount') && (safeEl('invoiceCount').textContent = invs.length);
  safeEl('customerCount') && (safeEl('customerCount').textContent = state.customers.length);
}

function renderAll() {
  renderSummary();
  renderPending();
  renderInvoices();
  renderCustomers();
  renderServiceCatalog();

  renderCharts();
  populateCustomerSelect();
  renderTransactions();
  populateLedgerCustomerSelect();
  populateStatementCustomerSelect();
  renderCustomerLedger(safeEl('custSelect')?.value || '');
  updateCounters();
  recalcTotals();
  try { lucide.createIcons(); } catch (e) { }
  safeEl('sumBizName') && (safeEl('sumBizName').textContent = getBizName(state.currentBiz));
}

/* ========== Initialization ========== */
(async () => {
  // 1. Load all data first
  await loadDB(); // fetch live data

  // 2. Initialize filters after data is ready
  if (typeof reports_initFilters === "function") {
    reports_initFilters();  // populate business dropdown + attach events
  }

  // 3. Render first report tab (financial by default)
  if (typeof reports_renderTab === "function") {
    reports_renderTab("financial");
  }

  // 4. Reset invoice form & show dashboard
  resetInvoiceForm();
  showView('dashboard');

  // 5. Re-init icons safely
  try { lucide.createIcons(); } catch (e) { }
})();


// Make sure RUN_ENV is global (billing.js already declares var RUN_ENV = "test")
function setEnvFromUI() {
  const el = document.getElementById('envSelect');
  if (!el) return;
  // initialize select to current RUN_ENV
  el.value = RUN_ENV || 'test';
  el.onchange = async () => {
    const newEnv = el.value;
    if (!confirm(`Switch environment to "${newEnv}"? This will reload data.`)) {
      el.value = RUN_ENV; return;
    }
    RUN_ENV = newEnv;
    try {
      await loadDB(); // re-fetch data for the selected env
      alert('Environment switched to ' + RUN_ENV);
    } catch (e) {
      console.error('Failed to load for env', RUN_ENV, e);
      alert('Failed to load data for env: ' + RUN_ENV);
    }
  };
}

async function loadServices() {
  try {
    const res = await fetchServerData('getservices', {});
    state.services = res.services || [];
    renderServices(state.services); // initial render
  } catch (err) {
    console.error('Failed to load services', err);
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  await loadBusinesses();   // populate state.businesses
  populateBusinessDropdown(); // populate dropdown
  await loadServices();     // populate & render service catalog
  loadCustomers();          // render customer table
});

/* === Service modal helpers === */
// dynamically show service modal using existing DOM or create one
function openServiceModal(service = null) {
  let container = safeEl('serviceModuleContainer');
  if (!container) {
    console.error("Container 'serviceModuleContainer' not found!");
    return;
  }

  // Render modal with dynamic content
  container.innerHTML = `
    <div id="serviceModal" class="glass rounded-2xl p-6 w-full max-w-[480px] mx-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 id="serviceModalTitle" class="font-semibold">${service ? 'Edit Service' : 'Add Service'}</h3>
        <button type="button" class="btn" id="closeServiceModalBtn"><i data-lucide="x"></i></button>
      </div>
      <input type="hidden" id="svcId" />
      <div class="mt-4">
        <label class="text-xs text-white/60">Business</label>
        <select id="svcBusiness" class="p-2 rounded-md bg-white text-gray-900 dark:bg-gray-800 dark:text-white"></select>
      </div>
      <div class="mt-4">
        <label class="text-xs text-white/60">Service Name</label>
        <input id="svcName" class="w-full mt-1 bg-white/5 border border-white/10 rounded-xl p-2" />
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button type="button" class="btn" id="cancelServiceBtn">Cancel</button>
        <button type="button" class="btn bg-brand-500/30 hover:bg-brand-500/40 border-brand-500/50" id="saveServiceBtn">${service ? 'Update' : 'Save'}</button>
      </div>
    </div>
  `;

  // Populate business dropdown
  const sel = safeEl('svcBusiness');
  sel.innerHTML = Object.values(state.businesses)
    .map(b => `<option value="${b.id}">${b.name || b.id}</option>`)
    .join('');

  // If editing an existing service, populate the fields with the service data
  if (service) {
    safeEl('svcId').value = service.id || '';
    safeEl('svcName').value = service.service || service.name || '';
    safeEl('svcBusiness').value = service.businessId || Object.keys(state.businesses)[0] || '';
    safeEl('serviceModalTitle').innerText = 'Edit Service';
    safeEl('saveServiceBtn').innerText = 'Update';
  } else {
    // If adding a new service, clear the fields
    safeEl('svcId').value = '';
    safeEl('svcName').value = '';
    safeEl('svcBusiness').value = Object.keys(state.businesses)[0] || '';
    safeEl('serviceModalTitle').innerText = 'Add Service';
    safeEl('saveServiceBtn').innerText = 'Save';
  }

  // Event handlers
  safeEl('closeServiceModalBtn').onclick = closeServiceModal;
  safeEl('cancelServiceBtn').onclick = closeServiceModal;
  safeEl('saveServiceBtn').onclick = handleSaveService;

  try { if (window.lucide) lucide.createIcons(); } catch (e) { }
}


// Close module
function closeServiceModal() {
  const modal = safeEl('serviceModal');
  if (modal) modal.remove();
}

// Save service & render in catalog
async function handleSaveService() {
  const loader = safeEl("loader");
  const svcId = safeEl("svcId").value;

  try {
    loader.classList.remove("hidden");

    const serviceObj = {
      id: svcId || "svc_" + uid(), // ensure svc_ prefix
      businessId: safeEl("svcBusiness")?.value || safeEl("bizSelect")?.value || "",
      service: safeEl("svcName").value.trim()  // ✅ match sheet column "service"
    };

    if (!serviceObj.businessId) throw new Error("Business selection required");
    if (!serviceObj.service) throw new Error("Service name required");

    const saved = await fetchServerData("saveservice", serviceObj);

    // ensure consistent structure
    const finalService = saved.service || saved || serviceObj;

    if (svcId) {
      // update existing
      const idx = state.services.findIndex(s => s.id === svcId);
      if (idx !== -1) state.services[idx] = finalService;
    } else {
      // add new
      state.services.push(finalService);
    }

    // Refresh UI
    renderServices(state.services);

    closeServiceModal();
    showToast(svcId ? "✅ Service updated" : "✅ Service added", "success");
  } catch (err) {
    console.error("handleSaveService error", err);
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    loader.classList.add("hidden");
  }
}



// Render services in catalog grid
function renderServices(services = state.services) {
  console.log("✅ renderServices (final version with Delete) is active");

  const container = safeEl("serviceCatalog");
  if (!container) return;

  const section = safeEl("view-services");
  if (section) section.classList.remove("hidden");

  // Group services by business
  const grouped = {};
  (services || []).forEach(s => {
    const biz = s.businessId || "unknown";
    if (!grouped[biz]) grouped[biz] = [];
    grouped[biz].push(s);
  });

  // Build UI per business card
  container.innerHTML = Object.keys(grouped).map(bizId => {
    const bizName = state.businesses[bizId]?.name || "Unknown Business";

    const svcList = grouped[bizId]
      .map(s => {
        return `
          <div class="flex justify-between items-center p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <span class="font-medium text-sm">${s.service}</span>
            <div class="flex gap-2">
              <!-- Add -->
              <button class="px-3 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 text-sm"
                onclick="addServiceToInvoice('${encodeURIComponent(JSON.stringify(s))}')">
                Add to invoice
              </button>

              <!-- Delete -->
              <button class="px-3 py-1 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm"
                onclick="deleteService('${s.id}')">
                Delete
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="col-span-12 md:col-span-4 p-4 glass rounded-2xl">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-semibold">${bizName}</h4>
          <span class="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">
            ${grouped[bizId].length} services
          </span>
        </div>
        <div class="flex flex-col gap-2">${svcList}</div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}



function openDeleteServiceModal() {
  let container = safeEl('serviceModuleContainer');
  if (!container) return;

  container.innerHTML = `
    <div id="deleteServiceModal" class="glass rounded-2xl p-6 w-full max-w-[480px] mx-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-red-400 flex items-center gap-2">
          <i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i>
          Delete Service
        </h3>
        <button type="button" class="btn" id="closeDeleteServiceBtn">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div class="mt-4">
        <label class="text-xs text-white/60">Select Service to Delete</label>
        <select id="deleteSvcId"
          class="w-full mt-1 p-2 rounded-md bg-white text-gray-900 dark:bg-gray-800 dark:text-white">
          ${state.services.map(s => `<option value="${s.id}">${s.service}</option>`).join("")}
        </select>
      </div>

      <!-- Warning text -->
      <p class="mt-3 text-sm text-red-400 flex items-center gap-1">
        <i data-lucide="alert-octagon" class="w-4 h-4"></i>
        This action cannot be undone. Type the service name to confirm.
      </p>

      <!-- Confirmation input -->
      <input id="confirmServiceName"
        placeholder="Type service name here..."
        class="w-full mt-2 bg-white/5 border border-white/10 rounded-xl p-2 text-sm" />

      <!-- Main action buttons -->
      <div class="flex justify-end gap-2 mt-5" id="deleteActionButtons">
        <button type="button" class="btn" id="cancelDeleteServiceBtn">Cancel</button>
        <button type="button"
          class="btn bg-red-600/60 hover:bg-red-600/80 text-white font-semibold disabled:opacity-50"
          id="confirmDeleteServiceBtn" disabled>
          <i data-lucide="trash-2" class="w-4 h-4"></i> Delete
        </button>
      </div>

      <!-- Hidden second confirmation -->
      <div id="finalConfirmBox" class="hidden mt-5 p-4 bg-red-600/10 border border-red-600/30 rounded-xl">
        <p class="text-sm text-red-300 mb-3">
          ⚠️ Are you absolutely sure you want to delete this service? This cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn" id="cancelFinalDeleteBtn">Cancel</button>
          <button type="button" class="btn bg-red-700 hover:bg-red-800 text-white font-semibold" id="finalDeleteBtn">
            <i data-lucide="trash-2" class="w-4 h-4"></i> Yes, Delete
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  // Handlers
  safeEl("closeDeleteServiceBtn").onclick = closeDeleteServiceModal;
  safeEl("cancelDeleteServiceBtn").onclick = closeDeleteServiceModal;

  const confirmInput = safeEl("confirmServiceName");
  const selectEl = safeEl("deleteSvcId");
  const deleteBtn = safeEl("confirmDeleteServiceBtn");

  // Enable delete only when name matches
  confirmInput.addEventListener("input", () => {
    const selectedService = selectEl.options[selectEl.selectedIndex].text;
    deleteBtn.disabled = confirmInput.value.trim() !== selectedService.trim();
  });

  // Show secondary confirmation box
  deleteBtn.onclick = () => {
    safeEl("deleteActionButtons").classList.add("hidden");
    safeEl("finalConfirmBox").classList.remove("hidden");
  };

  // Final confirmation handlers
  safeEl("cancelFinalDeleteBtn").onclick = () => {
    safeEl("finalConfirmBox").classList.add("hidden");
    safeEl("deleteActionButtons").classList.remove("hidden");
  };

  safeEl("finalDeleteBtn").onclick = () => {
    const svcId = selectEl.value;
    const selectedService = selectEl.options[selectEl.selectedIndex].text;
    if (svcId) {
      deleteService(svcId);
      closeDeleteServiceModal();
      showToast(`✅ Service "${selectedService}" deleted successfully`, "success");
    }
  };
}

function closeDeleteServiceModal() {
  const container = safeEl("serviceModuleContainer");
  if (container) container.innerHTML = "";
}


function closeDeleteServiceModal() {
  const container = safeEl("serviceModuleContainer");
  if (container) container.innerHTML = "";
}



function confirmDeleteService() {
  const svcId = safeEl("deleteSvcId").value;
  if (!svcId) return;
  deleteService(svcId);
  closeServiceModal();
}





async function deleteService(svcId) {
  if (!svcId) return;

  const loader = safeEl("loader");
  try {
    loader.classList.remove("hidden");

    // Call server to delete
    await fetchServerData("deleteservice", { id: svcId });

    // Remove from local state
    state.services = state.services.filter(s => s.id !== svcId);

    // Refresh catalog
    renderServiceCatalog(state.services);

    // Success message
    showToast("✅ Service deleted successfully", "success");
  } catch (err) {
    console.error("deleteService error", err);
    showToast("❌ Failed to delete service: " + (err.message || err), "error");
  } finally {
    loader.classList.add("hidden");
  }
}




/* === Payment modal === */

/* === Payment modal (fixed: handler re-assigned per open) === */

function closePaymentModal() {
  const modal = safeEl('paymentModal');
  if (!modal) return;
  modal.classList.add('hidden');
  // clear dataset so old id doesn't linger (optional)
  delete modal.dataset.invId;
}

/* === Payment modal with history === */
function openPaymentModal(invId) {
  let modal = safeEl('paymentModal');
  if (!modal) {
    const div = document.createElement('div');
    div.id = 'paymentModal';
    div.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-50';
    div.innerHTML = `
      <div class="glass rounded-2xl p-6 w-[520px] max-w-[95vw]">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Record Payment</h3>
          <button class="btn" id="closePaymentModalBtn"><i data-lucide="x"></i></button>
        </div>
        <div class="mt-4 space-y-2">
          <div>
            <label class="text-xs text-white/60">Amount</label>
            <input id="payAmount" type="number" class="w-full mt-1 bg-white/5 border border-white/10 rounded-xl p-2" />
          </div>
          <div>
            <label class="text-xs text-white/60">Notes</label>
            <input id="payNotes" class="w-full mt-1 bg-white/5 border border-white/10 rounded-xl p-2" />
          </div>
        </div>

        <!-- Payment history -->
        <div class="mt-6">
          <h4 class="font-medium mb-2">Payment History</h4>
          <div id="paymentHistory" class="space-y-2 max-h-40 overflow-y-auto pr-2 text-sm"></div>
        </div>

        <div class="flex justify-end mt-6">
          <button class="btn" id="savePaymentBtn">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    modal = div;

    // Close button
    document.getElementById('closePaymentModalBtn').onclick = closePaymentModal;

    // Save payment
    document.getElementById('savePaymentBtn').onclick = async function () {
      const amount = Number(safeEl('payAmount').value || 0);
      const notes = safeEl('payNotes').value || '';
      await commitPayment(invId, amount, notes);
      closePaymentModal();
    };
  }

  // Load invoice
  const inv = state.invoices.find(x => x.id === invId);
  if (!inv) return alert('Invoice not found');

  // Default amount = due
  const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const due = (inv.total || 0) - paid;
  safeEl('payAmount').value = due > 0 ? due : '';
  safeEl('payNotes').value = '';

  // Render history
  const histDiv = safeEl('paymentHistory');
  histDiv.innerHTML = '';
  if (inv.payments && inv.payments.length > 0) {
    inv.payments.forEach(p => {
      const row = document.createElement('div');
      row.className = "flex justify-between items-center bg-white/5 rounded-lg p-2 border border-white/10";
      row.innerHTML = `
        <span class="text-xs text-white/70">${new Date(p.date).toLocaleDateString()}</span>
        <span class="font-medium text-emerald-300">₹${p.amount}</span>
        <span class="text-xs text-white/50">${p.method || 'Cash'}</span>
        <span class="text-xs italic text-white/60">${p.notes || ''}</span>
      `;
      histDiv.appendChild(row);
    });
  } else {
    histDiv.innerHTML = `<div class="text-xs text-white/50 italic">No payments yet</div>`;
  }

  modal.classList.remove('hidden');
}


/* commitPayment: updates invoice locally, sends to server, updates UI */
async function commitPayment(invId, amount, notes = '', method = 'Cash') {
  if (!invId) return alert('Invoice id missing');
  amount = Number(amount || 0);
  if (amount <= 0) return alert('Enter a payment amount greater than 0.');

  const idx = state.invoices.findIndex(i => i.id === invId);
  if (idx === -1) return alert('Invoice not found in current data.');

  // Clone invoice to avoid accidental UI mutation while saving
  const inv = JSON.parse(JSON.stringify(state.invoices[idx]));
  inv.payments = Array.isArray(inv.payments) ? inv.payments : [];

  // Use IST ISO or your preferred format; here we keep ISO without timezone Z if you prefer IST helper:
  // const dateStr = toISTISOString(new Date());
  const dateStr = new Date().toISOString();

  inv.payments.push({
    date: dateStr,
    amount: amount,
    method: method,
    notes: notes || ''
  });

  // Recompute totals & status
  const paid = inv.payments.reduce((s, p) => s + (p.amount || 0), 0);
  inv.status = paid >= (inv.total || 0) ? 'Paid' : (paid > 0 ? 'Partial' : (inv.status === 'Credit' ? 'Credit' : 'Pending'));

  // Optionally update created/updated timestamps
  inv.updatedAt = new Date().toISOString();

  try {
    // show tiny loader if available
    if (typeof showLoader === 'function') showLoader();

    // send to server (saveInvoiceToServer updates existing invoice by id)
    const saved = await saveInvoiceToServer(inv);
    if (saved && saved.error) throw new Error(saved.error);

    const savedInv = saved.invoice || saved;

    // Replace local state item
    state.invoices[idx] = savedInv;
    renderAll();

    if (typeof showToast === 'function') showToast('✅ Payment recorded', 'success');
    else console.log('Payment recorded', savedInv);
  } catch (err) {
    console.error('commitPayment error', err);
    if (typeof showToast === 'function') showToast('❌ Failed to record payment: ' + err.message, 'error');
    else alert('Failed to record payment: ' + err.message);
  } finally {
    if (typeof hideLoader === 'function') hideLoader();
  }
}

/* recordPayment: opens modal (keeps backward compatibility) */
function recordPayment(invId) {
  openPaymentModal(invId);
}


// === Customer Statement PDF generator ===
function sanitizeFileName(s) {
  return (s || 'statement').replace(/[^a-z0-9\-_\.]/gi, '_').slice(0, 120);
}

function generateCustomerStatement(customerId) {
  // If no explicit id passed, try ledger filter
  customerId = customerId || (safeEl('ledgerCustomerFilter') && safeEl('ledgerCustomerFilter').value) || '';

  if (!customerId) {
    return alert('Please select a customer in the ledger (or pass customerId to the function).');
  }

  // check libraries
  if (!window.jspdf || !window.jspdf.jsPDF || typeof window.jspdf.jsPDF !== 'function') {
    return alert('PDF library not loaded. Please include jsPDF and jsPDF-AutoTable (see docs).');
  }

  const cust = state.customers.find(c => String(c.id) === String(customerId));
  if (!cust) return alert('Customer not found.');

  // apply business filter if present
  const selectedBizId = (safeEl('bizSelect') && safeEl('bizSelect').value) || (state.currentBiz || 'all');

  // collect invoices for this customer (respect business if selected)
  let invoices = (state.invoices || []).filter(inv => {
    if (String(inv.customerId) !== String(customerId) &&
      String(inv.customer_id || '') !== String(customerId) &&
      String(inv.custId || '') !== String(customerId)) return false;
    if (selectedBizId && selectedBizId !== 'all') return String(inv.businessId) === String(selectedBizId);
    return true;
  });

  // Sort by date ascending (earliest first) for statement
  invoices.sort((a, b) => new Date(a.date) - new Date(b.date));

  // totals
  const totalInvoiced = invoices.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
  const totalPaid = invoices.reduce((s, inv) => s + ((inv.payments || []).reduce((p, a) => p + (a.amount || 0), 0)), 0);
  const balance = totalInvoiced - totalPaid;

  // build table rows
  const rows = invoices.map(inv => {
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const due = (inv.total || 0) - paid;
    return [
      getInvoiceLabel(inv),
      inv.date ? (typeof inv.date === 'string' && inv.date.length >= 10 ? inv.date.slice(0, 10) : safeDateDisplay(inv.date)) : '',
      inv.dueDate ? (typeof inv.dueDate === 'string' && inv.dueDate.length >= 10 ? inv.dueDate.slice(0, 10) : safeDateDisplay(inv.dueDate)) : '',
      formatINR(inv.total || 0),
      formatINR(paid),
      formatINR(due),
      inv.status || 'Pending'
    ];
  });

  // create PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = 40;

  // Header
  doc.setFontSize(14);
  doc.text('RanSan Groups', margin, y);
  doc.setFontSize(10);
  doc.text(`Customer: ${cust.name}`, margin, y + 18);
  if (cust.phone) doc.text(`Phone: ${cust.phone}`, margin, y + 34);
  if (cust.email) doc.text(`Email: ${cust.email}`, margin + 200, y + 34);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, 520, y + 18, { align: 'right' });
  y += 54;

  // Summary small cards
  doc.setFontSize(11);
  doc.text(`Total Invoiced: ${formatINR(totalInvoiced)}`, margin, y);
  doc.text(`Total Paid: ${formatINR(totalPaid)}`, margin + 200, y);
  doc.text(`Balance: ${formatINR(balance)}`, margin + 380, y);
  y += 18;

  // Add a little spacing
  y += 6;

  // Table head + body using autotable
  const head = [['Invoice', 'Date', 'Due', 'Total', 'Paid', 'Balance', 'Status']];
  doc.autoTable({
    head: head,
    body: rows,
    startY: y,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [124, 58, 237] },
    margin: { left: margin, right: margin },
    theme: 'grid',
    willDrawCell: function (data) { /* optional custom cell drawing */ }
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : y + 12;
  doc.setFontSize(10);
  doc.text(`Total Invoiced: ${formatINR(totalInvoiced)}`, margin, finalY);
  doc.text(`Total Paid: ${formatINR(totalPaid)}`, margin + 220, finalY);
  doc.setFontSize(12);
  doc.text(`Outstanding Balance: ${formatINR(balance)}`, margin + 380, finalY);

  // Footer (optional)
  const footerY = 780;
  doc.setFontSize(9);
  doc.text('This is a system generated statement.', margin, footerY);

  // Save
  const fileName = `Statement_${sanitizeFileName(cust.name)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}



function populateStatementCustomers() {
  const bizId = safeEl("bizSelect")?.value || "all";
  const select = safeEl("statementCustomerSelect");
  if (!select) return;

  select.innerHTML = "";

  // Default option
  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.textContent = "-- All Customers --";
  select.appendChild(optDefault);

  // ✅ Only customers of this business
  let customers = state.customers || [];
  if (bizId !== "all") {
    customers = customers.filter(c => c.businessId === bizId);
  }

  customers.forEach(cust => {
    const opt = document.createElement("option");
    opt.value = cust.id;
    opt.textContent = cust.name;
    select.appendChild(opt);
  });

  // ✅ Auto-select first customer
  let firstCustomerId = "";
  if (customers.length > 0) {
    firstCustomerId = customers[0].id;
    select.value = firstCustomerId;
  }

  // ✅ Render statement immediately
  if (typeof renderStatementDashboard === "function") {
    renderStatementDashboard(firstCustomerId);
  }
}





function populateStatementCustomerSelect() {
  const sel = safeEl("statementCustomerSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="">-- All Customers --</option>`;

  // filter customers by current business
  const customers = state.currentBiz === "all"
    ? state.customers
    : state.customers.filter(c => c.businessId === state.currentBiz);

  customers.forEach(cust => {
    const opt = document.createElement("option");
    opt.value = cust.id;
    opt.textContent = cust.name;
    sel.appendChild(opt);
  });
}




// --- Helpers (fallbacks if not defined globally) ---
window.safeEl = window.safeEl || ((id) => document.getElementById(id));
window.getInvoiceLabel = window.getInvoiceLabel || ((inv) => inv["invoice number"] || inv.invoiceNumber || inv.id || "—");
window.formatINR = window.formatINR || ((n) => {
  const v = Number(n || 0);
  if (Number.isNaN(v)) return "₹0";
  return v.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
});
window.safeDateDisplay = window.safeDateDisplay || ((d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
});

// Robust due date resolver (supports multiple field names)
function getDueDate(inv) {
  const candidates = [inv.dueDate, inv.due_date, inv.due, inv.dueOn, inv.paymentDue];
  const raw = candidates.find(Boolean);
  const dt = raw ? new Date(raw) : null;
  return (dt && !isNaN(dt)) ? dt : null;
}

function daysBetween(a, b) {
  const one = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const two = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((two - one) / (1000 * 60 * 60 * 24));
}

// Paid amount, balance, and last payment date
function computePaymentInfo(inv) {
  const payments = (inv.payments || []).slice().sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const total = inv.total || 0;
  const balance = Math.max(0, total - paid);
  const lastPaidDate = payments.length ? payments[payments.length - 1].date : null;
  return { paid, total, balance, lastPaidDate, payments };
}

// Due status pill (red overdue, orange upcoming ≤7 days, green cleared)
function renderDuePill(inv, balance, dueDate) {
  if (!dueDate) {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-600 text-white">No due date</span>`;
  }
  const today = new Date();
  const dd = daysBetween(today, dueDate);

  if (balance <= 0) {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-600 text-white">Cleared</span>`;
  }
  if (dd < 0) {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-600 text-white">Overdue ${Math.abs(dd)}d</span>`;
  }
  if (dd <= 7) {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-600 text-white">Due in ${dd}d</span>`;
  }
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-600 text-white">Due ${safeDateDisplay(dueDate)}</span>`;
}

// Progress bar (paid %)
function renderProgressBar(total, paid) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return `
    <div class="w-full">
      <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div class="h-2 bg-emerald-500" style="width:${pct}%;"></div>
      </div>
      <div class="text-[11px] mt-1 text-white/70">${pct}% paid</div>
    </div>
  `;
}

// Expandable payment detail rows
function renderPaymentDetails(payments) {
  if (!payments || payments.length === 0) {
    return `<div class="text-white/60 text-sm">No payments recorded.</div>`;
  }
  const rows = payments.map(p => `
    <tr class="border-b border-white/10">
      <td class="px-2 py-1">${safeDateDisplay(p.date)}</td>
      <td class="px-2 py-1 text-right">${formatINR(p.amount)}</td>
      <td class="px-2 py-1">${p.method || p.mode || "—"}</td>
      <td class="px-2 py-1">${p.note || p.ref || ""}</td>
    </tr>
  `).join("");
  return `
    <div class="mt-2 bg-white/5 rounded-lg p-2">
      <div class="text-white/80 font-medium mb-1">Payment History</div>
      <table class="w-full text-xs text-white/80">
        <thead>
          <tr class="border-b border-white/10">
            <th class="px-2 py-1 text-left">Date</th>
            <th class="px-2 py-1 text-right">Amount</th>
            <th class="px-2 py-1 text-left">Method</th>
            <th class="px-2 py-1 text-left">Note</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// === MAIN: render statement for selected customer ===
function renderStatementDashboard(customerId) {
  const cust = (state.customers || []).find(c => String(c.id) === String(customerId));
  if (!cust) return;

  const invoices = (state.invoices || []).filter(inv => String(inv.customerId) === String(customerId));

  // Totals
  const totals = invoices.reduce((acc, inv) => {
    const { total, paid, balance } = computePaymentInfo(inv);
    acc.totalInvoiced += total;
    acc.totalPaid += paid;
    acc.totalBalance += balance;
    return acc;
  }, { totalInvoiced: 0, totalPaid: 0, totalBalance: 0 });

  // Next due date (only from invoices with balance > 0 and a due date in the future)
  const today = new Date();
  const nextDue = invoices
    .map(inv => ({ inv, due: getDueDate(inv), info: computePaymentInfo(inv) }))
    .filter(x => x.due && x.info.balance > 0 && x.due >= today)
    .sort((a, b) => a.due - b.due)[0];

  // === Update existing Summary Cards (kept as-is) ===
  const cards = [
    { label: "Total Invoiced", value: formatINR(totals.totalInvoiced), color: "text-blue-400" },
    { label: "Total Paid", value: formatINR(totals.totalPaid), color: "text-emerald-400" },
    { label: "Pending Balance", value: formatINR(totals.totalBalance), color: "text-amber-400" }
  ];
  const cardsEl = safeEl("statementSummaryCards");
  if (cardsEl) {
    cardsEl.innerHTML = cards.map(c => `
      <div class="bg-white/5 rounded-xl p-4 text-center">
        <div class="text-sm text-white/60">${c.label}</div>
        <div class="text-2xl font-bold ${c.color}">${c.value}</div>
      </div>
    `).join("");
  }

  // === Payment Distribution Doughnut Chart with Overdue Slice ===
  const pieEl = document.getElementById("statementPieChart");
  if (pieEl) {
    const ctx = pieEl.getContext("2d");

    if (window.statementChart) {
      window.statementChart.destroy();
    }

    const paid = totals.totalPaid;
    const total = totals.totalInvoiced;

    // Calculate overdue & pending
    let overdue = 0;
    let pending = 0;
    invoices.forEach(inv => {
      const { balance } = computePaymentInfo(inv);
      const dueDate = getDueDate(inv);
      if (balance > 0) {
        if (dueDate && dueDate < new Date()) {
          overdue += balance; // past due
        } else {
          pending += balance; // not yet due
        }
      }
    });

    const finalPercentPaid = (total > 0) ? Math.round((paid / total) * 100) : 0;
    let displayPercent = 0;

    window.statementChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Pending', 'Overdue'],
        datasets: [{
          data: [paid, pending, overdue],
          backgroundColor: [
            '#10b981', // green (paid)
            '#f59e0b', // amber (pending)
            '#ef4444'  // red (overdue)
          ],
          borderWidth: 1,
          borderColor: '#1e293b'
        }]
      },
      options: {
        cutout: '70%',
        animation: {
          animateScale: true,
          animateRotate: false,
          onProgress: (animation) => {
            displayPercent = Math.round(finalPercentPaid * animation.currentStep / animation.numSteps);
          },
          onComplete: () => {
            displayPercent = finalPercentPaid;
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'white', font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatINR(ctx.parsed)}`
            }
          }
        }
      },
      plugins: [
        {
          id: 'centerLabel',
          afterDraw(chart) {
            const { width, chartArea, ctx } = chart;
            const centerX = width / 2;
            const centerY = chartArea.top + (chartArea.bottom - chartArea.top) / 2;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // % Paid in center
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = 'white';
            ctx.fillText(`${displayPercent}% Paid`, centerX, centerY);

            // total invoiced below
            ctx.font = '12px Arial';
            ctx.fillStyle = '#9ca3af'; // slate-400
            ctx.fillText(`of ${formatINR(total)}`, centerX, centerY + 20);

            ctx.restore();
          }
        },
        {
          id: 'sliceShadow',
          beforeDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          },
          afterDraw(chart) {
            const { ctx } = chart;
            ctx.restore();
          }
        }
      ]
    });
  }




  // === Table rows with progress, paid date, due pill ===
  const tbody = safeEl("statementInvoiceList");
  if (tbody) {
    tbody.innerHTML = "";
    invoices.forEach(inv => {
      const { total, paid, balance, lastPaidDate, payments } = computePaymentInfo(inv);
      const dueDate = getDueDate(inv);

      // main row
      const tr = document.createElement("tr");
      tr.className = "border-b border-white/10 align-top";

      tr.innerHTML = `
        <td class="p-2">
          <div class="flex items-center gap-2">
            <button class="toggle-payments text-white/70 hover:text-white" data-inv="${inv.id}" title="Show payments">
              <i data-lucide="chevron-down"></i>
            </button>
            <div class="font-medium text-white/90">${getInvoiceLabel(inv)}</div>
          </div>
          <div class="mt-2">${renderProgressBar(total, paid)}</div>
        </td>

        <td class="p-2">${safeDateDisplay(inv.date)}</td>
        <td class="p-2 text-right">${formatINR(total)}</td>

        <td class="p-2 text-right">
          <div class="text-emerald-300">${formatINR(paid)}</div>
          <div class="text-[11px] text-white/60">${lastPaidDate ? "Last paid: " + safeDateDisplay(lastPaidDate) : "—"}</div>
        </td>

        <td class="p-2 text-right ${balance > 0 ? "text-amber-300" : "text-emerald-300"}">${formatINR(balance)}</td>

        <td class="p-2">
          <div class="mb-1">${renderDuePill(inv, balance, dueDate)}</div>
          <div class="text-[11px] text-white/60">${dueDate ? safeDateDisplay(dueDate) : ""}</div>
        </td>
      `;

      // details row (payments)
      const trDetails = document.createElement("tr");
      trDetails.className = "hidden";
      trDetails.setAttribute("data-details-for", inv.id);
      trDetails.innerHTML = `
        <td colspan="6" class="p-2">
          ${renderPaymentDetails(payments)}
        </td>
      `;

      tbody.appendChild(tr);
      tbody.appendChild(trDetails);
    });

    // attach toggles
    tbody.querySelectorAll(".toggle-payments").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv");
        const row = tbody.querySelector(`tr[data-details-for="${id}"]`);
        if (!row) return;
        row.classList.toggle("hidden");
        const i = btn.querySelector("i");
        if (i) i.setAttribute("data-lucide", row.classList.contains("hidden") ? "chevron-down" : "chevron-up");
        if (window.lucide) window.lucide.createIcons();
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  // === Summary Bar (bottom) ===
  const bar = safeEl("statementSummaryBar");
  if (bar) {
    bar.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        <!-- Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto flex-grow">
          <div class="bg-white/5 rounded-lg p-3 text-center">
            <div class="text-[12px] text-white/60">Total Invoiced</div>
            <div class="text-lg font-bold text-blue-400">${formatINR(totals.totalInvoiced)}</div>
          </div>
          <div class="bg-white/5 rounded-lg p-3 text-center">
            <div class="text-[12px] text-white/60">Total Paid</div>
            <div class="text-lg font-bold text-emerald-400">${formatINR(totals.totalPaid)}</div>
          </div>
          <div class="bg-white/5 rounded-lg p-3 text-center">
            <div class="text-[12px] text-white/60">Pending Balance</div>
            <div class="text-lg font-bold text-amber-400">${formatINR(totals.totalBalance)}</div>
          </div>
          <div class="bg-white/5 rounded-lg p-3 text-center">
            <div class="text-[12px] text-white/60">Next Due Date</div>
            <div class="text-lg font-bold text-white">${nextDue ? safeDateDisplay(nextDue.due) : "—"}</div>
          </div>
        </div>

        <!-- Buttons -->
        <div class="flex flex-wrap gap-2">
          <button id="exportStatementPdfBtn"
            class="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-2">
            <i data-lucide="file-down"></i><span>Export PDF</span>
          </button>
          <button id="exportStatementCsvBtn"
            class="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-2">
            <i data-lucide="table"></i><span>Export CSV</span>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // === Exports
    const exportRows = invoices.map(inv => {
      const { total, paid, balance, lastPaidDate, payments } = computePaymentInfo(inv);
      const due = getDueDate(inv);
      return {
        invoice: getInvoiceLabel(inv),
        date: safeDateDisplay(inv.date),
        status: inv.status || "",
        total,
        paid,
        balance,
        lastPaidDate: lastPaidDate ? safeDateDisplay(lastPaidDate) : "",
        dueDate: due ? safeDateDisplay(due) : "",
        payments  // 👈 add full payment list here
      };
    });

    const pdfBtn = safeEl("exportStatementPdfBtn");
    const csvBtn = safeEl("exportStatementCsvBtn");

    if (pdfBtn) {
      pdfBtn.onclick = () => exportStatementPDF(cust, exportRows, totals, nextDue);
    }
    if (csvBtn) {
      csvBtn.onclick = () => exportStatementCSV(cust, exportRows, totals, nextDue);
    }
  }
}

// --- Exporters ---
function exportStatementCSV(cust, rows, totals, nextDue) {
  const header = ["Invoice", "Date", "Status", "Total", "Paid", "Balance", "Last Paid Date", "Due Date"];
  const body = rows.map(r => [
    r.invoice, r.date, r.status,
    r.total, r.paid, r.balance,
    r.lastPaidDate, r.dueDate
  ]);
  // summary row
  body.push([]);
  body.push(["TOTALS", "", "", totals.totalInvoiced, totals.totalPaid, totals.totalBalance, "", nextDue ? nextDue.due.toISOString().slice(0, 10) : ""]);

  const csv = [header, ...body].map(arr => arr.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Customer_Statement_${cust.name || "Customer"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportStatementPDF(cust, rows, totals, nextDue) {
  // Invoice summary table
  const htmlRows = rows.map(r => `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #ddd">${r.invoice}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${r.date}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${r.status}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">${formatINR(r.total)}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">${formatINR(r.paid)}</td>
      <td style="text-align:right" class="${r.balance > 0 ? 'pending' : 'paid'}">
  ${formatINR(r.balance)}
</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${r.lastPaidDate}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${r.dueDate}</td>
    </tr>
  `).join("");

  const summary = `
  <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:12px">
    <div style="padding:8px 12px;border-radius:6px;background:#eff6ff;color:#2563eb;font-weight:bold;">
      Total Invoiced: <span style="font-size:14px">${formatINR(totals.totalInvoiced)}</span>
    </div>
    <div style="padding:8px 12px;border-radius:6px;background:#ecfdf5;color:#059669;font-weight:bold;">
      Total Paid: <span style="font-size:14px">${formatINR(totals.totalPaid)}</span>
    </div>
    <div style="padding:8px 12px;border-radius:6px;background:#fef3c7;color:#d97706;font-weight:bold;">
      Pending Balance: <span style="font-size:14px">${formatINR(totals.totalBalance)}</span>
    </div>
    <div style="padding:8px 12px;border-radius:6px;background:#f3f4f6;color:#374151;font-weight:bold;">
      Next Due: <span style="font-size:14px">${nextDue ? safeDateDisplay(nextDue.due) : "—"}</span>
    </div>
  </div>
`;

  // === Payment transactions per invoice
  const paymentSections = rows.map(r => {
    const overdue = r.balance > 0 && r.dueDate && new Date(r.dueDate) < new Date();

    if (!r.payments || r.payments.length === 0) {
      return `
        <div>
<h4 style="margin:12px 0 4px">
  ${r.invoice}
  ${overdue ? '<span class="overdue">OVERDUE</span>' : ""}
</h4>
          <div style="color:#777;font-size:13px">No payments recorded</div>
        </div>
      `;
    }

    const payRows = r.payments.map(p => {
      const isPending = !p.cleared && !p.confirmed; // adjust to your data model
      const amountClass = isPending ? "pending" : "paid";
      return `
    <tr>
      <td>${safeDateDisplay(p.date)}</td>
      <td class="${amountClass}" style="text-align:right">${formatINR(p.amount)}</td>
      <td>${p.method || ""}</td>
      <td>${p.notes || ""}</td>
    </tr>
  `;
    }).join("");

    // compute total payments
    const totalPayments = r.payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    return `
      <div>
        <h4 style="margin:12px 0 4px">
          ${r.invoice}
          ${overdue ? '<span style="color:#b91c1c;font-size:12px;font-weight:bold;margin-left:8px">OVERDUE</span>' : ""}
        </h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
          <thead>
            <tr>
              <th style="text-align:left;background:#f9fafb;border-bottom:1px solid #ddd;padding:6px">Date</th>
              <th style="text-align:right;background:#f9fafb;border-bottom:1px solid #ddd;padding:6px">Amount</th>
              <th style="text-align:left;background:#f9fafb;border-bottom:1px solid #ddd;padding:6px">Method</th>
              <th style="text-align:left;background:#f9fafb;border-bottom:1px solid #ddd;padding:6px">Notes</th>
            </tr>
          </thead>
          <tbody>${payRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:6px;text-align:right;font-weight:bold;border-top:1px solid #ddd">Total Received</td>
              <td style="padding:6px;text-align:right;font-weight:bold;border-top:1px solid #ddd">${formatINR(totalPayments)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }).join("");


  // Derive statement period from rows
  let statementStart = "";
  let statementEnd = "";
  if (rows.length > 0) {
    const dates = rows
      .map(r => new Date(r.date))
      .filter(d => !isNaN(d));
    if (dates.length > 0) {
      statementStart = safeDateDisplay(new Date(Math.min(...dates)));
      statementEnd = safeDateDisplay(new Date(Math.max(...dates)));
    }
  }

  // Build final balance section
  let finalBalance = "";
  if (totals.totalBalance > 0) {
    finalBalance = `
    <div style="margin-top:24px;padding:16px;border-top:2px solid #374151;text-align:right;">
      <div style="font-size:14px;color:#374151;margin-bottom:4px;">
        Statement for <b>${cust.name || ""}</b>  
        ${statementStart && statementEnd ? `(Period: ${statementStart} – ${statementEnd})` : ""}
      </div>
      <span style="font-size:18px;font-weight:bold;color:#d97706;">
        Final Balance Due: ${formatINR(totals.totalBalance)}
      </span>
    </div>
  `;
  } else {
    finalBalance = `
    <div style="margin-top:24px;padding:16px;border-top:2px solid #374151;text-align:right;">
      <div style="font-size:14px;color:#374151;margin-bottom:4px;">
        Statement for <b>${cust.name || ""}</b>  
        ${statementStart && statementEnd ? `(Period: ${statementStart} – ${statementEnd})` : ""}
      </div>
      <span style="font-size:18px;font-weight:bold;color:#059669;">
        ✅ No Balance Outstanding
      </span>
    </div>
  `;
  }


  const html = `
    <html>
      <head>
        <title>Customer Statement - ${cust.name || ""}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; color:#111827; background:#fff; }
  h2 { margin: 0 0 6px 0; color:#1f2937; }
  h3 { margin: 20px 0 10px; color:#1f2937; }
  h4 { color:#111827; }
  table { width:100%; border-collapse: collapse; margin-bottom:12px; }
  thead th {
    background:#1f2937;
    color:#fff;
    padding:8px;
    text-align:left;
    font-size:13px;
  }
  tbody tr:nth-child(odd) { background:#f9fafb; }
  tbody td {
    padding:6px;
    border-bottom:1px solid #e5e7eb;
    font-size:13px;
  }
  tfoot td {
    background:#f1f5f9;
    font-weight:bold;
    color:#0f172a;
    border-top:2px solid #1f2937;
    font-size:13px;
  }
  .overdue {
    color:#dc2626; /* red-600 */
    font-size:12px;
    font-weight:bold;
    margin-left:8px;
  }
  .paid { color:#2563eb; font-weight:bold; }    /* blue-600 */
  .pending { color:#d97706; font-weight:bold; } /* amber-600 */
</style>
      </head>
      <body>
        <h2>Customer Statement</h2>
        <div style="margin-bottom:12px;color:#555">${cust.name || ""}</div>

        <table>
<thead>
  <tr>
    <th>Invoice</th>
    <th>Date</th>
    <th>Status</th>
    <th style="text-align:right">Total</th>
    <th style="text-align:right;background:#ecfdf5;color:#059669;">Paid</th>
    <th style="text-align:right;background:#fef3c7;color:#d97706;">Balance</th>
    <th>Last Paid</th>
    <th>Due Date</th>
  </tr>
</thead>
          <tbody>${htmlRows}</tbody>
        </table>

        ${summary}

        <h3>Payment Transactions</h3>
        ${paymentSections}

${finalBalance}
        
      </body>
    </html>
  `;

  const w = window.open("", "_blank", "width=900,height=1000");
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}











document.getElementById('bizSelect').addEventListener('change', e => {
  const selectedBiz = e.target.value;
  const filtered = selectedBiz === 'all'
    ? state.services
    : state.services.filter(s => s.businessId === selectedBiz);

  renderServiceCatalog(filtered);
});



function showLoader() {
  document.getElementById("loader").classList.remove("hidden");
}
function hideLoader() {
  document.getElementById("loader").classList.add("hidden");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `px-4 py-2 rounded-xl text-white shadow transition-opacity duration-500 ${type === "success" ? "bg-green-600" : "bg-red-600"
    }`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("opacity-0");
    setTimeout(() => toast.remove(), 500);
  }, 2000);
}

function highlightActive(view) {
  // remove highlight from all nav buttons
  document.querySelectorAll("nav button").forEach(el => {
    el.classList.remove("nav-active");
  });

  // add highlight to the matching one
  const btn = document.querySelector(`nav button[data-nav="${view}"]`);
  if (btn) {
    btn.classList.add("nav-active");
  }
}


function highlightActive(name, color = "purple") {
  console.log("👉 highlightActive called for:", name, "with color:", color);

  const colorMap = {
    green: { border: "border-green-400", bg: "bg-green-500/10" },
    blue: { border: "border-blue-400", bg: "bg-blue-500/10" },
    purple: { border: "border-purple-400", bg: "bg-purple-500/10" },
    orange: { border: "border-orange-400", bg: "bg-orange-500/10" },
  };

  // Reset all
  document.querySelectorAll("nav button").forEach(btn => {
    btn.classList.remove(
      "border-l-4",
      "border-green-400", "bg-green-500/10",
      "border-blue-400", "bg-blue-500/10",
      "border-purple-400", "bg-purple-500/10",
      "border-orange-400", "bg-orange-500/10"
    );
  });

  const activeBtn = [...document.querySelectorAll("nav button")]
    .find(b => b.getAttribute("onclick") === `showView('${name}')`);

  if (!activeBtn) {
    console.warn("⚠️ No active button found for:", name);
    return;
  }

  const chosen = colorMap[color] || colorMap.purple;
  console.log("✅ Applying classes:", chosen.border, chosen.bg);
  activeBtn.classList.add("border-l-4", chosen.border, chosen.bg);
}

/**
 * Animate number counter for KPI widgets
 * @param {string} elId - The ID of the element
 * @param {number} newValue - The new target value
 * @param {boolean} isCurrency - If true, format as ₹
 * @param {number} duration - Animation duration in ms
 */
function animateCounter(elId, newValue, isCurrency = true, duration = 1000) {
  const el = document.getElementById(elId);
  if (!el) {
    console.warn(`⚠️ animateCounter: Element #${elId} not found`);
    return;
  }

  // Extract current numeric value
  const text = el.innerText.replace(/[^\d.-]/g, ""); // strip non-numeric
  const currentValue = parseFloat(text) || 0;

  const startTime = performance.now();
  const diff = newValue - currentValue;

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = currentValue + diff * progress;
    el.innerText = isCurrency ? `₹${Math.round(value).toLocaleString("en-IN")}` : Math.round(value).toLocaleString("en-IN");

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

