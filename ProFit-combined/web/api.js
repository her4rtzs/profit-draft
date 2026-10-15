/* Shared API client. Same-origin "/api" by default, so the session and CSRF
   cookies work without CORS. Every non-GET request echoes the csrftoken cookie
   in X-CSRFToken, which Django requires for the login POST as well. */
(() => {
  const raw = (window.PROFIT_CONFIG?.API_BASE_URL || "").trim();
  const baseUrl = new URL((raw || "/api").replace(/\/?$/, "/"), location.origin);
  if (location.protocol === "https:" && baseUrl.protocol !== "https:") {
    throw new Error("Secure pages require an HTTPS API endpoint.");
  }
  const apiUrl = path => new URL(path.replace(/^\/+/, "").replace(/\/?$/, "/"), baseUrl).href;
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
    busy(1);
    try { return await rawRequest(path, options); } finally { busy(-1); }
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
    const response = await fetch(apiUrl(path), { ...options, method, headers, credentials: "include", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 401 ? "Your session has expired. Please sign in again."
        : response.status === 403 ? "You do not have permission to perform this action."
        : (payload.detail || payload.message || `Request failed (${response.status}).`));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  window.ProFitAPI = {
    request, busy,
    get: path => request(path),
    post: (path, data) => request(path, { method: "POST", body: JSON.stringify(data || {}) }),
    patch: (path, data) => request(path, { method: "PATCH", body: JSON.stringify(data || {}) })
  };
})();
