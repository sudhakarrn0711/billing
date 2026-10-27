/* RanSan Needs Attention — read-only additions to the existing dashboard. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(value)||0);
  const cents=value=>Math.round((Number(value)||0)*100);
  const config={approachingPercent:80,...window.RS_DASHBOARD_ATTENTION_CONFIG};
  const threshold=Number(config.approachingPercent)>0&&Number(config.approachingPercent)<=100?Number(config.approachingPercent):80;
  let queued=false,lastScope=null,hadAlerts=false,navigation=0;
  const day=value=>window.rsDashboardDay?rsDashboardDay(value):'';

  /* Separate pure model: no modifications to source records or existing totals. */
  function build(model, approaching=threshold) {
    const buckets=[{label:'1–30 days',amount:0,count:0},{label:'31–60 days',amount:0,count:0},{label:'61–90 days',amount:0,count:0},{label:'90+ days',amount:0,count:0}];
    const quality=[],references=new Map(),invoiceIds=new Set();
    const balanceByCustomer=new Map();
    function issue(kind,label,inv,index,extra={}) {
      const invoiceId=String(inv.id??'row-'+index);
      invoiceIds.add(invoiceId);
      quality.push({kind,label,invoiceId:inv.id,invoiceLabel:inv.invoiceNumber||inv['invoice number']||invoiceId,customerId:inv.customerId,businessId:inv.businessId,...extra});
    }
    model.invoices.forEach((inv,index)=>{
      const balance=Math.max(0,cents(model.outstanding(inv))),due=day(inv.dueDate||inv.due);
      balanceByCustomer.set(String(inv.customerId),(balanceByCustomer.get(String(inv.customerId))||0)+balance);
      if(balance>0&&!due)issue('due','Unpaid invoice has a missing or invalid due date',inv,index);
      if(balance>0&&due&&due<model.today){
        const late=Math.round((Date.parse(model.today+'T12:00:00Z')-Date.parse(due+'T12:00:00Z'))/86400000);
        const bucket=buckets[late<=30?0:late<=60?1:late<=90?2:3];bucket.amount+=balance;bucket.count++;
      }
      const payments=Array.isArray(inv.payments)?inv.payments:[];
      if(!payments.length&&Number(inv.paid)>0)issue('date','Legacy paid amount has no dated payment entries',inv,index);
      payments.forEach((p,paymentIndex)=>{
        if(!(Number(p.amount)>0))return;
        if(!day(p.date))issue('date','Payment '+(paymentIndex+1)+' has a missing or invalid date',inv,index,{paymentIndex});
        if(p.sourceAdvanceId)return; // Advance allocation is not a second cash receipt.
        const method=String(p.method||'').trim().toLowerCase();
        const reference=String(p.reference||p.utr||'').trim();
        if(method&&method!=='cash'&&!reference)issue('reference','Non-cash payment '+(paymentIndex+1)+' has no reference to review',inv,index,{paymentIndex});
        if(reference){
          const key=[String(inv.businessId),method,reference.toLowerCase()].join('|');
          if(!references.has(key))references.set(key,[]);
          references.get(key).push({inv,index,paymentIndex,reference});
        }
      });
    });
    references.forEach(rows=>{
      if(rows.length<2)return;
      rows.forEach(row=>issue('duplicate','Repeated reference '+row.reference+' ('+rows.length+' payment entries; review before treating as a duplicate)',row.inv,row.index,{paymentIndex:row.paymentIndex}));
    });
    const credits=model.customers.map(c=>{
      const limit=cents(c.creditLimit),used=balanceByCustomer.get(String(c.id))||0;
      return {id:c.id,name:c.name||String(c.id),limit:limit/100,used:used/100,percent:limit>0?used/limit*100:0,excess:Math.max(0,used-limit)/100};
    }).filter(c=>c.limit>0&&c.percent>=approaching).sort((a,b)=>b.excess-a.excess||b.percent-a.percent);
    buckets.forEach(b=>b.amount/=100);
    return {buckets,overdueTotal:buckets.reduce((s,b)=>s+cents(b.amount),0)/100,overdueCount:buckets.reduce((s,b)=>s+b.count,0),credits,excessTotal:credits.reduce((s,c)=>s+cents(c.excess),0)/100,quality,qualityInvoices:invoiceIds.size,threshold:approaching};
  }
  window.rsBuildDashboardAttention=build;

  function element(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
  function button(label,fn,enabled=true){const b=element('button','rs-attention-button',label);b.type='button';b.disabled=!enabled;b.onclick=fn;return b;}
  function can(menu){
    const role=String(sessionStorage.getItem('role')||'').toLowerCase();
    const access=String(sessionStorage.getItem('access')||'').split(',').map(s=>s.trim());
    return role==='admin'||access.includes('all')||access.includes(menu);
  }
  function status(text){const host=$('rsAttentionStatus');if(host)host.textContent=text;}
  function selectValue(select,value){if(!select)return false;value=String(value??'');if(!Array.from(select.options).some(o=>o.value===value))return false;select.value=value;return true;}
  async function openFinance(menu,customerId='') {
    if(!can(menu)||typeof window.showView!=='function'){status('You do not have access to this report.');return;}
    const generation=++navigation;
    const business=String($('bizSelect')?.value||'all');
    window.showView(menu);
    const targetBusiness=business.toLowerCase()==='all'?'':business;
    const ready=()=>{
      const b=$('rsFinBusiness'),c=$('rsFinCustomer'),tab=document.querySelector('#rsFinanceTabs [data-report="'+menu+'"]');
      return b&&c&&(!tab||tab.getAttribute('aria-selected')==='true')&&Array.from(b.options).some(o=>o.value===targetBusiness)&&Array.from(c.options).some(o=>o.value===String(customerId));
    };
    if(!ready())await new Promise(resolve=>{
      const panel=$('view-finance');if(!panel){resolve();return;}
      let timer;
      const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timer);resolve();}});
      observer.observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-selected','class']});
      timer=setTimeout(()=>{observer.disconnect();resolve();},8000);
    });
    if(generation!==navigation||String($('bizSelect')?.value||'all')!==business)return;
    const panel=$('view-finance'),tab=document.querySelector('#rsFinanceTabs [data-report="'+menu+'"]');
    if(panel?.classList.contains('hidden')||(tab&&tab.getAttribute('aria-selected')!=='true'))return;
    if(!ready()){status('Report opened. Its filters are still loading; choose the business/customer in the report.');return;}
    selectValue($('rsFinBusiness'),targetBusiness);selectValue($('rsFinCustomer'),customerId);
    if($('rsFinFrom'))$('rsFinFrom').value='';
    if($('rsFinTo'))$('rsFinTo').value=rsDashboardLocalDay();
    $('rsFinApply')?.click();
  }
  function openLedger(customerId){
    if(can('ledger'))return openFinance('ledger',customerId);
    if(can('customerLedger')&&typeof window.showView==='function'){
      window.showView('customerLedger');
      const select=$('ledgerCustomerFilter');
      if(selectValue(select,customerId))select.dispatchEvent(new Event('change',{bubbles:true}));
      if(typeof window.renderCustomerLedger==='function')window.renderCustomerLedger(customerId);
    }else status('You do not have access to the customer ledger.');
  }
  function dialog(title){
    let d=$('rsAttentionDialog');
    if(!d){d=element('dialog','rs-attention-dialog');d.id='rsAttentionDialog';document.body.append(d);}
    if(d.open)d.close();d.replaceChildren();d.setAttribute('aria-labelledby','rsAttentionDialogTitle');
    const head=element('div','rs-attention-dialog-head'),h=element('h2','',title);h.id='rsAttentionDialogTitle';
    head.append(h,button('Close',()=>d.close()));d.append(head);
    const body=element('div','rs-attention-dialog-body');d.append(body);return {d,body};
  }
  function showCreditRows(data){
    const {d,body}=dialog('Credit Limit Alerts');
    body.append(element('p','rs-attention-note','Approaching: '+data.threshold+'% or more. Amounts use the selected business scope and each customer’s existing credit limit.'));
    for(const c of data.credits){
      const row=element('article','rs-attention-detail-row');
      row.append(element('strong','',c.name),element('p','',money(c.used)+' outstanding / '+money(c.limit)+' limit · '+c.percent.toFixed(1)+'% used'),element('p',c.excess>0?'rs-attention-danger':'',c.excess>0?'Exceeds limit by '+money(c.excess):c.percent>=100?'At credit limit':'Approaching credit limit'),button('Open customer ledger',()=>{d.close();openLedger(c.id);},can('ledger')||can('customerLedger')));
      body.append(row);
    }
    d.showModal();
  }
  function showQualityRows(data,model){
    const {d,body}=dialog('Data Quality Alerts');
    body.append(element('p','rs-attention-note',data.quality.length+' review flags across '+data.qualityInvoices+' invoices. A repeated reference may be a legitimate split payment. No records are changed here.'));
    for(const issue of data.quality){
      const c=model.customers.find(c=>String(c.id)===String(issue.customerId));
      const b=model.businesses.find(b=>String(b.id)===String(issue.businessId));
      const row=element('article','rs-attention-detail-row');
      row.append(element('strong','',issue.invoiceLabel+' · '+(c?.name||issue.customerId||'Customer')),element('small','',b?.name||issue.businessId||''),element('p','',issue.label));
      const actions=element('div','rs-attention-actions');
      if(can('invoices')&&typeof window.openPrint==='function'&&issue.invoiceId!==undefined)actions.append(button('View invoice',()=>{d.close();window.openPrint(issue.invoiceId);}));
      if(can('ledger')||can('customerLedger'))actions.append(button('Open customer ledger',()=>{d.close();openLedger(issue.customerId);}));
      if((issue.kind==='reference'||issue.kind==='duplicate')&&can('reconciliation'))actions.append(button('Open reconciliation',()=>{d.close();openFinance('reconciliation',issue.customerId);}));
      row.append(actions);body.append(row);
    }
    d.showModal();
  }
  function card(title,kind){const c=element('article','rs-attention-card rs-attention-'+kind);c.append(element('h3','',title));return c;}
  function render(){
    const host=$('rsDashboardAttention');if(!host||typeof state==='undefined'||typeof window.rsDashboardScope!=='function')return;
    const model=rsDashboardScope(),data=build(model);
    const total=data.overdueCount+data.credits.length+data.quality.length;
    const select=$('bizSelect'),scope=String(select?.value||'all');
    let details=$('rsAttentionDetails'),grid=$('rsAttentionGrid');
    if(!details){
      details=element('details','rs-attention');details.id='rsAttentionDetails';
      const summary=element('summary','');summary.append(element('strong','','Needs Attention'));
      const count=element('span','rs-attention-count');count.id='rsAttentionCount';count.setAttribute('aria-live','polite');summary.append(count);
      const label=element('small','rs-attention-scope');label.id='rsAttentionScope';summary.append(label);details.append(summary);
      grid=element('div','rs-attention-grid');grid.id='rsAttentionGrid';details.append(grid);
      const live=element('p','rs-attention-note');live.id='rsAttentionStatus';live.setAttribute('role','status');details.append(live);host.append(details);
    }
    $('rsAttentionCount').textContent=total?'Review needed':'No alerts in loaded data';
    $('rsAttentionScope').textContent=scope.toLowerCase()==='all'?'All businesses':select?.selectedOptions?.[0]?.textContent.trim()||'Selected business';
    if(!total)details.open=false;else if(lastScope!==scope||!hadAlerts)details.open=true;
    lastScope=scope;hadAlerts=total>0;grid.replaceChildren();
    const overdue=card('Overdue Risk','overdue');
    overdue.append(element('strong','rs-attention-value',money(data.overdueTotal)),element('p','rs-attention-note',data.overdueCount+' overdue invoices'));
    const buckets=element('dl','rs-attention-buckets');
    data.buckets.forEach(b=>{const row=element('div','');row.append(element('dt','',b.label),element('dd','',money(b.amount)));buckets.append(row);});
    overdue.append(buckets,button('Open Receivables Ageing',()=>openFinance('ageing'),can('ageing')));
    const credit=card('Credit Limit Alerts','credit');
    credit.append(element('strong','rs-attention-value',data.credits.length+' customers'),element('p','rs-attention-note','At or above '+data.threshold+'% of credit limit'),element('p','rs-attention-note','Total excess: '+money(data.excessTotal)),button('Review customers → ledger',()=>showCreditRows(data),data.credits.length>0));
    const quality=card('Data Quality Alerts','quality');
    quality.append(element('strong','rs-attention-value',data.quality.length+' review flags'),element('p','rs-attention-note',data.qualityInvoices+' affected invoices'));
    const counts=[['Due dates',data.quality.filter(q=>q.kind==='due').length],['Payment dates',data.quality.filter(q=>q.kind==='date').length],['References',data.quality.filter(q=>q.kind==='reference'||q.kind==='duplicate').length]];
    const list=element('p','rs-attention-note',counts.map(([label,count])=>label+': '+count).join(' · '));quality.append(list,button('Review flagged records',()=>showQualityRows(data,model),data.quality.length>0));
    grid.append(overdue,credit,quality);
    $('rsAttentionStatus').textContent=can('ageing')?'':'Report links follow your existing access permissions.';
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;try{render();}catch(e){console.error('Needs Attention rendering failed:',e);status('Needs Attention could not be displayed. Existing reports remain available.');}});}
  function init(){
    if(!$('rsDashboardAttention'))return;
    $('bizSelect')?.addEventListener('change',schedule);
    for(const name of ['rs:data-loaded','rs:mutation','rs:finance-changed'])window.addEventListener(name,schedule);
    window.addEventListener('rs:sync',e=>{if(e.detail?.phase==='saved'&&['getall','financeget'].includes(e.detail.action))schedule();});
    const credit=$('creditUsage');if(credit)new MutationObserver(schedule).observe(credit,{childList:true,subtree:true});
    schedule();
  }
  if(document.readyState==='complete')queueMicrotask(init);else window.addEventListener('load',init,{once:true});
})();
