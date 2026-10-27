/* Preserve the existing 15-minute idle policy, with mobile activity and in-flight protection. */
(function(){
 'use strict';const idleMs=15*60*1000;let lastActivity=Date.now(),ending=false;
 function activity(){if(!ending)lastActivity=Date.now();}
 ['pointerdown','touchstart','keydown','input','change','focusin','mousemove','scroll'].forEach(name=>document.addEventListener(name,activity,{passive:true,capture:true}));
 window.addEventListener('rs:sync',event=>{if(event.detail?.pending>0||event.detail?.phase==='settled')activity();});
 setInterval(()=>{
  if(ending||document.visibilityState==='hidden'||window.rsPendingRequests>0||window.rsInvoiceIsSubmitting?.())return;
  if(Date.now()-lastActivity<idleMs)return;
  ending=true;
  if(typeof window.rsLogout==='function')window.rsLogout({stayOnPage:true,reason:'Session ended after 15 minutes without activity. Your open form remains here; sign in again before submitting.'});
 },30000);
 // Do not attach a popstate logout handler or change browser history.
})();
