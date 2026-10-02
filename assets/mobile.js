/* Responsive behavior: keep existing IDs, nodes, listeners, and billing logic. */
(() => {
  'use strict';
  function init() {
    const side = document.getElementById('sidebar');
    if (!side) return;
    const media = matchMedia('(max-width: 1023px)');
    const open = document.createElement('button');
    open.id = 'mobileMenuFloat'; open.type = 'button'; open.className = 'btn no-print';
    open.textContent = '☰'; open.setAttribute('aria-label', 'Open navigation');
    open.setAttribute('aria-controls', 'sidebar'); open.setAttribute('aria-expanded', 'false');
    const close = document.createElement('button');
    close.id = 'mobileCloseBtn'; close.type = 'button'; close.className = 'btn';
    close.textContent = '✕ Close'; close.setAttribute('aria-label', 'Close navigation');
    const overlay = document.createElement('div'); overlay.id = 'mobileOverlay'; overlay.className = 'no-print';
    document.body.append(open, overlay); side.prepend(close);
    function setOpen(value, restore = true) {
      value = value && media.matches;
      side.classList.toggle('mobile-open', value); overlay.classList.toggle('mobile-open', value);
      open.setAttribute('aria-expanded', String(value));
      side.inert = media.matches && !value;
      if (value) close.focus(); else if (restore && media.matches) open.focus();
    }
    open.addEventListener('click', () => setOpen(true));
    close.addEventListener('click', () => setOpen(false));
    overlay.addEventListener('click', () => setOpen(false));
    side.addEventListener('click', e => { if (e.target.closest('nav button,nav a')) setOpen(false); });
    document.addEventListener('keydown', e => {
      if (!side.classList.contains('mobile-open')) return;
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        const items = [...side.querySelectorAll('button,select,a,input,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    });
    media.addEventListener('change', () => setOpen(false, false)); setOpen(false, false);
    const toggle = document.getElementById('takePaymentNow');
    const fields = document.getElementById('invoicePaymentFields');
    function syncPayment() {
      if (!toggle || !fields) return;
      fields.classList.toggle('hidden', !toggle.checked);
      document.getElementById('invoicePayAmount').disabled = !toggle.checked;
      document.getElementById('invoicePayMethod').disabled = !toggle.checked;
    }
    toggle?.addEventListener('change', syncPayment);
    document.getElementById('invoiceForm')?.addEventListener('reset', () => setTimeout(syncPayment, 0));
    syncPayment();
    function wrapTables(root) {
      const tables = root.querySelectorAll('table');
      tables.forEach(table => {
        if (table.closest('.billing-table-scroll,.overflow-x-auto') || table.closest('#printArea')) return;
        const wrapper = document.createElement('div'); wrapper.className = 'billing-table-scroll';
        table.before(wrapper); wrapper.append(table);
      });
    }
    wrapTables(document);
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1 && !node.matches('table,.billing-table-scroll')) wrapTables(node);
      }));
    }).observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
