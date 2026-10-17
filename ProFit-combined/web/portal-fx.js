/* Page reveal: the portal shell appears only after the sidebar and content are built, so nothing flickers on open. */
(() => {
  const ready = () => document.body.classList.add("pf-ready");
  document.body ? ready() : document.addEventListener("DOMContentLoaded", ready);
  const reveal = () => requestAnimationFrame(() => document.documentElement.classList.remove("pf-pre"));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", reveal, { once: true });
  else reveal();
})();
