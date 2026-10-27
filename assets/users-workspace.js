/* Presentation only. Existing users.js owns verification, data and every action. */
(function () {
  'use strict';
  const tones = ['violet', 'teal', 'blue', 'amber', 'pink'];
  function colour(value) {
    let hash = 0;
    for (const c of String(value).toLowerCase()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return tones[hash % tones.length];
  }
  function badge(text, tone) {
    const span = document.createElement('span');
    span.className = 'rs-users-pill';
    span.dataset.tone = tone;
    span.textContent = text;
    return span;
  }
  function decorate(table) {
    for (const row of table.rows) {
      const cells = row.cells;
      if (cells.length < 4 || cells[0].colSpan > 1) continue;
      for (const button of cells[3].querySelectorAll('button')) {
        const label = (button.textContent + ' ' + (button.getAttribute('aria-label') || '') + ' ' + (button.getAttribute('title') || '')).toLowerCase();
        const tone = /delete|remove/.test(label) ? 'pink' : /password|reset/.test(label) ? 'amber' : 'blue';
        if (button.dataset.tone !== tone) button.dataset.tone = tone;
      }
      const username = cells[0].textContent.trim();
      if (row.dataset.userTone !== colour(username)) row.dataset.userTone = colour(username);
      // Only plain text is wrapped. Existing links, badges and action listeners are retained.
      for (const index of [1, 2]) {
        const cell = cells[index];
        if (cell.children.length) {
          for (const span of cell.querySelectorAll('span')) {
            if (span.children.length || !span.textContent.trim()) continue;
            const value = span.textContent.trim();
            span.classList.add('rs-users-pill');
            const tone = index === 1 ? (/^admin$/i.test(value) ? 'violet' : /^viewer$/i.test(value) ? 'teal' : 'blue') : colour(value);
            if (span.dataset.tone !== tone) span.dataset.tone = tone;
          }
          continue;
        }
        if (!cell.textContent.trim()) continue;
        const text = cell.textContent.trim();
        const values = index === 1 ? [text] : text.split(',').map(s => s.trim()).filter(Boolean);
        cell.textContent = '';
        for (const value of values) cell.appendChild(badge(value, index === 1 ? (/^admin$/i.test(value) ? 'violet' : /^viewer$/i.test(value) ? 'teal' : 'blue') : colour(value)));
      }
    }
  }
  function enhanceSave() {
    const original = window.saveUser;
    if (typeof original !== 'function' || original.rsUsersFeedback) return;
    let pending = null;
    const wrapped = function () {
      if (pending) return pending;
      const button = document.getElementById('rsSaveUser');
      const modal = document.getElementById('userModal');
      const label = button.textContent;
      // Existing users.js validates synchronously and disables this button only for an actual save.
      let operation;
      try { operation = original.apply(this, arguments); }
      catch (error) { throw error; }
      if (!button.disabled) return operation;
      button.textContent = 'Saving…';
      button.setAttribute('aria-busy', 'true');
      modal.setAttribute('aria-busy', 'true');
      const closers = Array.from(modal.querySelectorAll('[onclick="closeUserModal()"]'));
      const previous = closers.map(node => node.disabled);
      const fields = Array.from(modal.querySelectorAll('input,select'));
      const fieldStates = fields.map(node => node.disabled);
      fields.forEach(node => { node.disabled = true; });
      closers.forEach(node => { node.disabled = true; });
      // Original handler owns toasts and closes only after the server confirms success.
      const progress = typeof window.rsInvoiceProgress === 'function'
        ? window.rsInvoiceProgress('Saving user', () => operation) : operation;
      pending = Promise.resolve(progress).finally(() => {
        button.textContent = label;
        button.removeAttribute('aria-busy');
        modal.removeAttribute('aria-busy');
        fields.forEach((node, index) => { node.disabled = fieldStates[index]; });
        closers.forEach((node, index) => { node.disabled = previous[index]; });
        pending = null;
      });
      return pending;
    };
    wrapped.rsUsersFeedback = true;
    window.saveUser = wrapped;
  }
  function init() {
    enhanceSave();
    const section = document.getElementById('view-users');
    const table = document.getElementById('usersTable');
    if (!section || !table) return;
    decorate(table);
    // Observe only this table; decorating settles after one follow-up callback.
    new MutationObserver(() => decorate(table)).observe(table, {childList:true, subtree:true, characterData:true});
    function clearance() {
      const footer = document.querySelector('.rs-site-footer');
      const style = footer && getComputedStyle(footer);
      const fixed = style && /^(fixed|sticky)$/.test(style.position) && style.display !== 'none';
      section.style.setProperty('--rs-users-footer-space', (fixed ? footer.getBoundingClientRect().height + 28 : 28) + 'px');
    }
    clearance();
    window.addEventListener('resize', clearance, {passive:true});
    if (window.ResizeObserver) {
      const footer = document.querySelector('.rs-site-footer');
      if (footer) new ResizeObserver(clearance).observe(footer);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
