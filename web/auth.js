/* UI route guard. Demo mode is clearly marked and never represents a server-authenticated session. */
(() => {
  const cfg = window.PROFIT_CONFIG || {};
  const rawSlug = (location.pathname.split("/").pop() || "index").replace(/\.html$/i, "");
  const file = `/${rawSlug.toLowerCase()}`;
  const path = location.pathname.toLowerCase();
  const isTrainerSection = path.includes("/trainer/") || file === "/trainer-portal";
  const isStaffSection = path.includes("/staff/");
  const ownerOnlyPages = new Set([
    "/index",
    "/reports",
    "/subscriptions",
    "/transactions",
    "/trainers",
    "/cashiers",
    "/announcements"
  ]);
  const cashierPages = new Set([
    "/cashier",
    "/payments",
    "/members",
    "/attendance",
    "/settings",
    "/profile"
  ]);
  const adminPages = new Set([...ownerOnlyPages, ...cashierPages]);
  const memberPages = new Set(["/member-home", "/claim"]);
  const dashboardPage = file === "/dashboard";
  const onboardingPage = file === "/onboarding";
  const loginPage = file === "/login";
  const loginTarget = "/login";

  async function performLogout() {
    try {
      localStorage.removeItem("pp-accent");
      localStorage.removeItem("profit-member-demo-checkins");
      localStorage.removeItem("profit-demo-session");
      localStorage.removeItem("profit-account-v1");
      sessionStorage.removeItem("profit-demo-session");
      sessionStorage.removeItem("profit-verified-session");
      sessionStorage.removeItem("pf-auth-just-logged-in");
      sessionStorage.setItem("profit-logged-out", "1");
    } catch (e) { }
    if (window.ProFitAPI) {
      try {
        await window.ProFitAPI.post("/auth/logout", {});
      } catch (e) {
        /* ignore offline/demo errors so client logout always succeeds */
      }
    }
    location.replace(loginTarget);
  }

  function confirmLogoutDialog() {
    return new Promise(resolve => {
      if (typeof HTMLDialogElement !== "function") {
        resolve(window.confirm("Are you sure you want to log out?"));
        return;
      }
      let dlg = document.getElementById("pfLogoutConfirm");
      if (!dlg) {
        const st = document.createElement("style");
        st.textContent = `
          #pfLogoutConfirm{margin:auto;inset:0;padding:0;width:min(380px,92vw);border-radius:16px;border:1px solid rgba(255,255,255,.14);background:#111320;color:#f6efdc;box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif}
          #pfLogoutConfirm::backdrop{background:rgba(5,8,14,.65);backdrop-filter:blur(3px)}
          #pfLogoutConfirm .pf-lo-box{padding:22px;display:grid;gap:12px}
          #pfLogoutConfirm h3{margin:0;font:700 18px/1.2 "Plus Jakarta Sans",Inter,sans-serif}
          #pfLogoutConfirm p{margin:0;font-size:14px;color:#9a9788;line-height:1.5}
          #pfLogoutConfirm .pf-lo-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:6px}
          #pfLogoutConfirm button{height:40px;padding:0 18px;border-radius:999px;font:600 13.5px/1 "Plus Jakarta Sans",Inter,sans-serif;cursor:pointer}
          #pfLogoutConfirm .pf-lo-cancel{border:1px solid rgba(255,255,255,.18);background:transparent;color:#f6efdc}
          #pfLogoutConfirm .pf-lo-ok{border:0;background:#e8b93a;color:#1a1407;font-weight:700}
        `;
        document.head.appendChild(st);
        dlg = document.createElement("dialog");
        dlg.id = "pfLogoutConfirm";
        dlg.setAttribute("aria-labelledby", "pfLogoutTitle");
        dlg.innerHTML = `<div class="pf-lo-box">
          <h3 id="pfLogoutTitle">Log out of ProFit?</h3>
          <p>Are you sure you want to log out? You will be redirected to the sign-in page.</p>
          <div class="pf-lo-actions">
            <button type="button" class="pf-lo-cancel" data-lo-cancel>Cancel</button>
            <button type="button" class="pf-lo-ok" data-lo-confirm>Log out</button>
          </div>
        </div>`;
        document.body.appendChild(dlg);
      }
      const finish = ok => {
        dlg.removeEventListener("cancel", onCancel);
        dlg.removeEventListener("click", onBackdrop);
        if (dlg.open) dlg.close();
        resolve(ok);
      };
      const onCancel = e => { e.preventDefault(); finish(false); };
      const onBackdrop = e => { if (e.target === dlg) finish(false); };
      dlg.querySelector("[data-lo-cancel]").onclick = () => finish(false);
      dlg.querySelector("[data-lo-confirm]").onclick = () => finish(true);
      dlg.addEventListener("cancel", onCancel);
      dlg.addEventListener("click", onBackdrop);
      dlg.showModal();
    });
  }

  let logoutBound = false;
  function bindLogoutOnce() {
    if (logoutBound) return;
    logoutBound = true;
    document.addEventListener("click", async event => {
      const button = event.target.closest("[data-logout]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const menu = document.getElementById("accountMenu");
      if (menu) menu.classList.remove("is-open");
      const confirmed = await confirmLogoutDialog();
      if (!confirmed) return;
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
    }, true);
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

  const isDemoForced = Boolean(
    (cfg.DEMO_MODE && !cfg.API_BASE_URL) ||
    location.protocol === "file:" ||
    location.search.includes("demo=1")
  );

  if (
    !storedUser &&
    !loginPage &&
    !explicitlyLoggedOut &&
    !location.search.includes("reason=session") &&
    isDemoForced
  ) {
    storedUser = {
      name: isTrainerSection ? "Coach Mika" : "Administrator",
      role: isTrainerSection ? "TRAINER" : "ADMIN",
      demo: true
    };
    try {
      localStorage.setItem("profit-demo-session", JSON.stringify(storedUser));
    } catch { }
  }

  if (isDemoForced) {
    const user = storedUser;
    if (!loginPage && (adminPages.has(file) || memberPages.has(file) || isTrainerSection) && !user) {
      location.replace(file === "/index" ? "/" : `${loginTarget}?reason=session`);
      return;
    }
    const active = user;
    if (active) {
      window.ProFitAuth = {
        user: active,
        role: active.role,
        getUser: () => active,
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
  if (!loginPage && !onboardingPage && !dashboardPage && !isAdmin && !isMember && !isTrainer) return;

  const isCashierRole = r => String(r || "").toUpperCase() === "CASHIER";
  const isOwnerRole = r => ["ADMIN", "OWNER"].includes(String(r || "").toUpperCase());
  const isStaffRole = r => isOwnerRole(r) || isCashierRole(r);
  const homeForRole = () => "/dashboard";

  if (!storedUser && !loginPage) {
    document.documentElement.classList.add("auth-pending");
  }

  if (storedUser && !loginPage) {
    window.ProFitAuth = {
      user: storedUser,
      role: storedUser.role,
      getUser: () => storedUser,
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
        sessionStorage.removeItem("profit-logged-out");
        sessionStorage.setItem("profit-verified-session", JSON.stringify(user));
      } catch { }
      if (loginPage) {
        if (user.requires_first_login_gate) {
          document.documentElement.classList.remove("auth-checking", "auth-pending");
          window.ProFitAuth = {
            user,
            role,
            getUser: () => user,
            logout: performLogout
          };
          window.dispatchEvent(new CustomEvent("profit-auth-ready", { detail: { user, role } }));
          return;
        }
        if ((role === "MEMBER" || role === "CASHIER" || role === "TRAINER") && user.onboarding_completed === false) {
          location.replace("/onboarding");
          return;
        }
        location.replace(homeForRole(role));
        return;
      }
      if (onboardingPage && isOwnerRole(role)) {
        location.replace("/dashboard");
        return;
      }
      const portalAttr = String(document.body?.dataset?.portal || "").toLowerCase();
      const pageAttr = String(document.body?.dataset?.page || "").toLowerCase();
      const pageIsTrainer = isTrainer || portalAttr === "trainer";
      const pageIsCashierDash = file === "/cashier" || pageAttr === "cashier";
      const pageIsMemberDash = isMember || pageAttr === "member-home";
      const pageIsOwnerDash = file === "/index" || (dashboardPage && !pageIsTrainer && !pageIsCashierDash && !pageIsMemberDash);
      const pageIsOwnerOnly = pageIsOwnerDash || ownerOnlyPages.has(file);
      const pageIsStaffShared = !pageIsTrainer && !pageIsMemberDash && !pageIsCashierDash && !pageIsOwnerOnly && isAdmin;

      if (pageIsTrainer && role !== "TRAINER") {
        location.replace(homeForRole(role));
        return;
      }
      if (pageIsMemberDash && role !== "MEMBER") {
        location.replace(homeForRole(role));
        return;
      }
      if (pageIsCashierDash && !isCashierRole(role)) {
        location.replace(homeForRole(role));
        return;
      }
      if (pageIsOwnerOnly && !isOwnerRole(role)) {
        location.replace(homeForRole(role));
        return;
      }
      if (pageIsStaffShared && !isStaffRole(role)) {
        location.replace(homeForRole(role));
        return;
      }
      if (user.must_change_password && pageIsTrainer && file !== "/settings") {
        location.replace("/trainer/settings?force_password_change=1");
        return;
      }
      document.documentElement.classList.remove("auth-checking", "auth-pending");
      window.ProFitAuth = {
        user,
        role,
        getUser: () => user,
        logout: performLogout
      };
      document.querySelectorAll("[data-user-name]").forEach(el => {
        const displayName = (user.name || "").trim();
        if (displayName) {
          el.textContent = displayName;
        } else {
          el.innerHTML = `<a href="${isTrainer ? "/trainer/profile" : "/profile"}" style="color:inherit;text-decoration:underline">Name not set</a>`;
        }
      });
      window.dispatchEvent(new CustomEvent("profit-auth-ready", { detail: { user, role } }));
    } catch (error) {
      const isAuthFailure = error && (error.status === 401 || error.status === 403);
      if (isAuthFailure) {
        try {
          sessionStorage.removeItem("profit-verified-session");
          localStorage.removeItem("profit-demo-session");
          sessionStorage.removeItem("profit-demo-session");
        } catch { }
      }
      if (storedUser && !isAuthFailure) {
        document.documentElement.classList.remove("auth-checking", "auth-pending");
        window.ProFitAuth = {
          user: storedUser,
          role: storedUser.role,
          getUser: () => storedUser,
          logout: performLogout
        };
        document.querySelectorAll("[data-user-name]").forEach(el => {
          el.textContent = storedUser.name || "Account";
        });
        return;
      }
      if (loginPage) document.documentElement.classList.remove("auth-checking", "auth-pending");
      else location.replace(`${loginTarget}?reason=session`);
      window.dispatchEvent(new CustomEvent("profit-auth-error", { detail: error }));
    }
  });
})();
