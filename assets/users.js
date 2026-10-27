/* Verified user administration. Presets affect menu preferences only; backend owns authorization. */
(function () {
 'use strict';
 const $ = id => document.getElementById(id);
 const menus = {dashboard:'Dashboard',transactions:'Transactions',invoices:'Invoices',customers:'Customers',services:'Services',reports:'Reports',customerLedger:'Customer ledger',statement:'Statements','commission-report':'Commission',adv2_panel:'Advanced statements',users:'Manage users',collections:'Collection Centre',ageing:'Receivables Ageing',ledger:'Unified Ledger','commission-settlement':'Commission Settlement','business-comparison':'Business Comparison',reconciliation:'Reconciliation',audit:'Audit Trail',archive:'Archive & Restore',portal:'Customer Access'};
 const presets = {billing:['transactions','invoices','customers','services','customerLedger','statement'],collections:['collections','ageing','ledger','customerLedger','statement','reconciliation'],reports:['dashboard','reports','statement','commission-report','business-comparison']};
 let users=[],editing=null,passwordOnly=false,busy=false,baseline='',closing=null,opening=false,opener=null,historyBusy=false,historyOffset=0,historyTotal=0,historyEvents=[],modalScope='',listScope='',historyScope='';
 const tokenKey=()=>`rs-admin:${getBillingEnv()}:${sessionStorage.getItem('username')||'user'}`;
 const scope=()=>`${getBillingEnv()}|${sessionStorage.getItem('username')||'user'}`;
 const message=text=>{$('rsUserStatus').textContent=text;};
 const toast=(text,tone)=>window.showToast?.(text,tone);
 function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;}
 async function call(operation,data={}){
  const result=await fetchServerData('rsusers',{operation,token:sessionStorage.getItem(tokenKey())||'',...data});
  if(result.error||result.success===false)throw new Error(result.error||'User operation failed');return result;
 }
 function requireToken(){if(sessionStorage.getItem(tokenKey()))return true;$('rsAdminForm').hidden=false;message('Verify your admin credentials before managing users.');$('rsAdminPassword').focus();return false;}
 const checks=()=>Array.from($('accessList').querySelectorAll('input[type="checkbox"]'));
 const selected=()=>checks().filter(x=>x.checked).map(x=>x.value);
 function signature(){return JSON.stringify({username:$('uUsername').value,password:$('uPassword').value,role:$('uRole').value,access:selected().sort()});}
 const isOpen=()=>!$('userModal').classList.contains('hidden');
 const dirty=()=>isOpen()&&baseline!==signature();
 async function confirm(options){if(typeof window.rsInvoiceConfirm!=='function'){toast('Confirmation dialog is unavailable. Reload the page before continuing.','error');return false;}return window.rsInvoiceConfirm(options);}
 function forceClose(){
  $('userModal').classList.add('hidden');$('uPassword').value='';baseline='';
  if(opener?.isConnected)opener.focus();
 }
 window.closeUserModal=function(){
  if(busy)return Promise.resolve(false);
  if(!dirty()){forceClose();return Promise.resolve(true);}
  if(closing)return closing;
  closing=confirm({title:'Discard unsaved user changes?',message:'Your account or permission changes have not been saved.',confirmLabel:'Discard changes',cancelLabel:'Keep editing',danger:true}).then(answer=>{if(answer)forceClose();return answer;}).finally(()=>{closing=null;});
  return closing;
 };
 function updateSummary(){
  const values=selected(),admin=$('uRole').value==='admin';
  $('rsUserPermissionSummary').replaceChildren();
  $('rsUserPermissionCount').textContent=passwordOnly?'Password update only':`${values.length} / ${Object.keys(menus).length} menus selected`;
  $('rsUserPermissionNote').textContent=passwordOnly?'Role and menu access remain unchanged.':admin?'Administrators have full access. Selected menus are saved preferences, not a restriction on administrator rights.':values.length?'Review these menu permissions before saving.':'No menu access selected for this viewer.';
  if(!passwordOnly)for(const key of values){const pill=node('span','rs-users-pill',menus[key]||key);pill.dataset.tone='teal';$('rsUserPermissionSummary').append(pill);}
  $('rsUserPresetTools').hidden=passwordOnly;
  $('rsUserPermissionSummary').hidden=passwordOnly;
 }
 function buildModal(user,mode){
  editing=user;passwordOnly=mode==='password';opener=document.activeElement;modalScope=scope();
  $('modalTitle').textContent=passwordOnly?'Change password':user?'Edit user':'Add user';
  $('rsSaveUser').textContent=passwordOnly?'Update password':user?'Save changes':'Create user';
  $('uUsername').value=user?.username||'';$('uUsername').disabled=passwordOnly;
  $('uPassword').value='';$('uPassword').placeholder=passwordOnly?'Enter new password':user?'Leave blank to keep current password':'Enter password';
  $('uRole').value=user?.role||'viewer';$('uRole').disabled=false;
  $('accessList').replaceChildren();
  const access=(user?.access||'').split(',');
  for(const [value,text] of Object.entries(menus)){
   const label=node('label'),input=node('input');input.type='checkbox';input.value=value;input.checked=user?.access==='all'||access.includes(value);label.append(input,document.createTextNode(text));$('accessList').append(label);
  }
  $('accessList').parentElement.hidden=passwordOnly;$('uRole').closest('label').hidden=passwordOnly;
  $('rsUserPreset').value='';$('userModal').classList.remove('hidden');updateSummary();baseline=signature();
  (passwordOnly?$('uPassword'):$('uUsername')).focus();
 }
 async function open(user,mode){
  if(busy||opening||!requireToken())return;
  if(user&&listScope!==scope()){toast('Reload users for the current environment before editing.','error');return;}
  opening=true;
  try{if(isOpen()&&!(await window.closeUserModal()))return;buildModal(user,mode);}finally{opening=false;}
 }
 window.openUserModal=user=>open(user||null,'account');
 window.changePasswordModal=username=>{const user=users.find(x=>x.username===username);return user?open(user,'password'):Promise.resolve();};
 window.rsApplyUserPreset=function(){
  if(busy||passwordOnly)return;const keys=presets[$('rsUserPreset').value];if(!keys)return;
  for(const input of checks())input.checked=keys.includes(input.value);
  updateSummary();toast('Permission preset applied. Review menus before saving.','info');
 };
 function render(){
  const query=$('rsUserSearch').value.toLowerCase(),visible=users.filter(u=>[u.username,u.role,u.access].join(' ').toLowerCase().includes(query));
  const tbody=$('usersTable');tbody.replaceChildren();
  for(const user of visible){
   const row=node('tr');
   for(const [index,value] of [user.username,user.role,user.access==='all'?'All menus':user.access||'No menus'].entries()){
    const td=node('td');if(index===1)td.append(node('span','rs-role',value));else td.textContent=value;row.append(td);
   }
   const actions=node('td'),group=node('div');
   for(const [label,fn] of [['Edit',()=>window.openUserModal(user)],['Password',()=>window.changePasswordModal(user.username)],['Delete',()=>window.deleteUser(user.username)]]){
    const button=node('button','btn'+(label==='Delete'?' rs-user-delete':''),label);button.type='button';button.onclick=fn;group.append(button);
   }
   actions.append(group);row.append(actions);tbody.append(row);
  }
  if(!visible.length){const row=node('tr'),cell=node('td','','No users match your search.');cell.colSpan=4;row.append(cell);tbody.append(row);}
  $('rsUserTotal').textContent=users.length;$('rsUserAdmins').textContent=users.filter(u=>u.role==='admin').length;$('rsUserViewers').textContent=users.filter(u=>u.role==='viewer').length;
  message(visible.length?`${visible.length} user(s) shown`:'No users match your search.');
 }
 window.loadUsers=async function(){
  if(!requireToken())return;const current=scope();message('Loading users…');
  try{const data=await call('list');if(scope()!==current)return;
   if(!Array.isArray(data.users))throw new Error('The server returned an invalid user list.');
   users=data.users.filter(u=>{const name=String(u.username||'').trim().toLowerCase();return !!name&&['admin','viewer'].includes(String(u.role||'viewer').toLowerCase())&&!(name==='username'&&String(u.role).toLowerCase()==='role');});
   listScope=current;$('rsAdminForm').hidden=true;render();
  }catch(e){if(scope()!==current)return;message(e.message);if(/verif|expired|admin/i.test(e.message)){sessionStorage.removeItem(tokenKey());$('rsAdminForm').hidden=false;}}
 };
 window.saveUser=async function(){
  if(busy)return;
  const username=$('uUsername').value.trim(),password=$('uPassword').value;
  if(!username||(!editing&&!password)||(passwordOnly&&!password)){message('Username and password are required for this action.');toast('Complete the required user fields.','error');return;}
  if(!requireToken())return;
  if(modalScope!==scope()){toast('Environment or signed-in account changed. Reopen this form before saving.','error');return;}
  busy=true;$('rsSaveUser').disabled=true;
  const operation=passwordOnly?'password':editing?'update':'create',values=selected();
  // Keep explicit all-menu grants when an existing all-menu profile remains fully selected.
  const access=editing?.access==='all'&&values.length===Object.keys(menus).length?'all':values.join(',');
  try{
   const result=await call(operation,{username,password,oldUsername:editing?.username,role:$('uRole').value,access});
   forceClose();toast(operation==='password'?'Password updated.':'User saved.','success');
   if(result.auditWarning)toast(result.auditWarning,'info');
   await window.loadUsers();
  }catch(e){toast(e.message,'error');}
  finally{busy=false;$('rsSaveUser').disabled=false;}
 };
 window.deleteUser=async function(username){
  if(busy||!requireToken())return;
  const current=scope();
  if(listScope!==current){toast('Reload users for the current environment before deleting.','error');return;}
  busy=true; // Covers confirmation too, so repeated clicks cannot open another deletion.
  try{
   const approved=await confirm({title:'Delete user?',message:'This removes the account and its workspace access. Existing invoices and reports are retained.',details:[['Username',username]],danger:true,confirmLabel:'Delete user',cancelLabel:'Cancel'});
   if(!approved)return;
   if(current!==scope())throw new Error('Environment or account changed. Review the user list before deleting.');
   const operation=async()=>{const result=await call('delete',{username});toast('User deleted.','success');if(result.auditWarning)toast(result.auditWarning,'info');await window.loadUsers();};
   if(typeof window.rsInvoiceProgress==='function')await window.rsInvoiceProgress('Deleting user',operation);else await operation();
  }catch(e){toast(e.message,'error');}finally{busy=false;}
 };
 function formatTime(value){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(d)+' IST':'Time not recorded';}
 function renderHistory(){
  const body=$('rsUserActivityRows');body.replaceChildren();
  const labels={create:'Account creation',update:'Role / account update',password:'Password change',delete:'Account deletion'};
  for(const event of historyEvents){
   const row=node('tr'),operation=String(event.action).split(':')[1],before=event.before||{},after=event.after||{};
   const status={committed:'Confirmed',prepared:'Requested',failed:'Failed'}[event.phase]||'Recorded';
   const values=[formatTime(event.createdAt),after.username||before.username||'Not recorded',labels[operation]||'User operation',event.actor||'Not recorded'];
   for(const value of values)row.append(node('td','',value));
   const cell=node('td'),pill=node('span','rs-users-pill',status);pill.dataset.tone=event.phase==='committed'?'teal':event.phase==='failed'?'pink':'amber';cell.append(pill);row.append(cell);
   const detail=node('td');
   if(operation==='update'&&event.phase==='committed'){
    const changes=[];if(before.username&&before.username!==after.username)changes.push(`Name: ${before.username} → ${after.username}`);
    if(before.role&&after.role&&before.role!==after.role)changes.push(`Role: ${before.role} → ${after.role}`);
    if(typeof before.access==='string'&&typeof after.access==='string'&&before.access!==after.access)changes.push('Menu access changed');
    detail.textContent=changes.join(' · ')||'Account details updated; unchanged fields may also have been submitted.';
   }else detail.textContent=event.phase==='prepared'?'Request recorded; this entry alone does not confirm completion.':operation==='password'?'Password value is not displayed.':event.phase==='failed'?'Operation failed; review current account state.':'Recorded account operation.';
   row.append(detail);body.append(row);
  }
  if(!historyEvents.length){const row=node('tr'),cell=node('td','','No user change events found in the audit rows checked. Load older records to check earlier activity.');cell.colSpan=6;row.append(cell);body.append(row);}
  $('rsUserActivityStatus').textContent=`${historyEvents.length} user event(s) · ${historyOffset} of ${historyTotal} audit rows checked. Requested and Confirmed entries may describe the same operation.`;
  $('rsUserHistoryMore').hidden=historyOffset>=historyTotal;
 }
 window.rsLoadUserActivity=async function(reset=true){
  if(historyBusy||!requireToken())return;historyBusy=true;
  const current=scope();
  if(historyScope!==current){reset=true;historyEvents=[];historyOffset=0;historyTotal=0;$('rsUserActivityRows').replaceChildren();}
  $('rsUserHistoryRefresh').disabled=true;$('rsUserHistoryMore').disabled=true;
  $('rsUserActivityStatus').textContent='Loading recorded user activity…';
  try{
   const offset=reset?0:historyOffset;
   const result=await fetchServerData('rsop',{operation:'audit',offset});
   if(scope()!==current)return;
   if(result.error||!Array.isArray(result.rows)||!Number.isFinite(Number(result.total)))throw new Error(result.error||'Invalid audit response.');
   if(reset)historyEvents=[];historyScope=current;
   historyEvents.push(...result.rows.filter(x=>/^rsusers:(create|update|password|delete)$/.test(x.action||'')||(x.action==='rsusers'&&x.phase==='failed'&&x.before?.username)));
   historyOffset=offset+result.rows.length;historyTotal=Number(result.total);renderHistory();
  }catch(e){$('rsUserActivityStatus').textContent='Activity could not be loaded: '+e.message;toast(e.message,'error');}
  finally{historyBusy=false;$('rsUserHistoryRefresh').disabled=false;$('rsUserHistoryMore').disabled=false;}
 };
 function init(){
  $('rsAdminName').value=sessionStorage.getItem('username')||'';
  $('rsUserSearch').addEventListener('input',render);
  $('accessList').addEventListener('change',updateSummary);$('uRole').addEventListener('change',updateSummary);
  $('rsAdminForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter||$('rsAdminForm').querySelector('button');button.disabled=true;try{const result=await call('verify',{username:$('rsAdminName').value.trim(),password:$('rsAdminPassword').value});sessionStorage.setItem(tokenKey(),result.token);$('rsAdminPassword').value='';await window.loadUsers();}catch(err){message(err.message);}finally{button.disabled=false;}};
  if(sessionStorage.getItem(tokenKey()))$('rsAdminForm').hidden=true;
  window.addEventListener('beforeunload',event=>{if(dirty()||busy){event.preventDefault();event.returnValue='';}});
  document.addEventListener('keydown',event=>{
   if(!isOpen()||document.getElementById('rsInvoiceConfirmModal'))return;
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();window.closeUserModal();}
   if(event.key==='Tab'){
    const controls=Array.from($('userModal').querySelectorAll('button,input,select')).filter(x=>!x.disabled&&!x.closest('[hidden]'));
    const first=controls[0],last=controls.at(-1);if(!first)return;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  },true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
