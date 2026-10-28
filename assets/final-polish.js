/* Read-only finishing layer. Existing modules own data, actions, chart creation and permissions. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),tones=['violet','amber','teal','blue'];
 const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5m0 14h16M8 15l4-5 4 2 4-7"/></svg>';
 const specs=[['sumRevenue','violet'],['sumPending','amber'],['sumReceived','teal'],['sumCredit','blue'],['kpiTotalCommission','violet'],['kpiThisMonth','blue'],['kpiHighest','amber'],['kpiAvg','teal'],['txTotal','violet'],['txPayments','teal'],['txBalance','amber'],['txCredits','blue']];
 function cards(){for(const [id,tone]of specs){const value=$(id),card=value?.closest('.glass');if(!card)continue;card.classList.add('rs-finish-kpi');card.dataset.finishTone=tone;if(!card.querySelector('.rs-finish-kpi-icon')){const span=document.createElement('span');span.className='rs-finish-kpi-icon';span.setAttribute('aria-hidden','true');span.innerHTML=icon;card.append(span);}}}
 let scheduled=false;
 function sync(){scheduled=false;const sidebar=$('sidebar');if(sidebar){
  const candidates=Array.from(sidebar.querySelectorAll('button[data-nav],#rsFinanceCentreNav'));
  const visible=Array.from(document.querySelectorAll('#mainContent section[id^="view-"]')).find(section=>!section.classList.contains('hidden')&&getComputedStyle(section).display!=='none');
  const name=visible?.id.slice(5)||'dashboard';
  for(const [index,button]of candidates.entries()){const key=button.id==='rsFinanceCentreNav'?'finance':button.dataset.nav;button.dataset.finishTone=tones[index%tones.length];button.dataset.finishActive=String(key===name);}
 }
 const surfaces=[document.querySelector('.rs-site-footer'),document.querySelector('.rs-bottom-nav')].filter(Boolean);let clearance=28;
 for(const surface of surfaces){const style=getComputedStyle(surface);if(!/^(fixed|sticky)$/.test(style.position)||style.display==='none'||style.visibility==='hidden')continue;const rect=surface.getBoundingClientRect();const occupied=Number.isFinite(rect.top)&&window.innerHeight?Math.max(0,window.innerHeight-rect.top):rect.height;clearance=Math.max(clearance,Math.ceil(occupied)+24);}
 for(const id of ['view-dashboard','view-customers','view-commission-report','view-transactions','view-reports'])$(id)?.style.setProperty('--rs-finish-clearance',clearance+'px');
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(sync);}}
 function init(){cards();sync();
  const observer=new MutationObserver(schedule);for(const section of document.querySelectorAll('#mainContent section[id^="view-"]'))observer.observe(section,{attributes:true,attributeFilter:['class']});
  if($('sidebar'))observer.observe($('sidebar'),{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current']});
  new MutationObserver(schedule).observe(document.body,{childList:true});
  if(window.ResizeObserver){const resize=new ResizeObserver(schedule);const footer=document.querySelector('.rs-site-footer');if(footer)resize.observe(footer);}
  window.addEventListener('resize',schedule,{passive:true});window.addEventListener('load',schedule,{once:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
