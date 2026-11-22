/* Bundled PDF-lib renderer: portrait A4, no jsPDF/CDN/table-plugin dependency. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.RanSanStatementPDF=api;})(typeof window!=='undefined'?window:null,function(){
'use strict';
async function create(report,lib){
 if(!lib?.PDFDocument)throw Error('Statement PDF engine is unavailable. Upload assets/vendor/pdf-lib.min.js and refresh.');
 const {PDFDocument,StandardFonts,rgb}=lib,doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const title=report.title||'Customer Ledger Statement';doc.setTitle(title);doc.setAuthor('RanSan Groups');
 const W=595.28,H=841.89,M=32,usable=W-M*2,widths=[156,58,82,82,82,usable-460];
 const C={ink:'#172554',muted:'#64748b',violet:'#6d28d9',teal:'#0f766e',amber:'#92400e',line:'#dce3f0'};
 const color=hex=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255),num=n=>Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 let page,y;const imageCache=new Map();
 function canvas(){if(typeof document==='undefined')throw Error('This text needs browser font rendering. Use Print / Save PDF.');return document.createElement('canvas');}
 function supported(s,font){try{font.encodeText(s);return true}catch{return false}}
 function measure(s,size,font=regular){if(supported(s,font))return font.widthOfTextAtSize(s,size);const c=canvas(),ctx=c.getContext('2d');if(!ctx)throw Error('Browser text renderer is unavailable');ctx.font=(font===bold?'bold ':'')+size+'px Arial, sans-serif';return ctx.measureText(s).width;}
 function wrap(value,maxWidth,size,font=regular){const input=String(value??'').replace(/[\r\n\t]+/g,' ');if(!input)return [''];const result=[];let line='';for(const point of input){if(line&&measure(line+point,size,font)>maxWidth){result.push(line.trimEnd());line=point.trimStart()}else line+=point;}if(line)result.push(line.trimEnd());return result;}
 async function text(value,x,top,size=9,hex=C.ink,font=regular){const s=String(value??'');if(!s)return;if(supported(s,font)){page.drawText(s,{x,y:H-top-size,size,font,color:color(hex)});return;}
  // Keep non-Latin names intact using the browser's shaping/font fallback, at 3x resolution.
  const key=[s,size,hex,font===bold].join('|');let item=imageCache.get(key);if(!item){const c=canvas(),ctx=c.getContext('2d'),fontCSS=(font===bold?'bold ':'')+size+'px Arial, sans-serif';ctx.font=fontCSS;const width=Math.max(1,ctx.measureText(s).width),height=size*1.7;c.width=Math.ceil(width*3+6);c.height=Math.ceil(height*3);ctx.scale(3,3);ctx.font=fontCSS;ctx.textBaseline='top';ctx.fillStyle=hex;ctx.fillText(s,0,0);const image=await doc.embedPng(c.toDataURL('image/png'));item={image,width:c.width/3,height:c.height/3};imageCache.set(key,item);}page.drawImage(item.image,{x,y:H-top-item.height,width:item.width,height:item.height});
 }
 function rect(x,top,width,height,fill,border){page.drawRectangle({x,y:H-top-height,width,height,color:color(fill),...(border?{borderColor:color(border),borderWidth:.6}:{})});}
 async function lines(values,x,top,size=9,hex=C.ink,font=regular,gap=size*1.4){for(let i=0;i<values.length;i++)await text(values[i],x,top+i*gap,size,hex,font);}
 async function rowHeader(){rect(M,y,usable,25,'#312e81');let x=M;for(const [i,label]of ['INVOICE / CUSTOMER / DUE','DATE','TOTAL','PAID','BALANCE','STATUS'].entries()){await text(label,x+7,y+8,7,'#ffffff',bold);x+=widths[i];}y+=25;}
 async function newPage(continuation=false,notesPage=false){page=doc.addPage([W,H]);y=M;if(continuation){await text(report.title?'RANSAN GROUPS / CUSTOMER STATEMENT':'RANSAN GROUPS / CUSTOMER LEDGER',M,y,9,C.violet,bold);await text('Continued | '+report.generated,W-M-118,y,8,C.muted);y+=24;if(!notesPage)await rowHeader();}}
 await newPage();await text('RANSAN GROUPS',M,y,9,C.violet,bold);y+=20;await text(title,M,y,22,C.ink,bold);y+=34;
 const scope=wrap(report.businessName+' / '+report.customerName+' / '+report.statusName+' / '+(report.filterLabel||'All due conditions'),usable-24,9,bold);const scopeHeight=scope.length*13+33;rect(M,y,usable,scopeHeight,'#eef2ff','#c7d2fe');await lines(scope,M+12,y+10,9,C.violet,bold,13);await text('Generated '+report.generated+'  |  '+report.rows.length+' invoice(s)  |  '+(report.basisLabel||'All recorded dates'),M+12,y+14+scope.length*13,8,C.muted);y+=scopeHeight+14;
 const gap=9,cardWidth=(usable-gap*2)/3;for(const [i,card]of [{label:'TOTAL INVOICED',value:report.totals.invoiced,fill:'#f3e8ff',ink:C.violet,line:'#d8b4fe'},{label:'PAYMENTS APPLIED',value:report.totals.paid,fill:'#ccfbf1',ink:C.teal,line:'#5eead4'},{label:'BALANCE DUE',value:report.totals.balance,fill:'#fef3c7',ink:C.amber,line:'#fcd34d'}].entries()){const x=M+i*(cardWidth+gap);rect(x,y,cardWidth,72,card.fill,card.line);await text(card.label,x+11,y+12,7.3,card.ink,bold);const amount='INR '+num(card.value);let size=15;while(size>9&&measure(amount,size,bold)>cardWidth-22)size-=.5;await text(amount,x+11,y+33,size,card.ink,bold);}y+=86;
 const note=wrap('Amounts in INR. Invoice balances only. Standalone advances, opening balances and ledger adjustments are separate. Payments applied may include advance allocations.',usable,8);await lines(note,M,y,8,C.muted,regular,11);y+=note.length*11+13;if(report.explanation){const extra=wrap(report.explanation,usable,8);await lines(extra,M,y,8,C.muted,regular,11);y+=extra.length*11+12;}
 const warnings=report.warnings||{};if(warnings.invalidDates||warnings.negativeBalances||warnings.voided||warnings.missingPaymentDates||warnings.invalidPaymentDates){const warn=wrap('Review: '+(warnings.invalidDates||0)+' invalid invoice date(s), '+(warnings.negativeBalances||0)+' negative balance(s), '+(warnings.voided||0)+' void/cancelled row(s); '+((warnings.missingPaymentDates||0)+(warnings.invalidPaymentDates||0))+' payment date issue(s). '+(report.filters?.dateMode==='asof'?'Invalid invoice dates and missing/invalid payment dates excluded. Current saved invoice totals used; historical invoice edits not reconstructed.':'Saved amounts retained.'),usable-18,8);rect(M,y,usable,warn.length*11+16,'#fff7ed','#fed7aa');await lines(warn,M+9,y+8,8,C.amber,regular,11);y+=warn.length*11+27;}
 if(y>H-120)await newPage(true);else await rowHeader();
 for(const [index,r]of report.rows.entries()){
  const ref=wrap(r.reference,widths[0]-14,8.2,bold),customer=wrap(r.customer,widths[0]-14,7.5),business=wrap(r.business,widths[0]-14,7.1),dueLines=r.dueState?wrap((r.due?'Due '+r.due+' / ':'')+r.dueState.label,widths[0]-22,7.1):[],leftHeight=ref.length*11+customer.length*10+business.length*10+(dueLines.length?dueLines.length*10+12:0)+10;
  const values=[r.date||'Not recorded',num(r.total),num(r.paid),num(r.balance),r.status];const other=values.map((v,i)=>wrap(v,widths[i+1]-14,i===4?7:8)),height=Math.max(41,leftHeight,...other.map(a=>a.length*11+18));
  if(height>H-110)throw Error('An invoice row is too long for A4. Use Print / Save PDF for this statement.');if(y+height>H-52)await newPage(true);
  rect(M,y,usable,height,index%2?'#f5f7ff':'#ffffff');let x=M;await lines(ref,x+7,y+9,8.2,C.violet,bold,11);await lines(customer,x+7,y+9+ref.length*11,7.5,C.ink,regular,10);await lines(business,x+7,y+9+ref.length*11+customer.length*10,7.1,C.muted,regular,10);if(dueLines.length){const top=y+12+ref.length*11+customer.length*10+business.length*10;rect(x+5,top,widths[0]-10,dueLines.length*10+7,r.dueState.key==='overdue'?'#fff1f2':'#fffbeb');await lines(dueLines,x+10,top+3,7.1,r.dueState.key==='overdue'?'#be123c':C.amber,regular,10);}x+=widths[0];
  for(let col=0;col<other.length;col++){const hex=col===2?C.teal:col===3?C.amber:C.ink;if(col===4){const status=String(r.status).toLowerCase(),fill=status==='paid'?'#ccfbf1':status==='partial'?'#fef3c7':status==='pending'?'#ffe4e6':'#e0e7ff';rect(x+4,y+8,widths[col+1]-8,other[col].length*11+8,fill);await lines(other[col],x+7,y+12,7,status==='paid'?C.teal:status==='partial'?C.amber:C.violet,bold,11);}else{const size=col===0?7.5:8;for(let k=0;k<other[col].length;k++){const line=other[col][k];await text(line,col===0?x+7:x+widths[col+1]-7-measure(line,size),y+10+k*11,size,hex);}}x+=widths[col+1];}
  page.drawLine({start:{x:M,y:H-y-height},end:{x:W-M,y:H-y-height},thickness:.5,color:color(C.line)});y+=height;
 }
 if(y+44>H-52)await newPage(true);rect(M,y,usable,40,'#e0e7ff','#c7d2fe');await text('FILTERED TOTALS',M+9,y+13,8,C.violet,bold);let x=M+widths[0]+widths[1];for(const value of [report.totals.invoiced,report.totals.paid,report.totals.balance]){const formatted=num(value);let size=8;while(size>6&&measure(formatted,size,bold)>68)size-=.5;await text(formatted,x+82-7-measure(formatted,size,bold),y+13,size,C.ink,bold);x+=82;}
 y+=56;
 if(report.invoiceNotes?.length){
  if(y+35>H-52)await newPage(true,true);await text('Invoice notes',M,y,12,C.violet,bold);y+=23;
  for(const note of report.invoiceNotes){const titleLines=wrap(note.reference,usable,9,bold);if(y+titleLines.length*13+15>H-52)await newPage(true,true);await lines(titleLines,M,y,9,C.violet,bold,13);y+=titleLines.length*13+5;
   for(const line of wrap(note.text,usable-8,8)){if(y+12>H-52){await newPage(true,true);await text('Invoice notes (continued)',M,y,10,C.violet,bold);y+=20;}await text(line,M+4,y,8,C.ink);y+=12;}y+=14;
  }
 }
 for(const [i,p]of doc.getPages().entries()){page=p;await text('System-generated invoice balance report',M,H-30,7,C.muted);const label='Page '+(i+1)+' of '+doc.getPageCount();await text(label,W-M-measure(label,7),H-30,7,C.muted);}
 return doc.save();
}
return {create};
});
