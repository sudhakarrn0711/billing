/*
 * RanSan — consolidated Finance Centre navigation
 *
 * Keeps the original finance buttons and their event handlers.
 * Hides duplicate finance entries in the left sidebar.
 * Uses the existing permission-controlled buttons to open reports.
 */
(function () {
  "use strict";

  const FINANCE_MENUS = [
    "collections",
    "ageing",
    "ledger",
    "commission-settlement",
    "business-comparison",
    "reconciliation",
    "audit",
    "archive",
    "portal"
  ];

  function init() {
    if (document.getElementById("rsFinanceCentreNav")) return;

    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    const entries = FINANCE_MENUS.map(function (name) {
      return {
        name: name,
        button: sidebar.querySelector(
          '[data-nav="' + name + '"]'
        )
      };
    }).filter(function (entry) {
      return Boolean(entry.button);
    });

    if (!entries.length) return;

    /*
     * Read visibility before applying our hiding class.
     * Existing scripts have already applied menu permissions.
     */
    // Drawer visibility is presentation, not permission. A closed mobile drawer
    // can inherit visibility:hidden even for an authorised report.
    function permitted(entry) {
      const role=String(sessionStorage.getItem('role')||'').toLowerCase();
      const access=String(sessionStorage.getItem('access')||'').split(',').map(x=>x.trim());
      const allowed=role==='admin'||(role==='viewer'&&(access.includes('all')||access.includes(entry.name)));
      const b=entry.button;
      return allowed && b.isConnected && !b.hidden && !b.disabled &&
        !b.classList.contains('hidden') && b.style.display!=='none' && b.style.visibility!=='hidden';
    }

    const style = document.createElement("style");
    style.id = "rsFinanceNavigationStyles";
    style.textContent = `
      #sidebar .rs-finance-original-nav {
        display: none !important;
      }

      #sidebar #rsFinanceCentreNav {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 46px;
        text-align: left;
        justify-content: space-between;
      }

      #sidebar #rsFinanceCentreNav[hidden] {
        display: none !important;
      }

      #rsFinanceCentreNav .rs-finance-nav-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 16px;
      }

      #sidebar #rsFinanceCentreNav[aria-current="page"] {
        color: var(--rs-info, #a5b4fc);
        background: #818cf818;
        border-color: #818cf855;
      }

      body.theme-minimal
      #sidebar #rsFinanceCentreNav[aria-current="page"] {
        color: #4338ca;
        background: #e0e7ff;
        border-color: #a5b4fc;
      }

      body.rs-sidebar-collapsed #rsFinanceCentreNav {
        justify-content: center;
      }

      body.rs-sidebar-collapsed #rsFinanceCentreNav .label {
        display: none;
      }
    `;
    document.head.appendChild(style);

    const financeButton = document.createElement("button");
    financeButton.id = "rsFinanceCentreNav";
    financeButton.type = "button";
    financeButton.className = "btn w-full flex items-center justify-between";
    financeButton.title = "Finance Centre";
    financeButton.setAttribute("aria-label", "Finance Centre");
    financeButton.setAttribute("aria-controls", "view-finance");

    financeButton.innerHTML = `
      <span class="flex items-center gap-2">
      <svg
        class="rs-finance-nav-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3"></rect>
        <path d="M7 8h10"></path>
        <path d="M7 16v-4"></path>
        <path d="M12 16v-2"></path>
        <path d="M17 16v-6"></path>
      </svg>
      <span class="label">Finance Centre</span>
      </span>
      <span class="chip label">Finance</span>
    `;

    entries[0].button.before(financeButton);

    entries.forEach(function (entry) {
      entry.button.classList.add("rs-finance-original-nav");
    });

    /*
     * Never expose a report that was unavailable at startup.
     * Also respect subsequent inline permission restrictions.
     */
    function availableEntries() {
      return entries.filter(permitted);
    }

    function updateSelection(isFinanceView) {
      const available = availableEntries();
      financeButton.hidden = available.length === 0;

      if (isFinanceView && available.length) {
        sidebar.querySelectorAll("[aria-current]").forEach(function (el) {
          if (el !== financeButton) {
            el.removeAttribute("aria-current");
          }
        });

        financeButton.setAttribute("aria-current", "page");
      } else {
        financeButton.removeAttribute("aria-current");
      }
    }

    financeButton.addEventListener("click", function () {
      const available = availableEntries();

      const destination =
        available.find(function (entry) {
          return entry.name === "collections";
        }) || available[0];

      if (!destination) {
        financeButton.hidden = true;
        return;
      }

      /*
       * Reuse the original click:
       * - existing report navigation
       * - existing access checks
       * - existing mobile drawer close behaviour
       */
      destination.button.click();

      queueMicrotask(function () {
        const panel = document.getElementById("view-finance");

        updateSelection(
          Boolean(panel) &&
          !panel.classList.contains("hidden")
        );
      });
    });

    /*
     * Keep the sidebar highlight correct when navigating through
     * report tabs, dashboard shortcuts, or other sidebar entries.
     */
    if (typeof window.showView === "function") {
      const previousShowView = window.showView;

      window.showView = function (name) {
        const result = previousShowView.apply(this, arguments);

        queueMicrotask(function () {
          updateSelection(FINANCE_MENUS.includes(name));
        });

        return result;
      };
    }

    const permissionObserver=new MutationObserver(()=>updateSelection(
      Boolean(document.getElementById('view-finance')) && !document.getElementById('view-finance').classList.contains('hidden')
    ));
    entries.forEach(entry=>permissionObserver.observe(entry.button,{attributes:true,attributeFilter:['style','class','hidden','disabled']}));

    const financePanel = document.getElementById("view-finance");

    updateSelection(
      Boolean(financePanel) &&
      !financePanel.classList.contains("hidden")
    );
  }

  /*
   * Run after the existing scripts have initialized navigation,
   * permissions, the mobile drawer, and the finance workspace.
   */
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init, { once: true });
  }
})();