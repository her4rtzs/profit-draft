/* Runs in <head> before first paint so the saved theme/accent/sidebar state never flashes. */
(function () {
  var h = document.documentElement;
  try {
    var qTheme = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search).get('theme') : null;
    var def = h.getAttribute('data-default-theme') || 'light';
    var t = qTheme || localStorage.getItem('pf-theme') || def;
    if (t === 'system') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    h.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var a = localStorage.getItem('pf-accent') || 'gold';
    if (a !== 'gold') h.setAttribute('data-accent', a);
    try { localStorage.removeItem('pf-mini'); } catch (e) {}
  } catch (e) { h.setAttribute('data-theme', 'light'); }
})();
