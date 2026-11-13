/* UI route guard. Demo mode is clearly marked and never represents a server-authenticated session. */
(() => {
  const cfg = window.PROFIT_CONFIG || {};
  const file = location.pathname.split("/").pop() || "index.html";
  const path = location.pathname.toLowerCase();
  const isTrainerSection = path.includes("/trainer/") || file === "trainer-portal.html";
  const isStaffSection = path.includes("/staff/");
  const adminPages = new Set([
    "index.html",
    "members.html",
    "attendance.html",
    "payments.html",
    "reports.html",
    "settings.html",
    "profile.html",
    "subscriptions.html",
    "transactions.html",
    "trainers.html",
    "announcements.html"
  ]);
  const memberPages = new Set(["member-home.html"]);
  const loginPage = file === "login.html";
  const loginTarget = isTrainerSection || isStaffSection ? "../login.html" : "login.html";

  async function performLogout() {
    try {
      localStorage.removeItem("pp-accent");
      localStorage.removeItem("profit-member-demo-checkins");
      localStorage.removeItem("profit-demo-session");
      sessionStorage.removeItem("profit-demo-session");
      sessionStorage.removeItem("profit-verified-session");
      sessionStorage.removeItem("pf-auth-just-logged-in");
      sessionStorage.setItem("profit-logged-out", "1");
    } catch (e) {}
    if (window.ProFitAPI) {
      try {
        await window.ProFitAPI.post("/auth/logout", {});
      } catch (e) {
        /* ignore offline/demo errors so client logout always succeeds */
      }
    }
    const welcomeTarget = isTrainerSection || isStaffSection ? "../welcome.html" : "welcome.html";
    location.replace(welcomeTarget);
  }

  let logoutBound = false;
  function bindLogoutOnce() {
    if (logoutBound) return;
    logoutBound = true;
    document.addEventListener("click", async event => {
      const button = event.target.closest("[data-logout]");
      if (!button) return;
      event.preventDefault();
      button.disabled = true;
      try {
        if (window.ProFitAuth && typeof window.ProFitAuth.logout === "function") {
          await window.ProFitAuth.logout();
        } else {
          await performLogout();
        }
      } catch (error) {
        button.disabled = false;
        alert(error.message || "Unable to sign out. Please retry.");
      }
    });
  }

  bindLogoutOnce();

  let storedUser = (() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("profit-verified-session") ||
        localStorage.getItem("profit-demo-session") ||
        sessionStorage.getItem("profit-demo-session") ||
        "null"
      );
    } catch {
      return null;
    }
  })();

  const explicitlyLoggedOut = (() => {
    try {
      return sessionStorage.getItem("profit-logged-out") === "1";
    } catch {
      return false;
    }
  })();

  if (
    !storedUser &&
    !loginPage &&
    !explicitlyLoggedOut &&
    !location.search.includes("reason=session") &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:" || location.search.includes("demo=1"))
  ) {
    storedUser = {
      name: isTrainerSection ? "Coach Mika" : "Administrator",
      role: isTrainerSection ? "TRAINER" : "ADMIN",
      demo: true
    };
    try {
      localStorage.setItem("profit-demo-session", JSON.stringify(storedUser));
    } catch {}
  }

  if (
    (cfg.DEMO_MODE && !cfg.API_BASE_URL) ||
    (storedUser && (!cfg.API_BASE_URL || location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:"))
  ) {
    const user = storedUser;
    if (!loginPage && (adminPages.has(file) || memberPages.has(file)) && !user) {
      location.replace(file === "index.html" ? "welcome.html" : `${loginTarget}?reason=session`);
      return;
    }
    const active = user;
    if (active) {
      window.ProFitAuth = {
        user: active,
        role: active.role,
        logout: performLogout
      };
    }
    document.addEventListener("DOMContentLoaded", () => {
      if (active) {
        document.querySelectorAll("[data-user-name]").forEach(el => {
          el.textContent = active.name || "Account";
        });
      }
      document.documentElement.classList.remove("auth-checking");
    });
    return;
  }

  const isAdmin = (adminPages.has(file) || isStaffSection) && !isTrainerSection;
  const isMember = memberPages.has(file);
  const isTrainer = isTrainerSection;
  if (!loginPage && !isAdmin && !isMember && !isTrainer) return;

  const isStaffRole = r => ["ADMIN", "OWNER", "CASHIER"].includes(String(r || "").toUpperCase());

  if (!storedUser && !loginPage) {
    document.documentElement.classList.add("auth-pending");
  }

  if (storedUser && !loginPage) {
    window.ProFitAuth = {
      user: storedUser,
      role: storedUser.role,
      logout: performLogout
    };
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const payload = await window.ProFitAPI.get("/auth/session");
      const user = payload.user;
      const role = String(user?.role || "").toUpperCase();
      if (!user || (!isStaffRole(role) && role !== "MEMBER" && role !== "TRAINER")) {
        throw new Error("No active session.");
      }
      try {
        sessionStorage.setItem("profit-verified-session", JSON.stringify(user));
      } catch {}
      if (loginPage) {
        location.replace(
          isStaffRole(role) ? "index.html" : role === "TRAINER" ? "trainer/index.html" : "member-home.html"
        );
        return;
      }
      if (isAdmin && !isStaffRole(role)) {
        location.replace(
          role === "TRAINER"
            ? isStaffSection ? "../trainer/index.html" : "trainer/index.html"
            : isStaffSection ? "../member-home.html" : "member-home.html"
        );
        return;
      }
      if (isMember && role !== "MEMBER") {
        location.replace(role === "TRAINER" ? "trainer/index.html" : "index.html");
        return;
      }
      if (isTrainer && role !== "TRAINER") {
        location.replace(
          isStaffRole(role)
            ? isTrainerSection ? "../index.html" : "index.html"
            : isTrainerSection ? "../member-home.html" : "member-home.html"
        );
        return;
      }
      document.documentElement.classList.remove("auth-checking", "auth-pending");
      window.ProFitAuth = {
        user,
        role,
        logout: performLogout
      };
      document.querySelectorAll("[data-user-name]").forEach(el => {
        el.textContent = user.name || user.email || "Account";
      });
    } catch (error) {
      if (storedUser) {
        document.documentElement.classList.remove("auth-checking", "auth-pending");
        window.ProFitAuth = {
          user: storedUser,
          role: storedUser.role,
          logout: performLogout
        };
        document.querySelectorAll("[data-user-name]").forEach(el => {
          el.textContent = storedUser.name || "Account";
        });
        return;
      }
      if (loginPage) document.documentElement.classList.remove("auth-checking", "auth-pending");
      else location.replace(file === "index.html" && !isTrainerSection && !isStaffSection ? "welcome.html" : `${loginTarget}?reason=session`);
      window.dispatchEvent(new CustomEvent("profit-auth-error", { detail: error }));
    }
  });
})();
