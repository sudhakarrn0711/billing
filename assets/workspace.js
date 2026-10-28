/* v2 workspace: scoped local drafts, exact retry payloads, header sizing. */
(function(){
'use strict';
const el=id=>document.getElementById(id);let pending=null,paused=false,timer,offered=null;
const key=(businessId=el('bizSelect')?.value||'all')=>['ransan-invoice-v2',getBillingEnv(),sessionStorage.getItem('username')||'user',businessId].join(':');
function status(text){el('rsDraftText').textContent=text;el('rsDraftBar').hidden=false}
function read(){try{return JSON.parse(localStorage.getItem(key())||'null')}catch{return null}}
function write(data){try{localStorage.setItem(key(),JSON.stringify(data));return true}catch{status('Draft could not be stored on this device. Keep this page open.');return false}}
function snapshot(){const fields={};el('invoiceForm').querySelectorAll('input[id],select[id],textarea[id]').forEach(x=>fields[x.id]=x.type==='checkbox'?x.checked:x.value);const rows=Array.from(document.querySelectorAll('#itemBody tr')).map(tr=>Object.fromEntries(['serv','desc','qty','rate','tax'].map(c=>[c,c==='tax'?(tr.dataset.copyTax||'0'):(tr.querySelector('.'+c)?.value||'')])));return {fields,rows}}
function showOffer(){offered=read();if(offered){status(offered.pending?'Unconfirmed save found. Restore it and retry to check the same invoice.':'A saved draft is available for this business.');el('rsRestoreDraft').hidden=false;el('rsDiscardDraft').hidden=false}else el('rsDraftBar').hidden=true}
function persist(){if(paused||!el('invoiceForm'))return;if(offered&&!pending)return;const form=snapshot();if(!pending&&!form.rows.length&&!form.fields.invNotes)return;const data={version:2,time:new Date().toISOString(),form,pending};if(write(data)){status(pending?'Save unconfirmed. Retry Save to check the same invoice; reset only to start a different invoice.':'Draft saved on this device · '+new Date().toLocaleTimeString());el('rsRestoreDraft').hidden=true;el('rsDiscardDraft').hidden=false}}
function syncPayment(){const meta=el('rsPaymentMeta');if(meta)meta.hidden=!el('takePaymentNow').checked;el('rsPaymentFields').hidden=!el('takePaymentNow').checked;el('rsPaymentAmount').required=el('takePaymentNow').checked;el('rsPaymentAmount').disabled=!el('takePaymentNow').checked;el('rsPaymentMethod').disabled=!el('takePaymentNow').checked}
function freeze(on){el('invoiceForm').querySelectorAll('input,select,textarea,button').forEach(x=>{if(x.closest('#rsDraftBar')||x.type==='submit')return;if(on){x.dataset.rsWasDisabled=String(x.disabled);x.disabled=true}else if('rsWasDisabled' in x.dataset){x.disabled=x.dataset.rsWasDisabled==='true';delete x.dataset.rsWasDisabled}});if(!on)syncPayment()}
window.rsPrepareInvoice=function(inv){if(offered)throw new Error('Restore or discard the existing draft before saving.');if(pending)return JSON.parse(JSON.stringify(pending));inv.requestId=crypto.randomUUID();pending=JSON.parse(JSON.stringify(inv));persist();freeze(true);return inv};
window.rsInvoiceRetryPayload=()=>pending?JSON.parse(JSON.stringify(pending)):null;
window.rsInvoiceDraftState=()=>({pending:!!(pending||offered?.pending),offered:!!offered});
window.rsInvoiceDraftForBusiness=function(businessId){try{const draft=JSON.parse(localStorage.getItem(key(businessId))||'null');return {exists:!!draft,pending:!!draft?.pending};}catch{return {exists:false,pending:false};}};
window.rsInvoicePersistDraft=persist;
window.rsLoadInvoiceDraft=function(fields,rows){
 if(pending||offered?.pending)throw new Error('Resolve the unconfirmed invoice save before duplicating another invoice.');
 paused=true;clearTimeout(timer);pending=null;offered=null;
 try{freeze(false);originalReset();el('itemBody').replaceChildren();
  for(const row of rows){addItemRow(row.serv);const tr=el('itemBody').lastElementChild;for(const c of ['serv','desc','qty','rate'])tr.querySelector('.'+c).value=row[c];window.rsSetInvoiceRowTax?.(tr,row.tax||0);}
  for(const [id,value]of Object.entries(fields)){const control=el(id);if(control){if(control.type==='checkbox')control.checked=!!value;else control.value=value;}}
  recalcTotals();syncPayment();
 }finally{paused=false;}persist();
};
window.rsInvoiceSucceeded=function(inv){paused=true;clearTimeout(timer);pending=null;offered=null;try{localStorage.removeItem(key())}catch{}freeze(false);resetInvoiceForm();el('rsDraftBar').hidden=true;window.rsDeliveryStatus(inv.whatsappStatus);paused=false};
window.rsDeliveryStatus=function(value){let v=value;try{if(typeof v==='string')v=JSON.parse(v)}catch{v=null}const box=el('rsDelivery');box.hidden=false;box.dataset.state=v?.state||'unknown';const labels={accepted:'WhatsApp: provider accepted the message. Delivery/read confirmation is unavailable.',failed:'WhatsApp: provider rejected the request. Invoice is saved.',skipped:'WhatsApp: not sent — customer phone or configuration is missing.',queued:'WhatsApp: queued for the background worker. Not sent yet.',sending:'WhatsApp: submission in progress. Delivery is not confirmed.',queue_failed:'WhatsApp: notification could not be queued. Invoice is saved; check diagnostics.',pending:'WhatsApp: send outcome is unconfirmed. Check the provider before resending.',unknown:'WhatsApp: outcome is unconfirmed. Check the provider before resending.'};box.textContent=labels[v?.state]||'WhatsApp: status unavailable. Deploy the updated Apps Script backend to enable status reporting.'};
const originalReset=resetInvoiceForm;
function clearDraft(){paused=true;clearTimeout(timer);pending=null;offered=null;try{localStorage.removeItem(key())}catch{}freeze(false);originalReset();el('rsPaymentAmount').value='';el('rsPaymentMethod').value='Cash';syncPayment();el('rsDraftBar').hidden=true;paused=false;}
let resetPending=false;
resetInvoiceForm=function(){
 if(!paused&&(pending||offered?.pending)&&!window.rsInvoiceResetApproved){
  if(resetPending)return false;
  if(typeof window.rsInvoiceConfirm!=='function'){showToast('Reload the page to load the confirmation dialog.','error');return false;}
  const originalKey=key(),originalRequest=JSON.stringify(pending||offered);resetPending=true;
  return window.rsInvoiceConfirm({title:'Reset an unconfirmed invoice?',message:'Check invoice history first. Resetting removes the local retry request and does not undo a saved invoice.',danger:true,confirmLabel:'Reset draft',cancelLabel:'Keep draft',requireAcknowledgement:true}).then(ok=>{if(!ok)return false;if(key()!==originalKey||JSON.stringify(pending||offered)!==originalRequest||window.rsInvoiceIsSubmitting?.()){showToast('The draft changed. Review it before resetting.','warning');return false;}return clearDraft();}).finally(()=>{resetPending=false;});
 }
 return clearDraft();
};

function init(){const header=document.querySelector('body>header');if(header){const measure=()=>document.documentElement.style.setProperty('--rs-header-height',header.getBoundingClientRect().height+'px');new ResizeObserver(measure).observe(header);measure()}
 const form=el('invoiceForm');if(!form)return;syncPayment();showOffer();
 form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(persist,500)});form.addEventListener('change',()=>{syncPayment();persist()});new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(persist,500)}).observe(el('itemBody'),{childList:true});window.addEventListener('pagehide',persist);
 el('rsRestoreDraft').onclick=()=>{const data=read();if(!data)return;if(data.form.fields.invCustomer&&!Array.from(el('invCustomer').options).some(o=>o.value===data.form.fields.invCustomer)){status('Wait for customer data to load, then restore this draft.');return}paused=true;pending=data.pending||null;offered=null;el('itemBody').innerHTML='';for(const row of data.form.rows){addItemRow(row.serv);const tr=el('itemBody').lastElementChild;window.rsSetInvoiceRowTax?.(tr,row.tax||0);for(const c of ['serv','desc','qty','rate']){const x=tr.querySelector('.'+c);if(x)x.value=row[c]}}for(const [id,value]of Object.entries(data.form.fields)){const x=el(id);if(x){if(x.type==='checkbox')x.checked=!!value;else x.value=value}}recalcTotals();syncPayment();freeze(!!pending);paused=false;persist()};
 el('rsDiscardDraft').onclick=async()=>{
  if(typeof rsInvoiceSaving!=='undefined'&&rsInvoiceSaving){showToast('Wait for the invoice save result before discarding.','info');return;}
  const originalKey=key(),unconfirmed=!!(pending||offered?.pending);
  if(typeof window.rsInvoiceConfirm!=='function'){showToast('Refresh the page to load the confirmation dialog.','error');return;}
  const approved=await window.rsInvoiceConfirm({title:unconfirmed?'Review unconfirmed save':'Discard saved draft?',message:unconfirmed?'This invoice save has not been confirmed. Check invoice history first. Discarding removes the local retry request and does not undo an invoice already saved on the server.':'Remove this saved draft from this device and clear the invoice form? No saved invoice or payment will be deleted.',confirmLabel:'Discard draft',cancelLabel:'Keep draft',danger:true,requireAcknowledgement:unconfirmed});
  if(!approved)return;if(key()!==originalKey||typeof rsInvoiceSaving!=='undefined'&&rsInvoiceSaving){showToast('The workspace changed. Review the draft before discarding.','warning');return;}
  paused=true;try{clearTimeout(timer);localStorage.removeItem(originalKey);pending=null;offered=null;freeze(false);originalReset();el('rsPaymentAmount').value='';el('rsPaymentMethod').value='Cash';syncPayment();el('rsDraftBar').hidden=true;window.rsInvoiceMarkClean?.('create');showToast('Local draft discarded. Saved invoices and payments are unchanged.','success');}catch(error){showToast('Draft could not be discarded: '+error.message,'error');}finally{paused=false;}
 };
 el('bizSelect').addEventListener('change',()=>{pending=null;offered=null;freeze(false);originalReset();syncPayment();showOffer()});
 const observer=new MutationObserver(()=>{for(const [button,panel]of [['notifBtn','notifPanel'],['profileBtn','profileMenu']])el(button)?.setAttribute('aria-expanded',String(!el(panel)?.classList.contains('hidden')))});for(const id of ['notifPanel','profileMenu'])observer.observe(el(id),{attributes:true,attributeFilter:['class']});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){el('notifPanel').classList.add('hidden');el('profileMenu').classList.add('hidden')}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
