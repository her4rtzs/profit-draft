// ==========================================================================
// splash.js — ProFit Global Startup Loading Screen
// Runs on initial app open or full reload. Zero artificial delay.
// ==========================================================================
(() => {
  // Public auth & registration pages must load immediately without interruption
  if (/(^|\/)(login|join|forgot)\.html$/.test(location.pathname)) return;

  const isReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isReload = (() => {
    try {
      const navEntries = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (navEntries && navEntries[0]) return navEntries[0].type === "reload";
      return performance.navigation && performance.navigation.type === 1;
    } catch (_) { return false; }
  })();

  const sessionKey = "pf-app-initialized";
  let isInitialSession = false;
  try {
    isInitialSession = !sessionStorage.getItem(sessionKey);
  } catch (_) {
    isInitialSession = true;
  }

  // Only show the startup splash on initial opening in the session or browser reload
  if (!isInitialSession && !isReload) return;

  try { sessionStorage.setItem(sessionKey, "1"); } catch (_) {}

  // Create loading element early in document
  const loader = document.createElement("div");
  loader.id = "pf-global-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.setAttribute("aria-label", "Loading ProFit Dashboard");

  // Read gym branding if stored
  let gymName = "ProFit";
  let gymTag = "FUNCTIONAL FITNESS";
  let gymLogo = "logo.jpg";
  try {
    const prof = JSON.parse(localStorage.getItem("profit-gym-profile") || "null");
    if (prof) {
      if (prof.name) gymName = prof.name;
      if (prof.tagline) gymTag = prof.tagline;
      if (prof.logo) gymLogo = prof.logo;
    }
  } catch (_) {}

  loader.innerHTML = `
    <style id="pf-global-loader-style">
      #pf-global-loader {
        position: fixed;
        inset: 0;
        z-index: 9999999;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #08090D;
        background-image:
          radial-gradient(900px 520px at 50% 28%, rgba(244, 197, 66, 0.16), transparent 70%),
          linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
        background-size: auto, 48px 48px, 48px 48px;
        color: #F5F1E5;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        opacity: 1;
        transition: opacity 0.42s cubic-bezier(0.16, 1, 0.3, 1), transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
      }
      #pf-global-loader.pf-loader-hide {
        opacity: 0;
        transform: scale(1.02);
        pointer-events: none;
      }
      .pf-loader-card {
        text-align: center;
        padding: 40px 32px;
        max-width: 360px;
        width: 90%;
        display: flex;
        flex-direction: column;
        align-items: center;
        animation: pfLoaderCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .pf-loader-logo-wrap {
        position: relative;
        width: 86px;
        height: 86px;
        margin-bottom: 20px;
        display: grid;
        place-items: center;
      }
      .pf-loader-logo-glow {
        position: absolute;
        inset: -10px;
        border-radius: 28px;
        background: radial-gradient(circle, rgba(244, 197, 66, 0.35) 0%, transparent 70%);
        filter: blur(12px);
        animation: pfGlowPulse 2.4s ease-in-out infinite alternate;
      }
      .pf-loader-logo-box {
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 22px;
        background: linear-gradient(145deg, #181d2a 0%, #0e121c 100%);
        border: 1.5px solid rgba(244, 197, 66, 0.4);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65), 0 0 24px rgba(244, 197, 66, 0.2);
        overflow: hidden;
        display: grid;
        place-items: center;
      }
      .pf-loader-logo-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 20px;
      }
      .pf-loader-logo-fallback {
        display: none;
        color: #F4C542;
        font-size: 32px;
      }
      .pf-loader-title {
        margin: 0 0 4px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #FFFFFF;
        text-transform: uppercase;
      }
      .pf-loader-tag {
        margin: 0 0 24px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.22em;
        color: #F4C542;
        text-transform: uppercase;
      }
      .pf-loader-spinner-wrap {
        position: relative;
        width: 36px;
        height: 36px;
        margin-bottom: 16px;
      }
      .pf-loader-spinner {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2.5px solid rgba(244, 197, 66, 0.16);
        border-top-color: #F4C542;
        border-right-color: rgba(244, 197, 66, 0.65);
        animation: pfSpin 0.85s linear infinite;
        box-shadow: 0 0 14px rgba(244, 197, 66, 0.25);
      }
      .pf-loader-msg {
        margin: 0;
        font-size: 13.5px;
        font-weight: 500;
        color: #A3ADC2;
        letter-spacing: 0.01em;
        animation: pfTextFade 2s ease-in-out infinite alternate;
      }
      @keyframes pfSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes pfLoaderCardIn {
        from { opacity: 0; transform: translateY(14px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes pfGlowPulse {
        from { opacity: 0.45; transform: scale(0.95); }
        to { opacity: 0.85; transform: scale(1.08); }
      }
      @keyframes pfTextFade {
        from { opacity: 0.65; }
        to { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .pf-loader-spinner { animation: none; border-color: #F4C542; }
        .pf-loader-card { animation: none; }
        .pf-loader-logo-glow { animation: none; }
        .pf-loader-msg { animation: none; }
      }
    </style>
    <div class="pf-loader-card">
      <div class="pf-loader-logo-wrap">
        <div class="pf-loader-logo-glow" aria-hidden="true"></div>
        <div class="pf-loader-logo-box">
          <img src="${gymLogo}" alt="${gymName}" class="pf-loader-logo-img" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';">
          <div class="pf-loader-logo-fallback" aria-hidden="true"><i class="fa-solid fa-dumbbell"></i></div>
        </div>
      </div>
      <h1 class="pf-loader-title">${gymName}</h1>
      <p class="pf-loader-tag">${gymTag}</p>
      <div class="pf-loader-spinner-wrap" aria-hidden="true">
        <div class="pf-loader-spinner"></div>
      </div>
      <p class="pf-loader-msg">Preparing your fitness dashboard...</p>
    </div>
  `;

  // Attach immediately to document root
  if (document.documentElement) {
    document.documentElement.appendChild(loader);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.documentElement.appendChild(loader));
  }

  // Dismissal logic
  const startTime = performance.now();
  const MIN_DISPLAY_MS = 380; // minimum duration so the smooth animation is perceptible
  const MAX_SAFETY_MS = 2200; // prevent blocking in case of slow or offline networks
  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    const elapsed = performance.now() - startTime;
    const delay = Math.max(0, MIN_DISPLAY_MS - elapsed);

    setTimeout(() => {
      loader.classList.add("pf-loader-hide");
      setTimeout(() => {
        try { loader.remove(); } catch (_) {}
      }, 430);
    }, delay);
  }

  // Dismiss as soon as DB sync settles or DOM is fully ready
  if (window.pfSyncSettled) {
    dismiss();
  } else {
    document.addEventListener("profit:synced", dismiss, { once: true });
    window.addEventListener("load", dismiss, { once: true });
    setTimeout(dismiss, MAX_SAFETY_MS);
  }
})();
