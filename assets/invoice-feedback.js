/* Small, non-blocking status box for actual submissions; no fake progress percentage. */
(function(){
 'use strict';
 const active=new Map(),submissions=new Map();let serial=0;
 function node(tag,cls,text){const element=document.createElement(tag);element.className=cls||'';if(text)element.textContent=text;return element;}
 function update(){
  let box=document.getElementById('rsInvoiceSubmitProgress');
  if(!active.size){if(box)box.hidden=true;return;}
  if(!box){box=node('div','rs-mini-progress');box.id='rsInvoiceSubmitProgress';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.append(node('span','rs-mini-spinner'),node('div','rs-mini-copy'));document.body.append(box);}
  box.dataset.tone=Array.from(active.values()).pop().includes('payment')?'receipt':'invoice';box.hidden=false;const copy=box.querySelector('.rs-mini-copy');copy.replaceChildren(node('strong','',Array.from(active.values()).pop()+'…'),node('small','','Please wait for server confirmation.'));
 }
 window.rsInvoiceProgress=async function(label,operation){
  const id=++serial;active.set(id,label);update();
  try{const result=await operation();
   const invoices=result&&result.invoices||[result&&result.invoice].filter(Boolean);
   const states=invoices.map(inv=>{try{return typeof inv.whatsappStatus==='string'?JSON.parse(inv.whatsappStatus):inv.whatsappStatus}catch{return null}}).filter(Boolean);
   const status=document.getElementById('rsInvoiceAsyncStatus');
   if(status&&states.some(s=>s.state==='queued'||s.state==='queue_failed')){status.hidden=false;status.textContent=states.some(s=>s.state==='queue_failed')?'Saved. WhatsApp queue needs attention; check Apps Script diagnostics before sending again.':'Saved. WhatsApp notification queued; the background worker handles sending separately.';}
   return result;
  }finally{active.delete(id);update();}
 };
 // Paint the actual submission status before validation, network work and rerendering.
 // Duplicate clicks for the same action share one promise and never replay a write.
 window.rsInvoiceSubmit=function(key,label,operation){
  if(submissions.has(key))return submissions.get(key);
  const request=window.rsInvoiceProgress(label,async()=>{
   await new Promise(resolve=>{if(typeof requestAnimationFrame==='function')requestAnimationFrame(resolve);else setTimeout(resolve,0);});
   return operation();
  }).finally(()=>submissions.delete(key));
  submissions.set(key,request);return request;
 };
 window.rsInvoiceIsSubmitting=()=>submissions.size>0;
})();
