/* Local demonstration mode. Set DEMO_MODE=false and configure API_BASE_URL only when a real API is deployed. */
window.PROFIT_CONFIG = window.PROFIT_CONFIG || { API_BASE_URL: "/api", DEMO_MODE: false };

/* Shared browser stores.
   They live in config.js because every page — the staff workspace and both
   member/trainer portals — loads this file before anything else, so both sides
   always agree on what a gym announcement or a staff profile is. */
(() => {
  const KEYS = { announce: "profit-announcements-v1", profile: "profit-account-v1" };
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const timeAgo = iso => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.round(hrs / 24);
    return days === 1 ? "Yesterday" : `${days} days ago`;
  };

  window.ProFitAnnouncements = {
    KEY: KEYS.announce,
    esc,
    timeAgo,
    all() { return read(KEYS.announce) || []; },
    forAudience(who) {
      const wanted = String(who || "").toLowerCase();
      return this.all().filter(item => {
        const audience = String(item.audience || "Everyone").toLowerCase();
        return audience === "everyone" || audience === wanted;
      });
    },
    publish(input) {
      const item = {
        id: "a" + Date.now().toString(36),
        title: String(input.title || "").trim().slice(0, 120),
        message: String(input.message || "").trim().slice(0, 600),
        audience: input.audience || "Everyone",
        at: new Date().toISOString()
      };
      if (!item.title || !item.message) return null;
      write(KEYS.announce, [item, ...this.all()].slice(0, 50));
      return item;
    },
    remove(id) { write(KEYS.announce, this.all().filter(item => item.id !== id)); }
  };

  /* Six deterministic flat-vector faceless human avatars used consistently across
     every portal and tab whenever a user has not uploaded a custom profile photo. */
  const AVATAR_PRESETS = [
    { id: "av-1", label: "Amber", bg: "#2b2113", skin: "#8d5524", shirt: "#f59e0b", hair: "#1a1412", style: "puffs" },
    { id: "av-2", label: "Gold", bg: "#262014", skin: "#e0ac69", shirt: "#fbbf24", hair: "#1f1916", style: "cap" },
    { id: "av-3", label: "Slate", bg: "#1f2636", skin: "#d9a066", shirt: "#f97316", hair: "#1c1816", style: "cap" },
    { id: "av-4", label: "Runner", bg: "#2a1f14", skin: "#6f4222", shirt: "#b45309", hair: "#2b1d14", style: "headband", band: "#fbbf24" },
    { id: "av-5", label: "Sky", bg: "#17252d", skin: "#f1c27d", shirt: "#0ea5e9", hair: "#29201b", style: "part" },
    { id: "av-6", label: "Emerald", bg: "#17261f", skin: "#c68642", shirt: "#10b981", hair: "#1a1614", style: "bob" }
  ];
  const AVATAR_BY_ID = Object.fromEntries(AVATAR_PRESETS.map(p => [p.id, p]));

  function hashSeed(seed) {
    const str = String(seed || "profit-user").trim().toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function svgForPreset(p) {
    let hairSvg = "";
    if (p.style === "puffs") {
      hairSvg =
        `<circle cx="32" cy="18" r="6.5" fill="${p.hair}"/>` +
        `<circle cx="22.5" cy="21" r="5" fill="${p.hair}"/>` +
        `<circle cx="41.5" cy="21" r="5" fill="${p.hair}"/>`;
    } else if (p.style === "headband") {
      hairSvg =
        `<path d="M20 28c0-7.5 5.2-13 12-13s12 5.5 12 13v1H20v-1z" fill="${p.hair}"/>` +
        `<rect x="19.5" y="22.5" width="25" height="3.6" rx="1.8" fill="${p.band || "#fbbf24"}"/>`;
    } else if (p.style === "bob") {
      hairSvg =
        `<path d="M18.5 32c0-9.5 5.6-16 13.5-16s13.5 6.5 13.5 16v6.5c0 1.4-1.1 2.5-2.5 2.5h-2.5v-8c0-6-3.8-10-8.5-10s-8.5 4-8.5 10v8H21c-1.4 0-2.5-1.1-2.5-2.5V32z" fill="${p.hair}"/>`;
    } else if (p.style === "part") {
      hairSvg =
        `<path d="M20 26.5c0-6.8 5.2-11.8 12.2-11.8 6.4 0 11.8 4.4 11.8 11.2-2.2-3.2-6.2-4.6-12.4-4.2-4.8.3-8.6 1.8-11.6 4.8z" fill="${p.hair}"/>`;
    } else {
      hairSvg =
        `<path d="M21 25.5c1.5-5.8 5.7-9.5 11-9.5s9.5 3.7 11 9.5c-3.1-2.2-6.8-3.2-11-3.2s-7.9 1-11 3.2z" fill="${p.hair}"/>`;
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-hidden="true">` +
      `<circle cx="32" cy="32" r="32" fill="${p.bg}"/>` +
      `<path d="M12 61c1.8-11.8 9.6-18.5 20-18.5S50.2 49.2 52 61v3H12v-3z" fill="${p.shirt}"/>` +
      `<rect x="27.5" y="36.5" width="9" height="8" rx="4.5" fill="${p.skin}"/>` +
      `<ellipse cx="32" cy="29.5" rx="11.2" ry="12.2" fill="${p.skin}"/>` +
      hairSvg +
      `</svg>`
    );
  }

  function buildAvatarSvg(seed) {
    const p = AVATAR_BY_ID[seed] || AVATAR_PRESETS[hashSeed(seed) % AVATAR_PRESETS.length];
    return svgForPreset(p);
  }

  function dataUrlFromSvg(svg) {
    try {
      return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    } catch (_) {
      return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    }
  }

  // Enforce one flat, consistent circular avatar look across every portal (no boxes, no glowing rings).
  if (typeof document !== "undefined" && !document.getElementById("pf-avatar-uniform")) {
    const st = document.createElement("style");
    st.id = "pf-avatar-uniform";
    st.textContent = [
      ".sidebar-avatar,.topbar-avatar,.pp-avatar,.pp-avatar.gold-frame,.mini-avatar,.csh-avatar,.member-avatar-face,.tr-avatar,.tr-req-ava,.tw-coach-avatar,.pp-avatar-photo,.avatar{",
      "  border-radius:50%!important;box-shadow:none!important;outline:none!important;filter:none!important;",
      "  border:1px solid rgba(255,255,255,.12)!important;overflow:hidden!important;background:#1b2230!important;",
      "}",
      ".sidebar-avatar::before,.sidebar-avatar::after,.topbar-avatar::before,.topbar-avatar::after,.pp-avatar::before,.pp-avatar::after,.pp-avatar.gold-frame::before,.pp-avatar.gold-frame::after,.member-avatar-face::before,.member-avatar-face::after{",
      "  display:none!important;content:none!important;box-shadow:none!important;",
      "}",
      ".sidebar-avatar img,.topbar-avatar img,.pp-avatar img,.mini-avatar img,.csh-avatar img,.tr-avatar img,.tr-req-ava img,.tw-coach-avatar img,.pp-avatar-photo img,.avatar img{",
      "  width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important;display:block!important;",
      "}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(st);
  }

  // Universal smooth KPI count-up animation across all portals (Owner, Cashier, Trainer, Member).
  if (typeof document !== "undefined" && !window.__pfCountUpInit) {
    window.__pfCountUpInit = true;
    const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const KPI_SELECTOR = [
      ".tr-kpi strong",
      ".csh-kpi-val",
      ".fn-kpi-val",
      ".kpi-val",
      ".kpi-value",
      ".tw-kpi-val",
      ".pp-cal-stat strong",
      "#streakDays",
      "#weeklyVisits",
      "#achievementsCount"
    ].join(",");

    function parseMetric(raw) {
      const txt = String(raw || "").trim();
      const m = txt.match(/^([^\d-]*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
      if (!m) return null;
      const num = parseFloat(m[2].replace(/,/g, ""));
      if (!Number.isFinite(num)) return null;
      const decimals = (m[2].split(".")[1] || "").length;
      return { prefix: m[1], num, decimals, suffix: m[3], hasComma: m[2].includes(",") || num >= 1000 };
    }

    function formatMetric(meta, val) {
      const fixed = meta.decimals > 0
        ? val.toLocaleString("en-US", { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals })
        : (meta.hasComma ? Math.round(val).toLocaleString("en-US") : String(Math.round(val)));
      return `${meta.prefix}${fixed}${meta.suffix}`;
    }

    function animateEl(el) {
      if (!el || reduceMotion() || el.dataset.pfCounting === "1") return;
      const txt = (el.textContent || "").trim();
      if (!txt || txt === el.dataset.pfLastVal) return;
      const meta = parseMetric(txt);
      if (!meta || meta.num === 0) {
        el.dataset.pfLastVal = txt;
        return;
      }
      const prev = parseMetric(el.dataset.pfLastVal || "");
      const from = prev ? prev.num : 0;
      if (from === meta.num) {
        el.dataset.pfLastVal = txt;
        return;
      }
      el.dataset.pfCounting = "1";
      el.dataset.pfLastVal = txt;
      const t0 = performance.now();
      const dur = 680;
      const step = now => {
        const p = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = formatMetric(meta, from + (meta.num - from) * ease);
        if (p < 1) requestAnimationFrame(step);
        else {
          el.textContent = txt;
          el.dataset.pfCounting = "0";
        }
      };
      requestAnimationFrame(step);
    }

    const bindAll = () => {
      document.querySelectorAll(KPI_SELECTOR).forEach(el => {
        if (el.dataset.pfObsBound) return;
        el.dataset.pfObsBound = "1";
        animateEl(el);
        new MutationObserver(() => animateEl(el)).observe(el, { childList: true, characterData: true, subtree: true });
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindAll, { once: true });
    } else {
      bindAll();
    }
    new MutationObserver(bindAll).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.ProFitAvatar = {
    presets() {
      return AVATAR_PRESETS.map(p => ({ id: p.id, label: p.label, dataUrl: dataUrlFromSvg(svgForPreset(p)) }));
    },
    svg(seed) {
      return buildAvatarSvg(seed);
    },
    dataUrl(seed) {
      return dataUrlFromSvg(buildAvatarSvg(seed));
    },
    resolve(photo, seed) {
      const clean = String(photo || "").trim();
      if (clean && AVATAR_BY_ID[clean]) return dataUrlFromSvg(svgForPreset(AVATAR_BY_ID[clean]));
      return clean || this.dataUrl(seed);
    },
    paint(box, { photo = "", seed = "", alt = "" } = {}) {
      if (!box) return;
      const src = this.resolve(photo, seed);
      let img = box.querySelector("img.pf-avatar-img");
      if (!img) {
        const legacy = box.querySelector("img");
        if (legacy) {
          img = legacy;
          img.classList.add("pf-avatar-img");
        } else {
          img = document.createElement("img");
          img.className = "pf-avatar-img";
          img.alt = alt;
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          img.style.borderRadius = "50%";
          img.style.display = "block";
          box.prepend(img);
        }
      }
      img.src = src;
      box.classList.add("has-photo");
      const textSpan = box.querySelector("[data-user-initials]");
      if (textSpan) textSpan.style.display = "none";
    }
  };

  /* Staff profile — scoped per signed-in user so switching accounts never leaks
     another user's name or avatar, with server-verified auth data taking priority. */
  const readSessionUser = () => {
    if (window.ProFitAuth && window.ProFitAuth.user) return window.ProFitAuth.user;
    try {
      return JSON.parse(sessionStorage.getItem("profit-verified-session") || "null");
    } catch {
      return null;
    }
  };
  const profileKeyForUser = () => {
    const u = readSessionUser();
    const uid = u && (u.id || u.email);
    return uid ? `${KEYS.profile}:${uid}` : KEYS.profile;
  };
  window.ProFitProfile = {
    KEY: KEYS.profile,
    get() {
      const u = readSessionUser();
      const roleCode = String((u && u.role) || "").toUpperCase();
      const defaultRole = roleCode === "MEMBER" ? "Gym member" : roleCode === "CASHIER" ? "Cashier" : roleCode === "TRAINER" ? "Personal trainer" : "Gym administrator";
      const base = { name: "", email: "", phone: "", role: defaultRole, photo: "", bio: "", joined: "" };
      const stored = read(profileKeyForUser()) || {};
      const merged = { ...base, ...stored };
      if (u) {
        if (typeof u.name === "string") merged.name = u.name.trim();
        if (u.email) merged.email = u.email;
        if (typeof u.photo === "string" && u.photo) merged.photo = u.photo;
        else if (typeof u.photo === "string" && u.photo === "" && u.id) merged.photo = "";
      }
      return merged;
    },
    save(patch) {
      const key = profileKeyForUser();
      const next = { ...this.get(), ...patch };
      if (!write(key, next)) return null;
      return next;
    },
    clear() {
      try { localStorage.removeItem(KEYS.profile); } catch { /* ignore */ }
    },
    initials() {
      const p = this.get();
      const name = (p.name || "").trim();
      if (!name || name.includes("@")) return "PF";
      const parts = name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
      return parts || "PF";
    }
  };

  /* Weekly class timetable, shared by the member schedule, the overview
     calendar and the trainer portal so all three show the same week. */
  window.ProFitTimetable = [
    { dow: 0, time: "09:00", name: "Recovery & Stretch", coach: "Coach Bea", mins: 45, cap: 18, emoji: "🧘" },
    { dow: 1, time: "06:00", name: "Sunrise HIIT", coach: "Coach Mika", mins: 45, cap: 12, emoji: "🔥" },
    { dow: 1, time: "18:30", name: "Strength Basics", coach: "Coach Jun", mins: 60, cap: 10, emoji: "💪" },
    { dow: 2, time: "07:00", name: "Cardio Club", coach: "Coach Rei", mins: 40, cap: 16, emoji: "🏃" },
    { dow: 2, time: "19:00", name: "Boxing Fitness", coach: "Coach Dan", mins: 50, cap: 12, emoji: "🥊" },
    { dow: 3, time: "06:00", name: "Sunrise HIIT", coach: "Coach Mika", mins: 45, cap: 12, emoji: "🔥" },
    { dow: 3, time: "19:00", name: "Mobility Flow", coach: "Coach Bea", mins: 50, cap: 14, emoji: "🧘" },
    { dow: 4, time: "18:00", name: "Barbell Club", coach: "Coach Jun", mins: 60, cap: 8, emoji: "🏋️" },
    { dow: 5, time: "07:00", name: "Cardio Club", coach: "Coach Rei", mins: 40, cap: 16, emoji: "🏃" },
    { dow: 5, time: "17:30", name: "Friday Finisher", coach: "Coach Mika", mins: 45, cap: 12, emoji: "⚡" },
    { dow: 6, time: "08:00", name: "Team Sweat", coach: "Coaches", mins: 75, cap: 20, emoji: "⚽" }
  ];
  window.ProFitCoaches = [...new Set(window.ProFitTimetable.map(s => s.coach))].sort();

  /* Gym contact block. The public portal shows this so a visitor can reach the
     front desk without first creating an account — it is the single source the
     portal, the trainer portal and the footer all read from. */
  window.ProFitGym = {
    name: "ProFit",
    tag: "FUNCTIONAL FITNESS",
    phone: "+63 917 555 0142",
    email: "hello@profitgym.ph",
    address: "Unit 4, Brgy. Poblacion, Makati City, Metro Manila",
    hours: [
      { days: "Mon – Fri", time: "6:00 AM – 10:00 PM" },
      { days: "Saturday", time: "7:00 AM – 9:00 PM" },
      { days: "Sunday", time: "8:00 AM – 6:00 PM" }
    ],
    /* Where members actually send money. Shown on the enrollment form so a
       payer never has to ask the front desk for the account number. */
    payIn: [
      {
        id: "gcash",
        label: "GCash",
        icon: "fa-mobile-screen-button",
        accountName: "PROFIT FUNCTIONAL FITNESS",
        number: "0917 555 0142",
        note: "Send the exact amount, then paste the reference number below."
      },
      /* Cash is a real option on the form but has no account to send to. Without
         this entry the panel fell through to rows[0] and told a walk-in to send
         GCash, which is the wrong instruction for someone standing at the desk. */
      {
        id: "cash",
        label: "Cash",
        icon: "fa-money-bill-wave",
        lead: "Pay at the front desk",
        accountName: "",
        number: "",
        note: "Bring the exact amount. Ask for the official receipt and keep it for your records."
      }
    ],
    esc() {
      return String(arguments[0] ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
  };

  /* Activity feed. Staff pages get the richer API from sidebar.js; every other
     page (the portals, the member home, enrollment) writes straight into the
     same key so the front desk's bell tells the truth about what happened. */
  const NOTIF_KEY = "profit-notifications-v1";
  window.ProFitNotify = {
    KEY: NOTIF_KEY,
    push(input) {
      if (window.ProFitNotifications && typeof window.ProFitNotifications.push === "function") {
        return window.ProFitNotifications.push(input);
      }
      const item = {
        id: input.tag || input.type + ":" + Date.now(),
        type: input.type || "general",
        icon: input.icon || "fa-bell",
        title: input.title || "Update",
        message: input.message || "",
        time: input.time || "Just now",
        href: input.href || "",
        read: false
      };
      let list = [];
      try { list = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]"); } catch { /* storage blocked */ }
      if (!Array.isArray(list)) list = [];
      if (input.tag) list = list.filter(n => n.id !== input.tag);
      list = [item, ...list].slice(0, 40);
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
      try { document.dispatchEvent(new CustomEvent("profit-notifications")); } catch { /* no document */ }
      return item;
    }
  };
})();


/* Keep mobile status bar theme-color synced with manual Light/Dark theme toggles */
(() => {
  if (typeof document === "undefined") return;
  const syncThemeColor = () => {
    const html = document.documentElement;
    const isLight = html.getAttribute("data-theme") === "light" ||
      (document.body && !document.body.classList.contains("dark") && html.getAttribute("data-theme") !== "dark" && localStorage.getItem("theme") === "light");
    const color = isLight ? "#faf6ee" : "#0a0e17";
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta && meta.getAttribute("content") !== color) {
      meta.setAttribute("content", color);
    }
  };
  document.addEventListener("DOMContentLoaded", syncThemeColor);
  window.addEventListener("storage", e => { if (e.key === "theme" || e.key === "pf-theme") syncThemeColor(); });
  new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
})();


/* Global Accessibility preferences (High Contrast Mode + Enhanced Focus Indicators) */
(() => {
  if (typeof document === "undefined") return;
  const K_CONTRAST = "pf-a11y-contrast";
  const K_FOCUS = "pf-a11y-focus";

  if (!document.getElementById("pf-a11y-styles")) {
    const st = document.createElement("style");
    st.id = "pf-a11y-styles";
    st.textContent = `
      html[data-high-contrast="1"],
      html[data-high-contrast="1"][data-theme="dark"] body[data-portal="trainer"] {
        --text: #ffffff !important;
        --text-2: #f1f5f9 !important;
        --muted: #cbd5e1 !important;
        --border: rgba(255, 255, 255, .42) !important;
        --line: rgba(255, 255, 255, .42) !important;
        --line-strong: rgba(255, 255, 255, .62) !important;
        --ink: #ffffff !important;
        --t2: #e2e8f0 !important;
        --ln: rgba(255, 255, 255, .45) !important;
      }
      html[data-high-contrast="1"][data-theme="light"],
      html[data-high-contrast="1"][data-theme="light"] body[data-portal="trainer"],
      html[data-high-contrast="1"]:not([data-theme="dark"]) body:not(.dark) {
        --text: #0a0a0a !important;
        --text-2: #171717 !important;
        --muted: #262626 !important;
        --border: #404040 !important;
        --line: #404040 !important;
        --line-strong: #171717 !important;
        --ink: #0a0a0a !important;
        --t2: #262626 !important;
        --ln: #404040 !important;
      }
      html[data-high-contrast="1"] .st-card,
      html[data-high-contrast="1"] .mb-st-card,
      html[data-high-contrast="1"] .tr-st-card,
      html[data-high-contrast="1"] .panel,
      html[data-high-contrast="1"] .card,
      html[data-high-contrast="1"] .tw-card,
      html[data-high-contrast="1"] .pp-card,
      html[data-high-contrast="1"] .member-panel,
      html[data-high-contrast="1"] input,
      html[data-high-contrast="1"] select,
      html[data-high-contrast="1"] textarea,
      html[data-high-contrast="1"] button {
        border-width: 1.5px;
      }
      html[data-enhanced-focus="1"] :is(button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], [tabindex]):focus,
      html[data-enhanced-focus="1"] :is(button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], [tabindex]):focus-visible {
        outline: 3px solid #ff8c00 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 5px rgba(255, 140, 0, .28) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  const read = key => {
    try { return localStorage.getItem(key) === "1"; } catch (_) { return false; }
  };
  const write = (key, on) => {
    try { localStorage.setItem(key, on ? "1" : "0"); } catch (_) {}
  };

  const apply = () => {
    const contrast = read(K_CONTRAST);
    const focus = read(K_FOCUS);
    if (contrast) document.documentElement.dataset.highContrast = "1";
    else delete document.documentElement.dataset.highContrast;
    if (focus) document.documentElement.dataset.enhancedFocus = "1";
    else delete document.documentElement.dataset.enhancedFocus;
    document.querySelectorAll('[data-a11y="contrast"]').forEach(el => { el.checked = contrast; });
    document.querySelectorAll('[data-a11y="focus"]').forEach(el => { el.checked = focus; });
  };

  window.ProFitA11y = {
    get: () => ({ contrast: read(K_CONTRAST), focus: read(K_FOCUS) }),
    setHighContrast: on => { write(K_CONTRAST, !!on); apply(); },
    setEnhancedFocus: on => { write(K_FOCUS, !!on); apply(); },
    sync: apply
  };

  apply();
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("change", e => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-a11y="contrast"]')) {
      window.ProFitA11y.setHighContrast(t.checked);
    } else if (t.matches('[data-a11y="focus"]')) {
      window.ProFitA11y.setEnhancedFocus(t.checked);
    }
  });
  window.addEventListener("storage", e => {
    if (e.key === K_CONTRAST || e.key === K_FOCUS) apply();
  });

  /* Auto-load branded ProFit controls (Select dropdowns, Date & Time pickers) */
  if (!document.getElementById("pf-controls-js")) {
    const sc = document.createElement("script");
    sc.id = "pf-controls-js";
    sc.src = "/pf-controls.js?v=6";
    sc.defer = true;
    (document.head || document.documentElement).appendChild(sc);
  }
})();
