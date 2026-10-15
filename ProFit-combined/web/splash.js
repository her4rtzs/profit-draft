/* ProFit intro splash: glowing logo, orbiting ring, rising letters, loading bar, then a two-panel curtain opens.
   Shows on a fresh visit or after 10 quiet minutes; skipped when the visitor prefers reduced motion. */
(() => {
  // Plays on a fresh visit or after 10 quiet minutes (not on every click). Add ?splash=1 to the address to force it.
  try {
    const now = Date.now(), last = Number(localStorage.getItem("pf-splash-at") || 0);
    const forced = /[?&]splash=1/.test(location.search);
    if (!forced && now - last < 10 * 60 * 1000) return;
    localStorage.setItem("pf-splash-at", String(now));
  } catch (e) { try { if (sessionStorage.getItem("pf-splash2")) return; sessionStorage.setItem("pf-splash2", "1"); } catch (e2) {} }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const css = `#pf-splash{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#f6efdc}
#pf-splash .s-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,#33270a 0%,#0b0a08 62%,#050507 100%);transition:transform .8s cubic-bezier(.7,0,.2,1)}
#pf-splash .s-l{right:50%;transform-origin:left}#pf-splash .s-r{left:50%}
#pf-splash .s-half{position:absolute;top:0;bottom:0;width:50%;overflow:hidden;transition:transform .85s cubic-bezier(.7,0,.2,1)}
#pf-splash .s-half .s-bg{width:200%}
#pf-splash .s-l .s-bg{left:0}#pf-splash .s-r .s-bg{right:0;left:auto}
#pf-splash.out .s-l{transform:translateX(-101%)}#pf-splash.out .s-r{transform:translateX(101%)}
#pf-splash .s-wrap{position:relative;text-align:center;transition:opacity .35s ease,transform .5s ease}
#pf-splash.out .s-wrap{opacity:0;transform:scale(1.08)}
#pf-splash .s-glow{position:absolute;left:50%;top:44px;width:260px;height:260px;margin:-130px 0 0 -130px;border-radius:50%;background:radial-gradient(circle,#e8b93a55,transparent 68%);animation:sGlow 2.2s ease-in-out infinite}
#pf-splash .s-logo{position:relative;width:116px;height:116px;margin:0 auto 24px}
#pf-splash .s-logo img{width:100%;height:100%;border-radius:28px;object-fit:cover;box-shadow:0 14px 40px #000a;animation:sPop .8s cubic-bezier(.2,1.4,.4,1) both}
#pf-splash .s-ring{position:absolute;inset:-12px;border-radius:38px;border:2px solid transparent;border-top-color:#f4d27a;border-right-color:#e8b93a66;animation:sSpin 1.2s linear infinite}
#pf-splash .s-ring.b{inset:-22px;border-radius:46px;border-top-color:transparent;border-bottom-color:#e8b93a55;border-left-color:#e8b93a22;animation-duration:2s;animation-direction:reverse}
#pf-splash .s-name{font-size:40px;font-weight:800;letter-spacing:.02em;display:flex;justify-content:center}
#pf-splash .s-name span{display:inline-block;opacity:0;transform:translateY(26px) rotate(4deg);animation:sRise .55s cubic-bezier(.2,.9,.3,1) forwards}
#pf-splash .s-name span:nth-child(n+4){color:#f4d27a}
#pf-splash .s-tag{margin-top:8px;font-size:11px;letter-spacing:.42em;color:#e8b93a;opacity:0;animation:sFade .6s .8s forwards}
#pf-splash .s-bar{width:200px;height:4px;margin:28px auto 0;border-radius:4px;background:#ffffff1a;overflow:hidden}
#pf-splash .s-bar i{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#b8891c,#f4d27a,#fff3c4);background-size:200% 100%;animation:sBar 1.5s .2s cubic-bezier(.3,.7,.2,1) forwards,sShine 1s linear infinite}
@keyframes sPop{from{transform:scale(.3) rotate(-14deg);opacity:0}to{transform:none;opacity:1}}
@keyframes sSpin{to{transform:rotate(360deg)}}
@keyframes sRise{to{opacity:1;transform:none}}
@keyframes sFade{to{opacity:1}}
@keyframes sBar{to{width:100%}}
@keyframes sShine{to{background-position:-200% 0}}
@keyframes sGlow{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const d = document.createElement("div"); d.id = "pf-splash";
  d.innerHTML = `<div class="s-half s-l"><div class="s-bg"></div></div><div class="s-half s-r"><div class="s-bg"></div></div>
<div class="s-wrap"><div class="s-glow"></div><div class="s-logo"><span class="s-ring b"></span><span class="s-ring"></span><img src="logo.jpg" alt=""></div>
<div class="s-name">${[..."ProFit"].map((c, i) => `<span style="animation-delay:${.3 + i * .08}s">${c}</span>`).join("")}</div>
<div class="s-tag">FUNCTIONAL FITNESS</div><div class="s-bar"><i></i></div></div>`;
  const add = () => document.body.appendChild(d);
  document.body ? add() : document.addEventListener("DOMContentLoaded", add);
  const t0 = Date.now();
  let done = false;
  const hide = () => {
    if (done) return; done = true;
    setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 1000); }, Math.max(0, 1900 - (Date.now() - t0)));
  };
  document.readyState === "complete" ? hide() : addEventListener("load", hide);
  setTimeout(hide, 4500);
})();
