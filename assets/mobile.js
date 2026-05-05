/* =====================================================
   MOBILE.JS — FINAL ULTRA FIXED VERSION
   Professional Mobile Optimizer

   FIXED NOW:
   ✅ Collapse button hidden fully
   ✅ Only Hamburger / Close toggle shown
   ✅ Sidebar open / close same button
   ✅ Click outside close
   ✅ All modals responsive
   ✅ Close buttons visible
   ✅ Tables scrollable
   ✅ Forms fit screen
   ✅ Login center perfect
   ✅ Env toggle visible
   ✅ Logout visible
===================================================== */

(function () {
  "use strict";

  const MOBILE = 768;

  /* =========================
     START
  ========================= */
  window.addEventListener("load", initMobile);
  window.addEventListener("resize", debounce(initMobile, 250));

  function initMobile() {
    if (window.innerWidth > MOBILE) return;

    bodyFix();
    loginFix();
    createHeader();
    hideOldCollapseButtons();
    moveTopActions();
    sidebarFix();
    modalFix();
    tableFix();
    formFix();
    gridFix();
    cardFix();
    chartFix();
    sectionFix();
  }

  /* =========================
     HELPERS
  ========================= */

  function qs(x) { return document.querySelector(x); }
  function qsa(x) { return document.querySelectorAll(x); }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* =========================
     BODY
  ========================= */

  function bodyFix() {
    document.body.style.overflowX = "hidden";
    document.body.classList.add("mobile-ui");
  }

  /* =========================
     LOGIN SCREEN
  ========================= */

  function loginFix() {
    const login =
      qs("#loginScreen") ||
      qs("#login") ||
      qs(".login-screen") ||
      qs(".login-container");

    if (!login) return;

    login.style.minHeight = "100vh";
    login.style.display = "flex";
    login.style.alignItems = "center";
    login.style.justifyContent = "center";
    login.style.padding = "20px";

    const card = login.firstElementChild;
    if (card) {
      card.style.width = "100%";
      card.style.maxWidth = "420px";
      card.style.padding = "22px";
      card.style.borderRadius = "18px";
    }
  }

  /* =========================
     CREATE TOP HEADER
  ========================= */

  function createHeader() {
    if (qs("#mobileTopBar")) return;

    const aside = qs("aside");
    if (!aside) return;

    aside.id = "mobileSidebar";

    const bar = document.createElement("div");
    bar.id = "mobileTopBar";

    bar.innerHTML = `
      <button id="mobileMenuBtn">☰</button>
      <div id="mobileTitle">Dashboard</div>
      <div id="mobileTopActions"></div>
    `;

    document.body.prepend(bar);

    const overlay = document.createElement("div");
    overlay.id = "mobileOverlay";
    document.body.appendChild(overlay);

    const style = document.createElement("style");
    style.innerHTML = `
      #mobileTopBar{
        position:fixed;
        top:0; left:0; right:0;
        height:56px;
        background:#0f172a;
        display:flex;
        align-items:center;
        gap:10px;
        padding:0 12px;
        z-index:99999;
        border-bottom:1px solid rgba(255,255,255,.08);
      }

      #mobileMenuBtn{
        width:38px;
        height:38px;
        border:none;
        background:none;
        color:#fff;
        font-size:24px;
        border-radius:8px;
      }

      #mobileTitle{
        color:#fff;
        font-weight:600;
        font-size:15px;
      }

      #mobileTopActions{
        margin-left:auto;
        display:flex;
        gap:6px;
        align-items:center;
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
        padding-top:60px;
      }

      #mobileSidebar.open{
        left:0;
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

      main{
        padding-top:64px !important;
      }

      /* hide unwanted old collapse buttons */
      .collapse-btn,
      .sidebar-toggle,
      .menu-collapse,
      [onclick*="collapse"],
      [onclick*="toggleSidebarOld"]{
        display:none !important;
      }
    `;
    document.head.appendChild(style);

    qs("#mobileMenuBtn").onclick = toggleMenu;
    qs("#mobileOverlay").onclick = closeMenu;
  }

  /* =========================
     REMOVE OLD COLLAPSE
  ========================= */

function hideOldCollapseButtons() {

  function removeButtons() {
    document.querySelectorAll("button,a,div,span").forEach(el => {

      const txt = (el.innerText || "").trim().toLowerCase();

      const cls = (el.className || "").toString().toLowerCase();

      if (
        txt === "collapse" ||
        txt === "expand" ||
        txt === "close menu" ||
        txt === "menu" ||
        cls.includes("collapse") ||
        cls.includes("sidebar-toggle") ||
        cls.includes("menu-toggle") ||
        el.onclick?.toString().includes("collapse")
      ) {
        el.style.display = "none";
        el.remove();
      }

    });
  }

  /* run immediately */
  removeButtons();

  /* run again after render */
  setTimeout(removeButtons, 500);
  setTimeout(removeButtons, 1000);
  setTimeout(removeButtons, 2000);

  /* live watch future buttons */
  const observer = new MutationObserver(removeButtons);

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

  /* =========================
     MENU TOGGLE
  ========================= */

  function toggleMenu() {
    const side = qs("#mobileSidebar");
    const ov = qs("#mobileOverlay");
    const btn = qs("#mobileMenuBtn");

    if (!side) return;

    if (side.classList.contains("open")) {
      closeMenu();
    } else {
      side.classList.add("open");
      ov.classList.add("show");
      btn.innerHTML = "✕";
    }
  }

  function closeMenu() {
    const side = qs("#mobileSidebar");
    const ov = qs("#mobileOverlay");
    const btn = qs("#mobileMenuBtn");

    if (!side) return;

    side.classList.remove("open");
    ov.classList.remove("show");
    btn.innerHTML = "☰";
  }

  /* =========================
     TOP ACTIONS
  ========================= */

  function moveTopActions() {
    const wrap = qs("#mobileTopActions");
    if (!wrap) return;

    const env =
      qs("#env-toggle") ||
      qs(".env-toggle") ||
      qs("[data-env]");

    const logout =
      qs("#logoutBtn") ||
      qs("#logout") ||
      qs("[onclick*='logout']");

    if (env && !wrap.contains(env)) {
      wrap.appendChild(env);
      env.style.height = "34px";
      env.style.fontSize = "12px";
      env.style.maxWidth = "95px";
    }

    if (logout && !wrap.contains(logout)) {
      wrap.appendChild(logout);
      logout.style.height = "34px";
      logout.style.padding = "6px 10px";
      logout.style.background = "#dc2626";
      logout.style.color = "#fff";
      logout.style.borderRadius = "8px";
      logout.style.fontSize = "12px";
    }
  }

  /* =========================
     SIDEBAR
  ========================= */

  function sidebarFix() {
    qsa("#mobileSidebar button,#mobileSidebar a").forEach(el => {
      el.style.minHeight = "44px";
      el.style.display = "flex";
      el.style.alignItems = "center";
    });
  }

  /* =========================
     MODALS
  ========================= */

  function modalFix() {
    qsa(`
      #printModal > div,
      #bizModal > div,
      #editInvoiceModal > div,
      #bulkPaymentModal > div,
      #userModal > div
    `).forEach(modal => {
      modal.style.width = "96vw";
      modal.style.maxWidth = "96vw";
      modal.style.maxHeight = "92vh";
      modal.style.overflowY = "auto";
      modal.style.padding = "16px";
      modal.style.borderRadius = "18px";
    });

    /* make close buttons visible */
    qsa("[onclick*='close'], .close, .modal-close").forEach(btn => {
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.minWidth = "38px";
      btn.style.minHeight = "38px";
      btn.style.fontSize = "20px";
    });
  }

  /* =========================
     TABLES
  ========================= */

  function tableFix() {
    qsa("table").forEach(t => {
      if (t.parentElement) t.parentElement.style.overflowX = "auto";
      t.style.minWidth = "700px";
      t.style.fontSize = "12px";
    });
  }

  /* =========================
     FORMS
  ========================= */

  function formFix() {
    qsa("input,select,textarea,button").forEach(el => {
      el.style.minHeight = "42px";
      el.style.fontSize = "14px";
      if (el.tagName !== "BUTTON") el.style.width = "100%";
    });
  }

  /* =========================
     GRID
  ========================= */

  function gridFix() {
    qsa(".grid").forEach(g => {
      g.style.gridTemplateColumns = "1fr";
      g.style.gap = "12px";
    });
  }

  /* =========================
     CARD
  ========================= */

  function cardFix() {
    qsa(".glass,.modal-glass").forEach(c => {
      c.style.padding = "14px";
      c.style.borderRadius = "16px";
    });
  }

  /* =========================
     CHARTS
  ========================= */

  function chartFix() {
    qsa("canvas").forEach(c => {
      c.style.width = "100%";
      c.style.height = "auto";
      c.style.maxHeight = "260px";
    });
  }

  /* =========================
     SECTIONS
  ========================= */

  function sectionFix() {
    qsa("section").forEach(s => {
      s.style.paddingBottom = "80px";
    });
  }

})();