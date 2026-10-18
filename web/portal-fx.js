/* Page reveal: the portal shell appears only after the sidebar and content are built, so nothing flickers on open. */
(() => {
  const ready = () => {
    if (document.body) document.body.classList.add("pf-ready");
    document.documentElement.classList.remove("pf-pre");
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }
  requestAnimationFrame(() => document.documentElement.classList.remove("pf-pre"));
})();
