/* Invoice tools: read-only receipts/status/history, local draft copies and unsaved-form guards. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text!==undefined)e.textContent=String(text);return e;};
 const button=(text,fn,cls='')=>{const b=node('button','rs-tool-button '+cls,text);b.type='button';b.onclick=fn;return b;};
 const find=id=>(state.invoices||[]).find(i=>String(i.id)===String(id));
 const money=value=>'INR '+Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const label=invoice=>invoice.invoiceNumber||invoice['invoice number']||invoice.id;
 const snapshot=form=>JSON.stringify(Array.from(form?.querySelectorAll('input,select,textarea')||[]).map(e=>[e.id||e.className,e.type==='checkbox'?e.checked:e.value]));
 let createBaseline='',editBaseline='',createTouched=false,editTouched=false,previousBiz='',bypass=0,allowNavigation=false,sequence=0,overlay=null,returnFocus=null;
 const dirtyCreate=()=>!!window.rsInvoiceRetryPayload?.()||(createTouched&&snapshot($('invoiceForm'))!==createBaseline);
 window.rsInvoiceHasUnsavedEntries=dirtyCreate;
 const dirtyEdit=()=>!$('editInvoiceModal')?.classList.contains('hidden')&&editTouched&&snapshot($('rsEditInvoiceForm'))!==editBaseline;
 function approve(kind){if(bypass)return true;if(kind==='edit'&&typeof rsEditInvoiceSaving!=='undefined'&&rsEditInvoiceSaving||kind!=='edit'&&typeof rsInvoiceSaving!=='undefined'&&rsInvoiceSaving){showToast('Wait for the invoice submission result before leaving.','info');return false;}const dirty=kind==='edit'?dirtyEdit():dirtyCreate();if(!dirty)return true;return confirm(kind==='edit'?'This invoice has unsaved changes. Leave without saving these edits?':'This invoice has unsaved entries or an unconfirmed save. Leave this form? Review invoice history before starting another request.');}
 window.rsInvoiceMarkClean=function(kind){if(kind==='edit'){editBaseline=snapshot($('rsEditInvoiceForm'));editTouched=false;}else{createBaseline=snapshot($('invoiceForm'));createTouched=false;}};
 function close(){sequence++;if(overlay){overlay.remove();overlay=null;}document.body.classList.remove('rs-tools-open');if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
 function dialog(title,subtitle){
  if(!overlay)returnFocus=document.activeElement;else overlay.remove();const token=++sequence;
  overlay=node('div','fixed inset-0 rs-overlay rs-invoice-tools-dialog');overlay.id='rsInvoiceToolsModal';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','rsInvoiceToolsTitle');
  const card=node('section','rs-tools-card'),head=node('header','rs-tools-head'),copy=node('div');copy.append(node('span','rs-tools-eyebrow','INVOICE TOOLS'));const heading=node('h2','',title);heading.id='rsInvoiceToolsTitle';copy.append(heading,node('p','',subtitle||''));const exit=button('✕ Close',close);head.append(copy,exit);
  const body=node('div','rs-tools-body');card.append(head,body);overlay.append(card);document.body.append(overlay);document.body.classList.add('rs-tools-open');exit.focus({preventScroll:true});return {body,token};
 }
 const current=token=>overlay&&token===sequence;
 function error(body,message,retry){body.replaceChildren(node('p','rs-tools-error',message),button('Retry check',retry));}
 function note(body,text){body.append(node('p','rs-tools-note',text));}
 const stateInfo=value=>{
  let parsed=value;try{if(typeof parsed==='string')parsed=JSON.parse(parsed);}catch{parsed=null;}
  const key=parsed?.state,known={queued:['Queued','Waiting for the background worker. No send is confirmed.'],sending:['Sending','Worker submission is in progress. Delivery is not confirmed.'],accepted:['Accepted','The provider accepted the message. Delivery and read confirmation are unavailable.'],failed:['Failed','The provider rejected the request or preparation failed.'],queue_failed:['Queue failed','Invoice saved, but the notification could not be queued.'],skipped:['Not sent','The notification was skipped. Check phone and configuration.'],unknown:['Unknown','The send outcome is unconfirmed. Check provider history before resending.'],pending:['Unknown','Legacy/pending outcome is unconfirmed. Check provider history before resending.']};
  return {key:known[key]?(key==='pending'?'unknown':key):'unrecorded',label:known[key]?.[0]||'Not recorded',description:known[key]?.[1]||'No automatic notification status has been recorded.',reason:String(parsed?.reason||''),httpStatus:parsed?.httpStatus||'',checkedAt:parsed?.checkedAt||''};
 };
 window.rsInvoiceWhatsAppInfo=stateInfo;
 window.rsInvoiceWhatsAppBadge=function(invoice){const info=stateInfo(invoice.whatsappStatus),badge=button('WA · '+info.label,()=>window.rsOpenInvoiceStatus(invoice.id),'rs-wa-status');badge.dataset.state=info.key;badge.title='Automatic WhatsApp notification · click to refresh status';return badge;};
 window.rsOpenInvoiceStatus=async function(id){
  const {body,token}=dialog('WhatsApp status',label(find(id)||{id}));note(body,'Checking the recorded automatic notification status…');
  try{const result=await fetchServerData('invoicestatus',{invoiceId:id});if(!current(token))return;const invoice=find(id);if(invoice)invoice.whatsappStatus=result.whatsappStatus;
   const info=stateInfo(result.whatsappStatus),pill=node('span','rs-tools-pill',info.label);pill.dataset.state=info.key;body.replaceChildren(pill);note(body,info.description);if(info.reason)note(body,info.reason);if(info.httpStatus)note(body,'Provider HTTP status: '+info.httpStatus);if(info.checkedAt)note(body,'Last outcome recorded: '+info.checkedAt);body.append(button('Refresh status',()=>window.rsOpenInvoiceStatus(id)));note(body,'This status covers automatic invoice/payment notifications. No message is sent by this check.');renderInvoices();
  }catch(e){if(current(token))error(body,e.message,()=>window.rsOpenInvoiceStatus(id));}
 };
 window.rsOpenInvoiceTools=function(id){const invoice=find(id);if(!invoice)return;const {body}=dialog('Invoice tools',label(invoice));const admin=sessionStorage.getItem('role')==='admin';
  for(const [title,description,fn,allowed]of [
   ['Payment receipts','View confirmed recorded payments; download PDF or print.',()=>window.rsOpenInvoiceReceipts(id),true],
   ['WhatsApp status','Refresh the recorded automatic notification outcome.',()=>window.rsOpenInvoiceStatus(id),true],
   ['Activity history','Read existing audit records for this invoice.',()=>window.rsOpenInvoiceActivity(id),admin],
   ['Duplicate as new draft','Copy customer and line items. Payments and invoice number are not copied.',()=>{close();window.rsDuplicateInvoice(id);},admin]
  ]){const item=node('div','rs-tools-option'),action=button(title,fn);action.disabled=!allowed;item.append(action,node('p','',description+(allowed?'':' Administrator access required.')));body.append(item);}
 };
 function receiptData(invoice,payment,index){
  const customer=(state.customers||[]).find(c=>String(c.id)===String(invoice.customerId))||{},business=state.businesses[invoice.businessId]||{};
  return {business:business.name||'RanSan',customer:customer.name||'Not recorded',invoice:label(invoice),reference:payment.id||label(invoice)+' / payment '+(index+1),kind:payment.sourceAdvanceId?'Advance allocation record':'Payment receipt',date:rsInvoiceDay(payment.date)||'Not recorded',amount:payment.amount!==''&&payment.amount!==null&&payment.amount!==undefined&&Number.isFinite(Number(payment.amount))?money(payment.amount):'Not recorded',method:payment.method||'Not recorded',utr:payment.reference||payment.utr||'Not recorded',notes:payment.notes||payment.note||'',advance:!!payment.sourceAdvanceId};
 }
 window.rsInvoiceReceiptData=receiptData;
 function receiptRows(data){return [['Receipt reference',data.reference],['Invoice',data.invoice],['Customer',data.customer],['Recorded date',data.date],['Amount',data.amount],['Method',data.method],['Payment reference / UTR',data.utr],...(data.notes?[['Notes',data.notes]]:[])];}
 function pdf(data){
  const PDF=window.jspdf?.jsPDF;if(!PDF){showToast('PDF library is unavailable. Use Print / Save PDF.','info');return;}
  const doc=new PDF();doc.setFontSize(19);const businessLines=doc.splitTextToSize(data.business,170);doc.text(businessLines,20,22);const titleY=22+businessLines.length*7+8;doc.setFontSize(12);doc.text(data.kind,20,titleY);
  if(typeof doc.autoTable!=='function'){showToast('Receipt PDF table library is unavailable. Use Print / Save PDF.','info');return;}
  doc.autoTable({startY:titleY+10,head:[['Detail','Recorded value']],body:receiptRows(data),theme:'grid',styles:{fontSize:10,cellPadding:4,overflow:'linebreak'},headStyles:{fillColor:[15,118,110]},columnStyles:{0:{cellWidth:55}},margin:{left:20,right:20}});
  const footer=data.advance?'Allocation of an existing advance; this is not a second cash receipt.':'Confirms a payment entry recorded in RanSan. Bank clearance is not independently verified.';
  doc.setFontSize(9);const y=doc.lastAutoTable?.finalY||200;if(y>250)doc.addPage();doc.text(doc.splitTextToSize(footer,170),20,y>250?22:y+12);doc.save(('Receipt-'+data.invoice+'-'+data.reference).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,150)+'.pdf');
 }
 const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 window.rsInvoiceReceiptHTML=function(data){return '<!doctype html><html><head><meta charset="utf-8"><title>Payment receipt</title><style>body{font:14px Arial,sans-serif;color:#17263d;margin:35px}h1{color:#0f766e}table{width:100%;border-collapse:collapse}td{padding:12px;border-bottom:1px solid #dce5ed;overflow-wrap:anywhere}td:first-child{width:32%;color:#53657b}p{line-height:1.6}@media print{body{margin:15mm}}</style></head><body><h1>'+escape(data.business)+'</h1><h2>'+escape(data.kind)+'</h2><table>'+receiptRows(data).map(([k,v])=>'<tr><td>'+escape(k)+'</td><td>'+escape(v)+'</td></tr>').join('')+'</table><p>'+escape(data.advance?'Allocation of an existing advance; this is not a second cash receipt.':'Confirms a recorded payment entry. Bank clearance is not independently verified.')+'</p></body></html>';};
 function print(data){const frame=node('iframe','rs-receipt-print-frame');frame.title='Payment receipt print preview';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.onload=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};frame.srcdoc=window.rsInvoiceReceiptHTML(data);document.body.append(frame);setTimeout(()=>frame.remove(),120000);}
 window.rsOpenInvoiceReceipts=async function(id){
  const {body,token}=dialog('Payment receipts',label(find(id)||{id}));note(body,'Checking saved payment records…');
  try{const result=await fetchServerData('invoicecontext',{invoiceId:id});if(!current(token))return;const invoice=result.invoices?.find(i=>String(i.id)===String(id));if(!invoice)throw new Error('Invoice was not found.');body.replaceChildren();if(!(invoice.payments||[]).length){note(body,'No saved payment records for this invoice.');return;}
   invoice.payments.forEach((payment,index)=>{const data=receiptData(invoice,payment,index),card=node('section','rs-receipt-card');card.append(node('h3','',data.kind+' · '+data.amount));const list=node('dl','rs-receipt-details');receiptRows(data).forEach(([k,v])=>list.append(node('dt','',k),node('dd','',v)));const actions=node('div','rs-tools-actions');actions.append(button('Download PDF',()=>pdf(data),'rs-tool-primary'),button('Print / Save PDF',()=>print(data)));card.append(list,actions);if(data.advance)card.append(node('p','rs-tools-note','Existing advance allocation; no new receipt of money is implied.'));body.append(card);});
   note(body,'Receipts use saved payment entries. Missing dates and UTRs are shown as Not recorded.');
  }catch(e){if(current(token))error(body,e.message,()=>window.rsOpenInvoiceReceipts(id));}
 };
 window.rsOpenInvoiceActivity=async function(id){
  if(sessionStorage.getItem('role')!=='admin'){showToast('Administrator access is required for invoice audit history.','error');return;}
  const {body,token}=dialog('Invoice activity',label(find(id)||{id})),list=node('div','rs-activity-list'),status=node('p','rs-tools-note'),older=button('Load older records',()=>load());body.append(status,list,older);const seen=new Set();let cursor=null,loading=false;
  async function load(){if(loading)return;loading=true;older.disabled=true;status.textContent='Checking audit records…';try{const result=await fetchServerData('invoiceactivity',{invoiceId:id,cursor});if(!current(token))return;
    for(const row of result.rows||[]){if(seen.has(row.id))continue;seen.add(row.id);const item=node('article','rs-activity-item'),phase=node('span','rs-tools-pill',row.phase==='prepared'?'Attempt started':row.phase==='committed'?'Saved':row.phase==='failed'?'Failed':row.phase);phase.dataset.state=row.phase;item.append(phase,node('strong','',row.action),node('p','',row.detail),node('small','',row.date+' · '+row.actor));list.append(item);}
    cursor=result.nextCursor;older.textContent='Load older records';older.hidden=cursor===null;status.textContent=(seen.size?seen.size+' matching audit entries loaded. ':'No matching entries in the scanned range. ')+(cursor!==null?'Load older records to continue searching.':'End of available audit records.');
   }catch(e){if(current(token)){status.textContent=e.message;older.hidden=false;older.textContent='Retry activity check';}}finally{loading=false;if(current(token))older.disabled=false;}
  }await load();
 };
 window.rsSetInvoiceRowTax=function(row,value){const tax=Number(value)||0;row.dataset.copyTax=String(tax);let field=row.querySelector('.rs-copy-tax');if(!tax&&!field)return;
  if(!field){const wrap=node('label','rs-copy-tax-field','Tax % ');field=node('input','rs-copy-tax');field.type='number';field.min='0';field.step='any';field.setAttribute('aria-label','Copied line tax percent');field.addEventListener('input',()=>{row.dataset.copyTax=field.value;recalcTotals();});wrap.append(field);row.querySelector('.desc').parentElement.append(wrap);}field.value=String(tax);
 };
 window.rsInvoiceCopyDraft=function(invoice){const customer=(state.customers||[]).find(c=>String(c.id)===String(invoice.customerId)),today=rsCalendarDate(new Date());let due='';if(customer&&Number.isFinite(Number(customer.creditDays))&&Number(customer.creditDays)>=0){const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+Number(customer.creditDays));due=day.toISOString().slice(0,10);}
  return {fields:{invCustomer:String(invoice.customerId),invDate:today,invDue:due,invNotes:invoice.notes||'',discount:invoice.discount||0,invCommission:0,asCredit:false,takePaymentNow:false,rsPaymentAmount:'',rsPaymentReference:'',rsPaymentReceipt:''},rows:(invoice.items||[]).map(item=>({serv:String(item.serviceId||''),desc:String(item.desc||''),qty:String(item.qty??1),rate:String(item.rate??0),tax:String(item.tax||0)}))};
 };
 window.rsDuplicateInvoice=function(id){try{
  if(sessionStorage.getItem('role')!=='admin')throw new Error('Administrator access is required to create an invoice.');const invoice=find(id);if(!invoice)throw new Error('Invoice not found.');
  if(typeof window.rsLoadInvoiceDraft!=='function'||typeof window.rsInvoiceDraftState!=='function')throw new Error('The updated workspace.js is not loaded. Refresh the page before copying.');
  if(!(state.customers||[]).some(customer=>String(customer.id)===String(invoice.customerId)&&String(customer.businessId)===String(invoice.businessId)))throw new Error('The source customer is unavailable. Review the customer record before copying.');
  if((invoice.items||[]).some(item=>!Number.isFinite(Number(item.qty))||Number(item.qty)<=0||!Number.isFinite(Number(item.rate))||Number(item.rate)<0||!Number.isFinite(Number(item.tax||0))||Number(item.tax||0)<0))throw new Error('Review invalid source quantities, prices or tax before copying.');
  const targetDraft=window.rsInvoiceDraftForBusiness?.(String(invoice.businessId));
  if(window.rsInvoiceDraftState?.().pending||targetDraft?.pending)throw new Error('Resolve the unconfirmed invoice save in the current/source business before duplicating another invoice.');
  if(!Number.isFinite(Number(invoice.discount||0))||Number(invoice.discount||0)<0)throw new Error('Review the source discount before copying.');
  const services=Array.isArray(state.services)?state.services:Object.values(state.services||{});if(!(invoice.items||[]).length||invoice.items.some(item=>!services.some(service=>String(service.id)===String(item.serviceId)&&String(service.businessId)===String(invoice.businessId))))throw new Error('A source service is unavailable. Review or restore the service before copying this invoice.');
  if(!Array.from($('bizSelect').options).some(option=>String(option.value)===String(invoice.businessId)))throw new Error('The source business is unavailable.');
  if(!approve('create'))return;if(targetDraft?.exists&&String($('bizSelect').value)!==String(invoice.businessId)&&!confirm('The source business already has a saved local draft. Replace that draft with this copy?'))return;if(window.rsInvoiceDraftState?.().offered&&!confirm('Replace the saved local draft with this invoice copy?'))return;
  const draft=window.rsInvoiceCopyDraft(invoice);window.rsInvoicePersistDraft?.();bypass++;try{$('bizSelect').value=String(invoice.businessId);$('bizSelect').dispatchEvent(new Event('change',{bubbles:true}));showView('invoices');window.rsLoadInvoiceDraft(draft.fields,draft.rows);}finally{bypass--;}
  createTouched=true;$('invoiceForm').scrollIntoView({behavior:'smooth',block:'start'});showToast('New draft copied. Review dates, prices and tax, then Save to receive a new invoice number. Payments were not copied.','success');
 }catch(e){showToast(e.message,'error');}};
 function init(){
  if(!$('invoiceForm'))return;previousBiz=$('bizSelect').value;window.rsInvoiceMarkClean('create');
  for(const event of ['pointerdown','focusin'])$('bizSelect').addEventListener(event,()=>{previousBiz=$('bizSelect').value;},{passive:true});
  for(const event of ['input','change'])document.addEventListener(event,e=>{if(e.target.closest('#invoiceForm'))createTouched=true;if(e.target.closest('#rsEditInvoiceForm'))editTouched=true;},true);
  document.addEventListener('click',e=>{const createAction=!!e.target.closest('#rsRestoreDraft,#itemBody button,[onclick*="addItemRow"]'),editAction=!!e.target.closest('#editItemBody button,[onclick*="addEditItemRow"]');if(createAction||editAction)queueMicrotask(()=>{if(createAction)createTouched=true;if(editAction)editTouched=true;});},true);
  if(typeof MutationObserver!=='undefined'){const rows=$('itemBody'),editRows=$('editItemBody');if(rows)new MutationObserver(()=>{if(snapshot($('invoiceForm'))!==createBaseline)createTouched=true;}).observe(rows,{childList:true});if(editRows)new MutationObserver(()=>{if(snapshot($('rsEditInvoiceForm'))!==editBaseline)editTouched=true;}).observe(editRows,{childList:true});}
  window.addEventListener('beforeunload',event=>{if(!allowNavigation&&(dirtyCreate()||dirtyEdit())){window.rsInvoicePersistDraft?.();event.preventDefault();event.returnValue='';}});
  const baseOpen=openEditInvoice;window.openEditInvoice=function(){if(!approve('edit'))return false;const result=baseOpen.apply(this,arguments);window.rsInvoiceMarkClean('edit');return result;};
  const baseClose=closeEditInvoice;window.closeEditInvoice=function(){if(!approve('edit'))return false;return baseClose.apply(this,arguments);};
  const baseReset=resetInvoiceForm;window.resetInvoiceForm=function(){if(!approve('create'))return false;const result=baseReset.apply(this,arguments);window.rsInvoiceMarkClean('create');return result;};
  const succeeded=window.rsInvoiceSucceeded;window.rsInvoiceSucceeded=function(){window.rsInvoiceMarkClean('create');bypass++;try{return succeeded.apply(this,arguments);}finally{bypass--;window.rsInvoiceMarkClean('create');}};
  const baseView=window.showView;window.showView=function(name){if(name!=='invoices'&&!$('view-invoices').classList.contains('hidden')){if(!approve('create')||!approve('edit'))return false;window.rsInvoicePersistDraft?.();}return baseView.apply(this,arguments);};
  $('bizSelect').addEventListener('change',event=>{const next=$('bizSelect').value,wasBypassed=bypass>0;if(!bypass){$('bizSelect').value=previousBiz;if(!approve('create')||!approve('edit')){event.stopImmediatePropagation();event.preventDefault();return;}window.rsInvoicePersistDraft?.();$('bizSelect').value=next;}previousBiz=next;queueMicrotask(()=>{if(!wasBypassed)window.rsInvoiceMarkClean('create');});},true);
  const logout=window.rsLogout;window.rsLogout=function(options={}){if(!options.stayOnPage){if(!approve('create')||!approve('edit'))return Promise.resolve(false);window.rsInvoicePersistDraft?.();allowNavigation=true;}return logout.apply(this,arguments);};
  window.addEventListener('rs:data-loaded',()=>{if(!createTouched){previousBiz=$('bizSelect').value;window.rsInvoiceMarkClean('create');}});
  document.addEventListener('keydown',event=>{if(!overlay)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}else if(event.key==='Tab'){const controls=Array.from(overlay.querySelectorAll('button,a,input,select,textarea')).filter(e=>!e.disabled&&!e.hidden);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}},true);
  renderInvoices();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
