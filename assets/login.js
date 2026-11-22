/* One verified request per submit; no stored passwords or automatic login retries. */
(function(){
 'use strict';const form=document.getElementById('rsLoginForm');if(!form)return;
 const env=document.getElementById('loginEnv'),name=document.getElementById('loginName'),password=document.getElementById('loginPassword'),status=document.getElementById('loginStatus'),button=form.querySelector('button[type="submit"]'),elapsed=document.getElementById('loginElapsed');let busy=false;
 env.value=localStorage.getItem('billing_env')==='live'?'live':'test';
 form.onsubmit=async function(event){
  event.preventDefault();if(busy)return;if(typeof form.reportValidity==='function'&&!form.reportValidity())return;
  const selectedEnv=env.value,username=name.value.trim(),secret=password.value;if(!username||!secret){status.textContent='Enter your username and password.';return;}
  busy=true;button.disabled=true;form.setAttribute('aria-busy','true');env.disabled=true;name.disabled=true;password.disabled=true;button.classList.add('is-working');status.dataset.state='working';status.textContent='Verifying your credentials securely…';
  const started=Date.now();if(elapsed)elapsed.textContent='';const timer=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);if(elapsed)elapsed.textContent=seconds+'s elapsed';if(seconds>=8)status.textContent='Secure verification is still running. Please keep this page open.';},1000);
  try{
   const result=await window.rsCall('login',{username,password:secret},{env:selectedEnv,timeoutMs:90000});
   if(result?.success!==true||typeof result.sessionToken!=='string'||!result.sessionToken||!['admin','viewer'].includes(result.role))throw new Error('The server did not return a valid sign-in. Check the deployed backend version.');
   for(const key of ['username','role','access'])sessionStorage.setItem(key,result[key]||'');
   sessionStorage.setItem('rs-session:'+selectedEnv,result.sessionToken);sessionStorage.setItem('env',selectedEnv);sessionStorage.setItem('isLoggedIn','true');localStorage.setItem('billing_env',selectedEnv);
   password.value='';status.dataset.state='success';status.textContent='Signed in. Opening your workspace…';location.replace('index.html');
  }catch(error){status.dataset.state='error';status.textContent=error.message||'Sign-in could not be confirmed. Please try again.';}
  finally{clearInterval(timer);busy=false;button.disabled=false;button.classList.remove('is-working');form.setAttribute('aria-busy','false');env.disabled=false;name.disabled=false;password.disabled=false;}
 };
})();
