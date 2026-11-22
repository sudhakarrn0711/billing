/* Read-only service query/usage helpers, shared by the Services UI and offline checks. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.RanSanServiceTools=api;})(typeof window!=='undefined'?window:null,function(){
'use strict';
const same=(a,b)=>String(a)===String(b),name=s=>String(s?.service||s?.name||''),normalize=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function price(value){if(value===undefined||value===null||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
function duplicates(services,draft){return services.filter(s=>!s.archivedAt&&same(s.businessId,draft.businessId)&&!same(s.id,draft.id)&&normalize(name(s))===normalize(name(draft))&&normalize(name(draft)));}
function query(services,businessId,filters,prefs=()=>({favourites:[],recent:[]})){
 const q=normalize(filters.query),sort=filters.sort||'name-asc',view=filters.view||'all';let rows=services.filter(s=>!s.archivedAt&&(!businessId||businessId==='all'||same(s.businessId,businessId))&&(!q||[name(s),s.notes,s.category].some(v=>normalize(v).includes(q))));
 rows=rows.filter(s=>{const p=prefs(s.businessId);return view==='all'||view==='favourites'&&p.favourites.includes(String(s.id))||view==='recent'&&p.recent.includes(String(s.id));});
 rows.sort((a,b)=>{if(sort.startsWith('price')){const pa=price(a.price),pb=price(b.price);if(pa===null&&pb!==null)return 1;if(pb===null&&pa!==null)return -1;if(pa!==null&&pb!==null&&pa!==pb)return (pa-pb)*(sort==='price-desc'?-1:1);}else{const cmp=name(a).localeCompare(name(b),undefined,{sensitivity:'base',numeric:true});if(cmp)return cmp*(sort==='name-desc'?-1:1);}return String(a.id).localeCompare(String(b.id));});return rows;
}
function usageIndex(services,invoices,ledger){const byId=new Map(services.map(s=>[String(s.id),s])),byName=new Map(),result=new Map(services.map(s=>[String(s.id),[]]));for(const s of services){const key=JSON.stringify([String(s.businessId),normalize(name(s))]);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(s);}
 for(const inv of invoices||[]){if(inv.archivedAt||/^(void|cancelled)$/i.test(inv.status||''))continue;const found=new Map();for(const line of Array.isArray(inv.items)?inv.items:[]){let service=null,legacy=false;if(line.serviceId!==undefined&&line.serviceId!==null&&String(line.serviceId)!==''){service=byId.get(String(line.serviceId));if(service&&!same(service.businessId,inv.businessId))service=null;}else{const candidates=byName.get(JSON.stringify([String(inv.businessId),normalize(line.serviceName||line.service||line.name)]))||[];if(candidates.length===1){service=candidates[0];legacy=true;}}if(service){const old=found.get(String(service.id));found.set(String(service.id),{legacy:old?old.legacy&&legacy:legacy});}}
  for(const [id,match]of found){const date=ledger.day(inv.date);result.get(id).push({invoice:inv,date:ledger.validDate(date)?date:'',legacy:match.legacy});}
 }
 for(const [id,rows]of result){rows.sort((a,b)=>b.date.localeCompare(a.date)||String(a.invoice.id).localeCompare(String(b.invoice.id)));result.set(id,{rows,count:rows.length,last:rows.find(r=>r.date)?.date||'',missingDates:rows.filter(r=>!r.date).length,legacy:rows.filter(r=>r.legacy).length});}return result;
}
return {name,normalize,price,duplicates,query,usageIndex};
});
