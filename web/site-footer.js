// Shared footer + dynamic gym name hydration for public pages.
(() => {
  // Site-wide a11y shell: a keyboard skip link on every page with main content,
  // and a page heading only where the markup has none (staff pages build theirs in layout.js).
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'main-content';
    if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.href = '#' + main.id;
    skip.className = 'pf-skip-link';
    skip.textContent = 'Skip to content';
    skip.style.cssText = 'position:fixed;top:-60px;left:12px;z-index:99999;padding:10px 16px;background:#0a0e16;color:#fff;border-radius:0 0 8px 8px;font:600 14px/1.2 system-ui,sans-serif;text-decoration:none';
    skip.addEventListener('focus', () => { skip.style.top = '0'; });
    skip.addEventListener('blur', () => { skip.style.top = '-60px'; });
    document.body.insertBefore(skip, document.body.firstChild);
  }
  if (!document.querySelector('h1')) {
    const h1 = document.createElement('h1');
    h1.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    h1.textContent = document.body.dataset.title || document.title.split('|')[0].trim();
    (main || document.body).insertBefore(h1, (main || document.body).firstChild);
  }
  try {
    const prof = JSON.parse(localStorage.getItem("profit-gym-profile") || "null");
    const customName = prof && prof.name && prof.name.trim() && prof.name.trim().toLowerCase() !== "profit"
      ? prof.name.trim()
      : "Functional Fitness Gym";
    document.querySelectorAll("[data-gym-name]").forEach(el => {
      el.textContent = customName;
    });
  } catch (_) {}
  // Register the offline shell service worker on HTTPS public pages; clean up stale SWs on local HTTP dev.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && !window.__pfSwRegistered) {
    const isLocalHttp =
      location.protocol !== "https:" &&
      (location.hostname === "localhost" ||
        location.hostname === "127.0.0.1" ||
        location.hostname === "[::1]");
    window.__pfSwRegistered = true;
    if (isLocalHttp) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister().catch(() => {}));
      }).catch(() => {});
      if (typeof caches !== "undefined" && caches.keys) {
        caches.keys().then(keys => {
          keys.filter(k => k.startsWith("profit-")).forEach(k => caches.delete(k).catch(() => {}));
        }).catch(() => {});
      }
    } else if (location.protocol === "https:") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
      }, { once: true });
    }
  }
  const pfPublicPage = location.pathname === "/" || /(welcome|login|join|forgot|faq|terms|privacy)(?:\.html)?$/.test(location.pathname);
  if (!pfPublicPage) return;
  if (document.querySelector(".site-footer")) return;
  if (!document.querySelector('link[href^="site-footer.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "site-footer.css?v=5";
    document.head.appendChild(link);
  }
  const footer = document.createElement("footer");
  footer.className = "site-footer pf-injected";
  footer.innerHTML = `<div class="foot-inner"><div class="foot-top"><div class="foot-lead"><div class="foot-brand"><img src="logo.jpg" alt="ProFit logo" width="52" height="52"><div><strong>ProFit</strong><small data-gym-name>Functional Fitness Gym</small></div></div><div class="foot-built"><img src="ausfitious-logo.png" alt="Team AusFITious logo" width="56" height="56"><div><span class="kicker">Built by</span><strong>Team AusFITious</strong><small>Gym Management System</small></div></div></div><div class="foot-col"><h3>Explore</h3><a href="/#why">Features</a><a href="/#programs">Programs</a><a href="/#plans">Membership</a><a href="/#about">About</a></div><div class="foot-col"><h3>Contact</h3><p>Alfonso, Calabarzon</p><p>Luksuhin-Mangas Road</p><a href="tel:+639122617663">0912 261 7663</a></div></div><div class="foot-bottom"><span>&copy; <span class="foot-year" id="year">${new Date().getFullYear()}</span> ProFit. All rights reserved.</span><span class="foot-team">Team AusFITious</span></div></div>`;
  document.body.appendChild(footer);
})();
