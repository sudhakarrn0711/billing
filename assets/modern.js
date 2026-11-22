/* In-page invoice preview: user-initiated printing works after an async save. */
window.rsShowInvoicePreview=function(html){
 const old=document.getElementById('rsInvoicePreview');if(old)old.remove();
 const previous=document.activeElement;const panel=document.createElement('section');panel.id='rsInvoicePreview';panel.className='rs-preview';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Invoice preview');
 panel.innerHTML='<div class="rs-preview-bar"><strong>Invoice preview</strong><button type="button" disabled>Print / Save PDF</button><button type="button">Close</button><span class="rs-preview-status" role="status">Preparing invoice…</span></div>';
 const frame=document.createElement('iframe');frame.title='Printable invoice';const buttons=panel.querySelectorAll('button');const status=panel.querySelector('[role=status]');let disposed=false;
 const onKey=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const available=Array.from(buttons).filter(b=>!b.disabled);const first=available[0],last=available[available.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
 function close(){disposed=true;panel.remove();document.removeEventListener('keydown',onKey);previous?.focus()}
 buttons[1].onclick=close;document.addEventListener('keydown',onKey);
 buttons[0].onclick=()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(e){status.textContent='Use your browser’s Print command to save this invoice.'}};
 frame.onload=async()=>{const doc=frame.contentDocument;await Promise.race([Promise.all(Array.from(doc.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve}))),new Promise(resolve=>setTimeout(resolve,5000))]);if(disposed)return;buttons[0].disabled=false;status.textContent='Ready. Choose Save as PDF in your device’s print options.'};
 // Resolve relative logo/signature URLs against the application, not about:srcdoc.
 const base=document.createElement('base');base.href=document.baseURI;html=html.replace(/<head>/i,'<head>'+base.outerHTML);frame.srcdoc=html;panel.append(frame);document.body.append(panel);buttons[1].focus();
};
