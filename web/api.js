/* Shared API client with safe per-user offline read cache & auto-refresh on reconnect.
   Same-origin "/api" by default, so session and CSRF cookies work without CORS.
   - Online: always fetches live data and saves a per-user snapshot of GET responses.
   - Offline: GET requests return the signed-in user's saved snapshot; write actions
     (POST/PATCH/DELETE) stay blocked with a clear reconnect message.
   - Logout / 401 / 403: immediately wipes all cached API snapshots and SW HTML pages. */
(() => {
  const raw = (window.PROFIT_CONFIG?.API_BASE_URL || "").trim();
  const baseUrl = new URL((raw || "/api").replace(/\/?$/, "/"), location.origin);
  if (location.protocol === "https:" && baseUrl.protocol !== "https:") {
    throw new Error("Secure pages require an HTTPS API endpoint.");
  }
  const apiUrl = path => {
    const [pathname, search] = String(path || "").replace(/^\/+/, "").split("?");
    const cleanPath = pathname.replace(/\/?$/, "/");
    return new URL(search !== undefined ? `${cleanPath}?${search}` : cleanPath, baseUrl).href;
  };
  const normalizeCachePath = path => {
    const [pathname, search] = String(path || "").replace(/^\/+/, "").split("?");
    const cleanPath = pathname.replace(/\/+$/, "").toLowerCase();
    return search !== undefined && search !== "" ? `${cleanPath}?${search}` : cleanPath;
  };
  const csrfToken = () => (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1] || "";

  // ---- Service Worker registration (all portals) ----
  function registerServiceWorker() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.__pfSwRegistered) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    window.__pfSwRegistered = true;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }
  if (typeof window !== "undefined") {
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
  }

  // ---- Per-user offline GET cache ----
  const CACHE_PREFIX = "pf-api-cache:v1:";
  const OFFLINE_USER_KEY = "profit-offline-user";
  const MAX_CACHE_ENTRIES = 60;
  const PUBLIC_GET_PATHS = new Set(["plans"]);
  const NEVER_CACHE_PREFIXES = ["auth/csrf", "auth/google", "auth/verify", "auth/reset", "auth/forgot", "auth/resend"];

  function readActiveUserScope() {
    try {
      const u =
        (window.ProFitAuth && (typeof window.ProFitAuth.getUser === "function" ? window.ProFitAuth.getUser() : window.ProFitAuth.user)) ||
        JSON.parse(sessionStorage.getItem("profit-verified-session") || "null") ||
        JSON.parse(localStorage.getItem(OFFLINE_USER_KEY) || "null");
      if (u && (u.id || u.email || u.username)) {
        return String(u.id || u.email || u.username).toLowerCase();
      }
    } catch (_) {}
    return "";
  }

  function isCacheableGet(normPath) {
    if (!normPath) return false;
    for (const pfx of NEVER_CACHE_PREFIXES) {
      if (normPath === pfx || normPath.startsWith(pfx + "?") || normPath.startsWith(pfx + "/")) return false;
    }
    return true;
  }

  function cacheKeyFor(normPath) {
    const base = normPath.split("?")[0];
    if (PUBLIC_GET_PATHS.has(base)) return `${CACHE_PREFIX}public:${normPath}`;
    const scope = readActiveUserScope();
    if (!scope) return null;
    return `${CACHE_PREFIX}${scope}:${normPath}`;
  }

  function pruneOldestCacheEntries(targetCount) {
    try {
      const rows = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(CACHE_PREFIX)) continue;
        let ts = 0;
        try { ts = JSON.parse(localStorage.getItem(k) || "{}").savedAt || 0; } catch (_) {}
        rows.push({ k, ts });
      }
      if (rows.length <= targetCount) return;
      rows.sort((a, b) => a.ts - b.ts);
      const removeCount = rows.length - targetCount;
      for (let i = 0; i < removeCount; i++) {
        localStorage.removeItem(rows[i].k);
      }
    } catch (_) {}
  }

  function saveGetCache(normPath, data) {
    if (!isCacheableGet(normPath)) return;
    if (normPath === "auth/session" && data && data.user) {
      try {
        localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({
          id: data.user.id,
          name: data.user.name || "",
          first_name: data.user.first_name || "",
          last_name: data.user.last_name || "",
          email: data.user.email || "",
          role: data.user.role || "",
          photo: data.user.photo || "",
          onboarding_completed: data.user.onboarding_completed
        }));
      } catch (_) {}
    }
    const key = cacheKeyFor(normPath);
    if (!key) return;
    const record = JSON.stringify({ data, savedAt: Date.now() });
    if (record.length > 260_000) return; // skip huge blobs to keep quota healthy
    try {
      localStorage.setItem(key, record);
      pruneOldestCacheEntries(MAX_CACHE_ENTRIES);
    } catch (_) {
      pruneOldestCacheEntries(20);
      try { localStorage.setItem(key, record); } catch (__) {}
    }
  }

  function readGetCache(normPath) {
    if (!isCacheableGet(normPath)) return null;
    const key = cacheKeyFor(normPath);
    if (!key) return null;
    try {
      const rawItem = localStorage.getItem(key);
      if (!rawItem) return null;
      const parsed = JSON.parse(rawItem);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "data")) {
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  function formatSavedAgo(ts) {
    if (!ts) return "earlier";
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60) return "just now";
    const mins = Math.floor(sec / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  async function clearOfflineData() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem(OFFLINE_USER_KEY);
      sessionStorage.removeItem("profit-verified-session");
    } catch (_) {}
    try {
      if (typeof caches !== "undefined" && caches.delete) {
        await caches.delete("profit-pages-v1");
      }
    } catch (_) {}
    try {
      if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_PRIVATE_CACHES" });
      }
    } catch (_) {}
  }

  async function ensureCsrf() {
    if (!csrfToken()) await fetch(apiUrl("auth/csrf"), { credentials: "include", cache: "no-store" });
    return csrfToken();
  }

  // Global slow-connection, offline & recovery banner
  let slowInFlight = 0;
  let wasOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  let servedCachedOffline = false;
  let bannerDismissed = false;
  let recoverTimer = 0;
  let netBanner = null;
  let netStyleAdded = false;

  function ensureNetBanner() {
    if (!document.body) return null;
    if (!netStyleAdded && document.head) {
      netStyleAdded = true;
      const st = document.createElement("style");
      st.textContent = `#pfNetBanner{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99998;display:flex;align-items:center;gap:10px;max-width:min(540px,calc(100vw - 24px));padding:10px 14px;border-radius:12px;background:#1e293b;color:#f8fafc;border:1px solid rgba(232,185,58,.55);box-shadow:0 10px 28px rgba(0,0,0,.32);font:600 13px/1.35 "Plus Jakarta Sans",Inter,system-ui,sans-serif}#pfNetBanner[hidden]{display:none!important}#pfNetBanner.is-offline{background:#7f1d1d;border-color:#f87171}#pfNetBanner.is-ok{background:#14532d;border-color:#4ade80}#pfNetBanner .pf-net-copy{flex:1 1 auto;min-width:0}#pfNetBanner .pf-net-copy small{display:block;font-weight:500;opacity:.9;font-size:12px}#pfNetBanner .pf-net-action{border:0;background:rgba(255,255,255,.2);color:inherit;height:28px;padding:0 11px;border-radius:999px;cursor:pointer;font:700 12px/1 inherit;flex:none}#pfNetBanner .pf-net-action[hidden]{display:none!important}#pfNetBanner #pfNetClose{border:0;background:rgba(255,255,255,.14);color:inherit;width:26px;height:26px;border-radius:50%;cursor:pointer;display:grid;place-items:center;flex:none;font-size:13px}`;
      document.head.appendChild(st);
    }
    if (!netBanner) {
      netBanner = document.createElement("div");
      netBanner.id = "pfNetBanner";
      netBanner.setAttribute("role", "status");
      netBanner.setAttribute("aria-live", "polite");
      netBanner.hidden = true;
      netBanner.innerHTML = `<i class="fa-solid fa-wifi" aria-hidden="true"></i><div class="pf-net-copy"><strong id="pfNetTitle"></strong><small id="pfNetSub"></small></div><button type="button" class="pf-net-action" id="pfNetRefresh" hidden>Refresh now</button><button type="button" id="pfNetClose" aria-label="Dismiss network notice">&times;</button>`;
      document.body.appendChild(netBanner);
      netBanner.querySelector("#pfNetClose")?.addEventListener("click", () => {
        bannerDismissed = true;
        if (netBanner) netBanner.hidden = true;
      });
      netBanner.querySelector("#pfNetRefresh")?.addEventListener("click", () => {
        location.reload();
      });
    }
    return netBanner;
  }

  function isWeakConnection() {
    const c = typeof navigator !== "undefined" && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    if (!c) return false;
    return c.effectiveType === "slow-2g" || c.effectiveType === "2g"
      || (Number(c.rtt) >= 1200)
      || (Number(c.downlink) > 0 && Number(c.downlink) < 0.6);
  }

  function showNetBanner(kind, title, sub, autoHideMs, showRefreshBtn = false) {
    if (kind === "slow" && bannerDismissed) return;
    const el = ensureNetBanner();
    if (!el) return;
    clearTimeout(recoverTimer);
    el.className = kind === "offline" ? "is-offline" : kind === "ok" ? "is-ok" : "is-slow";
    const icon = el.querySelector("i");
    if (icon) {
      icon.className = kind === "ok" ? "fa-solid fa-circle-check"
        : kind === "offline" ? "fa-solid fa-triangle-exclamation"
        : "fa-solid fa-wifi";
    }
    const tEl = el.querySelector("#pfNetTitle");
    const sEl = el.querySelector("#pfNetSub");
    const rEl = el.querySelector("#pfNetRefresh");
    if (tEl) tEl.textContent = title;
    if (sEl) sEl.textContent = sub || "";
    if (rEl) rEl.hidden = !showRefreshBtn;
    el.hidden = false;
    if (autoHideMs > 0) {
      recoverTimer = setTimeout(() => { if (netBanner) netBanner.hidden = true; }, autoHideMs);
    }
  }

  function hideNetBanner(onlyIfKind) {
    if (!netBanner || netBanner.hidden) return;
    if (onlyIfKind === "slow" && !netBanner.classList.contains("is-slow")) return;
    netBanner.hidden = true;
  }

  function userIsEditingForm() {
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/i.test(active.tagName) && !active.readOnly && !active.disabled) {
      return true;
    }
    return Boolean(document.querySelector("dialog[open], .modal-backdrop.open, .modal-back"));
  }

  function refreshConnectionHint() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      wasOffline = true;
      bannerDismissed = false;
      showNetBanner("offline", "Offline mode — viewing saved data", "Data will update automatically once your internet returns.", 0);
      return;
    }
    if (slowInFlight > 0 || isWeakConnection()) {
      showNetBanner("slow", "Slow connection detected", "Requests are taking longer than usual. Please wait a moment.", 0);
    } else {
      hideNetBanner("slow");
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("offline", () => {
      wasOffline = true;
      bannerDismissed = false;
      showNetBanner("offline", "Offline mode — viewing saved data", "Data will update automatically once your internet returns.", 0);
    });
    window.addEventListener("online", () => {
      bannerDismissed = false;
      if (wasOffline || servedCachedOffline) {
        wasOffline = false;
        servedCachedOffline = false;
        window.dispatchEvent(new CustomEvent("profit-back-online"));
        if (userIsEditingForm()) {
          showNetBanner("ok", "Back online", "Tap Refresh now to load the latest updates.", 0, true);
        } else {
          showNetBanner("ok", "Back online", "Updating to the latest data...", 2500, false);
          setTimeout(() => {
            if (navigator.onLine !== false && !userIsEditingForm()) {
              location.reload();
            }
          }, 900);
        }
      } else {
        refreshConnectionHint();
      }
    });
    const conn = typeof navigator !== "undefined" && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    if (conn && typeof conn.addEventListener === "function") {
      conn.addEventListener("change", () => {
        bannerDismissed = false;
        refreshConnectionHint();
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", refreshConnectionHint);
    } else {
      refreshConnectionHint();
    }
  }

  // A thin gold bar at the top of the page while any request is in flight.
  let busyCount = 0, bar = null, hideTimer = 0;
  function busy(delta) {
    busyCount = Math.max(0, busyCount + delta);
    if (!document.body) return;
    if (!bar) { bar = document.createElement("div"); bar.id = "pfProgress"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar); }
    clearTimeout(hideTimer);
    if (busyCount > 0) bar.className = "on";
    else { bar.className = "done"; hideTimer = setTimeout(() => { bar.className = ""; }, 350); }
  }

  async function request(path, options = {}) {
    const silent = !!options.silent;
    if (!silent) busy(1);
    try { return await rawRequest(path, options); } finally { if (!silent) busy(-1); }
  }

  async function rawRequest(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const normPath = normalizeCachePath(path);
    const isLogoutCall = method === "POST" && (normPath === "auth/logout" || normPath.startsWith("auth/logout?"));
    const silent = !!options.silent;

    if (isLogoutCall) {
      await clearOfflineData();
    }

    // Fast-path when browser already knows it is offline
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      wasOffline = true;
      if (method === "GET") {
        const cached = readGetCache(normPath);
        if (cached) {
          servedCachedOffline = true;
          if (!silent) {
            showNetBanner(
              "offline",
              `Offline mode — saved data (${formatSavedAgo(cached.savedAt)})`,
              "Data will update automatically once your internet returns.",
              0
            );
          }
          return cached.data;
        }
        const offGetErr = new Error("You're offline and this data hasn't been saved yet. Reconnect to load it.");
        offGetErr.offline = true;
        throw offGetErr;
      }
      if (!isLogoutCall) {
        showNetBanner("offline", "You're offline", "Reconnect to the internet to save changes.", 5000);
        const offWriteErr = new Error("You're offline. Reconnect to the internet to save changes.");
        offWriteErr.offline = true;
        throw offWriteErr;
      }
    }

    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (method !== "GET" && method !== "HEAD") {
      try {
        const token = await ensureCsrf();
        if (token) headers.set("X-CSRFToken", token);
      } catch (csrfErr) {
        if (!isLogoutCall) {
          showNetBanner("offline", "You're offline", "Reconnect to the internet to save changes.", 5000);
          const err = new Error("You're offline. Reconnect to the internet to save changes.");
          err.offline = true;
          throw err;
        }
        throw csrfErr;
      }
    }
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 12000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let markedSlow = false;
    const slowTimer = !silent ? setTimeout(() => {
      markedSlow = true;
      slowInFlight += 1;
      showNetBanner("slow", "Slow connection", "This is taking longer than usual. Please hold on...", 0);
    }, 3500) : 0;
    let response;
    try {
      response = await fetch(apiUrl(path), { ...options, method, headers, credentials: "include", cache: "no-store", signal: options.signal || controller.signal });
    } catch (err) {
      clearTimeout(timer);
      clearTimeout(slowTimer);
      if (markedSlow) slowInFlight = Math.max(0, slowInFlight - 1);
      if (method === "GET") {
        const cached = readGetCache(normPath);
        if (cached) {
          wasOffline = true;
          servedCachedOffline = true;
          if (!silent) {
            showNetBanner(
              "offline",
              `Offline mode — saved data (${formatSavedAgo(cached.savedAt)})`,
              "Could not reach the server. Data will update automatically when connection returns.",
              0
            );
          }
          return cached.data;
        }
      }
      if (err && err.name === "AbortError") {
        showNetBanner("offline", "Connection timed out", "The server took too long to respond. Check your internet and try again.", 6000);
        const timeoutErr = new Error("Request timed out. Please try again.");
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        showNetBanner("offline", "You're offline", "Reconnect to the internet to save changes.", 0);
      } else {
        showNetBanner("offline", "Connection problem", "Could not reach the server. Check your internet connection.", 6000);
      }
      throw err;
    }
    clearTimeout(timer);
    clearTimeout(slowTimer);
    if (markedSlow) {
      slowInFlight = Math.max(0, slowInFlight - 1);
      if (slowInFlight === 0 && !isWeakConnection()) hideNetBanner("slow");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && normPath === "auth/session") {
        await clearOfflineData();
      }
      let msg = payload.detail || payload.message;
      if (!msg && payload && typeof payload === "object") {
        const firstVal = Object.values(payload)[0];
        if (Array.isArray(firstVal) && firstVal[0]) msg = String(firstVal[0]);
        else if (typeof firstVal === "string") msg = firstVal;
      }
      const error = new Error(response.status === 401 ? "Your session has expired. Please sign in again."
        : response.status === 403 ? (msg || "You do not have permission to perform this action.")
        : (msg || `Request failed (${response.status}).`));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (method === "GET") {
      saveGetCache(normPath, payload);
    }
    if (method === "POST" && /check-in/i.test(path)) {
      try {
        localStorage.setItem("profit-last-checkin-ts", String(Date.now()));
        if (window.BroadcastChannel) {
          const bc = new BroadcastChannel("profit-attendance-sync");
          bc.postMessage({ type: "checkin", path, ts: Date.now() });
          bc.close();
        }
      } catch (_) {}
    }
    return payload;
  }

  const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
  const GMAIL_TYPO_DOMAINS = new Set([
    "gmai.com", "gmial.com", "gamil.com", "gmail.co", "gmail.con",
    "gmail.ph", "gmal.com", "gmail.net", "gmail.org", "gmail.c", "googlemai.com"
  ]);
  const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com", "tempmail.com", "temp-mail.org", "10minutemail.com",
    "guerrillamail.com", "yopmail.com", "trashmail.com", "fakeinbox.com",
    "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc",
    "throwawaymail.com", "fake.com", "invalid.com"
  ]);
  const FAKE_GMAIL_USERNAMES = new Set([
    "test", "testing", "tester", "example", "sample", "fake", "fakemail",
    "admin", "user", "username", "member", "nobody", "noemail", "noreply",
    "none", "null", "qwerty", "asdfgh", "zxcvbn", "abcdef", "abcdefg",
    "abcdefgh", "password", "demo"
  ]);

  function validateRealEmail(email) {
    const norm = String(email || "").trim().toLowerCase();
    if (!norm || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(norm)) {
      return "Enter a valid email address.";
    }
    const at = norm.lastIndexOf("@");
    const local = norm.slice(0, at);
    const domain = norm.slice(at + 1);
    if (GMAIL_TYPO_DOMAINS.has(domain)) {
      return "Enter a valid Gmail address ending in @gmail.com.";
    }
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return "Please use a real, permanent email address.";
    }
    if (GMAIL_DOMAINS.has(domain)) {
      const base = local.split("+")[0];
      if (base.length < 6 || base.length > 30) {
        return "Enter a real Gmail address (username must be 6 to 30 characters).";
      }
      if (!/^[a-z0-9]+(?:\.[a-z0-9]+)*$/.test(base)) {
        return "Enter a valid Gmail address (letters, numbers, and single dots only).";
      }
      if (!/[a-z]/.test(base)) {
        return "Enter a real Gmail address (cannot be numbers only).";
      }
      const dotless = base.replace(/\./g, "");
      if (FAKE_GMAIL_USERNAMES.has(base) || FAKE_GMAIL_USERNAMES.has(dotless)) {
        return "Please use a real, personal Gmail address.";
      }
    }
    return "";
  }

  window.ProFitAPI = {
    request, busy, validateRealEmail, clearOfflineData, registerServiceWorker,
    isOffline: () => typeof navigator !== "undefined" && navigator.onLine === false,
    get: (path, options) => request(path, options),
    post: (path, data, options) => request(path, { ...options, method: "POST", body: JSON.stringify(data || {}) }),
    patch: (path, data, options) => request(path, { ...options, method: "PATCH", body: JSON.stringify(data || {}) }),
    del: (path, options) => request(path, { ...options, method: "DELETE" }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" })
  };
})();
