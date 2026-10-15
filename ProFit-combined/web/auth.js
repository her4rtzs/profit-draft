/* UI route guard. Demo mode is clearly marked and never represents a server-authenticated session. */
(() => {
  const cfg = window.PROFIT_CONFIG || {};
  let logoutBound = false;
  function bindLogoutOnce() {
    if (logoutBound) return;
    logoutBound = true;
    document.addEventListener("click", async event => {
      const button = event.target.closest("[data-logout]");
      if (!button || !window.ProFitAuth) return;
      event.preventDefault();
      button.disabled = true;
      try { await window.ProFitAuth.logout(); }
      catch (error) { button.disabled = false; alert(error.message || "Unable to sign out. Please retry."); }
    });
  }
  const file = location.pathname.split("/").pop() || "index.html";
  const adminPages = new Set(["index.html","members.html","attendance.html","payments.html","reports.html","settings.html"]);
  const memberPages = new Set(["member-home.html"]);
  const trainerPages = new Set(["trainer-portal.html"]);
  const loginPage = file === "login.html";
  if (cfg.DEMO_MODE && !cfg.API_BASE_URL) {
    const read = () => { try { return JSON.parse(localStorage.getItem("profit-demo-session") || sessionStorage.getItem("profit-demo-session") || "null"); } catch { return null; } };
    const user = read();
    if (!loginPage && (adminPages.has(file) || memberPages.has(file)) && !user) {
      location.replace(file === "index.html" ? "welcome.html" : "login.html?reason=session");
      return;
    }
    const active = user;
    if (active) window.ProFitAuth = { user: active, role: active.role, async logout() { localStorage.removeItem("profit-demo-session"); sessionStorage.removeItem("profit-demo-session"); location.replace("login.html"); } };
    document.addEventListener("DOMContentLoaded", () => {
      if (active) {
        document.querySelectorAll("[data-user-name]").forEach(el => el.textContent = active.name || "Account");
        bindLogoutOnce();
      }
      document.documentElement.classList.remove("auth-checking");
    });
    return;
  }
  const isAdmin = adminPages.has(file), isMember = memberPages.has(file), isTrainer = trainerPages.has(file);
  if (!loginPage && !isAdmin && !isMember && !isTrainer) return;
  document.documentElement.classList.add("auth-checking");
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const payload = await window.ProFitAPI.get("/auth/session");
      const user = payload.user;
      if (!user || !["ADMIN","MEMBER","TRAINER"].includes(String(user.role || "").toUpperCase())) throw new Error("No active session.");
      const role = String(user.role).toUpperCase();
      if (loginPage) { location.replace(role === "ADMIN" ? "index.html" : role === "TRAINER" ? "trainer-portal.html" : "member-home.html"); return; }
      if (isAdmin && role !== "ADMIN") { location.replace(role === "MEMBER" ? "member-home.html" : "login.html?next=admin"); return; }
      if (isMember && role !== "MEMBER") { location.replace(role === "ADMIN" ? "index.html" : "login.html"); return; }
      if (isTrainer && role !== "TRAINER") { location.replace(role === "ADMIN" ? "index.html" : role === "MEMBER" ? "member-home.html" : "login.html"); return; }
      document.documentElement.classList.remove("auth-checking");
      window.ProFitAuth = { user, role, async logout() { await window.ProFitAPI.post("/auth/logout", {}); location.replace("login.html"); } };
      document.querySelectorAll("[data-user-name]").forEach(el => el.textContent = user.name || user.email || "Account");
      bindLogoutOnce();
    } catch (error) {
      if (loginPage) document.documentElement.classList.remove("auth-checking");
      else location.replace(file === "index.html" ? "welcome.html" : "login.html?reason=session");
      window.dispatchEvent(new CustomEvent("profit-auth-error", { detail: error }));
    }
  });
})();
