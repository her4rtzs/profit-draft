/* In-portal Google Account Connect & Disconnect drawer for Settings (Owner, Cashier, Trainer, Member). */
(() => {
  "use strict";

  const FALLBACK_CLIENT_ID = "752296461739-tpcmop84u41b31bo3eer33uv2v6fkauq.apps.googleusercontent.com";
  const GOOGLE_LOGO_SVG = `<svg class="pf-g-logo" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"/>
    <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"/>
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"/>
  </svg>`;

  let clientId = FALLBACK_CLIENT_ID;
  let oauthRedirectEnabled = false;
  let configPromise = null;
  let gsiPromise = null;
  let pwDialog = null;

  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = (async () => {
      try {
        const cfg = await window.ProFitAPI.get("/auth/google/config");
        if (cfg && cfg.client_id) clientId = cfg.client_id;
        oauthRedirectEnabled = Boolean(cfg && cfg.oauth_redirect_enabled);
      } catch (_) { }
      return { clientId, oauthRedirectEnabled };
    })();
    return configPromise;
  }

  function loadGsiScript() {
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      const existing = document.querySelector('script[src^="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("gsi-load-failed")), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("gsi-load-failed"));
      document.head.appendChild(s);
    });
    return gsiPromise;
  }

  function getToggle() {
    return document.getElementById("pfGoogleToggle");
  }

  function setDrawerOpen(toggle, drawer, open) {
    if (drawer) drawer.hidden = !open;
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setConnBtnContent(btn, label) {
    btn.innerHTML = `${GOOGLE_LOGO_SVG}<span>${label}</span>`;
    btn.dataset.gcState = label === "Connecting…" ? "busy" : "idle";
  }

  function showStatus(drawer, text, isErr) {
    const el = drawer.querySelector("[data-gc-msg]");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function renderState(drawer, user, toggleEl) {
    const toggle = toggleEl || getToggle();
    const sub = toggle ? toggle.querySelector("[data-gc-sub]") : document.querySelector("[data-gc-sub]");
    const note = drawer.querySelector("[data-gc-note]");
    const actions = drawer.querySelector("[data-gc-actions]");
    if (!actions) return;

    const connected = Boolean(user && user.google_connected);
    const hasPw = Boolean(user && user.has_password);
    const gEmail = (user && (user.google_email || user.email)) || "";

    actions.innerHTML = "";
    if (connected) {
      if (sub) sub.textContent = gEmail ? `Connected as ${gEmail}` : "Google account connected";
      if (note) {
        note.textContent = gEmail
          ? `Your ProFit account is linked to ${gEmail} for quick Google Sign-In.`
          : "Your ProFit account is linked to Google for quick Google Sign-In.";
      }
      if (!hasPw) {
        const setBtn = document.createElement("button");
        setBtn.type = "button";
        setBtn.className = "pf-gc-btn pf-gc-setpw";
        setBtn.textContent = "Set Password";
        setBtn.addEventListener("click", () => openSetPasswordDialog(drawer));
        actions.appendChild(setBtn);
      }
      const discBtn = document.createElement("button");
      discBtn.type = "button";
      discBtn.className = "pf-gc-btn pf-gc-disc";
      discBtn.textContent = "Disconnect Google";
      discBtn.addEventListener("click", () => handleDisconnect(drawer, discBtn));
      actions.appendChild(discBtn);
    } else {
      if (sub) sub.textContent = "Not connected — link Gmail for quick Google Sign-In";
      if (note) {
        note.textContent = "Link your Gmail account to sign in quickly with one click on the login page.";
      }
      const connBtn = document.createElement("button");
      connBtn.type = "button";
      connBtn.className = "pf-gc-btn pf-gc-conn";
      setConnBtnContent(connBtn, "Connect with Google");
      connBtn.addEventListener("click", () => handleConnect(drawer, connBtn));
      actions.appendChild(connBtn);
    }
  }

  async function handleConnect(drawer, btn) {
    showStatus(drawer, "", false);
    btn.disabled = true;
    setConnBtnContent(btn, "Connecting…");
    try {
      await loadConfig();
      try {
        await loadGsiScript();
      } catch (_) { }

      if (window.google?.accounts?.oauth2) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: async resp => {
            if (!resp || resp.error || !resp.access_token) {
              btn.disabled = false;
              setConnBtnContent(btn, "Connect with Google");
              showStatus(drawer, resp?.error === "access_denied" ? "Google connection cancelled." : "Could not authorize Google.", true);
              return;
            }
            try {
              const out = await window.ProFitAPI.post("/auth/google/connect", { access_token: resp.access_token });
              if (out && out.user) {
                try { sessionStorage.setItem("profit-verified-session", JSON.stringify(out.user)); } catch (_) { }
                renderState(drawer, out.user);
                showStatus(drawer, "Google account connected.", false);
              }
            } catch (err) {
              btn.disabled = false;
              setConnBtnContent(btn, "Connect with Google");
              showStatus(drawer, err?.message || "Could not connect Google account.", true);
            }
          },
          error_callback: () => {
            btn.disabled = false;
            setConnBtnContent(btn, "Connect with Google");
            showStatus(drawer, "Google popup closed or blocked. Allow popups and try again.", true);
          },
        });
        client.requestAccessToken({ prompt: "select_account" });
        return;
      }

      if (oauthRedirectEnabled) {
        const nextUrl = location.pathname + (location.hash || "");
        location.href = `/api/auth/google/login/?source=connect&next=${encodeURIComponent(nextUrl)}`;
        return;
      }
      showStatus(drawer, "Google Sign-In is currently unavailable. Try again shortly.", true);
    } catch (err) {
      showStatus(drawer, err?.message || "Could not start Google connection.", true);
    } finally {
      if (btn.isConnected && btn.dataset.gcState === "busy") {
        btn.disabled = false;
        setConnBtnContent(btn, "Connect with Google");
      }
    }
  }

  async function handleDisconnect(drawer, btn) {
    showStatus(drawer, "", false);
    btn.disabled = true;
    btn.textContent = "Disconnecting…";
    try {
      const out = await window.ProFitAPI.post("/auth/google/disconnect", {});
      if (out && out.user) {
        try { sessionStorage.setItem("profit-verified-session", JSON.stringify(out.user)); } catch (_) { }
        renderState(drawer, out.user);
        showStatus(drawer, "Google account disconnected.", false);
      }
    } catch (err) {
      showStatus(drawer, err?.message || "Could not disconnect Google account.", true);
      btn.disabled = false;
      btn.textContent = "Disconnect Google";
    }
  }

  function ensureSetPasswordDialog() {
    if (pwDialog) return pwDialog;
    const dlg = document.createElement("dialog");
    dlg.className = "pf-cp";
    dlg.setAttribute("aria-labelledby", "pfSpTitle");
    dlg.innerHTML = `<form method="dialog" novalidate>
      <div><h3 id="pfSpTitle">Set account password</h3><p>Add a password before disconnecting Google so you always have a way to sign in.</p></div>
      <label for="pfSpNew">New password<span class="pf-cp-field"><input id="pfSpNew" type="password" name="new_pw" autocomplete="new-password" required minlength="8"></span></label>
      <label for="pfSpConfirm">Confirm password<span class="pf-cp-field"><input id="pfSpConfirm" type="password" name="confirm_pw" autocomplete="new-password" required minlength="8"></span></label>
      <div class="pf-cp-msg" role="alert" aria-live="polite"></div>
      <div class="pf-cp-row"><button type="button" class="pf-cp-btn" data-sp-cancel>Cancel</button><button type="submit" class="pf-cp-btn pf-cp-primary">Save password</button></div>
    </form>`;
    document.body.appendChild(dlg);
    dlg.querySelector("[data-sp-cancel]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    pwDialog = dlg;
    return dlg;
  }

  function openSetPasswordDialog(drawer) {
    const dlg = ensureSetPasswordDialog();
    const form = dlg.querySelector("form");
    const msg = dlg.querySelector(".pf-cp-msg");
    const submit = form.querySelector("[type=submit]");
    form.reset();
    msg.textContent = "";
    msg.className = "pf-cp-msg";

    form.onsubmit = async e => {
      e.preventDefault();
      const newPw = form.new_pw.value;
      const confirmPw = form.confirm_pw.value;
      if (!newPw || newPw.length < 8) {
        msg.className = "pf-cp-msg err";
        msg.textContent = "Use at least 8 characters.";
        return;
      }
      if (newPw !== confirmPw) {
        msg.className = "pf-cp-msg err";
        msg.textContent = "Passwords do not match.";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        const out = await window.ProFitAPI.post("/auth/set-password", {
          new_password: newPw,
          confirm_password: confirmPw,
        });
        if (out && out.user) {
          try { sessionStorage.setItem("profit-verified-session", JSON.stringify(out.user)); } catch (_) { }
          renderState(drawer, out.user);
          showStatus(drawer, "Password saved. You can now disconnect Google anytime.", false);
        }
        dlg.close();
      } catch (err) {
        msg.className = "pf-cp-msg err";
        msg.textContent = err?.message || "Could not save password.";
      } finally {
        submit.disabled = false;
        submit.textContent = "Save password";
      }
    };
    if (typeof dlg.showModal === "function") dlg.showModal();
  }

  async function mount() {
    const drawer = document.getElementById("pfGoogleAccountRow");
    const toggle = getToggle();
    if (!drawer || !window.ProFitAPI) return;

    if (toggle && toggle.dataset.gcBound !== "1") {
      toggle.dataset.gcBound = "1";
      toggle.addEventListener("click", () => {
        setDrawerOpen(toggle, drawer, drawer.hidden);
      });
    }

    try {
      const sess = await window.ProFitAPI.get("/auth/session", { silent: true });
      if (sess && sess.user) {
        renderState(drawer, sess.user, toggle);
      }
    } catch (_) { }

    const q = new URLSearchParams(location.search);
    if (q.get("google_connected") === "1") {
      setDrawerOpen(toggle, drawer, true);
      showStatus(drawer, "Google account connected.", false);
      q.delete("google_connected");
      const clean = location.pathname + (q.toString() ? `?${q.toString()}` : "") + (location.hash || "");
      history.replaceState(null, "", clean);
    } else if (q.get("google_error")) {
      const code = q.get("google_error");
      setDrawerOpen(toggle, drawer, true);
      showStatus(
        drawer,
        code === "google_sub_in_use"
          ? "That Google account is already connected to another ProFit user."
          : "Could not connect Google account. Please try again.",
        true
      );
      q.delete("google_error");
      const clean = location.pathname + (q.toString() ? `?${q.toString()}` : "") + (location.hash || "");
      history.replaceState(null, "", clean);
    }
  }

  window.PFGoogleConnect = { mount };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
