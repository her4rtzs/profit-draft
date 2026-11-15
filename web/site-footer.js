// Shared footer + dynamic gym name hydration for public pages.
(() => {
  try {
    const prof = JSON.parse(localStorage.getItem("profit-gym-profile") || "null");
    const customName = prof && prof.name && prof.name.trim() && prof.name.trim().toLowerCase() !== "profit"
      ? prof.name.trim()
      : "Functional Fitness Gym";
    document.querySelectorAll("[data-gym-name]").forEach(el => {
      el.textContent = customName;
    });
  } catch (_) {}
  if (!/(welcome|login|join|faq|terms|privacy)\.html$/.test(location.pathname)) return; // never inside the portal
  if (document.querySelector(".site-footer")) return;
  if (!document.querySelector('link[href^="site-footer.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "site-footer.css?v=5";
    document.head.appendChild(link);
  }
  const footer = document.createElement("footer");
  footer.className = "site-footer pf-injected";
  footer.innerHTML = `<footer class="site-footer" role="contentinfo"><div class="foot-inner"><div class="foot-top"><div class="foot-lead"><div class="foot-brand"><img src="logo.jpg" alt="ProFit logo" width="52" height="52"><div><strong>ProFit</strong><small>Strength. Mobility. Happier.</small></div></div><div class="foot-built"><img src="ausfitious-logo.png" alt="Team AusFITious logo" width="56" height="56"><div><span class="kicker">Built by</span><strong>Team AusFITious</strong><small>Gym Management System</small></div></div></div><div class="foot-col"><h3>Explore</h3><a href="welcome.html">Home</a><a href="welcome.html#why">Features</a><a href="welcome.html#programs">Programs</a><a href="welcome.html#plans">Membership</a><a href="welcome.html#about">About</a><a href="welcome.html#visit">Contact</a></div><div class="foot-col"><h3>Contact</h3><p>Alfonso, Calabarzon</p><p>Luksuhin-Mangas Road</p><a href="tel:+639122617663">0912 261 7663</a></div></div><div class="foot-bottom"><span>&copy; <span class="foot-year" id="year">${new Date().getFullYear()}</span> ProFit. All rights reserved.</span><span class="foot-team">Team AusFITious</span></div></div></footer>`;
  document.body.appendChild(footer);
})();
