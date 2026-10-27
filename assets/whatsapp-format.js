/* Shared message formatting only. No network calls, credentials, sends or financial writes. */
var RanSanMessageFormat=(function(){
 'use strict';
 function amount(value){return '₹'+(Math.round((Number(value)||0)*100)/100).toLocaleString('en-IN',{maximumFractionDigits:2});}
 function links(upi,name,value){var intent='upi://pay?pa='+encodeURIComponent(upi)+'&pn='+encodeURIComponent(name||'RanSan')+'&am='+(Number(value)||0).toFixed(2)+'&cu=INR';return {upi:intent,web:'https://pay.google.com/gp/p/ui/pay?pa='+encodeURIComponent(upi)+'&pn='+encodeURIComponent(name||'RanSan')+'&am='+(Number(value)||0).toFixed(2)+'&cu=INR',qr:'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(intent)};}
 function account(business,config){business=business||{};config=config||{};return {gpay:String(business.gpay||business.gpayNumber||config.gpay_number||config.gpay||'9363410567'),upi:String(business.upi||business.upiId||config.upi_id||'f051m00855@indianbk')};}
 function paymentDetails(data,withLinks){var pay=data.account||{},parts=[];if(!pay.upi&&!pay.gpay)return '';parts.push('💳 *Payment Details*');if(pay.gpay)parts.push('📱 GPay: '+pay.gpay);if(pay.upi)parts.push('💠 UPI: '+pay.upi);if(withLinks&&pay.upi){var payLinks=links(pay.upi,data.business,data.pending);parts.push('\n👉 Pay Now:\n'+payLinks.web);}return parts.join('\n');}
 function view(url,title){return url?'\n\n📊 '+(title||'*View Details*')+'\n'+url:'';}
 function greeting(data){return 'Hi '+data.customer+',\n\n';}
 function newInvoice(data){return greeting(data)+'🧾 *New Invoice Created*\n\n📄 Invoice No: '+data.number+'\n💰 Total Amount: '+amount(data.total)+'\n💳 Paid: '+amount(data.paid)+'\n📊 Pending: '+amount(data.pending)+view(data.url)+(data.pending>0?'\n\n'+paymentDetails(data,false):'\n\n✅ This invoice is fully paid.')+'\n\nThank you for choosing '+data.business+' 🙏\n\nWarm regards,\n'+data.business;}
 function dueText(days){return days===null||days===undefined?'':days>0?'🔴 Overdue by '+days+' day'+(days===1?'':'s'):days===0?'🟠 Due today':-days<=3?'⚠️ Due in '+(-days)+' day'+(days===-1?'':'s'):'';}
 function paymentReceived(data){var rows=(data.invoices||[]).map(function(inv){var due=dueText(inv.daysOverdue);return '🧾 '+inv.number+' → '+amount(inv.pending)+(due?' · '+due:'');});
  var text=greeting(data)+'✅ *Payment Received*'+view(data.url,'*View Your Dashboard*')+'\n\nWe have received your payment.\n\n💰 Paid Now: '+amount(data.paidNow)+'\n\n📋 *Pending Invoices*\n────────────────\n'+(rows.length?rows.join('\n'):'No pending invoices 🎉')+'\n────────────────\n🧾 *Total Pending: '+amount(data.pending)+'*';
  if(data.pending<=0)return text+'\n\n🎉 *Payment Completed Successfully!*\n\nThank you for clearing your dues with '+data.business+'.\nWe truly appreciate your business.\n\nLooking forward to serving you again 🤝\n\nWarm regards,\n'+data.business;
  return text+'\n\n'+paymentDetails(data,false)+'\n\nKindly complete the pending payment and share the screenshot.\n\nWe appreciate your business with '+data.business+'.\nLooking forward to serving you again 🤝\n\nRegards,\n'+data.business;
 }
 function reminder(data){var text=greeting(data)+'📌 *Payment Reminder*\n\n📋 *Pending Invoices*\n────────────────\n'+(data.invoices||[]).map(function(inv){var days=inv.daysOverdue,label=dueText(days);if(days< -3)label='⚠️ Due in '+(-days)+' days';if(days===null||days===undefined)label='Due date not recorded';return '🧾 '+inv.number+' → '+amount(inv.pending)+(label?' · '+label:'');}).join('\n')+((data.invoices||[]).length?'':(data.numbers||[]).join(', '))+'\n────────────────'+'\n\n💰 Total Amount: '+amount(data.total)+'\n💳 Paid: '+amount(data.paid)+'\n📊 *Pending: '+amount(data.pending)+'*'+view(data.url);var details=paymentDetails(data,true);if(details)text+='\n\n'+details;
  if(data.due)text+='\n\n'+(data.overdue?'🔴 Earliest overdue date: ':'⚠️ Kindly clear by: ')+data.due;
  return text+'\n\nKindly clear '+(data.overdue?'the overdue balance':'your dues')+' at the earliest.\nThank you 🙏'+(data.business?'\n\nRegards,\n'+data.business:'');
 }
 function overdue(data){var pay=data.account||{},text=greeting(data)+'🔔 *Overdue Payment Reminder*\n\n📄 Invoice No: '+data.number+'\n💰 Pending Amount: '+amount(data.pending)+'\n🔴 Overdue by: '+data.daysOverdue+' day'+(data.daysOverdue===1?'':'s')+view(data.url);var details=paymentDetails(data,false);if(details)text+='\n\n'+details;
  if(pay.upi){var p=links(pay.upi,data.business,data.pending);text+='\n\n💳 *Pay Now (Mobile)*\n'+p.upi+'\n\n💻 *Scan & Pay (Desktop)*\n'+p.qr;}
  return text+'\n\nKindly clear the payment at the earliest.\nIf already paid, please share your payment reference.\n\nRegards,\n'+data.business;
 }
 return {amount:amount,links:links,account:account,newInvoice:newInvoice,paymentReceived:paymentReceived,reminder:reminder,overdue:overdue,dueText:dueText};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RanSanMessageFormat;
