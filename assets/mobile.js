/* =====================================================
   MOBILE.JS — CLEAN FINAL FIXED VERSION
   Solves:
   ✅ No top bar on mobile
   ✅ Env + Logout moved inside sidebar
   ✅ Sidebar has open + close button
   ✅ Login center perfect
   ✅ Modal close visible
   ✅ Collapse hidden
===================================================== */

(function () {
  "use strict";

  const MOBILE = 768;

  window.addEventListener("load", initMobile);
  window.addEventListener("resize", initMobile);

  function initMobile() {
    if (window.innerWidth > MOBILE) return;

    bodyFix();
    loginFix();
    createSidebarSystem();
    hideOldButtons();
    moveSidebarActions();
    modalFix();
    uiFix();
  }

  function qs(x){ return document.querySelector(x); }
  function qsa(x){ return document.querySelectorAll(x); }

  /* ==========================================
     BODY
  ========================================== */
  function bodyFix(){
    document.body.style.overflowX = "hidden";
  }

  /* ==========================================
     LOGIN PERFECT CENTER
  ========================================== */
  function loginFix(){

    const login =
      qs("#loginScreen") ||
      qs("#login") ||
      qs(".login-screen") ||
      qs(".login-container");

    if(!login) return;

    login.style.position = "fixed";
    login.style.inset = "0";
    login.style.display = "flex";
    login.style.alignItems = "center";
    login.style.justifyContent = "center";
    login.style.padding = "18px";
    login.style.background = "#f8fafc";
    login.style.zIndex = "999999";

    const card = login.firstElementChild;

    if(card){
      card.style.width = "100%";
      card.style.maxWidth = "420px";
      card.style.borderRadius = "18px";
      card.style.padding = "22px";
    }
  }

  /* ==========================================
     SIDEBAR SYSTEM
  ========================================== */
  function createSidebarSystem(){

    if(qs("#mobileMenuFloat")) return;

    const aside = qs("aside");
    if(!aside) return;

    aside.id = "mobileSidebar";

    /* Floating open button */
    const openBtn = document.createElement("button");
    openBtn.id = "mobileMenuFloat";
    openBtn.innerHTML = "☰";

    document.body.appendChild(openBtn);

    /* Overlay */
    const overlay = document.createElement("div");
    overlay.id = "mobileOverlay";
    document.body.appendChild(overlay);

    /* Close button inside sidebar */
    const closeBtn = document.createElement("button");
    closeBtn.id = "mobileCloseBtn";
    closeBtn.innerHTML = "✕";
    aside.prepend(closeBtn);

    /* Action Area */
    const act = document.createElement("div");
    act.id = "mobileSidebarActions";
    aside.appendChild(act);

    /* CSS */
    const style = document.createElement("style");
    style.innerHTML = `
      #mobileMenuFloat{
        position:fixed;
        top:14px;
        left:14px;
        width:42px;
        height:42px;
        border:none;
        border-radius:10px;
        background:#111827;
        color:#fff;
        font-size:24px;
        z-index:99999;
      }

      #mobileSidebar{
        position:fixed !important;
        top:0;
        left:-280px;
        width:260px !important;
        height:100vh;
        background:#111827 !important;
        z-index:100000;
        transition:left .28s ease;
        overflow-y:auto;
        padding:14px;
      }

      #mobileSidebar.open{
        left:0;
      }

      #mobileCloseBtn{
        width:40px;
        height:40px;
        border:none;
        border-radius:10px;
        background:#dc2626;
        color:#fff;
        font-size:22px;
        margin-bottom:14px;
      }

      #mobileOverlay{
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.55);
        display:none;
        z-index:99998;
      }

      #mobileOverlay.show{
        display:block;
      }

      #mobileSidebarActions{
        margin-top:20px;
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      #mobileSidebar button,
      #mobileSidebar a,
      #mobileSidebar select{
        min-height:42px;
        width:100%;
      }

      /* hide top bars */
      #mobileTopBar,
      header{
        display:none !important;
      }

      main{
        padding-top:10px !important;
      }
    `;
    document.head.appendChild(style);

    openBtn.onclick = openSidebar;
    closeBtn.onclick = closeSidebar;
    overlay.onclick = closeSidebar;
  }

  function openSidebar(){
    qs("#mobileSidebar")?.classList.add("open");
    qs("#mobileOverlay")?.classList.add("show");
  }

  function closeSidebar(){
    qs("#mobileSidebar")?.classList.remove("open");
    qs("#mobileOverlay")?.classList.remove("show");
  }

  /* ==========================================
     MOVE ENV + LOGOUT TO SIDEBAR
  ========================================== */
  function moveSidebarActions(){

    const wrap = qs("#mobileSidebarActions");
    if(!wrap) return;

    const env =
      qs("#env-toggle") ||
      qs(".env-toggle") ||
      qs("[data-env]");

    const logout =
      qs("#logoutBtn") ||
      qs("#logout") ||
      qs("[onclick*='logout']");

    if(env && !wrap.contains(env)){
      wrap.appendChild(env);
    }

    if(logout && !wrap.contains(logout)){
      wrap.appendChild(logout);
      logout.style.background = "#dc2626";
      logout.style.color = "#fff";
      logout.style.borderRadius = "10px";
    }
  }

  /* ==========================================
     HIDE OLD COLLAPSE
  ========================================== */
  function hideOldButtons(){

    function removeNow(){
      qsa("button,a,div,span").forEach(el => {

        const txt = (el.innerText || "").trim().toLowerCase();
        const cls = (el.className || "").toString().toLowerCase();

        if(
          txt === "collapse" ||
          txt === "expand" ||
          cls.includes("collapse") ||
          cls.includes("sidebar-toggle")
        ){
          el.remove();
        }

      });
    }

    removeNow();
    setTimeout(removeNow,500);
    setTimeout(removeNow,1200);

    new MutationObserver(removeNow).observe(document.body,{
      childList:true,
      subtree:true
    });
  }

  /* ==========================================
     MODALS
  ========================================== */
  function modalFix(){

    qsa(`
      #printModal > div,
      #bizModal > div,
      #editInvoiceModal > div,
      #bulkPaymentModal > div,
      #userModal > div
    `).forEach(m => {
      m.style.width = "96vw";
      m.style.maxWidth = "96vw";
      m.style.maxHeight = "92vh";
      m.style.overflowY = "auto";
      m.style.borderRadius = "18px";
    });

    qsa(".close,.modal-close,[onclick*='close']").forEach(btn=>{
      btn.style.display = "inline-flex";
      btn.style.minWidth = "40px";
      btn.style.minHeight = "40px";
      btn.style.fontSize = "22px";
      btn.style.zIndex = "999999";
    });
  }

  /* ==========================================
     GENERAL UI
  ========================================== */
  function uiFix(){

    qsa("table").forEach(t=>{
      if(t.parentElement) t.parentElement.style.overflowX = "auto";
      t.style.minWidth = "700px";
    });

    qsa("input,select,textarea").forEach(el=>{
      el.style.width = "100%";
      el.style.minHeight = "42px";
    });

    qsa(".grid").forEach(g=>{
      g.style.gridTemplateColumns = "1fr";
    });

    qsa(".glass,.modal-glass").forEach(c=>{
      c.style.borderRadius = "16px";
    });

  }

})();
