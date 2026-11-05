// Shyoy: no tooltips (from the 303 app's statusline.js).
// Johnny: no status lines, no help text, no tooltips anywhere. Every title attribute becomes data-tip, so the
// browser's tooltip box never appears, including on anything added later.
(() => {
  const strip = () => document.querySelectorAll('body [title]').forEach(el => { if (el.title) el.dataset.tip = el.title; el.removeAttribute('title'); });
  strip(); new MutationObserver(strip).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
})();
