/* Additional read-only commission summaries. No existing report function is replaced. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const defaults={businessRules:{},serviceRules:{},tolerancePoints:.5,checkServiceDetails:true,checkAgentDetails:true,commissionDueDateField:'commissionDueDate',agreedDueDates:{}};
  const config={...defaults,...window.RS_COMMISSION_INSIGHTS_CONFIG};
  const money=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(v)||0);
  const cents=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100):0;
  const rows=v=>Array.isArray(v)?v:Object.values(v||{});
  const own=(object,key)=>object&&Object.prototype.hasOwnProperty.call(object,String(key))?object[String(key)]:undefined;
  function day(value){const s=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';}
  const dayNumber=s=>Date.parse(s+'T12:00:00Z')/86400000;
  const shiftDay=(s,n)=>new Date((dayNumber(s)+n)*86400000).toISOString().slice(0,10);
  const localDay=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  function filter(source,scope){return rows(source.invoices).filter(i=>! /^(void|cancelled)$/i.test(i.status||'')&&(scope.business==='all'||String(i.businessId)===String(scope.business))&&(scope.customer==='all'||String(i.customerId)===String(scope.customer))&&(!scope.from||day(i.date||i.createdAt)>=scope.from)&&(!scope.to||(day(i.date||i.createdAt)&&day(i.date||i.createdAt)<=scope.to)));}
  function comparisonRanges(scope){
    const from=day(scope.from),to=day(scope.to);
    if(!from||!to||from>to)return {available:false,message:scope.mode==='all'?'Select Month, Year or Custom dates for a comparable period.':'Choose a valid, bounded date range for comparison.'};
    let priorFrom,priorTo;
    if(scope.mode==='month'){
      const d=new Date(from+'T12:00:00Z'),previous=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1,12));
      priorFrom=previous.toISOString().slice(0,10);
      const last=new Date(Date.UTC(previous.getUTCFullYear(),previous.getUTCMonth()+1,0,12)).getUTCDate();
      priorTo=new Date(Date.UTC(previous.getUTCFullYear(),previous.getUTCMonth(),Math.min(Number(to.slice(8,10)),last),12)).toISOString().slice(0,10);
    }else if(scope.mode==='year'){
      const d=new Date(to+'T12:00:00Z'),y=d.getUTCFullYear()-1,m=d.getUTCMonth();
      priorFrom=(Number(from.slice(0,4))-1)+'-01-01';
      const last=new Date(Date.UTC(y,m+1,0,12)).getUTCDate();priorTo=new Date(Date.UTC(y,m,Math.min(d.getUTCDate(),last),12)).toISOString().slice(0,10);
    }else{const length=dayNumber(to)-dayNumber(from)+1;priorTo=shiftDay(from,-1);priorFrom=shiftDay(from,-length);}
    return {available:true,from,to,priorFrom,priorTo};
  }
  function normalizeRule(rule,cfg){
    if(!rule||typeof rule!=='object')return null;
    const finite=v=>v!==undefined&&v!==null&&v!==''&&Number.isFinite(Number(v));
    const tolerance=finite(rule.tolerancePoints)?Math.max(0,Number(rule.tolerancePoints)):Math.max(0,Number(cfg.tolerancePoints)||0);
    let min=null,max=null;
    if(finite(rule.minRate)&&finite(rule.maxRate)){min=Number(rule.minRate);max=Number(rule.maxRate);}
    else if(finite(rule.expectedRate)){if(Number(rule.expectedRate)<0||Number(rule.expectedRate)>100)return null;min=Math.max(0,Number(rule.expectedRate)-tolerance);max=Math.min(100,Number(rule.expectedRate)+tolerance);}
    if(min!==null&&(min<0||max<min||max>100))return null;
    const expected=rule.expected!==undefined?rule.expected===true:finite(rule.expectedRate)?Number(rule.expectedRate)>0:min!==null&&min>0;
    return {expected,min,max};
  }
  function expectedForInvoice(inv,cfg){
    const business=normalizeRule(own(cfg.businessRules,inv.businessId),cfg);
    const items=rows(inv.items),weighted=items.map(item=>({item,weight:Math.max(0,Number(item.qty||0)*Number(item.rate||0)),rule:normalizeRule(own(cfg.serviceRules,item.serviceId||item.service),cfg)||business}));
    const total=weighted.reduce((s,x)=>s+x.weight,0);
    if(total>0&&weighted.some(x=>normalizeRule(own(cfg.serviceRules,x.item.serviceId||x.item.service),cfg))){
      const relevant=weighted.filter(x=>x.weight>0),complete=relevant.every(x=>x.rule&&x.rule.min!==null);
      return {expected:relevant.some(x=>x.rule?.expected),min:complete?relevant.reduce((s,x)=>s+x.weight*x.rule.min,0)/total:null,max:complete?relevant.reduce((s,x)=>s+x.weight*x.rule.max,0)/total:null};
    }
    return business||{expected:false,min:null,max:null};
  }
  function build(source,scope,settlements,cfg=config,now=new Date()){
    cfg={...defaults,...cfg};scope={business:'all',customer:'all',from:'',to:'',...scope};
    const selected=filter(source,scope),businesses=rows(source.businesses),customers=rows(source.customers),services=rows(source.services);
    const today=localDay(now),asOf=scope.to&&scope.to<today?scope.to:today;
    const available=Array.isArray(settlements),events=available?settlements:[];
    const businessName=id=>businesses.find(b=>String(b.id)===String(id))?.name||String(id||'Unknown business');
    const serviceName=id=>{const service=services.find(s=>String(s.id)===String(id));return service?.service||service?.name||String(id||'Unassigned service');};
    const summaryRows=new Map(),exceptions=[],checks={missing:0,rate:0,service:0,agent:0,invalid:0};
    const amount=value=>Number.isFinite(Number(value))?Number(value):0;
    for(const inv of selected){
      const id=String(inv.businessId),earned=cents(inv.commission);
      if(!summaryRows.has(id))summaryRows.set(id,{id,name:businessName(id),earned:0,receivedSum:0,reversedSum:0,receivedCount:0,reversedCount:0,eventCount:0,invoiceCount:0,untracked:0,knownOverdue:0,knownDueCount:0,unknownDue:0,invalidEvents:0});
      const row=summaryRows.get(id);row.earned+=earned;row.invoiceCount++;
      let received=0,reversed=0,validCount=0;
      const linked=events.filter(e=>String(e.invoiceId)===String(inv.id)&&(e.businessId==null||String(e.businessId)===String(inv.businessId)));
      for(const event of linked){
        if(!['received','reversal'].includes(event.kind))continue;
        const date=day(event.date),value=Number(event.amount);
        if(!date||event.amount==null||String(event.amount).trim()===''||!Number.isFinite(value)||value<0){row.invalidEvents++;continue;}
        if(date>asOf)continue;
        validCount++;
        if(event.kind==='received'){received+=cents(value);row.receivedCount++;}else{reversed+=cents(value);row.reversedCount++;}
      }
      row.receivedSum+=received;row.reversedSum+=reversed;row.eventCount+=validCount;
      if(!validCount&&earned!==0)row.untracked++;
      const due=day(own(cfg.agreedDueDates,inv.id)||inv[cfg.commissionDueDateField]||linked.find(e=>day(e.commissionDueDate))?.commissionDueDate);
      const outstanding=Math.max(0,earned-received-reversed);
      if(earned>0){
        if(available&&validCount&&outstanding===0)row.knownDueCount++;
        else if(available&&due){row.knownDueCount++;if(due<asOf)row.knownOverdue+=outstanding;}
        else row.unknownDue++;
      }
      const rule=expectedForInvoice(inv,cfg),hasCommission=inv.commission!==undefined&&inv.commission!==null&&String(inv.commission).trim()!=='';
      const related=rule.expected||amount(inv.commission)!==0;
      if(rule.expected)checks.missing++;if(rule.min!==null&&Number(inv.total)>0)checks.rate++;if(related&&cfg.checkServiceDetails)checks.service++;if(related&&cfg.checkAgentDetails)checks.agent++;if(hasCommission)checks.invalid++;
      const invoiceLabel=inv.invoiceNumber||inv['invoice number']||String(inv.id||'Invoice');
      function flag(kind,message){const totalValue=inv.total!==undefined&&inv.total!==null&&String(inv.total).trim()!==''&&Number.isFinite(Number(inv.total))?Number(inv.total):null,commissionValue=hasCommission&&Number.isFinite(Number(inv.commission))?Number(inv.commission):null;exceptions.push({kind,message,invoiceId:inv.id,invoiceLabel,businessName:businessName(inv.businessId),customerName:customers.find(c=>String(c.id)===String(inv.customerId))?.name||String(inv.customerId||'Customer'),invoiceDate:day(inv.date||inv.createdAt),total:totalValue,commission:commissionValue,commissionRaw:hasCommission?String(inv.commission):'',actualRate:totalValue>0&&commissionValue!==null?commissionValue/totalValue*100:null,expectedMin:rule.min,expectedMax:rule.max,services:rows(inv.items).map(it=>String(it.serviceName||serviceName(it.serviceId||it.service||'Not recorded'))).join(' · ')||'Not recorded',agent:String(inv.agent||inv.agentId||'').trim()||'Not recorded'});}
      if(rule.expected&&(!hasCommission||amount(inv.commission)===0))flag('missing','Commission is expected by a configured rule but is missing or zero.');
      else if(hasCommission&&!Number.isFinite(Number(inv.commission)))flag('invalid','Commission amount is not a valid number.');
      else if(rule.min!==null&&Number(inv.total)>0){const actual=Number(inv.commission)/Number(inv.total)*100;if(actual<rule.min-1e-8||actual>rule.max+1e-8)flag('rate','Actual rate '+actual.toFixed(2)+'%; configured range '+rule.min.toFixed(2)+'–'+rule.max.toFixed(2)+'%.');}
      if(related&&cfg.checkServiceDetails&&(!rows(inv.items).length||rows(inv.items).some(it=>!String(it.serviceId||it.service||it.serviceName||'').trim())))flag('service','Service details are missing or incomplete.');
      if(related&&cfg.checkAgentDetails&&/^(|unassigned|unknown|n\/a|none)$/i.test(String(inv.agent||inv.agentId||'').trim()))flag('agent','Agent details are not recorded; review if an agent applies.');
    }
    const settlementRows=Array.from(summaryRows.values()).map(row=>({...row,earned:row.earned/100,received:available?row.receivedSum/100:null,reversed:available?row.reversedSum/100:null,outstanding:available?(row.earned-row.receivedSum-row.reversedSum)/100:row.earned===0?0:null,overdue:available&&row.knownDueCount?row.knownOverdue/100:row.earned===0?0:null,partial:row.untracked>0||row.invalidEvents>0,overduePartial:row.unknownDue>0||row.invalidEvents>0}));
    const add=key=>settlementRows.reduce((s,r)=>s+cents(r[key]),0)/100;
    const aggregate={earned:add('earned'),received:settlementRows.some(r=>r.received!==null)?add('received'):selected.length?null:0,reversed:settlementRows.some(r=>r.reversed!==null)?add('reversed'):selected.length?null:0,outstanding:settlementRows.some(r=>r.outstanding!==null)?add('outstanding'):selected.length?null:0,overdue:settlementRows.some(r=>r.overdue!==null)?add('overdue'):selected.length?null:0,partial:settlementRows.some(r=>r.partial||r.outstanding===null),overduePartial:settlementRows.some(r=>r.overduePartial||r.overdue===null)};
    const ranges=comparisonRanges(scope);let comparison={...ranges};
    function totals(invoices){
      let earned=0;const byBusiness=new Map(),byService=new Map();
      function addTo(map,id,value,name,invoice){id=String(id);if(!map.has(id))map.set(id,{id,name,amount:0,invoiceAmounts:new Map()});const group=map.get(id);group.amount+=value;const invoiceId=String(invoice.id);group.invoiceAmounts.set(invoiceId,(group.invoiceAmounts.get(invoiceId)||0)+value);}
      for(const inv of invoices){
        const commission=cents(inv.commission);earned+=commission;addTo(byBusiness,inv.businessId,commission,businessName(inv.businessId),inv);
        const items=rows(inv.items),weights=items.map(it=>Math.max(0,amount(it.qty)*amount(it.rate))),total=weights.reduce((s,v)=>s+v,0);let remainder=commission;
        if(!items.length)addTo(byService,'unassigned',commission,'Unassigned service',inv);
        items.forEach((it,index)=>{const allocated=index===items.length-1?remainder:Math.round(commission*(total?weights[index]/total:1/items.length));remainder-=allocated;const id=it.serviceId||it.service||it.serviceName||'unassigned';addTo(byService,id,allocated,serviceName(id),inv);});
      }
      return {earned,byBusiness,byService};
    }
    if(ranges.available){
      const current=totals(filter(source,{...scope,from:ranges.from,to:ranges.to})),prior=totals(filter(source,{...scope,from:ranges.priorFrom,to:ranges.priorTo}));
      function drivers(key){const ids=new Set([...current[key].keys(),...prior[key].keys()]);return Array.from(ids,id=>{const a=current[key].get(id),b=prior[key].get(id);return {id,name:a?.name||b?.name,current:(a?.amount||0)/100,previous:(b?.amount||0)/100,change:((a?.amount||0)-(b?.amount||0))/100,currentInvoices:Array.from(a?.invoiceAmounts||[],([id,value])=>({id,amount:value/100})),previousInvoices:Array.from(b?.invoiceAmounts||[],([id,value])=>({id,amount:value/100}))};}).filter(x=>Math.abs(x.change)>.00001).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));}
      comparison={...ranges,current:current.earned/100,previous:prior.earned/100,priorInvoiceCount:filter(source,{...scope,from:ranges.priorFrom,to:ranges.priorTo}).length,change:(current.earned-prior.earned)/100,percent:prior.earned?(current.earned-prior.earned)/Math.abs(prior.earned)*100:null,businessDrivers:drivers('byBusiness'),serviceDrivers:drivers('byService')};
    }
    return {scope,asOf,selectedCount:selected.length,settlementsAvailable:available,settlementRows,aggregate,exceptions,checks,hasRateRules:[...Object.values(cfg.businessRules||{}),...Object.values(cfg.serviceRules||{})].some(rule=>normalizeRule(rule,cfg)),comparison};
  }
  window.RanSanCommissionInsights={build,comparisonRanges,defaults};

  window.rsBuildCommissionInsights=build;
  const cache={initialized:false,loading:false,dirty:true,data:null,error:''};let queued=false,navigation=0;
  function can(menu){const role=String(sessionStorage.getItem('role')||'').toLowerCase(),access=String(sessionStorage.getItem('access')||'').split(',').map(s=>s.trim());return role==='admin'||access.includes('all')||access.includes('reports')||access.includes(menu);}
  function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
  function button(label,action,enabled=true){const n=node('button','rs-ci-button',label);n.type='button';n.onclick=action;n.disabled=!enabled;return n;}
  function active(){return $('view-commission-report')&&!$('view-commission-report').classList.contains('hidden');}
  function currentScope(){return typeof window.rsCommissionRange==='function'?rsCommissionRange():{mode:'all',from:'',to:'',business:'all',customer:'all'};}
  async function loadSettlements(){
    if(cache.loading||!cache.dirty||!active())return;
    cache.initialized=true;cache.dirty=false;
    if(!can('commission-settlement')){cache.data=null;cache.error='Settlement access is required to load recorded receipts and reversals.';schedule();return;}
    if(typeof window.fetchServerData!=='function'){
      cache.data=Array.isArray(window.rsFinanceData?.settlements)?window.rsFinanceData.settlements:null;
      cache.error=cache.data?'':'Settlement records are not available in the loaded workspace.';schedule();return;
    }
    cache.loading=true;cache.error='';schedule();
    try{const data=await fetchServerData('financeget',{menu:'commission-settlement'});if(!Array.isArray(data?.settlements))throw Error('The backend did not provide settlement records.');cache.data=data.settlements;}
    catch(error){console.warn('Commission insights settlement read failed:',error);cache.error=error.message||'Settlement records could not be loaded.';}
    finally{cache.loading=false;schedule();}
  }
  async function openSettlement(){
    if(!can('commission-settlement')||typeof window.showView!=='function')return;
    const scope=currentScope(),generation=++navigation;
    window.showView('commission-settlement');
    const business=scope.business==='all'?'':scope.business,customer=scope.customer==='all'?'':scope.customer;
    const ready=()=>{const b=$('rsFinBusiness'),c=$('rsFinCustomer'),tab=document.querySelector('#rsFinanceTabs [data-report="commission-settlement"]');return b&&c&&(!tab||tab.getAttribute('aria-selected')==='true')&&Array.from(b.options).some(o=>o.value===business)&&Array.from(c.options).some(o=>o.value===customer);};
    if(!ready())await new Promise(resolve=>{const panel=$('view-finance');if(!panel){resolve();return;}let timer;const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timer);resolve();}});observer.observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-selected']});timer=setTimeout(()=>{observer.disconnect();resolve();},8000);});
    if(generation!==navigation||$('view-finance')?.classList.contains('hidden'))return;
    const tab=document.querySelector('#rsFinanceTabs [data-report="commission-settlement"]');if(tab&&tab.getAttribute('aria-selected')!=='true')return;
    if(ready()){$('rsFinBusiness').value=business;$('rsFinCustomer').value=customer;if($('rsFinFrom'))$('rsFinFrom').value=scope.from||'';if($('rsFinTo'))$('rsFinTo').value=scope.to||localDay();$('rsFinApply')?.click();}
  }
  function metric(label,value,note,tone='selected'){const n=node('div','rs-ci-metric rs-ci-tone-'+tone);n.append(node('span','',label),node('strong','',value===null?'Not recorded':money(value)));if(note)n.append(node('small','',note));return n;}
  function metricPill(value,tone='violet'){const n=node('span','rs-finish-pill',value);n.dataset.tone=tone;return n;}
  function detailTable(headers,entries,emptyMessage='No invoices in the selected scope.'){const wrap=node('div','rs-table-scroll rs-ci-table'),table=node('table'),head=node('thead'),tr=node('tr'),body=node('tbody');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Commission report table');headers.forEach(label=>tr.append(node('th','',label)));head.append(tr);table.append(head,body);for(const values of entries){const row=node('tr');for(const value of values){const cell=node('td');if(value instanceof Node)cell.append(value);else cell.textContent=value;row.append(cell);}body.append(row);}if(!entries.length){const row=node('tr'),cell=node('td','',emptyMessage);cell.colSpan=headers.length;row.append(cell);body.append(row);}wrap.append(table);return wrap;}
  const exceptionNames={missing:'Missing commission',rate:'Unusual rate',service:'Service details',agent:'Agent details',invalid:'Invalid amount'};
  const exceptionTones={missing:'pink',rate:'amber',service:'blue',agent:'violet',invalid:'pink'};
  function insightDialog(id,title){let d=$(id);if(!d){d=node('dialog','rs-ci-dialog');d.id=id;document.body.append(d);}if(d.open)d.close();d.replaceChildren();const heading=node('h2','',title);heading.id=id+'Title';d.setAttribute('aria-labelledby',heading.id);const head=node('div','rs-ci-dialog-head');head.append(heading,button('Close',()=>d.close()));const body=node('div','rs-ci-dialog-body');d.append(head,body);return {d,body};}
  function exceptionRows(flags,dialog){return flags.map(flag=>{const view=button(flag.invoiceLabel,()=>{dialog?.close();window.openPrint?.(flag.invoiceId);},can('invoices')&&typeof window.openPrint==='function');view.classList.add('rs-ci-invoice-link');return [view,metricPill(exceptionNames[flag.kind],exceptionTones[flag.kind]),flag.customerName,flag.businessName,flag.invoiceDate||'Not recorded',metricPill(flag.total===null?'Not recorded':money(flag.total),'blue'),metricPill(flag.commission===null?(flag.commissionRaw?'Invalid: '+flag.commissionRaw:'Not recorded'):money(flag.commission),'teal'),flag.actualRate===null?'Not available':flag.actualRate.toFixed(2)+'%',flag.expectedMin===null?'No numeric rate rule':flag.expectedMin.toFixed(2)+'–'+flag.expectedMax.toFixed(2)+'%',flag.services,flag.agent,flag.message];});}
  const exceptionHeaders=['Invoice','Review type','Customer','Business','Issue date','Invoice total','Commission','Actual rate','Expected range','Service details','Agent details','Reason / next review'];
  function exceptionsDialog(model,initial='all'){
    const {d,body}=insightDialog('rsCommissionExceptionDialog','Commission Exceptions');let category=initial,page=0;
    const filters=node('div','rs-ci-exception-filters'),select=node('select');select.setAttribute('aria-label','Exception category');for(const [value,label]of [['all','All review flags'],...Object.entries(exceptionNames)]){const option=node('option','',label);option.value=value;select.append(option);}select.value=category;filters.append(select);const count=node('p','rs-ci-note'),host=node('div'),pager=node('div','rs-ci-dialog-pager');body.append(node('p','rs-ci-note','Read-only flags based on the selected business, customer and dates. Review the saved invoice before changing a record. Missing/rate checks require configured expectations.'),filters,count,host,pager);
    function paint(){const flags=model.exceptions.filter(f=>category==='all'||f.kind===category);page=Math.min(page,Math.max(0,Math.ceil(flags.length/50)-1));host.replaceChildren(detailTable(exceptionHeaders,exceptionRows(flags.slice(page*50,page*50+50),d),'No review flags in this category.'));count.textContent=flags.length+' flags · showing '+(flags.length?page*50+1:0)+'–'+Math.min((page+1)*50,flags.length);const prev=button('Previous',()=>{page--;paint();},page>0),next=button('Next',()=>{page++;paint();},(page+1)*50<flags.length);pager.replaceChildren(prev,next);}
    select.onchange=()=>{category=select.value;page=0;paint();};paint();d.showModal();
  }
  function driverInvoices(entry,kind,model){
    const {d,body}=insightDialog('rsCommissionDriverDialog',entry.name+' · invoice contributions');
    body.append(node('p','rs-ci-note',kind==='service'?'Service figures allocate each invoice’s saved commission by line value. These are derived contributions, not individually recorded service commissions.':'Contributions use the commission saved on each invoice. No sample business amounts are inserted.'),node('p','rs-ci-note',model.comparison.from+' → '+model.comparison.to+' versus '+model.comparison.priorFrom+' → '+model.comparison.priorTo));
    const invoices=new Map(rows(state.invoices).map(i=>[String(i.id),i])),contributions=[...entry.currentInvoices.map(item=>({...item,period:'Selected'})),...entry.previousInvoices.map(item=>({...item,period:'Previous'}))];
    const count=node('p','rs-ci-note'),host=node('div'),pager=node('div','rs-ci-dialog-pager');let page=0;body.append(count,host,pager);
    function paint(){const entries=contributions.slice(page*50,page*50+50).map(item=>{const inv=invoices.get(item.id),view=button(inv?.invoiceNumber||inv?.['invoice number']||item.id,()=>{d.close();window.openPrint?.(item.id);},can('invoices')&&typeof window.openPrint==='function');return [metricPill(item.period,item.period==='Selected'?'violet':'blue'),view,day(inv?.date)||'Not recorded',metricPill(money(item.amount),'teal'),inv&&inv.commission!==null&&inv.commission!==undefined&&String(inv.commission).trim()!==''&&Number.isFinite(Number(inv.commission))?money(inv.commission):'Not recorded'];});
      host.replaceChildren(detailTable(['Period','Invoice','Issue date',kind==='service'?'Allocated contribution':'Saved commission contribution','Invoice commission'],entries));count.textContent=contributions.length+' invoice contributions · showing '+(contributions.length?page*50+1:0)+'–'+Math.min((page+1)*50,contributions.length);pager.replaceChildren(button('Previous',()=>{page--;paint();},page>0),button('Next',()=>{page++;paint();},(page+1)*50<contributions.length));}
    paint();d.showModal();
  }
  function driversTable(entries,kind,model){return detailTable(['Name','Selected','Previous','Change','Invoice counts','Evidence'],entries.slice(0,5).map((r,index)=>[metricPill(r.name,['violet','blue','teal','amber','pink'][index%5]),metricPill(money(r.current),'teal'),metricPill(money(r.previous),'blue'),metricPill((r.change>0?'+':'')+money(r.change),r.change>0?'teal':r.change<0?'pink':'amber'),metricPill(r.currentInvoices.length+' / '+r.previousInvoices.length,'amber'),button('View invoices',()=>driverInvoices(r,kind,model))]),'No changed commission contributions for these periods.');}
  function render(){
    const host=$('rsCommissionInsights');if(!host||!active()||typeof state==='undefined')return;
    const scope=currentScope();
    if(scope.from&&scope.to&&scope.from>scope.to){host.replaceChildren(node('p','rs-ci-warning','Select a valid commission date range to show these summaries.'));return;}
    const model=build(state,scope,cache.data,config),a=model.aggregate;
    const settlementOpen=$('rsCiSettlementDetails')?.open||false,driversOpen=$('rsCiDriversDetails')?.open||false,exceptionsOpen=$('rsCiExceptionDetails')?.open||false;host.replaceChildren();
    const settlement=node('article','rs-ci-card rs-ci-settlement'),header=node('div','rs-ci-heading');header.append(node('h3','','Commission Due & Settlement'),button(cache.loading?'Loading records…':'Refresh settlement records',()=>{cache.dirty=true;loadSettlements();},!cache.loading&&can('commission-settlement')));settlement.append(header,node('p','rs-ci-note','Invoices in the selected period; recorded settlements through '+model.asOf+'. Balances use earned commission minus recorded receipts and reversals; check historical completeness. Customer invoice payments are separate.'));
    const metrics=node('div','rs-ci-metrics');metrics.append(metric('Earned',a.earned,'','earned'),metric('Received · recorded',a.received,'','received'),metric('Reversed · recorded',a.reversed,'','reversed'),metric('Outstanding · recorded basis',a.outstanding,a.partial?'Some invoices have no entries or invalid entries; check completeness.':'','outstanding'),metric('Overdue · recorded',a.overdue,a.overduePartial?'Commission due dates/status are incomplete.':'','overdue'));settlement.append(metrics);if(model.settlementsAvailable)settlement.append(node('p','rs-ci-note','₹0 received/reversed means no matching entries in the returned settlement records; it does not confirm historical completeness. Overdue covers recorded commission due dates only.'));if(model.settlementRows.some(r=>r.outstanding<0))settlement.append(node('p','rs-ci-warning','Recorded receipts/reversals exceed earned commission for a business. Review invoice changes and settlement history.'));
    if(cache.loading)settlement.append(node('p','rs-ci-note','Loading recorded commission settlements…'));
    if(cache.error)settlement.append(node('p','rs-ci-warning',cache.error+(cache.data?' Showing previously loaded settlement records.':'')));
    const details=node('details','rs-ci-details');details.id='rsCiSettlementDetails';details.open=settlementOpen;details.append(node('summary','','View settlement amounts by business'));
    details.append(detailTable(['Business','Earned','Received','Reversed','Outstanding','Overdue','Coverage'],model.settlementRows.map(r=>[r.name,money(r.earned),r.received===null?'Not recorded':money(r.received),r.reversed===null?'Not recorded':money(r.reversed),r.outstanding===null?'Not recorded':money(r.outstanding)+(r.partial?' · partial':''),r.overdue===null?'Not recorded':money(r.overdue)+(r.overduePartial?' · partial':''),r.untracked+' invoices without settlement entries (earned balance retained); '+r.unknownDue+' need due-date/status records'+(r.invalidEvents?'; '+r.invalidEvents+' invalid settlement entries':'')])));settlement.append(details,button('Open Commission Settlement',openSettlement,can('commission-settlement')));
    const exceptions=node('article','rs-ci-card rs-ci-exceptions');exceptions.append(node('h3','','Commission Exceptions'),node('strong','rs-ci-big',model.exceptions.length+' review flags'),node('p','rs-ci-note',model.hasRateRules?'Configured commission rules are active. Rate checks require a configured range.':'No expected-rate rules configured. Missing/zero commission is not flagged automatically.'));
    const counts=node('div','rs-ci-counts');for(const [kind,label]of [['missing','Missing commission'],['rate','Unusual rate'],['service','Service details'],['agent','Agent details'],['invalid','Invalid amounts']])counts.append(button(label+': '+(!model.checks[kind]?(kind==='missing'||kind==='rate'?(model.hasRateRules?'No applicable rules':'Rules not configured'):(kind==='service'&&!config.checkServiceDetails)||(kind==='agent'&&!config.checkAgentDetails)?'Check disabled':'No applicable invoices'):model.exceptions.filter(f=>f.kind===kind).length),()=>exceptionsDialog(model,kind),model.exceptions.some(f=>f.kind===kind)));exceptions.append(counts,button('Review exceptions',()=>exceptionsDialog(model),model.exceptions.length>0));
    const exceptionDetails=node('details','rs-ci-details');exceptionDetails.id='rsCiExceptionDetails';exceptionDetails.open=exceptionsOpen;exceptionDetails.append(node('summary','','Detailed exception report · '+model.exceptions.length+' flags'),detailTable(exceptionHeaders,exceptionRows(model.exceptions.slice(0,10)),'No review flags in the current filters.'));if(model.exceptions.length>10)exceptionDetails.append(node('p','rs-ci-note','First ten flags shown here. Review exceptions opens all flags with category filters and pagination.'));exceptions.append(exceptionDetails);
    const change=node('article','rs-ci-card rs-ci-change');change.append(node('h3','','Commission Change Summary'));const c=model.comparison;
    if(!c.available)change.append(node('p','rs-ci-note',c.message));else{
      change.append(node('p','rs-ci-note',c.from+' → '+c.to+' compared with '+c.priorFrom+' → '+c.priorTo));
      const line=node('div','rs-ci-change-values');line.append(metric('Selected period',c.current),metric('Previous period',c.previous,'','previous'),metric('Change',c.change,c.percent===null?'Prior period is zero; percentage is not comparable.':(c.percent>0?'+':'')+c.percent.toFixed(1)+'%',c.change>0?'positive':c.change<0?'negative':'neutral'));change.append(line);if(c.priorInvoiceCount===0)change.append(node('p','rs-ci-note','No matching invoices were loaded for the previous comparison period. Check the displayed dates and filters before interpreting the change.'));
      const drivers=node('details','rs-ci-details');drivers.id='rsCiDriversDetails';drivers.open=driversOpen;drivers.append(node('summary','','View business and service drivers'));
      for(const [title,entries,kind]of [['Business drivers — saved invoice commission',c.businessDrivers,'business'],['Service drivers — allocated invoice commission',c.serviceDrivers,'service']]){drivers.append(node('h4','',title),driversTable(entries,kind,model));}
      change.append(drivers,node('p','rs-ci-note','Real invoices in the displayed periods drive these amounts. Counts show selected / previous invoices; View invoices traces each contribution. Largest five absolute changes are shown. Service figures are allocated by item value, not recorded service-level commission.'));
    }
    host.append(settlement,exceptions,change);
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;try{render();if(cache.dirty)loadSettlements();}catch(error){console.error('Commission insights rendering failed:',error);}});}
  function init(){
    if(!$('rsCommissionInsights'))return;
    const view=$('view-commission-report');if(view)new MutationObserver(schedule).observe(view,{attributes:true,attributeFilter:['class']});
    const table=$('commissionInvoiceTable');if(table)new MutationObserver(schedule).observe(table,{childList:true,subtree:true});
    for(const id of ['commissionFilterBiz','commissionFilterCust','rsCommissionPeriod','commissionFrom','commissionTo'])$(id)?.addEventListener('change',schedule);
    $('commissionApplyFilters')?.addEventListener('click',schedule);
    for(const name of ['rs:data-loaded','rs:mutation','rs:finance-changed'])window.addEventListener(name,()=>{cache.dirty=true;schedule();});
    window.addEventListener('rs:finance-loaded',event=>{if(event.detail?.menu==='commission-settlement'){cache.dirty=true;schedule();}});
    window.addEventListener('rs:sync',event=>{if(event.detail?.phase==='saved'&&['getall','financeget'].includes(event.detail.action))schedule();});schedule();
  }
  if(document.readyState==='complete')queueMicrotask(init);else window.addEventListener('load',init,{once:true});
})();
