/* ProFit intro splash: logo pop, sweeping ring, letter rise, loading bar. Shows once per tab session. */
(() => {
  try { if (sessionStorage.getItem("pf-splash")) return; sessionStorage.setItem("pf-splash", "1"); } catch (e) {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const css = `#pf-splash{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#2a210b,#07080c 70%);transition:opacity .6s ease,visibility .6s}
#pf-splash.out{opacity:0;visibility:hidden}
#pf-splash .s-wrap{text-align:center;color:#f6efdc;font-family:Inter,system-ui,sans-serif}
#pf-splash .s-logo{position:relative;width:112px;height:112px;margin:0 auto 22px}
#pf-splash .s-logo img{width:100%;height:100%;border-radius:26px;object-fit:cover;animation:sPop .7s cubic-bezier(.2,1.4,.4,1) both}
#pf-splash .s-ring{position:absolute;inset:-10px;border-radius:34px;border:2px solid transparent;border-top-color:#e8b93a;border-right-color:#e8b93a55;animation:sSpin 1.1s linear infinite}
#pf-splash .s-name{font-size:38px;font-weight:800;letter-spacing:.02em;display:flex;justify-content:center;gap:1px}
#pf-splash .s-name span{display:inline-block;opacity:0;transform:translateY(24px);animation:sRise .5s ease forwards}
#pf-splash .s-tag{margin-top:6px;font-size:11px;letter-spacing:.38em;color:#e8b93a;opacity:0;animation:sFade .6s .7s forwards}
#pf-splash .s-bar{width:180px;height:3px;margin:26px auto 0;border-radius:3px;background:#ffffff18;overflow:hidden}
#pf-splash .s-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#b8891c,#f4d27a);animation:sBar 1.3s .2s ease-out forwards}
@keyframes sPop{from{transform:scale(.4) rotate(-12deg);opacity:0}to{transform:none;opacity:1}}
@keyframes sSpin{to{transform:rotate(360deg)}}
@keyframes sRise{to{opacity:1;transform:none}}
@keyframes sFade{to{opacity:1}}
@keyframes sBar{to{width:100%}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const d = document.createElement("div"); d.id = "pf-splash";
  d.innerHTML = `<div class="s-wrap"><div class="s-logo"><span class="s-ring"></span><img src="logo.jpg" alt=""></div><div class="s-name">${[..."ProFit"].map((c,i)=>`<span style="animation-delay:${.25+i*.07}s">${c}</span>`).join("")}</div><div class="s-tag">FUNCTIONAL FITNESS</div><div class="s-bar"><i></i></div></div>`;
  const add = () => document.body.appendChild(d);
  document.body ? add() : document.addEventListener("DOMContentLoaded", add);
  const t0 = Date.now();
  const hide = () => setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 700); }, Math.max(0, 1500 - (Date.now() - t0)));
  document.readyState === "complete" ? hide() : addEventListener("load", hide);
  setTimeout(hide, 4000);
})();
