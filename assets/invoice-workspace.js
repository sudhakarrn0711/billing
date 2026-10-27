/* Layout only. Invoice inputs, IDs, save and payment entry points stay in billing.js. */
(function(){
 'use strict';
 function init(){
  const view=document.getElementById('view-invoices');if(!view)return;
  const footer=document.querySelector('.rs-site-footer');
  function clearance(){const style=footer?getComputedStyle(footer):null;const overlay=style&&['fixed','sticky'].includes(style.position)&&style.display!=='none'&&style.visibility!=='hidden';const height=overlay?footer.getBoundingClientRect().height:0;view.style.setProperty('--rs-invoice-footer-clearance',Math.ceil(Math.max(0,height)+24)+'px');}
  clearance();window.addEventListener('resize',clearance,{passive:true});window.addEventListener('load',clearance,{once:true});
  if(footer&&typeof ResizeObserver!=='undefined')new ResizeObserver(clearance).observe(footer);
  new MutationObserver(clearance).observe(view,{attributes:true,attributeFilter:['class']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
