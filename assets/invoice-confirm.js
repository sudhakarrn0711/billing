/* Promise-based confirmations for deliberate invoice draft actions. */
(function(){
 'use strict';let active=null;
 window.rsInvoiceConfirm=function(options={}){
  if(active)return Promise.resolve(false);
  return new Promise(resolve=>{
   const previous=document.activeElement,overlay=document.createElement('div');overlay.className='rs-confirm-overlay';overlay.id='rsInvoiceConfirmModal';overlay.setAttribute('role','alertdialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','rsConfirmTitle');overlay.setAttribute('aria-describedby','rsConfirmDescription');
   const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e;};
   const card=node('section','rs-confirm-card'),icon=node('span','rs-confirm-icon',options.danger?'!':'↗'),title=node('h2','',options.title||'Review this action');title.id='rsConfirmTitle';
   const copy=node('p','',options.message||'');copy.id='rsConfirmDescription';const actions=node('div','rs-confirm-actions'),cancel=node('button','rs-confirm-cancel',options.cancelLabel||'Keep editing'),approve=node('button','rs-confirm-approve',options.confirmLabel||'Continue');cancel.type=approve.type='button';overlay.dataset.tone=options.danger?'danger':'copy';card.append(icon,title,copy);
   const paymentLabels=new Set((options.paymentDetails||[]).map(row=>row[0]));
   if(options.paymentDetails?.length){const section=node('section','rs-confirm-payment-card'),heading=node('h3','','Payment being recorded'),list=node('dl','rs-confirm-payment-details');for(const [label,value]of options.paymentDetails)list.append(node('dt','',label),node('dd','',String(value??'Not recorded')));section.append(heading,list);card.append(section);}
   if(options.details?.length){const list=node('dl','rs-confirm-details');for(const [label,value]of options.details){if(paymentLabels.has(label))continue;list.append(node('dt','',label),node('dd','',String(value??'Not recorded')));}card.append(list);}
   let acknowledgement=null;if(options.requireAcknowledgement){const label=node('label','rs-confirm-ack'),check=node('input','');check.type='checkbox';label.append(check,node('span','','I checked invoice history for this unconfirmed save.'));acknowledgement=check;approve.disabled=true;check.onchange=()=>approve.disabled=!check.checked;card.append(label);}
   actions.append(cancel,approve);card.append(actions);overlay.append(card);
   const siblings=Array.from(document.body.children).map(el=>({el,inert:el.inert}));siblings.forEach(({el})=>el.inert=true);document.body.append(overlay);const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';active=overlay;
   function finish(answer){if(active!==overlay)return;active=null;document.removeEventListener('keydown',keydown,true);overlay.remove();siblings.forEach(({el,inert})=>el.inert=inert);document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus();resolve(answer);}
   function keydown(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);}else if(event.key==='Tab'){const controls=[...(acknowledgement?[acknowledgement]:[]),cancel,...(!approve.disabled?[approve]:[])],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}
   cancel.onclick=()=>finish(false);approve.onclick=()=>{if(!approve.disabled)finish(true);};overlay.onclick=event=>{if(event.target===overlay)finish(false);};document.addEventListener('keydown',keydown,true);cancel.focus();
  });
 };
})();
