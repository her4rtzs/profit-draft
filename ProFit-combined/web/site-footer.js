// Shared footer for public pages. Pages that already contain <footer class="site-footer"> are left alone.
(() => {
  if (!/(welcome|login|join|faq|terms|privacy)\.html$/.test(location.pathname)) return; // never inside the portal
  if (document.querySelector(".site-footer")) return;
  if (!document.querySelector('link[href^="site-footer.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "site-footer.css?v=3";
    document.head.appendChild(link);
  }
  const footer = document.createElement("footer");
  footer.className = "site-footer pf-injected";
  footer.innerHTML = `<footer class="site-footer" role="contentinfo"><div class="foot-inner"><div class="foot-top"><div class="foot-lead"><div class="foot-brand"><span class="pf-mark" aria-hidden="true">PF</span><div><strong>ProFit</strong><small>Strength. Mobility. Happier.</small></div></div><div class="foot-built"><img src="ausfitious-logo.png" alt="Team AusFITious logo" width="56" height="56"><div><span class="kicker">Built by</span><strong>Team AusFITious</strong><small>Gym Management System</small></div></div></div><div class="foot-col"><h3>Explore</h3><a href="welcome.html">Home</a><a href="welcome.html#why">Features</a><a href="welcome.html#programs">Programs</a><a href="welcome.html#plans">Membership</a><a href="welcome.html#about">About</a><a href="welcome.html#visit">Contact</a></div><div class="foot-col"><h3>Contact</h3><p>Alfonso, Calabarzon</p><p>Luksuhin-Mangas Road</p><a href="tel:+639122617663">0912 261 7663</a></div></div><div class="foot-bottom"><span>&copy; <span class="foot-year" id="year">${new Date().getFullYear()}</span> ProFit. All rights reserved.</span><span class="legal"><a href="terms.html">Terms of Service</a><a href="privacy.html">Privacy Policy</a><a href="faq.html">FAQ</a></span><span class="foot-team">Team AusFITious</span></div></div></footer>`;
  document.body.appendChild(footer);
})();
