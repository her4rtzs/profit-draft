// ==========================================================================
// splash.js — ProFit Branded Loading Screen
// Runs on:
//  1) Landing page (welcome.html / root): every browser visit, and once per
//     installed-app launch (so tapping Back from Sign In / Sign Up opens
//     Welcome immediately without replaying the loader)
//  2) Once after successful login while initializing the account
// Bypassed during normal Admin, Staff, and Member portal navigation.
// ==========================================================================
(() => {
  const path = (location.pathname || "").toLowerCase();
  const file = path.split("/").pop() || "";
  const isLandingPage = file === "" || file === "/" || path === "/" || path.endsWith("/");
  const isAuthPage = /(^|\/)(login|join|forgot)(?:\.html)?$/.test(path);

  if (isAuthPage) return;

  const isStandalone = Boolean(
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );

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
  } else if (isLandingPage && isStandalone) {
    try {
      if (sessionStorage.getItem("pf-standalone-splash-seen") === "1") {
        window.dispatchEvent(new CustomEvent("pf:splash-done"));
        return;
      }
      sessionStorage.setItem("pf-standalone-splash-seen", "1");
    } catch (_) {}
  }

  let gymTag = "Functional Fitness Gym";
  let gymLogo = "/logo.jpg";
  try {
    const prof = JSON.parse(localStorage.getItem("profit-gym-profile") || "null");
    if (prof) {
      if (prof.name && prof.name.trim() && prof.name.trim().toLowerCase() !== "profit") {
        gymTag = prof.name.trim();
      } else if (prof.tagline && prof.tagline.trim()) {
        gymTag = prof.tagline.trim();
      }
      if (prof.logo) {
        gymLogo = /^(data:|https?:|\/)/i.test(prof.logo) ? prof.logo : "/" + prof.logo.replace(/^\.?\//, "");
      }
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
        --bg: #070B18; --bg2: #0F1A33; --gold: #F5C518; --gold-soft: #FAD03C;
        --text: #F4F6FB; --muted: #9FB0D6;
        position: fixed !important; inset: 0 !important; z-index: 99999999 !important;
        width: 100% !important; height: 100dvh !important;
        display: flex !important; flex-direction: column !important;
        align-items: center !important; justify-content: space-between !important;
        overflow: hidden !important;
        background: radial-gradient(ellipse at 50% 38%, var(--bg2) 0%, var(--bg) 70%) !important;
        color: var(--text) !important;
        font-family: "Plus Jakarta Sans", Inter, system-ui, -apple-system, "Segoe UI", sans-serif !important;
        clip-path: circle(150% at 50% 50%);
        transition: clip-path .52s cubic-bezier(.76,0,.24,1), opacity .35s ease, visibility 0s .52s;
        padding: calc(16px + env(safe-area-inset-top, 0px)) max(20px, env(safe-area-inset-right, 20px)) calc(22px + env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 20px)) !important;
        overscroll-behavior: none !important;
        touch-action: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      #pf-loader * { box-sizing: border-box !important; }
      #pf-loader.done { clip-path: circle(0% at 50% 50%); visibility: hidden; pointer-events: none; }
      #pf-loader::before {
        content: ""; position: absolute; width: min(520px, 90vw); height: min(520px, 90vw); border-radius: 50%;
        top: 50%; left: 50%; transform: translate(-50%, -56%);
        background: radial-gradient(circle, rgba(245,197,24,.16), transparent 65%);
        filter: blur(28px); animation: pfHaze 6s ease-in-out infinite alternate; pointer-events: none;
      }
      @keyframes pfFadein { to { opacity: 1; } }
      @keyframes pfSpin { to { transform: rotate(360deg); } }
      @keyframes pfHaze {
        from { transform: translate(-54%, -58%) scale(.92); }
        to { transform: translate(-46%, -52%) scale(1.08); }
      }
      #pf-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

      #pf-loader .pf-spacer { height: 44px; flex: 0 0 auto; pointer-events: none; }
      #pf-loader .pf-wrap {
        position: relative; z-index: 2;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 16px; width: 100%; max-width: 340px; text-align: center;
        transition: opacity .38s ease, transform .45s ease;
        user-select: none; -webkit-user-select: none;
      }
      #pf-loader.done .pf-wrap { opacity: 0; transform: scale(.9); }

      #pf-loader .pf-stage { position: relative; width: 204px; height: 204px; display: grid; place-items: center; flex: none; }
      #pf-loader .pf-dial { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
      #pf-loader.play .pf-dial { animation: pfDialin .55s cubic-bezier(.2,.8,.2,1) .04s forwards; }
      @keyframes pfDialin { from { opacity: 0; transform: scale(.86) rotate(-24deg); } to { opacity: 1; transform: none; } }
      #pf-loader .pf-tick { stroke: rgba(255,255,255,.17); stroke-width: 1.6; stroke-linecap: round; opacity: 0; transition: stroke .35s, filter .35s; }
      #pf-loader .pf-tick.lit { stroke: var(--gold); filter: drop-shadow(0 0 3px rgba(245,197,24,.9)); }
      #pf-loader.play .pf-tick { animation: pfFadein .32s ease forwards; }
      #pf-loader .pf-track { fill: none; stroke: rgba(255,255,255,.08); stroke-width: 3.5; }
      #pf-loader .pf-arc {
        fill: none; stroke: url(#pfg); stroke-width: 3.5; stroke-linecap: round;
        stroke-dasharray: 552.92; stroke-dashoffset: 552.92;
        filter: drop-shadow(0 0 6px rgba(245,197,24,.7));
      }
      #pf-loader #pf-head { fill: var(--gold-soft); filter: drop-shadow(0 0 8px rgba(255,216,115,1)); opacity: 0; }

      #pf-loader .pf-ring2 {
        position: absolute; inset: 40px; border-radius: 50%;
        border: 1.5px dashed rgba(245,197,24,.38); animation: pfSpin 14s linear infinite reverse;
      }
      #pf-loader .pf-pulse {
        position: absolute; width: 102px; height: 102px; border-radius: 50%;
        border: 1.5px solid rgba(245,197,24,.55); opacity: 0;
      }
      #pf-loader.play .pf-pulse { animation: pfBeatring 1.6s ease-out .65s infinite; }
      @keyframes pfBeatring { 0% { transform: scale(1); opacity: .68; } 70%, 100% { transform: scale(1.7); opacity: 0; } }
      #pf-loader .pf-shock {
        position: absolute; width: 102px; height: 102px; border-radius: 50%;
        border: 2px solid var(--gold-soft); opacity: 0;
      }
      #pf-loader.finish .pf-shock { animation: pfShock .75s ease-out forwards; }
      @keyframes pfShock { 0% { transform: scale(.85); opacity: 1; } 100% { transform: scale(6.5); opacity: 0; } }

      #pf-loader .pf-logo {
        position: relative; width: 102px; height: 102px; border-radius: 50%; display: grid; place-items: center;
        background: #070B18; border: 1.5px solid rgba(245,197,24,.48); overflow: hidden; opacity: 0;
        box-shadow: 0 0 0 6px rgba(245,197,24,.07), 0 0 36px rgba(245,197,24,.26);
      }
      #pf-loader .pf-logo img { width: 100%; height: 100%; object-fit: cover; display: block; filter: none !important; }
      #pf-loader .pf-logo .pf-fallback { font-weight: 800; font-size: 30px; letter-spacing: -.02em; color: var(--gold); }
      #pf-loader .pf-logo::after {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.32) 50%, transparent 65%);
        transform: translateX(-120%); animation: pfSweep 3.2s ease-in-out .9s infinite;
      }
      @keyframes pfSweep { 0% { transform: translateX(-120%); } 45%, 100% { transform: translateX(120%); } }
      #pf-loader.play .pf-logo {
        animation: pfPop .62s cubic-bezier(.2,.9,.25,1.12) .08s forwards, pfHeart 1.6s ease-in-out .7s infinite;
      }
      @keyframes pfPop {
        0% { opacity: 0; transform: scale(.65) rotate(-8deg); }
        100% { opacity: 1; transform: none; }
      }
      @keyframes pfHeart {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 6px rgba(245,197,24,.06), 0 0 28px rgba(245,197,24,.22); }
        12% { transform: scale(1.06); box-shadow: 0 0 0 9px rgba(245,197,24,.10), 0 0 56px rgba(245,197,24,.48); }
        24% { transform: scale(1); }
        36% { transform: scale(1.035); box-shadow: 0 0 0 7px rgba(245,197,24,.08), 0 0 42px rgba(245,197,24,.34); }
        48% { transform: scale(1); }
      }
      #pf-loader.finish .pf-logo { animation: pfBurst .55s ease forwards; }
      @keyframes pfBurst {
        40% { transform: scale(1.12); box-shadow: 0 0 0 11px rgba(245,197,24,.18), 0 0 90px rgba(255,216,115,.8); }
        100% { transform: scale(1.03); }
      }

      #pf-loader .pf-brand-group { display: flex; flex-direction: column; align-items: center; gap: 4px; }
      #pf-loader .pf-brand { display: flex; font-size: 34px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; }
      #pf-loader .pf-brand span { display: inline-block; opacity: 0; }
      #pf-loader .pf-brand span:nth-child(n+4) { color: var(--gold); }
      #pf-loader.play .pf-brand span { animation: pfRise .45s cubic-bezier(.2,.8,.2,1) forwards; }
      @keyframes pfRise {
        from { opacity: 0; transform: translateY(14px) scale(.94); }
        to { opacity: 1; transform: none; }
      }
      #pf-loader .pf-tag {
        font-size: 11.5px; font-weight: 600; letter-spacing: .26em; text-transform: uppercase;
        color: var(--muted); opacity: 0; padding-left: .26em; line-height: 1.35;
      }
      #pf-loader.play .pf-tag { animation: pfTagin .55s ease .34s forwards; }
      @keyframes pfTagin {
        from { opacity: 0; letter-spacing: .38em; transform: translateY(6px); }
        to { opacity: 1; letter-spacing: .26em; transform: none; }
      }

      #pf-loader .pf-ecg {
        width: min(230px, 72vw); height: 38px; opacity: 0;
        -webkit-mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent);
        mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent);
      }
      #pf-loader.play .pf-ecg { animation: pfFadein .48s ease .44s forwards; }
      #pf-loader .pf-ecg path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      #pf-loader .pf-ecg .base { stroke: rgba(245,197,24,.22); stroke-width: 1.5; }
      #pf-loader .pf-ecg .beat {
        stroke: var(--gold-soft); stroke-width: 2.2; stroke-dasharray: 24 76; stroke-dashoffset: 24;
        filter: drop-shadow(0 0 5px rgba(255,216,115,.9)); animation: pfComet 1.9s linear infinite;
      }
      @keyframes pfComet { to { stroke-dashoffset: -100; } }

      #pf-loader .pf-status {
        display: inline-flex; align-items: baseline; justify-content: center; gap: 10px;
        font-size: 13px; color: var(--muted); opacity: 0; min-height: 20px;
      }
      #pf-loader.play .pf-status { animation: pfFadein .42s ease .30s forwards; }
      #pf-loader .pf-msg { transition: opacity .22s ease, transform .22s ease; }
      #pf-loader .pf-msg.swap { opacity: 0; transform: translateY(4px); }
      #pf-loader .pf-pct { font-variant-numeric: tabular-nums; color: var(--gold-soft); font-weight: 700; min-width: 4ch; text-align: right; }

      #pf-loader .pf-skip-wrap {
        position: relative; z-index: 5; flex: 0 0 auto;
        display: flex; align-items: center; justify-content: center; width: 100%;
      }
      #pf-loader .pf-skip {
        min-height: 44px;
        padding: 0 22px;
        border-radius: 999px;
        background: rgba(15, 26, 51, 0.88);
        border: 1px solid #263B63;
        color: #F4F6FB;
        font: 700 13.5px/1 "Plus Jakarta Sans", Inter, sans-serif;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
        pointer-events: auto;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        transition: border-color .15s ease, color .15s ease, background-color .15s ease, transform .12s ease-out, opacity .25s ease;
      }
      @media (hover: hover) and (pointer: fine) {
        #pf-loader .pf-skip:hover {
          border-color: var(--gold);
          color: var(--gold);
          background: rgba(15, 26, 51, 0.98);
        }
      }
      #pf-loader .pf-skip:active {
        transform: scale(0.96);
        border-color: var(--gold);
        color: var(--gold);
        background: rgba(245, 197, 24, 0.14);
      }
      #pf-loader .pf-skip:focus-visible {
        border-color: var(--gold);
        color: var(--gold);
        outline: 2px solid var(--gold);
        outline-offset: 2px;
      }
      #pf-loader.done .pf-skip { opacity: 0; pointer-events: none; }

      @media (max-height: 680px) {
        #pf-loader .pf-spacer { height: 24px; }
        #pf-loader .pf-wrap { gap: 12px; }
        #pf-loader .pf-stage { width: 176px; height: 176px; }
        #pf-loader .pf-ring2 { inset: 34px; }
        #pf-loader .pf-logo, #pf-loader .pf-pulse, #pf-loader .pf-shock { width: 88px; height: 88px; }
        #pf-loader .pf-brand { font-size: 30px; }
        #pf-loader .pf-ecg { height: 32px; }
      }

      @media (max-height: 500px) {
        #pf-loader .pf-spacer { display: none; }
        #pf-loader .pf-wrap { gap: 8px; }
        #pf-loader .pf-stage { width: 126px; height: 126px; }
        #pf-loader .pf-ring2 { inset: 24px; }
        #pf-loader .pf-logo, #pf-loader .pf-pulse, #pf-loader .pf-shock { width: 64px; height: 64px; }
        #pf-loader .pf-brand { font-size: 26px; }
        #pf-loader .pf-tag { font-size: 10.5px; letter-spacing: .2em; }
        #pf-loader .pf-ecg { display: none; }
        #pf-loader .pf-skip { min-height: 40px; padding: 0 18px; font-size: 13px; }
      }

      @media (prefers-reduced-motion: reduce) {
        #pf-loader *, #pf-loader::before { animation-duration: .01s !important; animation-iteration-count: 1 !important; }
        #pf-loader .pf-dial, #pf-loader .pf-logo, #pf-loader .pf-brand span, #pf-loader .pf-tag,
        #pf-loader .pf-ecg, #pf-loader .pf-status, #pf-loader .pf-tick { opacity: 1; }
      }
    </style>
    <canvas id="pf-canvas" aria-hidden="true"></canvas>
    <div class="pf-spacer" aria-hidden="true"></div>
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
      <div class="pf-brand-group">
        <div class="pf-brand" id="pf-brand" aria-hidden="true"></div>
        <div class="pf-tag" id="pf-loader-tag"></div>
      </div>
      <svg class="pf-ecg" viewBox="0 0 240 44" aria-hidden="true">
        <path class="base" pathLength="100" d="M0 22H88l5-4 4 4 6-14 6 30 6-36 6 26 5-6h6l4-3 4 3H240"/>
        <path class="beat" pathLength="100" d="M0 22H88l5-4 4 4 6-14 6 30 6-36 6 26 5-6h6l4-3 4 3H240"/>
      </svg>
      <div class="pf-status"><span class="pf-msg" id="pf-msg">Warming up…</span><span class="pf-pct" id="pf-pct">0%</span></div>
    </div>
    <div class="pf-skip-wrap">
      <button type="button" id="pf-skip" class="pf-skip" aria-label="Skip loading animation">Skip <span aria-hidden="true">&rarr;</span></button>
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

  const MIN_MS = isStandalone && !justLoggedIn ? 1250 : 1500;
  const C = 552.92;
  const N = 72;
  const steps = justLoggedIn
    ? [
        [0, "Signing you in…"],
        [35, "Loading your workspace…"],
        [72, "Almost ready…"]
      ]
    : [
        [0, "Warming up…"],
        [32, "Preparing ProFit…"],
        [68, "Almost ready…"]
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
    l.style.animationDelay = (0.08 + i * 0.004) + "s";
    ticksG.appendChild(l);
    ticks.push(l);
  }

  "ProFit".split("").forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch;
    s.style.animationDelay = (0.16 + i * 0.045) + "s";
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
      r: 0.6 + Math.random() * 1.7,
      vy: 0.18 + Math.random() * 0.42,
      ph: Math.random() * 6.28,
      sw: 0.2 + Math.random() * 0.45,
      a: 0.22 + Math.random() * 0.55
    };
  }
  function burst() {
    for (let i = 0; i < 56; i++) {
      const an = Math.random() * 6.28;
      const sp = 2 + Math.random() * 4.8;
      sparks.push({ x: W / 2, y: H / 2 - 20, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, r: 1 + Math.random() * 1.9 });
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
      ctx.fillStyle = "rgba(245,197,24," + (al * 0.16) + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.8, 0, 6.28); ctx.fill();
      ctx.fillStyle = "rgba(255,216,115," + al + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
    });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vx *= 0.94; s.vy *= 0.94; s.life -= 0.022;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = "rgba(255,216,115," + s.life + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life + 0.3, 0, 6.28); ctx.fill();
    }
    if (canvasOn) craf = requestAnimationFrame(draw);
  }
  function startCanvas() {
    size();
    parts = [];
    for (let i = 0; i < 36; i++) parts.push(mk(true));
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
    setTimeout(() => { msg.textContent = t; msg.classList.remove("swap"); }, 180);
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
  const skipBtn = loader.querySelector("#pf-skip");
  let dismissed = false;
  function onKeyDown(e) {
    if (e.key === "Escape") dismiss(true);
  }
  function dismiss(immediate) {
    if (dismissed) return;
    dismissed = true;
    canvasOn = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(craf);
    window.removeEventListener("resize", size);
    window.removeEventListener("keydown", onKeyDown);
    if (immediate) loader.classList.add("finish");
    loader.classList.add("done");
    try { window.dispatchEvent(new CustomEvent("pf:splash-done")); } catch (_) {}
    setTimeout(() => {
      try { loader.remove(); } catch (_) {}
    }, 560);
  }
  if (skipBtn) skipBtn.addEventListener("click", () => dismiss(true));
  window.addEventListener("keydown", onKeyDown);

  const start = performance.now() + 180;
  let p = 0, fin = false, f0 = 0, from = 0;
  function frame(now) {
    if (dismissed) return;
    if (!fin) {
      const t = Math.max(0, Math.min((now - start) / MIN_MS, 1));
      p = inOut(t) * 92;
      if (t >= 1 && loaded) { fin = true; f0 = now; from = p; }
    } else {
      const f = Math.min((now - f0) / 340, 1);
      p = from + (100 - from) * ease(f);
      if (f >= 1) {
        paint(100);
        setMsg("Let’s go!");
        loader.classList.add("finish");
        burst();
        setTimeout(() => dismiss(false), 260);
        return;
      }
    }
    paint(p);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
})();
