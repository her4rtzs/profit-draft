/* Runs first in <head>: puts theme and sidebar state on the page before it paints, and keeps
   transitions off until the first frame is done, so nothing slides, flashes or flickers on load. */
(() => {
  const r = document.documentElement;
  let theme = "dark", sb = "open";
  try { theme = localStorage.getItem("theme") || "dark"; sb = localStorage.getItem("sidebar") === "closed" ? "closed" : "open"; } catch (e) {}
  r.dataset.theme = theme; r.dataset.sb = sb;
  const paint = () => {
    if (document.body) document.body.classList.toggle("dark", theme === "dark");
    const nav = document.getElementById("sidebar");
    if (nav && sb === "closed") nav.classList.add("close");
    return !!(document.body && (nav || document.readyState !== "loading"));
  };
  if (!paint()) { const mo = new MutationObserver(() => { if (paint()) mo.disconnect(); }); mo.observe(r, { childList: true, subtree: true }); document.addEventListener("DOMContentLoaded", () => { paint(); mo.disconnect(); }); }
  addEventListener("load", () => requestAnimationFrame(() => requestAnimationFrame(() => r.classList.add("pf-ready"))));
})();
