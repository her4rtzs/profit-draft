// ==========================================================================
// splash.js — ProFit Branded Loading Screen
// Runs on:
//  1) Landing page (welcome.html / root) every time user opens or returns
//  2) Once after successful login while initializing the account
// Bypassed during normal Admin, Staff, and Member portal navigation.
// ==========================================================================
(() => {
  const path = (location.pathname || "").toLowerCase();
  const file = path.split("/").pop() || "";
  const isLandingPage = file === "" || file === "welcome.html" || path === "/" || path.endsWith("/welcome.html");
  const isAuthPage = /(^|\/)(login|join|forgot)\.html$/.test(path);

  if (isAuthPage) return;

  const justLoggedIn = (() => {
    try {
      return sessionStorage.getItem("pf-auth-just-logged-in") === "1";
    } catch (_) {
      return false;
    }
  })();

  if (!isLandingPage && !justLoggedIn) return;

  if (justLoggedIn) {
    try { sessionStorage.removeItem("pf-auth-just-logged-in"); } catch (_) {}
  }

  let gymTag = "Functional Fitness Gym";
  let gymLogo = "logo.jpg";
  try {
    const prof = JSON.parse(localStorage.getItem("profit-gym-profile") || "null");
    if (prof) {
      if (prof.name && prof.name.trim() && prof.name.trim().toLowerCase() !== "profit") {
        gymTag = prof.name.trim();
      } else if (prof.tagline && prof.tagline.trim()) {
        gymTag = prof.tagline.trim();
      }
      if (prof.logo) gymLogo = prof.logo;
    }
  } catch (_) {}

  const loader = document.createElement("div");
  loader.id = "pf-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.setAttribute("aria-label", "Loading ProFit");

  loader.innerHTML = `
    <style id="pf-loader-style">
      #pf-loader {
        --bg: #070a12; --bg2: #101728; --gold: #f2b632; --gold-soft: #ffd873;
        --text: #f4f6fb; --muted: #9aa3b5;
        position: fixed !important; inset: 0 !important; z-index: 99999999 !important;
        display: grid !important; place-items: center !important; overflow: hidden !important;
        background: radial-gradient(ellipse at 50% 40%, var(--bg2) 0%, var(--bg) 68%) !important;
        color: var(--text) !important;
        font-family: "Plus Jakarta Sans", Inter, system-ui, -apple-system, "Segoe UI", sans-serif !important;
        clip-path: circle(150% at 50% 50%);
        transition: clip-path 1s cubic-bezier(.76,0,.24,1), visibility 0s 1s;
        padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px);
      }
      #pf-loader * { box-sizing: border-box !important; }
      #pf-loader.done { clip-path: circle(0% at 50% 50%); visibility: hidden; pointer-events: none; }
      #pf-loader::before {
        content: ""; position: absolute; width: 560px; height: 560px; border-radius: 50%;
        background: radial-gradient(circle, rgba(242,182,50,.17), transparent 65%);
        filter: blur(30px); animation: pfHaze 8s ease-in-out infinite alternate; pointer-events: none;
      }
      @keyframes pfFadein { to { opacity: 1; } }
      @keyframes pfSpin { to { transform: rotate(360deg); } }
      @keyframes pfHaze { from { transform: translate(-50px,-25px) scale(.9); } to { transform: translate(50px,30px) scale(1.15); } }
      #pf-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

      #pf-loader .pf-wrap {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 20px;
        transition: opacity .5s ease, transform .6s ease;
      }
      #pf-loader.done .pf-wrap { opacity: 0; transform: scale(.88); }
      @media (max-height: 640px) { #pf-loader .pf-wrap { transform: scale(.8); } }

      #pf-loader .pf-stage { position: relative; width: 220px; height: 220px; display: grid; place-items: center; }
      #pf-loader .pf-dial { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
      #pf-loader.play .pf-dial { animation: pfDialin 1.4s cubic-bezier(.2,.8,.2,1) .5s forwards; }
      @keyframes pfDialin { from { opacity: 0; transform: scale(.8) rotate(-40deg); } to { opacity: 1; transform: none; } }
      #pf-loader .pf-tick { stroke: rgba(255,255,255,.17); stroke-width: 1.6; stroke-linecap: round; opacity: 0; transition: stroke .5s, filter .5s; }
      #pf-loader .pf-tick.lit { stroke: var(--gold); filter: drop-shadow(0 0 3px rgba(242,182,50,.9)); }
      #pf-loader.play .pf-tick { animation: pfFadein .4s ease forwards; }
      #pf-loader .pf-track { fill: none; stroke: rgba(255,255,255,.07); stroke-width: 3.5; }
      #pf-loader .pf-arc {
        fill: none; stroke: url(#pfg); stroke-width: 3.5; stroke-linecap: round;
        stroke-dasharray: 552.92; stroke-dashoffset: 552.92;
        filter: drop-shadow(0 0 6px rgba(242,182,50,.7));
      }
      #pf-loader #pf-head { fill: var(--gold-soft); filter: drop-shadow(0 0 8px rgba(255,216,115,1)); opacity: 0; }

      #pf-loader .pf-ring2 {
        position: absolute; inset: 44px; border-radius: 50%;
        border: 1.5px dashed rgba(242,182,50,.35); animation: pfSpin 14s linear infinite reverse;
      }
      #pf-loader .pf-pulse {
        position: absolute; width: 108px; height: 108px; border-radius: 50%;
        border: 1.5px solid rgba(242,182,50,.55); opacity: 0;
      }
      #pf-loader.play .pf-pulse { animation: pfBeatring 1.8s ease-out 1.6s infinite; }
      @keyframes pfBeatring { 0% { transform: scale(1); opacity: .7; } 70%, 100% { transform: scale(1.75); opacity: 0; } }
      #pf-loader .pf-shock {
        position: absolute; width: 108px; height: 108px; border-radius: 50%;
        border: 2px solid var(--gold-soft); opacity: 0;
      }
      #pf-loader.finish .pf-shock { animation: pfShock 1s ease-out forwards; }
      @keyframes pfShock { 0% { transform: scale(.8); opacity: 1; } 100% { transform: scale(7); opacity: 0; } }

      #pf-loader .pf-logo {
        position: relative; width: 108px; height: 108px; border-radius: 50%; display: grid; place-items: center;
        background: #0b0f19; border: 1px solid rgba(242,182,50,.4); overflow: hidden; opacity: 0;
        box-shadow: 0 0 0 6px rgba(242,182,50,.06), 0 0 40px rgba(242,182,50,.25);
      }
      #pf-loader .pf-logo img { width: 100%; height: 100%; object-fit: cover; display: block; filter: none !important; }
      #pf-loader .pf-logo .pf-fallback { font-weight: 800; font-size: 32px; letter-spacing: -.02em; color: var(--gold); }
      #pf-loader .pf-logo::after {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.35) 50%, transparent 65%);
        transform: translateX(-120%); animation: pfSweep 4s ease-in-out 2.4s infinite;
      }
      @keyframes pfSweep { 0% { transform: translateX(-120%); } 40%, 100% { transform: translateX(120%); } }
      #pf-loader.play .pf-logo {
        animation: pfPop 1.3s cubic-bezier(.2,.9,.25,1.15) .3s forwards, pfHeart 1.8s ease-in-out 1.6s infinite;
      }
      @keyframes pfPop {
        0% { opacity: 0; transform: scale(.35) rotate(-14deg); filter: blur(10px); }
        60% { opacity: 1; filter: blur(0); }
        100% { opacity: 1; transform: none; }
      }
      @keyframes pfHeart {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 6px rgba(242,182,50,.05), 0 0 30px rgba(242,182,50,.2); }
        10% { transform: scale(1.075); box-shadow: 0 0 0 10px rgba(242,182,50,.09), 0 0 70px rgba(242,182,50,.55); }
        20% { transform: scale(1); }
        30% { transform: scale(1.045); box-shadow: 0 0 0 8px rgba(242,182,50,.07), 0 0 50px rgba(242,182,50,.38); }
        42% { transform: scale(1); }
      }
      #pf-loader.finish .pf-logo { animation: pfBurst .8s ease forwards; }
      @keyframes pfBurst {
        40% { transform: scale(1.16); box-shadow: 0 0 0 12px rgba(242,182,50,.18), 0 0 110px rgba(255,216,115,.85); }
        100% { transform: scale(1.04); }
      }

      #pf-loader .pf-brand { display: flex; font-size: 36px; font-weight: 800; letter-spacing: -.02em; height: 46px; }
      #pf-loader .pf-brand span { display: inline-block; opacity: 0; }
      #pf-loader .pf-brand span:nth-child(n+4) { color: var(--gold); }
      #pf-loader.play .pf-brand span { animation: pfRise 1s cubic-bezier(.2,.8,.2,1) forwards; }
      @keyframes pfRise {
        from { opacity: 0; transform: translateY(22px) scale(.9); filter: blur(10px); }
        to { opacity: 1; transform: none; filter: blur(0); }
      }
      #pf-loader .pf-tag {
        margin-top: -10px; font-size: 12px; letter-spacing: .34em; text-transform: uppercase;
        color: var(--muted); opacity: 0; padding-left: .34em;
      }
      #pf-loader.play .pf-tag { animation: pfTagin 1.4s ease 2.2s forwards; }
      @keyframes pfTagin { from { opacity: 0; letter-spacing: .7em; } to { opacity: 1; letter-spacing: .34em; } }

      #pf-loader .pf-ecg {
        width: 250px; height: 44px; opacity: 0;
        -webkit-mask-image: linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
        mask-image: linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
      }
      #pf-loader.play .pf-ecg { animation: pfFadein 1s ease 2.6s forwards; }
      #pf-loader .pf-ecg path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      #pf-loader .pf-ecg .base { stroke: rgba(242,182,50,.2); stroke-width: 1.5; }
      #pf-loader .pf-ecg .beat {
        stroke: var(--gold-soft); stroke-width: 2.2; stroke-dasharray: 24 76; stroke-dashoffset: 24;
        filter: drop-shadow(0 0 5px rgba(255,216,115,.9)); animation: pfComet 2.4s linear infinite;
      }
      @keyframes pfComet { to { stroke-dashoffset: -100; } }

      #pf-loader .pf-status { display: flex; align-items: baseline; gap: 12px; font-size: 13px; color: var(--muted); opacity: 0; min-height: 20px; }
      #pf-loader.play .pf-status { animation: pfFadein .8s ease 2.8s forwards; }
      #pf-loader .pf-msg { transition: opacity .4s ease, transform .4s ease; }
      #pf-loader .pf-msg.swap { opacity: 0; transform: translateY(5px); }
      #pf-loader .pf-pct { font-variant-numeric: tabular-nums; color: var(--gold-soft); font-weight: 700; min-width: 3ch; text-align: right; }

      @media (prefers-reduced-motion: reduce) {
        #pf-loader *, #pf-loader::before { animation-duration: .01s !important; animation-iteration-count: 1 !important; }
        #pf-loader .pf-dial, #pf-loader .pf-logo, #pf-loader .pf-brand span, #pf-loader .pf-tag,
        #pf-loader .pf-ecg, #pf-loader .pf-status, #pf-loader .pf-tick { opacity: 1; }
      }
    </style>
    <canvas id="pf-canvas" aria-hidden="true"></canvas>
    <div class="pf-wrap">
      <div class="pf-stage">
        <svg class="pf-dial" viewBox="0 0 220 220" aria-hidden="true">
          <defs><linearGradient id="pfg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#b8860b"/><stop offset=".5" stop-color="#f2b632"/><stop offset="1" stop-color="#ffd873"/>
          </linearGradient></defs>
          <g id="pf-ticks"></g>
          <circle class="pf-track" cx="110" cy="110" r="88"/>
          <circle id="pf-arc" class="pf-arc" cx="110" cy="110" r="88" transform="rotate(-90 110 110)"/>
          <circle id="pf-head" r="5" cx="110" cy="22"/>
        </svg>
        <div class="pf-ring2"></div>
        <div class="pf-pulse"></div>
        <div class="pf-shock"></div>
        <div class="pf-logo">
          <img id="pf-logo" alt="ProFit" src="${gymLogo}" onerror="this.remove()">
          <span class="pf-fallback" id="pf-fallback">PF</span>
        </div>
      </div>
      <div class="pf-brand" id="pf-brand" aria-hidden="true"></div>
      <div class="pf-tag" id="pf-loader-tag"></div>
      <svg class="pf-ecg" viewBox="0 0 240 44" aria-hidden="true">
        <path class="base" pathLength="100" d="M0 22H88l5-4 4 4 6-14 6 30 6-36 6 26 5-6h6l4-3 4 3H240"/>
        <path class="beat" pathLength="100" d="M0 22H88l5-4 4 4 6-14 6 30 6-36 6 26 5-6h6l4-3 4 3H240"/>
      </svg>
      <div class="pf-status"><span class="pf-msg" id="pf-msg">Warming up…</span><span class="pf-pct" id="pf-pct">0%</span></div>
    </div>
  `;

  if (document.documentElement) {
    document.documentElement.appendChild(loader);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.documentElement.appendChild(loader));
  }

  const tagEl = loader.querySelector("#pf-loader-tag");
  if (tagEl) tagEl.textContent = gymTag;

  const brand = loader.querySelector("#pf-brand");
  const arc = loader.querySelector("#pf-arc");
  const head = loader.querySelector("#pf-head");
  const pct = loader.querySelector("#pf-pct");
  const msg = loader.querySelector("#pf-msg");
  const ticksG = loader.querySelector("#pf-ticks");
  const logo = loader.querySelector("#pf-logo");
  const fb = loader.querySelector("#pf-fallback");
  const cv = loader.querySelector("#pf-canvas");
  const ctx = cv.getContext("2d");

  const MIN_MS = 5200;
  const C = 552.92;
  const N = 72;
  const steps = [
    [0, "Warming up…"],
    [28, "Loading your plan…"],
    [58, "Syncing attendance…"],
    [84, "Almost ready…"]
  ];

  let loaded = document.readyState === "complete";
  window.addEventListener("load", () => { loaded = true; }, { once: true });
  if (logo) {
    if (logo.complete && logo.naturalWidth > 0 && fb) fb.style.display = "none";
    logo.addEventListener("load", () => { if (fb) fb.style.display = "none"; });
  }

  const NS = "http://www.w3.org/2000/svg";
  const ticks = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const major = i % 6 === 0;
    const r1 = 97;
    const r2 = major ? 109 : 104;
    const l = document.createElementNS(NS, "line");
    l.setAttribute("class", "pf-tick");
    l.setAttribute("x1", 110 + r1 * Math.cos(a));
    l.setAttribute("y1", 110 + r1 * Math.sin(a));
    l.setAttribute("x2", 110 + r2 * Math.cos(a));
    l.setAttribute("y2", 110 + r2 * Math.sin(a));
    l.style.animationDelay = (0.7 + i * 0.018) + "s";
    ticksG.appendChild(l);
    ticks.push(l);
  }

  "ProFit".split("").forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch;
    s.style.animationDelay = (1.2 + i * 0.15) + "s";
    brand.appendChild(s);
  });

  let W = 0, H = 0, DPR = 1, parts = [], sparks = [], canvasOn = false, craf = 0;
  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || window.innerWidth;
    H = cv.clientHeight || window.innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function mk(init) {
    return {
      x: Math.random() * W,
      y: init ? Math.random() * H : H + 10,
      r: 0.6 + Math.random() * 1.9,
      vy: 0.15 + Math.random() * 0.45,
      ph: Math.random() * 6.28,
      sw: 0.2 + Math.random() * 0.5,
      a: 0.25 + Math.random() * 0.6
    };
  }
  function burst() {
    for (let i = 0; i < 70; i++) {
      const an = Math.random() * 6.28;
      const sp = 2 + Math.random() * 5;
      sparks.push({ x: W / 2, y: H / 2 - 20, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, r: 1 + Math.random() * 2 });
    }
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    parts.forEach(p => {
      p.y -= p.vy;
      p.x += Math.sin(t / 1400 + p.ph) * p.sw * 0.4;
      if (p.y < -10) Object.assign(p, mk(false));
      const tw = 0.55 + 0.45 * Math.sin(t / 700 + p.ph);
      const al = p.a * tw;
      ctx.fillStyle = "rgba(242,182,50," + (al * 0.18) + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.28); ctx.fill();
      ctx.fillStyle = "rgba(255,216,115," + al + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
    });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vx *= 0.95; s.vy *= 0.95; s.life -= 0.018;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = "rgba(255,216,115," + s.life + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life + 0.3, 0, 6.28); ctx.fill();
    }
    if (canvasOn) craf = requestAnimationFrame(draw);
  }
  function startCanvas() {
    size();
    parts = [];
    for (let i = 0; i < 46; i++) parts.push(mk(true));
    sparks = [];
    canvasOn = true;
    cancelAnimationFrame(craf);
    craf = requestAnimationFrame(draw);
  }
  window.addEventListener("resize", size);

  const ease = t => 1 - Math.pow(1 - t, 3);
  const inOut = t => -(Math.cos(Math.PI * t) - 1) / 2;
  let raf = 0, stepIdx = 0;
  function setMsg(t) {
    msg.classList.add("swap");
    setTimeout(() => { msg.textContent = t; msg.classList.remove("swap"); }, 330);
  }
  function paint(p) {
    arc.style.strokeDashoffset = C * (1 - p / 100);
    const an = -Math.PI / 2 + (p / 100) * Math.PI * 2;
    head.setAttribute("cx", 110 + 88 * Math.cos(an));
    head.setAttribute("cy", 110 + 88 * Math.sin(an));
    head.style.opacity = p > 0.5 && p < 99.5 ? 1 : 0;
    const lit = Math.floor((p / 100) * N);
    for (let i = 0; i < N; i++) ticks[i].classList.toggle("lit", i < lit);
    pct.textContent = Math.round(p) + "%";
    for (let k = steps.length - 1; k >= 0; k--) {
      if (p >= steps[k][0]) {
        if (k !== stepIdx) { stepIdx = k; setMsg(steps[k][1]); }
        break;
      }
    }
  }

  startCanvas();
  paint(0);
  loader.classList.add("play");
  const start = performance.now() + 1800;
  let p = 0, fin = false, f0 = 0, from = 0;
  function frame(now) {
    if (!fin) {
      const t = Math.max(0, Math.min((now - start) / MIN_MS, 1));
      p = inOut(t) * 92;
      if (t >= 1 && loaded) { fin = true; f0 = now; from = p; }
    } else {
      const f = Math.min((now - f0) / 900, 1);
      p = from + (100 - from) * ease(f);
      if (f >= 1) {
        paint(100);
        setMsg("Let’s go!");
        loader.classList.add("finish");
        burst();
        setTimeout(() => { loader.classList.add("done"); }, 1100);
        setTimeout(() => {
          canvasOn = false;
          cancelAnimationFrame(craf);
          window.removeEventListener("resize", size);
          try { loader.remove(); } catch (_) {}
        }, 2300);
        return;
      }
    }
    paint(p);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
})();
