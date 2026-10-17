// Shared footer for the portal: logo, copyright, Team AusFITious credit, and links to FAQ and legal pages.
(() => {
  if (document.getElementById("pf-footer")) return;
  const style = document.createElement("style");
  style.textContent = `
    #pf-footer { margin-top: 40px; padding: 22px 0 8px; border-top: 1px solid var(--border);
      display: flex; flex-wrap: wrap; gap: 14px 28px; align-items: center; justify-content: space-between;
      color: var(--muted); font-size: 13.5px; line-height: 1.5; }
    #pf-footer .pf-foot-brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 700; }
    #pf-footer .pf-foot-brand img { width: 30px; height: 30px; border-radius: 9px; object-fit: cover; }
    #pf-footer nav { display: flex; flex-wrap: wrap; gap: 6px 18px; }
    #pf-footer a { color: var(--muted); text-decoration: none; }
    #pf-footer a:hover { color: var(--text); text-decoration: underline; }
    #pf-footer a:focus-visible { outline: 2px solid #e8b93a; outline-offset: 3px; border-radius: 4px; }
    #pf-footer .pf-foot-meta { width: 100%; font-size: 12.5px; }
    @media (max-width: 760px) { #pf-footer { margin-bottom: 120px; } }`;
  document.head.appendChild(style);
  const footer = document.createElement("footer");
  footer.id = "pf-footer";
  footer.innerHTML = `
    <div class="pf-foot-brand"><img src="logo.jpg" alt="" width="30" height="30"><span>ProFit</span></div>
    <nav aria-label="Footer"><a href="faq.html">FAQ</a><a href="terms.html">Terms of Service</a><a href="privacy.html">Privacy Policy</a></nav>
    <div class="pf-foot-meta">© ${new Date().getFullYear()} ProFit. All rights reserved. · Built by Team AusFITious</div>`;
  (document.querySelector(".main-content") || document.body).appendChild(footer);
})();
