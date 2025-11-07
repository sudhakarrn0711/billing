/***********************
 * Billing API Backend — Single env, CORS-safe (no API key, no env)
 * - Publish as Web App: Execute as "Me", Who has access: "Anyone"
 * - This design avoids CORS preflight by accepting text/plain JSON bodies
 ***********************/

const SHEET_ID = '12KZkcHpFHWk1MssRyW0PnbDB1KV1gutBfiFY4aPcm7E'; // <-- your sheet

/* Entrypoints */
function doGet(e)  { return out(handle(e, 'GET')); }
function doPost(e) { return out(handle(e, 'POST', e && e.postData)); }
/* Optional: handle stray preflights if any */
function doOptions(e) { return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT); }

/* Router */
function handle(e, method, postData) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = (params.action || 'getall').toString().toLowerCase();

  try {
    if (method === 'GET') {
      switch (action) {
        case 'getall':       return getAll();
        case 'getcustomers': return { customers: readRows('customers') };
        case 'getservices':  return { services:  readRows('services')  };
        case 'getinvoices':  return { invoices:  readRows('invoices')  };
        default:             return { error: 'unknown action' };
      }
    }

    if (method === 'POST') {
      const body = parseBody(postData, params);
      switch (action) {
        case 'savecustomer':    return saveCustomer(body);
        case 'deletecustomer':  return deleteCustomer(body);
        case 'saveinvoice':     return saveInvoice(body);
        case 'saveservice':     return saveService(body);
        case 'deleteservice':   return deleteService(body);
        case 'savebusiness':    return saveBusiness(body);
        case 'deletebusiness':  return deleteBusiness(body);
        default:                return { error: 'unknown action' };
      }
    }

    return { error: 'unsupported method' };
  } catch (err) {
    return { error: String(err) };
  }
}


/* Robust POST parser — accepts JSON sent as text/plain (no preflight) or URL-encoded */
function parseBody(postData, params) {
  if (!postData || !postData.contents) return params || {};
  const raw = postData.contents;

  // Try JSON first regardless of content-type
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : params || {};
  } catch (e) { /* fall through */ }

  // Fallback: parse application/x-www-form-urlencoded
  const out = Object.assign({}, params || {});
  if (raw && raw.indexOf('=') !== -1) {
    raw.split('&').forEach(kv => {
      if (!kv) return;
      const parts = kv.split('=');
      const key = decodeURIComponent(parts.shift().replace(/\+/g, ' '));
      const val = decodeURIComponent((parts.join('=') || '').replace(/\+/g, ' '));
      out[key] = val;
    });
  }
  return out;
}

/* JSON response helper */
function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Spreadsheet helpers */
function getSS(){ return SpreadsheetApp.openById(SHEET_ID); }

function readRows(sheetName){
  const sh = getSS().getSheetByName(sheetName);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => h.toString().trim());
  return values.slice(1)
    .filter(r => r.some(c => c !== '' && c !== null))
    .map(r => {
      const obj = {};
      headers.forEach((h,i) => {
        let v = r[i];
        if ((h === 'items' || h === 'payments') && typeof v === 'string' && v.trim()) {
          try { v = JSON.parse(v); } catch(e) {}
        }
        obj[h] = v;
      });
      return obj;
    });
}

function writeRowFromObject(headers, rowObj) {
  return headers.map(h => {
    let v = rowObj[h];
    if (h === 'items' || h === 'payments') return v ? JSON.stringify(v) : '[]';
    return (v !== undefined && v !== null) ? v : '';
  });
}

function appendRow(sheetName, obj){
  const sh = getSS().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const row = writeRowFromObject(headers, obj);
  sh.appendRow(row);
  return true;
}

function updateRowById(sheetName, id, obj){
  const sh = getSS().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  const headers = values[0].map(h => h.toString().trim());
  for (let r=1; r<values.length; r++) {
    if ((values[r][0] + '') === (id + '')) {
      const existingRow = values[r];
      const newRow = headers.map((h, idx) => {
        let v = Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : existingRow[idx];
        if (h === 'items' || h === 'payments') return v ? JSON.stringify(v) : '[]';
        return (v !== undefined && v !== null) ? v : existingRow[idx];
      });
      sh.getRange(r+1, 1, 1, newRow.length).setValues([newRow]);
      return true;
    }
  }
  return false;
}

/* Domain actions */
function getAll(){
  return {
    businesses: readRows('businesses'),
    services:   readRows('services'),
    customers:  readRows('customers'),
    invoices:   readRows('invoices')
  };
}

