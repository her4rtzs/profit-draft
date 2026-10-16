// ProFit loader. One branded loader on every page open. It shows before the page, and leaves when the
// data has synced (profit:synced from data.js), with a minimum and a maximum time.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = document.createElement("div");
  el.id = "pf-loader";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `<style>
    #pf-loader{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;overflow:hidden;
      background:radial-gradient(circle at 50% 36%,#2b2108 0%,#0d0c09 52%,#060608 100%);transition:opacity .5s ease,visibility .5s}
    #pf-loader.out{opacity:0;visibility:hidden}
    #pf-loader .pfl-wrap{display:grid;justify-items:center;gap:26px}
    #pf-loader .pfl-stage{position:relative;width:184px;height:184px;display:grid;place-items:center}
    #pf-loader .pfl-glow{position:absolute;inset:-34px;border-radius:50%;background:radial-gradient(circle,rgba(232,185,58,.38),transparent 66%);filter:blur(8px);animation:pflGlow 2.6s ease-in-out infinite}
    #pf-loader .pfl-ring{position:absolute;border-radius:50%}
    #pf-loader .pfl-ring.r1{inset:0;border:2px solid transparent;border-top-color:#f4d27a;border-right-color:rgba(244,210,122,.25);animation:pflSpin 1.1s linear infinite}
    #pf-loader .pfl-ring.r2{inset:18px;border:2px solid transparent;border-bottom-color:#e8b93a;border-left-color:rgba(232,185,58,.2);animation:pflSpin 1.9s linear infinite reverse}
    #pf-loader .pfl-ring.r3{inset:-14px;border:1px dashed rgba(255,255,255,.14);animation:pflSpin 16s linear infinite}
    #pf-loader .pfl-orbit{position:absolute;inset:0;animation:pflSpin 1.1s linear infinite}
    #pf-loader .pfl-orbit::after{content:"";position:absolute;top:-4px;left:50%;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:#f7dc96;box-shadow:0 0 16px #f4d27a}
    #pf-loader img{position:relative;width:112px;height:112px;border-radius:30px;object-fit:cover;box-shadow:0 20px 44px rgba(0,0,0,.6);animation:pflIn .75s cubic-bezier(.2,.8,.2,1) both}
    #pf-loader.out img{transform:scale(1.06);transition:transform .5s ease}
    #pf-loader .pfl-text{margin:0;color:#dcc98f;font:700 11px/1 Inter,system-ui,sans-serif;letter-spacing:.34em;text-transform:uppercase;padding-left:.34em}
    #pf-loader .pfl-bar{width:170px;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;position:relative}
    #pf-loader .pfl-bar::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,#f4d27a,transparent);transform:translateX(-100%);animation:pflSweep 1.4s ease-in-out infinite}
    @keyframes pflSpin{to{transform:rotate(360deg)}}
    @keyframes pflGlow{0%,100%{opacity:.55;transform:scale(.96)}50%{opacity:1;transform:scale(1.05)}}
    @keyframes pflIn{from{opacity:0;transform:scale(.82) translateY(8px)}to{opacity:1;transform:none}}
    @keyframes pflSweep{to{transform:translateX(100%)}}
    @media (prefers-reduced-motion: reduce){#pf-loader *{animation:none!important}}
  </style>
  <div class="pfl-wrap">
    <div class="pfl-stage" aria-hidden="true">
      <div class="pfl-glow"></div>
      <div class="pfl-ring r3"></div>
      <div class="pfl-ring r1"></div>
      <div class="pfl-ring r2"></div>
      <div class="pfl-orbit"></div>
      <img src="logo.jpg" alt="">
    </div>
    <p class="pfl-text">Loading</p>
    <div class="pfl-bar" aria-hidden="true"></div>
  </div>`;
  document.documentElement.appendChild(el);

  const started = performance.now();
  const minMs = reduce ? 250 : 1100;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const wait = Math.max(0, minMs - (performance.now() - started));
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 520);
    }, wait);
  };
  document.addEventListener("profit:synced", finish);
  addEventListener("load", () => setTimeout(finish, 700));
  setTimeout(finish, 3400);
})();
