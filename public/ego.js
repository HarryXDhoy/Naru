/* ego(lite) Style Tooltip for Naru: any control with a title shows the design system's black tooltip
   (bg-tooltip, radius-6, 12px weight 500) instead of the native one; a trailing "(⌘K)" becomes the muted shortcut. */
(function () {
  'use strict';
  /* Tooltip — black ego tooltip for anything with a title; a trailing "(⌘K)" becomes the muted shortcut. */
  var tip = null, tipTimer = 0, tipFor = null;
  function hideTip() { clearTimeout(tipTimer); tipTimer = 0; tipFor = null; if (tip) tip.classList.remove('show'); }
  function showTip(el) {
    var label = el.getAttribute('data-tip'), kbd = el.getAttribute('data-kbd') || '';
    if (!label || !el.isConnected) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; tip.setAttribute('role', 'tooltip'); tip.id = 'ego-tip'; document.body.appendChild(tip); }
    tip.innerHTML = ''; var s = document.createElement('span'); s.textContent = label; tip.appendChild(s);
    if (kbd) { var k = document.createElement('span'); k.className = 'kbd'; k.textContent = kbd; tip.appendChild(k); }
    tip.classList.add('show');
    var r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = r.top - h - 6;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function adopt(el) {
    var t = el.getAttribute('title');
    if (t) {
      var m = t.match(/^(.*?)\s*\(([⌘⌥⇧⌃][^)]*)\)\s*$/);
      el.setAttribute('data-tip', m ? m[1] : t); if (m) el.setAttribute('data-kbd', m[2]);
      el.removeAttribute('title');
      if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', m ? m[1] : t);
    }
    return el.getAttribute('data-tip') ? el : null;
  }
  function tipTarget(node) {
    var el = node && node.closest ? node.closest('[title],[data-tip]') : null;
    if (!el || el.closest('.pop .opt') || el.closest('dialog.wide .pv-body')) return null;
    return adopt(el);
  }
  function tooltips() {
    document.addEventListener('pointerover', function (e) {
      var el = tipTarget(e.target); if (el === tipFor) return;
      hideTip(); if (!el || e.pointerType === 'touch') return;
      tipFor = el; tipTimer = setTimeout(function () { if (tipFor === el) showTip(el); }, 450);
    });
    document.addEventListener('focusin', function (e) { var el = tipTarget(e.target); hideTip(); if (el && el.matches(':focus-visible')) { tipFor = el; showTip(el); } });
    ['pointerdown', 'focusout', 'scroll', 'keydown'].forEach(function (n) { document.addEventListener(n, hideTip, true); });
  }

  window.Ego = { tooltips: tooltips, sweep: function () {} };
})();