function saveInvoice(inv) {
  if (!inv) throw new Error('no invoice body');
  inv = JSON.parse(JSON.stringify(inv)); // deep clone

  inv.items = Array.isArray(inv.items) ? inv.items : [];
  inv.payments = Array.isArray(inv.payments) ? inv.payments : [];

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName("invoices");
  if (!sh) throw new Error('No "invoices" sheet found');

  const headers = sh.getDataRange().getValues()[0].map(h => h.toString().trim());
  const idIndex = headers.indexOf("id");
  const numIndex = headers.indexOf("invoice number"); // old header in sheet
  if (idIndex < 0 || numIndex < 0) throw new Error('Invoices sheet missing required headers');

  // ✅ Normalize: prefer invoiceNumber (camelCase)
  if (inv.invoiceNumber && !inv["invoice number"]) {
    inv["invoice number"] = inv.invoiceNumber;
  }
  if (!inv.invoiceNumber && inv["invoice number"]) {
    inv.invoiceNumber = inv["invoice number"];
  }

  // ✅ CASE 1: New Invoice
  if (!inv.id) {
    inv.id = 'inv_' + Utilities.getUuid();
    inv.createdAt = new Date().toISOString();

    // auto-generate invoice number ONLY if frontend didn't send one
    if (!inv.invoiceNumber) {
      const year = new Date().getFullYear().toString().slice(-2);
      const businesses = getSheetAsObjects("businesses"); // helper to read biz sheet
      const biz = businesses.find(b => b.id === inv.businessId);
      const prefix = (biz && biz.prefix) ? biz.prefix.toUpperCase() : "INV";

      const data = sh.getDataRange().getValues();
      let maxSeq = 0;
      for (let i = 1; i < data.length; i++) {
        const num = data[i][numIndex];
        if (typeof num === "string" && num.startsWith(prefix + "-" + year)) {
          const seq = parseInt(num.split("-")[2], 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      }
      const nextSeq = String(maxSeq + 1).padStart(4, "0");
      inv.invoiceNumber = prefix + "-" + year + "-" + nextSeq;
      inv["invoice number"] = inv.invoiceNumber;
    }

    // insert new row
    const row = writeRowFromObject(headers, inv);
    sh.appendRow(row);
    return { ok: true, invoice: inv };
  }

  // ✅ CASE 2: Update Existing
  const data = sh.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIndex]) === String(inv.id)) {
      rowIndex = i + 1; // adjust for header
      break;
    }
  }
  if (rowIndex < 0) throw new Error("Invoice not found: " + inv.id);

  const existingRow = data[rowIndex - 1];
  const existingObj = {};
  headers.forEach((h, j) => existingObj[h] = existingRow[j]);

  // preserve invoice number if blank
  if (!inv.invoiceNumber && existingObj["invoice number"]) {
    inv.invoiceNumber = existingObj["invoice number"];
    inv["invoice number"] = inv.invoiceNumber;
  }

  // preserve createdAt
  inv.createdAt = existingObj["createdAt"] || new Date().toISOString();

  // always ensure payments stays JSON
  inv.payments = Array.isArray(inv.payments) ? inv.payments : [];

  const finalObj = { ...existingObj, ...inv };

  const newRow = writeRowFromObject(headers, finalObj);
  sh.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);

  return { ok: true, invoice: finalObj };
}



function saveCustomer(cust){
  if (!cust) throw new Error('no customer body');
  cust = JSON.parse(JSON.stringify(cust));
  if (!cust.id) {
    cust.id = 'cust_' + Utilities.getUuid();
    cust.createdAt = (new Date()).toISOString();
    appendRow('customers', cust);
    return { ok: true, customer: cust };
  } else {
    const updated = updateRowById('customers', cust.id, cust);
    return { ok: updated, customer: cust };
  }
}

// --- Delete customer by id (uses your sheet helpers) ---
function deleteCustomer(body) {
  const id = body.id;
  if (!id) return { ok: false, error: "id required" };

  // ✅ Always open by ID for Web App
  const ss = SpreadsheetApp.openById("12KZkcHpFHWk1MssRyW0PnbDB1KV1gutBfiFY4aPcm7E"); // <-- change to your sheet ID
  const sheet = ss.getSheetByName('customers');
  if (!sheet) return { ok: false, error: "customers sheet missing" };

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const idIndex = headers.indexOf("id");
  if (idIndex === -1) return { ok: false, error: "id column missing" };

  for (let i = 0; i < data.length; i++) {
    if (data[i][idIndex] === id) {
      sheet.deleteRow(i + 2); // +2 for header row
      return { ok: true };
    }
  }

  return { ok: false, error: "not found" };
}

