/***********************
 * Billing API Backend — Test + Live support (single copy)
 * Deploy as Web App (Execute as "Me", access: "Anyone")
 * Switch env with &env=test or &env=live
 ***********************/

const SHEET_MAP = {
  live: '11Fr44tt6-952v_-HK7TBiTr7NgO0VL5vWwUwoZcS6-8',  // <-- replace with your live sheet id
  test: '12KZkcHpFHWk1MssRyW0PnbDB1KV1gutBfiFY4aPcm7E'   // <-- test sheet id
};

const DEFAULT_ENV = 'test';

/* Entrypoints */
function doGet(e)  { return out(handle(e, 'GET', e && e.parameter)); }
function doPost(e) { return out(handle(e, 'POST', e && e.parameter, e && e.postData)); }
function doOptions(e){ return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT); }

/* Router */
function handle(e, method, params, postData) {
  params = params || {};
  var action = (params.action || 'getall').toString().toLowerCase();
  var env = (params.env || DEFAULT_ENV).toString().toLowerCase();
  var sheetId = SHEET_MAP[env] || SHEET_MAP[DEFAULT_ENV];

  try {
    if (method === 'GET') {
      switch (action) {
        case 'getall':       return getAll(sheetId);
        case 'getcustomers': return { customers: readRows(sheetId, 'customers') };
        case 'getservices':  return { services:  readRows(sheetId, 'services') };
        case 'getinvoices':  return { invoices:  readRows(sheetId, 'invoices') };
        default:             return { error: 'unknown action' };
      }
    }

    if (method === 'POST') {
      var body = parseBody(postData, params);
      switch (action) {
        case 'savecustomer':    return saveCustomer(sheetId, body);
        case 'deletecustomer':  return deleteCustomer(sheetId, body);
        case 'saveinvoice':     return saveInvoice(sheetId, body);
        case 'saveservice':     return saveService(sheetId, body);
        case 'deleteservice':   return deleteService(sheetId, body);
        case 'savebusiness':    return saveBusiness(sheetId, body);
        case 'deletebusiness':  return deleteBusiness(sheetId, body);
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
  var raw = postData.contents;

  // Try JSON
  try {
    var parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : params || {};
  } catch (e) { /* fall through */ }

  // Fallback: parse urlencoded
  var out = Object.assign({}, params || {});
  if (raw && raw.indexOf('=') !== -1) {
    raw.split('&').forEach(function(kv){
      if (!kv) return;
      var parts = kv.split('=');
      var key = decodeURIComponent(parts.shift().replace(/\+/g,' '));
      var val = decodeURIComponent((parts.join('=') || '').replace(/\+/g,' '));
      out[key] = val;
    });
  }
  return out;
}

/* JSON response helper */
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj || {})).setMimeType(ContentService.MimeType.JSON);
}

/* Spreadsheet helpers that accept sheetId */
function getSS(sheetId) {
  return SpreadsheetApp.openById(sheetId);
}

function getSheetAsObjects(sheetId, sheetName) {
  return readRows(sheetId, sheetName);
}

function readRows(sheetId, sheetName) {
  var sh = getSS(sheetId).getSheetByName(sheetName);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function(h){ return h.toString().trim(); });
  return values.slice(1)
    .filter(function(r){ return r.some(function(c){ return c !== '' && c !== null; }); })
    .map(function(r){
      var obj = {};
      headers.forEach(function(h,i){
        var v = r[i];
        if ((h === 'items' || h === 'payments') && typeof v === 'string' && v.trim()) {
          try { v = JSON.parse(v); } catch(e) {}
        }
        obj[h] = v;
      });
      return obj;
    });
}

function writeRowFromObject(headers, rowObj) {
  return headers.map(function(h){
    var v = rowObj[h];
    if (h === 'items' || h === 'payments') return v ? JSON.stringify(v) : '[]';
    return (v !== undefined && v !== null) ? v : '';
  });
}

function appendRow(sheetId, sheetName, obj) {
  var sh = getSS(sheetId).getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(h){ return h.toString().trim(); });
  var row = writeRowFromObject(headers, obj);
  sh.appendRow(row);
  return true;
}

