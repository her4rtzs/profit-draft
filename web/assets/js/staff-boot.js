/* Runs in <head> before first paint so the saved theme/accent/sidebar state never flashes. */
(function () {
  var h = document.documentElement;
  try {
    var qTheme = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search).get('theme') : null;
    var def = h.getAttribute('data-default-theme') || 'light';
    var t = qTheme || localStorage.getItem('pf-theme') || localStorage.getItem('theme') || def;
    if (t === 'system') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var isDark = t === 'dark';
    h.setAttribute('data-theme', isDark ? 'dark' : 'light');
    h.classList.toggle('dark', isDark);
    h.setAttribute('data-accent', 'gold');
    if (localStorage.getItem('pf-mini') === '1') h.classList.add('pre-mini');
  } catch (e) { h.setAttribute('data-theme', 'light'); h.classList.remove('dark'); }
})();