function deleteService(body) {
  const id = body.id;
  if (!id) return { ok: false, error: "id required" };

  // Open spreadsheet by ID (replace with your actual sheet ID)
  const ss = SpreadsheetApp.openById("12KZkcHpFHWk1MssRyW0PnbDB1KV1gutBfiFY4aPcm7E");
  const sheet = ss.getSheetByName('services');
  if (!sheet) return { ok: false, error: "services sheet missing" };

  const data = sheet.getDataRange().getValues();
  const headers = data.shift(); // remove header row
  const idIndex = headers.indexOf("id");
  if (idIndex === -1) return { ok: false, error: "id column missing" };

  for (let i = 0; i < data.length; i++) {
    if (data[i][idIndex] === id) {
      sheet.deleteRow(i + 2); // +2 because of header
      return { ok: true };
    }
  }

  return { ok: false, error: "not found" };
}




function saveService(svc) {
  if (!svc) throw new Error("no service body");
  svc = JSON.parse(JSON.stringify(svc)); // deep clone

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName("services");
  if (!sh) throw new Error('No "services" sheet found');

  const headers = sh.getDataRange().getValues()[0].map(h => h.toString().trim());
  const idIndex = headers.indexOf("id");
  if (idIndex < 0) throw new Error('Services sheet missing "id" column');

  // If new service → assign ID
  if (!svc.id) {
    svc.id = "svc_" + Utilities.getUuid();
    svc.createdAt = new Date().toISOString();
  }

  // Build row aligned with headers
  const row = headers.map(h => svc[h] || "");

  // Check if ID already exists
  const data = sh.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIndex]) === String(svc.id)) {
      rowIndex = i + 1; // adjust for header row
      break;
    }
  }

  if (rowIndex === -1) {
    // New row → append
    sh.appendRow(row);
  } else {
    // Existing row → update
    sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  }

  return { ok: true, service: svc };
}


function saveBusiness(biz) {
  if (!biz) throw new Error('no business body');
  biz = JSON.parse(JSON.stringify(biz)); // clone

  // Align with sheet headers
  const safeBiz = {
    id: biz.id || '',
    name: biz.name || '',
    currency: biz.currency || 'INR',
    phone: biz.phone || '',
    email: biz.email || '',
    prefix: biz.prefix || 'INV',
    gst: biz.gst || '',
    waBase: biz.waBase || 'https://wa.me',
    footer: biz.footer || '',
    notes: biz.notes || '',
    code: biz.code || '' // sequential BIZ-1 if missing
  };

  const sh = getSS().getSheetByName("businesses");

  if (!safeBiz.id) {
    safeBiz.id = 'biz_' + Utilities.getUuid();

    // Generate sequential code if missing
    if (!safeBiz.code) {
      const values = sh.getDataRange().getValues();
      let nextNum = 1;
      if (values.length > 1) {
        const headers = values[0].map(h => h.toString().trim());
        const codeColIndex = headers.indexOf("code");
        if (codeColIndex !== -1) {
          const nums = values.slice(1)
            .map(r => r[codeColIndex])
            .map(c => (typeof c === "string" && c.startsWith("BIZ-")) ? parseInt(c.replace("BIZ-", ""), 10) : 0)
            .filter(n => !isNaN(n));
          if (nums.length) nextNum = Math.max.apply(null, nums) + 1;
        }
      }
      safeBiz.code = "BIZ-" + nextNum;
    }

    appendRow('businesses', safeBiz);
    return { ok: true, business: safeBiz };
  } else {
    const updated = updateRowById('businesses', safeBiz.id, safeBiz);
    return { ok: updated, business: safeBiz };
  }
}



function deleteBusiness(data) {
  if (!data || !data.id) throw new Error("no business id");
  const sh = getSS().getSheetByName("businesses");
  if (!sh) throw new Error("Sheet not found: businesses");

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: false, error: "no businesses found" };

  for (let r = 1; r < values.length; r++) {
    if ((values[r][0] + "") === (data.id + "")) {
      sh.deleteRow(r + 1);
      return { ok: true, deletedId: data.id };
    }
  }
  return { ok: false, error: "business not found" };
}
