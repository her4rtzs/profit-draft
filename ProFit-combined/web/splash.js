// Intro for the landing page only, once per tab session. Flat colour, no gradient.
(() => {
  if (!/(^|\/)welcome\.html$/.test(location.pathname)) return;
  try { if (sessionStorage.getItem("pf-landed")) return; sessionStorage.setItem("pf-landed", "1"); } catch (e) {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const d = document.createElement("div"); d.id = "pf-intro";
  d.innerHTML = `<style>#pf-intro{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#07080c;color:#f6efdc;transition:transform .7s cubic-bezier(.7,0,.2,1)}
#pf-intro.out{transform:translateY(-100%)}#pf-intro div{text-align:center}
#pf-intro img{width:84px;height:84px;border-radius:12px;opacity:0;animation:pfi .5s .1s forwards}
#pf-intro b{display:block;margin-top:16px;font:800 44px/1 "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.04em;opacity:0;animation:pfi .5s .3s forwards}
#pf-intro i{display:block;height:3px;width:0;margin:18px auto 0;background:#e8b93a;animation:pfw .9s .4s ease-out forwards}
@keyframes pfi{to{opacity:1}}@keyframes pfw{to{width:140px}}</style><div><img src="logo.jpg" alt=""><b>PROFIT</b><i></i></div>`;
  document.documentElement.appendChild(d);
  setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 800); }, 1500);
})();