function updateRowById(sheetId, sheetName, id, obj) {
  var sh = getSS(sheetId).getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  var headers = values[0].map(function(h){ return h.toString().trim(); });
  for (var r = 1; r < values.length; r++) {
    if ((values[r][0] + '') === (id + '')) {
      var existingRow = values[r];
      var newRow = headers.map(function(h, idx){
        var v = Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : existingRow[idx];
        if (h === 'items' || h === 'payments') return v ? JSON.stringify(v) : '[]';
        return (v !== undefined && v !== null) ? v : existingRow[idx];
      });
      sh.getRange(r+1, 1, 1, newRow.length).setValues([newRow]);
      return true;
    }
  }
  return false;
}

/* Generic delete helper */
function deleteById(sheetId, sheetName, id) {
  if (!id) return { ok: false, error: 'id required' };
  var sh = getSS(sheetId).getSheetByName(sheetName);
  if (!sh) return { ok: false, error: sheetName + ' sheet missing' };
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: false, error: 'no rows' };
  var headers = values[0].map(function(h){ return h.toString().trim(); });
  var idIndex = headers.indexOf('id');
  if (idIndex === -1) return { ok: false, error: 'id column missing' };
  for (var i = 1; i < values.length; i++) {
    if ((values[i][idIndex] + '') === (id + '')) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'not found' };
}

/* ---------------- Domain actions ---------------- */

function getAll(sheetId) {
  return {
    businesses: readRows(sheetId, 'businesses'),
    services:   readRows(sheetId, 'services'),
    customers:  readRows(sheetId, 'customers'),
    invoices:   readRows(sheetId, 'invoices')
  };
}

/* saveInvoice: full logic preserved, but uses sheetId */
function saveInvoice(sheetId, inv) {
  if (!inv) throw new Error('no invoice body');
  inv = JSON.parse(JSON.stringify(inv)); // deep clone

  inv.items = Array.isArray(inv.items) ? inv.items : [];
  inv.payments = Array.isArray(inv.payments) ? inv.payments : [];

  var ss = getSS(sheetId);
  var sh = ss.getSheetByName("invoices");
  if (!sh) throw new Error('No "invoices" sheet found');

  var values = sh.getDataRange().getValues();
  if (values.length < 1) throw new Error('Invoices sheet missing header');
  var headers = values[0].map(function(h){ return h.toString().trim(); });
  var idIndex = headers.indexOf("id");
  var numIndex = headers.indexOf("invoice number"); // old header name

  if (idIndex < 0 || numIndex < 0) throw new Error('Invoices sheet missing required headers');

  // Normalize invoiceNumber fields
  if (inv.invoiceNumber && !inv["invoice number"]) inv["invoice number"] = inv.invoiceNumber;
  if (!inv.invoiceNumber && inv["invoice number"]) inv.invoiceNumber = inv["invoice number"];

  // CASE 1: New Invoice
  if (!inv.id) {
    inv.id = 'inv_' + Utilities.getUuid();
    inv.createdAt = new Date().toISOString();

    // Auto-generate invoice number if missing
    if (!inv.invoiceNumber) {
      var bizId = inv.businessId || (inv.business && inv.business.id) || null;
      var bizPrefix = 'INV';
      try {
        var businesses = getSheetAsObjects(sheetId, 'businesses');
        if (bizId) {
          var biz = businesses.find(function(b){ return b && (b.id + '') === (bizId + ''); });
          if (biz && biz.prefix) bizPrefix = (biz.prefix + '').toUpperCase();
        } else if (businesses && businesses.length && businesses[0].prefix) {
          bizPrefix = (businesses[0].prefix + '').toUpperCase();
        }
      } catch(e) {}

      var year = (new Date()).getFullYear().toString().slice(-2);
      var maxSeq = 0;
      for (var i = 1; i < values.length; i++) {
        var num = values[i][numIndex];
        if (typeof num === 'string' && num.indexOf(bizPrefix + '-' + year) === 0) {
          var parts = num.split('-');
          var seqPart = parts[parts.length - 1];
          var seq = parseInt(seqPart, 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      }
      var nextSeq = ('0000' + (maxSeq + 1)).slice(-4);
      inv.invoiceNumber = bizPrefix + '-' + year + '-' + nextSeq;
      inv["invoice number"] = inv.invoiceNumber;
    }

    var row = writeRowFromObject(headers, inv);
    sh.appendRow(row);
    return { ok: true, invoice: inv };
  }

  // CASE 2: Update existing
  var rowIdx = -1;
  for (var r = 1; r < values.length; r++) {
    if ((values[r][idIndex] + '') === (inv.id + '')) { rowIdx = r + 1; break; }
  }
  if (rowIdx === -1) throw new Error('Invoice not found: ' + inv.id);

  var existingRow = values[rowIdx - 1];
  var existingObj = {};
  headers.forEach(function(h,j){ existingObj[h] = existingRow[j]; });

  if (!inv.invoiceNumber && existingObj["invoice number"]) {
    inv.invoiceNumber = existingObj["invoice number"];
    inv["invoice number"] = inv.invoiceNumber;
  }

  inv.createdAt = existingObj["createdAt"] || new Date().toISOString();
  inv.payments = Array.isArray(inv.payments) ? inv.payments : [];
  inv.items = Array.isArray(inv.items) ? inv.items : [];

  var finalObj = {};
  headers.forEach(function(h){
    if (Object.prototype.hasOwnProperty.call(inv, h)) finalObj[h] = inv[h];
    else finalObj[h] = existingObj[h];
  });

  var newRow = writeRowFromObject(headers, finalObj);
  sh.getRange(rowIdx, 1, 1, newRow.length).setValues([newRow]);
  return { ok: true, invoice: finalObj };
}

/* Customers */
function saveCustomer(sheetId, cust) {
  if (!cust) throw new Error('no customer body');
  cust = JSON.parse(JSON.stringify(cust));
  if (!cust.id) {
    cust.id = 'cust_' + Utilities.getUuid();
    cust.createdAt = (new Date()).toISOString();
    appendRow(sheetId, 'customers', cust);
    return { ok: true, customer: cust };
  } else {
    var updated = updateRowById(sheetId, 'customers', cust.id, cust);
    return { ok: updated, customer: cust };
  }
}

function deleteCustomer(sheetId, body) {
  return deleteById(sheetId, 'customers', body && body.id);
}

/* Services */
function saveService(sheetId, svc) {
  if (!svc) throw new Error('no service body');
  svc = JSON.parse(JSON.stringify(svc));
  var sh = getSS(sheetId).getSheetByName("services");
  if (!sh) throw new Error('No "services" sheet found');

  var headers = sh.getDataRange().getValues()[0].map(function(h){ return h.toString().trim(); });
  var idIndex = headers.indexOf("id");
  var data = sh.getDataRange().getValues();
  var rowIndex = -1;
  if (idIndex >= 0) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIndex]) === String(svc.id)) { rowIndex = i + 1; break; }
    }
  }

  if (!svc.id) {
    svc.id = "svc_" + Utilities.getUuid();
    svc.createdAt = new Date().toISOString();
  }

  var row = headers.map(function(h){ return svc[h] || ""; });

  if (rowIndex === -1) sh.appendRow(row); else sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  return { ok: true, service: svc };
}

