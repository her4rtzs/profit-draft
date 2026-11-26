/* Shared API client. Same-origin "/api" by default, so the session and CSRF
   cookies work without CORS. Every non-GET request echoes the csrftoken cookie
   in X-CSRFToken, which Django requires for the login POST as well. */
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
  const csrfToken = () => (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1] || "";

  async function ensureCsrf() {
    if (!csrfToken()) await fetch(apiUrl("auth/csrf"), { credentials: "include", cache: "no-store" });
    return csrfToken();
  }

  // Global slow-connection, offline & recovery banner
  let slowInFlight = 0;
  let wasOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  let bannerDismissed = false;
  let recoverTimer = 0;
  let netBanner = null;
  let netStyleAdded = false;

  function ensureNetBanner() {
    if (!document.body) return null;
    if (!netStyleAdded && document.head) {
      netStyleAdded = true;
      const st = document.createElement("style");
      st.textContent = `#pfNetBanner{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99998;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 24px));padding:10px 14px;border-radius:12px;background:#1e293b;color:#f8fafc;border:1px solid rgba(232,185,58,.55);box-shadow:0 10px 28px rgba(0,0,0,.32);font:600 13px/1.35 "Plus Jakarta Sans",Inter,system-ui,sans-serif}#pfNetBanner[hidden]{display:none!important}#pfNetBanner.is-offline{background:#7f1d1d;border-color:#f87171}#pfNetBanner.is-ok{background:#14532d;border-color:#4ade80}#pfNetBanner .pf-net-copy{flex:1 1 auto;min-width:0}#pfNetBanner .pf-net-copy small{display:block;font-weight:500;opacity:.88;font-size:12px}#pfNetBanner button{border:0;background:rgba(255,255,255,.14);color:inherit;width:26px;height:26px;border-radius:50%;cursor:pointer;display:grid;place-items:center;flex:none;font-size:13px}`;
      document.head.appendChild(st);
    }
    if (!netBanner) {
      netBanner = document.createElement("div");
      netBanner.id = "pfNetBanner";
      netBanner.setAttribute("role", "status");
      netBanner.setAttribute("aria-live", "polite");
      netBanner.hidden = true;
      netBanner.innerHTML = `<i class="fa-solid fa-wifi" aria-hidden="true"></i><div class="pf-net-copy"><strong id="pfNetTitle"></strong><small id="pfNetSub"></small></div><button type="button" id="pfNetClose" aria-label="Dismiss network notice">&times;</button>`;
      document.body.appendChild(netBanner);
      netBanner.querySelector("#pfNetClose")?.addEventListener("click", () => {
        bannerDismissed = true;
        if (netBanner) netBanner.hidden = true;
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

  function showNetBanner(kind, title, sub, autoHideMs) {
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
    if (tEl) tEl.textContent = title;
    if (sEl) sEl.textContent = sub || "";
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

  function refreshConnectionHint() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      wasOffline = true;
      bannerDismissed = false;
      showNetBanner("offline", "You're offline", "Check your internet connection — changes may not save.", 0);
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
      showNetBanner("offline", "You're offline", "Check your internet connection — changes may not save.", 0);
    });
    window.addEventListener("online", () => {
      bannerDismissed = false;
      if (wasOffline) {
        wasOffline = false;
        showNetBanner("ok", "Back online", "Your connection is restored.", 3200);
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
    const silent = !!options.silent;
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (method !== "GET" && method !== "HEAD") {
      const token = await ensureCsrf();
      if (token) headers.set("X-CSRFToken", token);
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
      if (err && err.name === "AbortError") {
        showNetBanner("offline", "Connection timed out", "The server took too long to respond. Check your internet and try again.", 6000);
        const timeoutErr = new Error("Request timed out. Please try again.");
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        showNetBanner("offline", "You're offline", "Check your internet connection and try again.", 0);
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
    request, busy, validateRealEmail,
    get: (path, options) => request(path, options),
    post: (path, data, options) => request(path, { ...options, method: "POST", body: JSON.stringify(data || {}) }),
    patch: (path, data, options) => request(path, { ...options, method: "PATCH", body: JSON.stringify(data || {}) }),
    del: (path, options) => request(path, { ...options, method: "DELETE" }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" })
  };
})();
