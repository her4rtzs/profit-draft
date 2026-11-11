/* Runs in <head> before first paint so the saved theme/accent/sidebar state never flashes. */
(function () {
  var h = document.documentElement;
  try {
    var def = h.getAttribute('data-default-theme') || 'light';
    var t = localStorage.getItem('pf-theme') || def;
    if (t === 'system') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    h.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var a = localStorage.getItem('pf-accent') || 'gold';
    if (a !== 'gold') h.setAttribute('data-accent', a);
    if (localStorage.getItem('pf-mini') === '1') h.classList.add('pre-mini');
  } catch (e) { h.setAttribute('data-theme', 'light'); }
})();
