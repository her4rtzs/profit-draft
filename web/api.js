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
    let response;
    try {
      response = await fetch(apiUrl(path), { ...options, method, headers, credentials: "include", cache: "no-store", signal: options.signal || controller.signal });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === "AbortError") {
        const timeoutErr = new Error("Request timed out. Please try again.");
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      throw err;
    }
    clearTimeout(timer);
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

  window.ProFitAPI = {
    request, busy,
    get: (path, options) => request(path, options),
    post: (path, data, options) => request(path, { ...options, method: "POST", body: JSON.stringify(data || {}) }),
    patch: (path, data, options) => request(path, { ...options, method: "PATCH", body: JSON.stringify(data || {}) }),
    del: (path, options) => request(path, { ...options, method: "DELETE" }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" })
  };
})();
