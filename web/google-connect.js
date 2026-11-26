/* In-portal Google Account Connect & Disconnect for Settings (Owner, Cashier, Trainer, Member). */
(() => {
  "use strict";

  const FALLBACK_CLIENT_ID = "752296461739-tpcmop84u41b31bo3eer33uv2v6fkauq.apps.googleusercontent.com";
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
      } catch (_) {}
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

  function showStatus(root, text, isErr) {
    const el = root.querySelector("[data-gc-msg]");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function renderState(root, user) {
    const sub = root.querySelector("[data-gc-sub]");
    const actions = root.querySelector("[data-gc-actions]");
    if (!sub || !actions) return;

    const connected = Boolean(user && user.google_connected);
    const hasPw = Boolean(user && user.has_password);
    const gEmail = (user && (user.google_email || user.email)) || "";

    actions.innerHTML = "";
    if (connected) {
      sub.textContent = gEmail ? `Connected as ${gEmail}` : "Google account connected";
      if (!hasPw) {
        const setBtn = document.createElement("button");
        setBtn.type = "button";
        setBtn.className = "pf-gc-btn pf-gc-setpw";
        setBtn.textContent = "Set Password";
        setBtn.addEventListener("click", () => openSetPasswordDialog(root));
        actions.appendChild(setBtn);
      }
      const discBtn = document.createElement("button");
      discBtn.type = "button";
      discBtn.className = "pf-gc-btn pf-gc-disc";
      discBtn.textContent = "Disconnect";
      discBtn.addEventListener("click", () => handleDisconnect(root, discBtn));
      actions.appendChild(discBtn);
    } else {
      sub.textContent = "Not connected — link Gmail for quick Google Sign-In";
      const connBtn = document.createElement("button");
      connBtn.type = "button";
      connBtn.className = "pf-gc-btn pf-gc-conn";
      connBtn.textContent = "Connect Google";
      connBtn.addEventListener("click", () => handleConnect(root, connBtn));
      actions.appendChild(connBtn);
    }
  }

  async function handleConnect(root, btn) {
    showStatus(root, "", false);
    btn.disabled = true;
    btn.textContent = "Connecting…";
    try {
      await loadConfig();
      try {
        await loadGsiScript();
      } catch (_) {}

      if (window.google?.accounts?.oauth2) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: async resp => {
            if (!resp || resp.error || !resp.access_token) {
              btn.disabled = false;
              btn.textContent = "Connect Google";
              showStatus(root, resp?.error === "access_denied" ? "Google connection cancelled." : "Could not authorize Google.", true);
              return;
            }
            try {
              const out = await window.ProFitAPI.post("/auth/google/connect", { access_token: resp.access_token });
              if (out && out.user) {
                try { sessionStorage.setItem("profit-verified-session", JSON.stringify(out.user)); } catch (_) {}
                renderState(root, out.user);
                showStatus(root, "Google account connected.", false);
              }
            } catch (err) {
              btn.disabled = false;
              btn.textContent = "Connect Google";
              showStatus(root, err?.message || "Could not connect Google account.", true);
            }
          },
          error_callback: () => {
            btn.disabled = false;
            btn.textContent = "Connect Google";
            showStatus(root, "Google popup closed or blocked. Allow popups and try again.", true);
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
      showStatus(root, "Google Sign-In is currently unavailable. Try again shortly.", true);
    } catch (err) {
      showStatus(root, err?.message || "Could not start Google connection.", true);
    } finally {
      if (btn.isConnected && btn.textContent === "Connecting…") {
        btn.disabled = false;
        btn.textContent = "Connect Google";
      }
    }
  }

  async function handleDisconnect(root, btn) {
    showStatus(root, "", false);
    btn.disabled = true;
    btn.textContent = "Disconnecting…";
    try {
      const out = await window.ProFitAPI.post("/auth/google/disconnect", {});
      if (out && out.user) {
        try { sessionStorage.setItem("profit-verified-session", JSON.stringify(out.user)); } catch (_) {}
        renderState(root, out.user);
        showStatus(root, "Google account disconnected.", false);
      }
    } catch (err) {
      showStatus(root, err?.message || "Could not disconnect Google account.", true);
      btn.disabled = false;
      btn.textContent = "Disconnect";
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

  function openSetPasswordDialog(root) {
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
          try { sessionStorage.setItem("profit-verified-session", JSON.stringify(out.user)); } catch (_) {}
          renderState(root, out.user);
          showStatus(root, "Password saved. You can now disconnect Google anytime.", false);
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
    const root = document.getElementById("pfGoogleAccountRow");
    if (!root || !window.ProFitAPI) return;
    try {
      const sess = await window.ProFitAPI.get("/auth/session", { silent: true });
      if (sess && sess.user) {
        renderState(root, sess.user);
      }
    } catch (_) {}

    const q = new URLSearchParams(location.search);
    if (q.get("google_connected") === "1") {
      showStatus(root, "Google account connected.", false);
      q.delete("google_connected");
      const clean = location.pathname + (q.toString() ? `?${q.toString()}` : "") + (location.hash || "");
      history.replaceState(null, "", clean);
    } else if (q.get("google_error")) {
      const code = q.get("google_error");
      showStatus(
        root,
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
