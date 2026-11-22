/* Keep the single existing business selector aligned with the current workspace.
   No cross-environment fallback, financial writes, fabricated business IDs or automatic retries. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const env=()=>typeof getBillingEnv==='function'?getBillingEnv():localStorage.getItem('billing_env')||'test';
 const initialEnv=env(),initialUser=sessionStorage.getItem('username')||'';
 let queued=false,ready=false,refreshing=false,lastError='',invalidFromCheck=0;
 const sameWorkspace=()=>env()===initialEnv&&(sessionStorage.getItem('username')||'')===initialUser;
 function catalog(value){
  if(!value||typeof value!=='object')return {rows:[],invalid:0,unnamed:0};
  const raw=Array.isArray(value)?value:Object.values(value),rows=[],ids=new Set();let invalid=0,unnamed=0;
  for(const row of raw){
   if(!row||typeof row!=='object'||row.archivedAt)continue;
   const id=String(row.id??'');if(!id.trim()||id==='all'){invalid++;continue;}
   if(ids.has(id))continue;ids.add(id);
   const name=String(row.name??'').trim();if(!name)unnamed++;
   rows.push({id,name:name||'Unnamed business · '+id});
  }
  return {rows,invalid,unnamed};
 }
 function model(){return typeof state!=='undefined'?state:null;}
 function setNotice(text){const note=$('rsBusinessLoadNotice');if(note){note.hidden=!text;note.textContent=text;}const action=$('rsBusinessRefresh');if(action){action.hidden=!text;action.disabled=refreshing;action.textContent=refreshing?'Checking…':'Refresh businesses';}}
 function sync(){
  queued=false;if(!sameWorkspace())return;
  const select=$('bizSelect'),data=model();if(!select||!data)return;
  const list=catalog(data.businesses);if(list.rows.length)ready=true;
  // Before the first successful data load do not replace a server-populated selector.
  if(!ready)return;
  const previous=String(select.value||'all'),choices=[['all','All Businesses'],...list.rows.map(b=>[b.id,b.name])];
  const allowed=choices.some(([id])=>id===previous);
  if(!allowed&&(window.rsInvoiceHasUnsavedEntries?.()||window.rsInvoiceDraftState?.().pending)){
   setNotice('The selected business is unavailable in '+initialEnv.toUpperCase()+'. Review your invoice draft before changing business.');return;
  }
  const chosen=allowed?previous:'all';
  const before=Array.from(select.options,o=>[String(o.value),String(o.textContent||'').trim()]);
  if(JSON.stringify(before)!==JSON.stringify(choices)){
   const options=choices.map(([id,name])=>{const option=document.createElement('option');option.value=id;option.textContent=name;return option;});select.replaceChildren(...options);
  }
  select.value=chosen;data.currentBiz=chosen;
  let message=lastError;
  if(!message&&(list.invalid+invalidFromCheck))message=(list.invalid+invalidFromCheck)+' business record(s) in '+initialEnv.toUpperCase()+' have no valid id. Review the businesses sheet headers and records.';
  if(!message&&!list.rows.length)message='No active businesses were returned for '+initialEnv.toUpperCase()+'. Refresh to check this workspace’s business records.';
  if(!message&&list.unnamed)message=list.unnamed+' business record(s) in '+initialEnv.toUpperCase()+' have no saved name. Review Business Settings.';
  setNotice(message);
  if(previous!==chosen&&previous!=='all')select.dispatchEvent(new Event('change',{bubbles:true}));
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(sync);}}
 async function refresh(){
  if(refreshing||!sameWorkspace())return;
  const before=model(),version=JSON.stringify(before?.businesses||{}),selected=$('bizSelect')?.value;
  refreshing=true;setNotice('Checking businesses in '+initialEnv.toUpperCase()+'…');
  try{
   if(typeof window.rsCall!=='function')throw new Error('Reload the page to load the workspace connection.');
   const result=await window.rsCall('getall',{}, {env:initialEnv});
   if(!sameWorkspace())return;
   if(!result||!result.businesses||typeof result.businesses!=='object')throw new Error('The server did not return a business list. Check the deployed backend for '+initialEnv.toUpperCase()+'.');
   if(model()!==before||JSON.stringify(before.businesses||{})!==version||$('bizSelect')?.value!==selected)throw new Error('The workspace changed during the check. Refresh businesses again.');
   const rows=Array.isArray(result.businesses)?result.businesses:Object.values(result.businesses);
   const map={};invalidFromCheck=catalog(rows).invalid;for(const row of rows){if(row&&String(row.id??'').trim()&&String(row.id)!=='all'&&!row.archivedAt)map[String(row.id)]=row;}
   before.businesses=map;
   ready=true;lastError='';
  }catch(error){if(sameWorkspace())lastError=String(error.message||error);}
  finally{refreshing=false;if(sameWorkspace())sync();}
 }
 function init(){
  const select=$('bizSelect');if(!select)return;
  // A fast initial response may finish before this deferred module is installed.
  const loadedAt=Date.parse(sessionStorage.getItem('rs-last-sync:'+initialEnv)||'');
  if(Number.isFinite(window.performance?.timeOrigin)&&loadedAt>=window.performance.timeOrigin)ready=true;
  const tools=document.createElement('div');tools.className='rs-business-load-tools';
  const notice=document.createElement('p');notice.id='rsBusinessLoadNotice';notice.hidden=true;notice.setAttribute('role','status');
  const action=document.createElement('button');action.id='rsBusinessRefresh';action.type='button';action.className='btn';action.textContent='Refresh businesses';action.hidden=true;action.onclick=refresh;
  tools.append(notice,action);select.after(tools);
  new MutationObserver(schedule).observe(select,{childList:true,subtree:true,characterData:true});
  select.addEventListener('change',schedule);
  window.addEventListener('rs:data-loaded',()=>{ready=true;lastError='';invalidFromCheck=0;schedule();});
  window.addEventListener('rs:sync',event=>{if(event.detail?.phase==='saved'&&['getall','financeget'].includes(event.detail.action))schedule();});
  for(const event of ['rs:mutation','rs:finance-changed'])window.addEventListener(event,schedule);
  // Reconcile after initial header relocation and any already-completed load.
  window.addEventListener('load',schedule,{once:true});schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
