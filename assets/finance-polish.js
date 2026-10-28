/* Finance Centre presentation only. No requests, calculations, permissions or action handlers. */
(function(){
 'use strict';
 const palette=['violet','teal','blue','amber','pink','orange','lime','sky','indigo'];
 const tabs={collections:['violet','<path d="M4 7h16v13H4zM8 7V4h8v3m-9 5h10m-10 4h6"/>'],ageing:['amber','<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],ledger:['teal','<path d="M4 4h16v16H4zM8 4v16m3-11h6m-6 4h6"/>'],'commission-settlement':['blue','<path d="M3 6h18v14H3zM3 10h18m-6 5h3M7 3v3m10-3v3"/>'],'business-comparison':['pink','<path d="M4 20V10h4v10m2 0V4h4v16m2 0v-7h4v7M2 20h20"/>'],reconciliation:['orange','<path d="m3 7 4-4 4 4M7 3v13m14 1-4 4-4-4m4 4V8"/>'],audit:['indigo','<path d="M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5"/>'],archive:['lime','<path d="M3 3h18v5H3zm2 5v13h14V8m-10 4h6"/>'],portal:['sky','<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>']};
 function icon(paths){const e=document.createElement('span');e.className='rs-fin-polish-icon';e.setAttribute('aria-hidden','true');e.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';return e;}
 function hash(value){let n=0;for(const c of String(value).toLowerCase())n=(n*31+c.charCodeAt(0))>>>0;return palette[n%palette.length];}
 function toneFor(text,index){
  const value=text.toLowerCase();
  const ageing={'not due':'teal','1–30':'blue','31–60':'amber','61–90':'orange','90+':'pink','no due date':'indigo'};
  if(ageing[value])return ageing[value];
  if(/received|credit|collected|not due/.test(value))return 'teal';
  if(/overdue|90\+|reversed/.test(value))return 'pink';
  if(/opening|31|61|debit/.test(value))return 'amber';
  return palette[index%palette.length];
 }
 function number(value){const n=Number(String(value).replace(/[^\d.\-]/g,''));return Number.isFinite(n)?n:null;}
 function kind(header){const h=header.toLowerCase().trim();
  if(/^business$/.test(h))return 'business';if(/^customer$/.test(h))return 'customer';
  if(/^(status|type|method|entity|ageing|phase)$/.test(h))return 'status';
  if(/change/.test(h))return 'change';
  if(/outstanding|balance|debit|credit|amount|earned|received|reversed|invoiced|collected|commission|prior comparable/.test(h))return 'amount';
  if(/^(invoice|matched invoice)$/.test(h))return 'reference';
  return '';
 }
 function cellTone(header,value,type){
  const h=header.toLowerCase(),v=value.toLowerCase(),n=number(value);
  if(type==='customer'||type==='business'||type==='reference')return hash(value);
  if(type==='change')return n===null?'blue':n<0?'pink':n>0?'teal':'blue';
  if(type==='amount'){
   if(/balance|outstanding/.test(h))return n===null?'blue':n>0?'pink':'teal';
   if(/reversed|debit/.test(h))return 'amber';if(/credit|received|collected/.test(h))return 'teal';return 'blue';
  }
  if(/^(unmatched|failed|error|overdue|90\+|cancelled|void|revoked)/.test(v))return 'pink';
  if(/^(matched|success|committed|paid|received|not due|accepted|active)/.test(v))return 'teal';
  if(/pending|prepared|partial|unpaid|unknown|expired|multiple/.test(v))return 'amber';return hash(value);
 }
 function tables(section){
  for(const table of section.querySelectorAll('#rsFinanceContent table')){
   const headers=Array.from(table.querySelectorAll('thead th')).map(x=>x.textContent);
   for(const row of table.querySelectorAll('tbody tr')){
    Array.from(row.cells).forEach((cell,index)=>{
     const type=kind(headers[index]||'');if(!type)return;
     const text=cell.textContent.trim();if(!text||text==='—')return;
     // Keep every existing action, link and complex cell subtree intact.
     if(cell.querySelector('button,a,input,select,pre,details'))return;
     if(cell.children.length){
      for(const span of cell.querySelectorAll('.rs-pill')){
       span.classList.add('rs-fin-value-pill');span.dataset.finTone=cellTone(headers[index],span.textContent,type);
      }
      return;
     }
     const span=document.createElement('span');span.className='rs-fin-value-pill';span.dataset.finTone=cellTone(headers[index],text,type);span.dataset.finKind=type;span.textContent=cell.textContent;cell.replaceChildren(span);
    });
   }
  }
 }
 function decorate(section){
  for(const button of section.querySelectorAll('#rsFinanceTabs button[data-report]')){
   const config=tabs[button.dataset.report];if(!config)continue;
   button.dataset.finTone=config[0];
   if(!button.querySelector('.rs-fin-polish-icon'))button.prepend(icon(config[1]));
  }
  let index=0;
  for(const card of section.querySelectorAll('#rsFinanceContent .rs-fin-kpi')){
   const label=Array.from(card.children).find(x=>x.tagName==='SPAN'&&!x.classList.contains('rs-fin-polish-icon'));
   card.dataset.finTone=toneFor(label?.textContent||'',index++);
   if(!card.querySelector('.rs-fin-polish-icon'))card.append(icon('<path d="M4 19V5m0 14h16M8 15l4-5 4 2 4-7"/>'));
  }
  for(const button of section.querySelectorAll('.rs-fin-actions button,.rs-fin-pagination button')){
   const label=button.textContent.toLowerCase();
   button.dataset.finTone=/revoke|disable|discard/.test(label)?'pink':/receipt|received|match|restore/.test(label)?'teal':/backup|back up|check/.test(label)?'amber':/view|print|next|previous/.test(label)?'blue':'violet';
  }
  for(const button of section.querySelectorAll('.rs-fin-portal-action'))button.dataset.finTone=hash(button.dataset.finCustomer||button.textContent);
  tables(section);
 }
 function init(){
  const section=document.getElementById('view-finance');if(!section)return;
  decorate(section);
  // Observe child content only. Attribute styling is intentionally excluded.
  let scheduled=false;
  const observer=new MutationObserver(()=>{
   if(scheduled)return;scheduled=true;
   queueMicrotask(()=>{scheduled=false;decorate(section);});
  });
  observer.observe(section,{childList:true,subtree:true,characterData:true});
  function clearance(){const footer=document.querySelector('.rs-site-footer'),style=footer&&getComputedStyle(footer);const fixed=style&&/^(fixed|sticky)$/.test(style.position)&&style.display!=='none';section.style.setProperty('--rs-fin-polish-clearance',(fixed?footer.getBoundingClientRect().height+28:28)+'px');}
  clearance();window.addEventListener('resize',clearance,{passive:true});
  if(window.ResizeObserver){const footer=document.querySelector('.rs-site-footer');if(footer)new ResizeObserver(clearance).observe(footer);}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
