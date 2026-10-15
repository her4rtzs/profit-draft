/* ProFit page motion: top progress bar, scroll reveal, number count-up, smooth link transitions. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ready = () => {
    document.body.classList.add("pf-ready");
    if (reduce) return;
    const bar = document.createElement("div");
    bar.id = "pf-topbar";
    document.body.appendChild(bar);
    const finish = () => { bar.classList.add("done"); setTimeout(() => bar.remove(), 700); };
    document.readyState === "complete" ? setTimeout(finish, 700) : addEventListener("load", () => setTimeout(finish, 300));

    // Reveal cards as they scroll into view. The class is added by JS only, so content never stays hidden without it.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }), { rootMargin: "0px 0px -8% 0px", threshold: .05 });
      const seen = new WeakSet();
      const scan = () => document.querySelectorAll(".panel,.pp-card,.member-panel,.member-metric-card,.stat-card,.pp-stat").forEach(el => {
        if (seen.has(el) || el.closest("[hidden]")) return;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight * .9) return; // already on screen: the CSS entrance handles it
        el.classList.add("pf-reveal");
        io.observe(el);
      });
      scan();
      new MutationObserver(() => requestAnimationFrame(scan)).observe(document.body, { childList: true, subtree: true });
      document.addEventListener("click", () => setTimeout(scan, 80));
    }

    // Ripple on buttons and tabs.
    document.addEventListener("pointerdown", e => {
      const t = e.target.closest && e.target.closest(".btn,.pp-btn,.pp-chip-btn,.pp-tab,.pp-segment button,.pp-view-toggle button,.pp-mood");
      if (!t || t.disabled) return;
      const r = t.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
      const dot = document.createElement("span");
      dot.className = "pf-ripple";
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      t.appendChild(dot);
      setTimeout(() => dot.remove(), 650);
    }, { passive: true });

    // Smooth fade when moving between pages.
    document.addEventListener("click", e => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || a.target === "_blank" || a.hasAttribute("download")) return;
      if (u.pathname === location.pathname && u.hash) return;
      document.body.classList.add("pf-leaving");
      try { sessionStorage.setItem("pf-nav", "1"); } catch (err) { /* storage blocked */ }
    });
    addEventListener("pageshow", e => { if (e.persisted) document.body.classList.remove("pf-leaving"); });
  };
  document.body ? ready() : document.addEventListener("DOMContentLoaded", ready);
})();

// Labels for the collapsed sidebar. The tip is fixed to the viewport, so the sidebar never clips it.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const tip = document.createElement("div");
  tip.className = "pf-tip";
  tip.setAttribute("aria-hidden", "true");
  const place = a => {
    const sb = document.querySelector(".sidebar");
    if (!sb || !sb.classList.contains("close") || sb.classList.contains("mobile-open")) return false;
    const label = (a.querySelector(".text") || a).textContent.trim();
    if (!label) return false;
    const r = a.getBoundingClientRect();
    tip.textContent = label;
    tip.style.top = (r.top + r.height / 2) + "px";
    tip.style.left = (r.right + 12) + "px";
    return true;
  };
  const show = e => {
    const a = e.target.closest && e.target.closest(".sidebar .menulist a");
    if (!a || !place(a)) return;
    if (!tip.isConnected) document.body.appendChild(tip);
    requestAnimationFrame(() => tip.classList.add("show"));
  };
  const hide = () => tip.classList.remove("show");
  document.addEventListener("pointerover", show);
  document.addEventListener("focusin", show);
  document.addEventListener("pointerout", hide);
  document.addEventListener("focusout", hide);
  addEventListener("scroll", hide, true);
})();