function deleteService(sheetId, body) {
  return deleteById(sheetId, 'services', body && body.id);
}

/* Businesses */
function saveBusiness(sheetId, biz) {
  if (!biz) throw new Error('no business body');
  biz = JSON.parse(JSON.stringify(biz));

  var sh = getSS(sheetId).getSheetByName("businesses");
  if (!sh) throw new Error('No "businesses" sheet found');

  var headers = sh.getDataRange().getValues()[0].map(function(h){ return h.toString().trim(); });

  if (!biz.id) {
    biz.id = 'biz_' + Utilities.getUuid();

    var values = sh.getDataRange().getValues();
    var codeColIndex = headers.indexOf("code");
    if (codeColIndex !== -1) {
      var nextNum = 1;
      if (values.length > 1) {
        var nums = values.slice(1).map(function(r){ return r[codeColIndex]; })
          .map(function(c){ return (typeof c === "string" && c.indexOf("BIZ-") === 0) ? parseInt(c.replace("BIZ-",""),10) : 0; })
          .filter(function(n){ return !isNaN(n) && n > 0; });
        if (nums.length) nextNum = Math.max.apply(null, nums) + 1;
      }
      biz.code = "BIZ-" + nextNum;
    }

    appendRow(sheetId, 'businesses', biz);
    return { ok: true, business: biz };
  } else {
    var updated = updateRowById(sheetId, 'businesses', biz.id, biz);
    return { ok: updated, business: biz };
  }
}

function deleteBusiness(sheetId, body) {
  return deleteById(sheetId, 'businesses', body && body.id);
}

/* End of script */
