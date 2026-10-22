/* Environment-scoped sessions. Network errors never clear a valid session or replay writes. */
(function(){
 'use strict';let pending=0;
 function sync(phase,action,error){window.rsPendingRequests=pending;window.dispatchEvent(new CustomEvent('rs:sync',{detail:{phase,action,error,time:new Date().toISOString(),pending}}));}
 window.rsShowSessionNotice=function(message){
  let notice=document.getElementById('rsSessionNotice');
  if(!notice){notice=document.createElement('div');notice.id='rsSessionNotice';notice.setAttribute('role','alert');const copy=document.createElement('span');copy.className='rs-session-copy';const link=document.createElement('a');link.href='login.html';link.textContent='Sign in again';notice.append(copy,link);document.body.appendChild(notice);}
  notice.querySelector('.rs-session-copy').textContent=message||'Your session expired. Your open form stays here; sign in again before submitting.';
  notice.hidden=false;
 };
 window.rsCall=async function(action,payload={},options={}){
  action=String(action).toLowerCase();const env=options.env||localStorage.getItem('billing_env')||'test',body={...payload},publicCall=['login','portaldata'].includes(action),token=publicCall?'':sessionStorage.getItem('rs-session:'+env);
  if(!publicCall){if(!token){window.rsShowSessionNotice();const error=new Error('AUTH_REQUIRED: Sign in again before submitting.');error.code='AUTH_REQUIRED';throw error;}body.sessionToken=token;}
  const read=['getall','getcustomers','getservices','getinvoices','invoicecontext','invoicestatus','invoiceactivity','financeget','portaldata'].includes(action)||(action==='rsop'&&['bundle','audit'].includes(body.operation));
  const controller=new AbortController(),timeout=options.timeoutMs||(read?60000:90000);let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
  pending++;sync('loading',action);
  try{
   if(!window.RS_CONFIG?.api)throw new Error('Billing API configuration is missing. Check app-config.js.');
   const response=await fetch(`${window.RS_CONFIG.api}?action=${encodeURIComponent(action)}&env=${encodeURIComponent(env)}`,{method:'POST',body:JSON.stringify(body),credentials:'omit',signal:controller.signal});
   let data;try{data=await response.json();}catch(error){if(timedOut)throw error;throw new Error('The server returned an unreadable response. Check the connection and deployment; your session was retained.');}
   if(!response.ok||data?.error||data?.success===false||data?.ok===false)throw new Error(data?.error||'Request failed. Check the connection and try again.');
   if(action==='getall'||action==='financeget')sessionStorage.setItem('rs-last-sync:'+env,new Date().toISOString());
   sync('saved',action);
   if(/^(save|delete)/i.test(action)||(action==='rsop'&&!['bundle','audit'].includes(body.operation)))window.dispatchEvent(new CustomEvent('rs:mutation',{detail:{action,operation:body.operation}}));
   return data;
  }catch(cause){
   let error=cause instanceof Error?cause:new Error(String(cause));
   if(timedOut){const checkLabel=({invoicecontext:'Invoice balance',invoicestatus:'WhatsApp status',invoiceactivity:'Invoice activity',financeget:'Finance report',getall:'Workspace data'})[action]||'Data';error=new Error(read?checkLabel+' check timed out after '+Math.round(timeout/1000)+' seconds. Retry the check; your session was retained.':'Server confirmation timed out. The request may have saved. Check payment/invoice history and retry using the retained original request.');error.code='TIMEOUT';error.mayHaveSaved=!read;}
   sync('failed',action,error.message);
   if(/^AUTH_REQUIRED\b/.test(error.message)){
    // A late failure for an old token must not clear a newer sign-in.
    if(sessionStorage.getItem('rs-session:'+env)===token){sessionStorage.removeItem('rs-session:'+env);window.rsShowSessionNotice('Your session expired or account changed. Review any pending request, then sign in again.');}
    error.code='AUTH_REQUIRED';
   }
   throw error;
  }finally{clearTimeout(timer);pending--;sync('settled',action);}
 };
 window.rsLogout=async function(options={}){
  try{if(sessionStorage.getItem('rs-session:'+(localStorage.getItem('billing_env')||'test')))await window.rsCall('logout',{}, {timeoutMs:10000});}catch(ignored){}
  Object.keys(sessionStorage).filter(key=>key.startsWith('rs-')||['isLoggedIn','username','role','access','env'].includes(key)).forEach(key=>sessionStorage.removeItem(key));
  if(options.stayOnPage)window.rsShowSessionNotice(options.reason||'Session ended due to inactivity. Sign in again before submitting.');else location.href='login.html';
 };
 window.addEventListener('offline',()=>sync('failed','connection','Offline. Changes are not queued automatically.'));
})();
