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

  // Never run on standalone public auth/registration form pages
  if (isAuthPage) return;

  const justLoggedIn = (() => {
    try {
      return sessionStorage.getItem("pf-auth-just-logged-in") === "1";
    } catch (_) {
      return false;
    }
  })();

  // Only run on Landing Page OR once immediately after login
  if (!isLandingPage && !justLoggedIn) {
    return;
  }

  // Consume the post-login one-time flag immediately
  if (justLoggedIn) {
    try {
      sessionStorage.removeItem("pf-auth-just-logged-in");
    } catch (_) {}
  }

  // Create loading element early in document
  const loader = document.createElement("div");
  loader.id = "pf-global-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.setAttribute("aria-label", "Loading ProFit");

  // Read gym branding if stored
  let gymName = "FUNCTIONAL FITNESS";
  let gymTag = "GYM OPERATIONS";
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
        position: fixed !important;
        inset: 0 !important;
        z-index: 99999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background-color: #0A0E17 !important;
        background-image:
          radial-gradient(900px 520px at 50% 32%, rgba(245, 158, 11, 0.12), transparent 70%),
          linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px) !important;
        background-size: auto, 48px 48px, 48px 48px !important;
        color: #F5F1E5 !important;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
        opacity: 1 !important;
        transition: opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;
        pointer-events: auto !important;
      }
      #pf-global-loader.pf-loader-hide {
        opacity: 0 !important;
        transform: scale(1.02) !important;
        pointer-events: none !important;
      }
      #pf-global-loader,
      #pf-global-loader * {
        box-sizing: border-box !important;
      }
      #pf-global-loader .pf-loader-stage {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        text-align: center !important;
        padding: 0 !important;
        max-width: 380px !important;
        width: 90% !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        animation: pfLoaderFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both !important;
      }
      #pf-global-loader .pf-loader-logo-wrap {
        position: relative !important;
        width: 88px !important;
        height: 88px !important;
        margin-bottom: 22px !important;
        display: grid !important;
        place-items: center !important;
        background: transparent !important;
      }
      #pf-global-loader .pf-loader-logo-glow {
        position: absolute !important;
        inset: -14px !important;
        border-radius: 32px !important;
        background: radial-gradient(circle, rgba(245, 158, 11, 0.35) 0%, transparent 72%) !important;
        filter: blur(14px) !important;
        animation: pfGlowPulse 2.4s ease-in-out infinite alternate !important;
        pointer-events: none !important;
      }
      #pf-global-loader .pf-loader-logo-box {
        position: relative !important;
        width: 100% !important;
        height: 100% !important;
        border-radius: 22px !important;
        background: #111522 !important;
        border: 1.5px solid rgba(245, 158, 11, 0.45) !important;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7), 0 0 22px rgba(245, 158, 11, 0.22) !important;
        overflow: hidden !important;
        display: grid !important;
        place-items: center !important;
      }
      #pf-global-loader .pf-loader-logo-img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        border-radius: 20px !important;
        display: block !important;
      }
      #pf-global-loader .pf-loader-logo-fallback {
        display: none !important;
        color: #F59E0B !important;
        font-size: 32px !important;
        background: transparent !important;
      }
      #pf-global-loader .pf-loader-title {
        margin: 0 0 4px !important;
        font-size: 21px !important;
        font-weight: 800 !important;
        letter-spacing: 0.08em !important;
        color: #FFFFFF !important;
        text-transform: uppercase !important;
        background: transparent !important;
      }
      #pf-global-loader .pf-loader-tag {
        margin: 0 0 22px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: 0.22em !important;
        color: #F59E0B !important;
        text-transform: uppercase !important;
        background: transparent !important;
      }
      #pf-global-loader .pf-loader-spinner-wrap {
        position: relative !important;
        width: 38px !important;
        height: 38px !important;
        margin-bottom: 16px !important;
        background: transparent !important;
      }
      #pf-global-loader .pf-loader-spinner {
        width: 100% !important;
        height: 100% !important;
        border-radius: 50% !important;
        border: 2.5px solid rgba(245, 158, 11, 0.18) !important;
        border-top-color: #F59E0B !important;
        border-right-color: rgba(245, 158, 11, 0.7) !important;
        animation: pfSpin 0.85s linear infinite !important;
        box-shadow: 0 0 16px rgba(245, 158, 11, 0.25) !important;
        background: transparent !important;
      }
      #pf-global-loader .pf-loader-msg {
        margin: 0 !important;
        font-size: 13.5px !important;
        font-weight: 500 !important;
        color: #D1D5DB !important;
        letter-spacing: 0.02em !important;
        animation: pfTextFade 2s ease-in-out infinite alternate !important;
        background: transparent !important;
      }
      @keyframes pfSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes pfLoaderFadeIn {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes pfGlowPulse {
        from { opacity: 0.4; transform: scale(0.96); }
        to { opacity: 0.85; transform: scale(1.08); }
      }
      @keyframes pfTextFade {
        from { opacity: 0.65; }
        to { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        #pf-global-loader .pf-loader-spinner { animation: none !important; border-color: #F59E0B !important; }
        #pf-global-loader .pf-loader-stage { animation: none !important; }
        #pf-global-loader .pf-loader-logo-glow { animation: none !important; }
        #pf-global-loader .pf-loader-msg { animation: none !important; }
      }
    </style>
    <div class="pf-loader-stage">
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
      <p class="pf-loader-msg">Preparing your fitness experience...</p>
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
  const MIN_DISPLAY_MS = 450;
  const MAX_SAFETY_MS = 2400;
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
      }, 460);
    }, delay);
  }

  // Dismiss when window load settles or timeout reached
  if (document.readyState === "complete") {
    dismiss();
  } else {
    window.addEventListener("load", dismiss, { once: true });
    document.addEventListener("DOMContentLoaded", () => {
      // Allow a brief moment for dynamic renders to complete
      setTimeout(dismiss, MIN_DISPLAY_MS);
    }, { once: true });
    setTimeout(dismiss, MAX_SAFETY_MS);
  }
})();
