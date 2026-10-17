// Shared footer: ProFit logo, legal links, contact details, copyright and the Team AusFITious credit with its logo.
// Pages that already contain a <footer class="site-footer"> (landing page, FAQ, Terms, Privacy) are left alone,
// so the footer never appears twice.
(() => {
  if (!/(welcome|login|join|faq|terms|privacy)\.html$/.test(location.pathname)) return; // never inside the portal
  if (document.querySelector(".site-footer")) return;
  if (!document.querySelector('link[href^="site-footer.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "site-footer.css?v=1";
    document.head.appendChild(link);
  }
  const footer = document.createElement("footer");
  footer.className = "site-footer pf-injected";
  footer.setAttribute("role", "contentinfo");
  footer.innerHTML = `<div class="foot-inner"><div class="foot-top">
    <div class="foot-brand"><img src="logo.jpg" alt="ProFit logo" width="44" height="44"><div><strong>ProFit</strong><small>Gym management platform</small></div></div>
    <div class="foot-col"><h3>Legal</h3><a href="terms.html">Terms of Service</a><a href="privacy.html">Privacy Policy</a><a href="faq.html">FAQ</a></div>
    <div class="foot-col"><h3>Contact</h3><a href="mailto:FunctionalPerformance.2022@gmail.com">FunctionalPerformance.2022@gmail.com</a><a href="tel:+639060536064">0906 053 6064</a><p>Luksuhin - Mangas Rd., Saray, Mangas 1, Alfonso, Cavite, Philippines</p></div>
  </div>
  <div class="foot-bottom"><span class="foot-copy">&copy; ${new Date().getFullYear()} ProFit. All rights reserved.</span>
    <span class="foot-team"><img src="ausfitious-logo.png" alt="Team AusFITious logo" width="64" height="64"><span>Built by<strong>Team AusFITious</strong></span></span></div></div>`;
  (document.querySelector(".main-content") || document.body).appendChild(footer);
})();
