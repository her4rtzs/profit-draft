/* ProFit Member Google Sign-In & Verified Account Linking.
   Strict Member-only authentication via Google Identity Services (ID token)
   with OAuth 2.0 redirect fallback. Staff/Admin login remains untouched. */
(() => {
  "use strict";

  const FALLBACK_CLIENT_ID = "752296461739-tpcmop84u41b31bo3eer33uv2v6fkauq.apps.googleusercontent.com";
  const ERROR_MESSAGES = {
    cancelled: "Google sign-in was cancelled.",
    staff_forbidden: "Google Sign-In is only available for Member accounts. Staff and trainers must sign in with their gym password.",
    account_disabled: "This member account is not active yet. Contact the gym or verify your email first.",
    already_linked_other: "This member account is already linked to a different Google account.",
    google_sub_in_use: "This Google account is already linked to another ProFit member.",
    email_not_verified: "Your Google account email is not verified. Verify it in Google first.",
    token_expired: "Your Google sign-in session expired. Please try again.",
    invalid_token: "Google credential could not be verified. Please try again.",
    invalid_state: "Your sign-in session expired. Please click Continue with Google again.",
    network_error: "Could not reach Google right now. Check your connection and try again.",
    db_error: "A server error occurred while signing you in. Please try again.",
    not_configured: "Google Sign-In is not configured for this flow yet.",
    oauth_error: "Google authorization did not complete. Please try again."
  };

  const btn = document.getElementById("googleSignInBtn") || document.getElementById("googleJoinBtn");
  if (!btn) return;

  const isJoinPage = /(^|\/)join(?:\.html)?$/i.test(location.pathname) || btn.id === "googleJoinBtn";
  const sourceName = isJoinPage ? "join" : "login";

  let clientId = FALLBACK_CLIENT_ID;
  let oauthRedirectEnabled = false;
  let busy = false;
  let gsiReady = false;
  let gsiFailed = false;
  let tokenClient = null;
  let linkDialog = null;
  let configPromise = null;

  function showMsg(text, isError) {
    if (!isJoinPage) {
      const box = document.getElementById("authMessage");
      if (box) {
        box.hidden = false;
        box.classList.toggle("error", !!isError);
        box.textContent = text;
        return;
      }
    }
    const errEl = document.getElementById("joinGoogleMsg") || document.getElementById("err");
    if (errEl) {
      errEl.hidden = false;
      errEl.style.color = isError ? "var(--err)" : "var(--ok)";
      errEl.textContent = text;
    }
  }

  function clearMsg() {
    const authBox = document.getElementById("authMessage");
    if (authBox && !isJoinPage) authBox.hidden = true;
    const jMsg = document.getElementById("joinGoogleMsg");
    if (jMsg) {
      jMsg.hidden = true;
      jMsg.textContent = "";
    }
  }

  function setBusy(state, label) {
    busy = !!state;
    btn.disabled = busy;
    btn.classList.toggle("is-busy", busy);
    btn.setAttribute("aria-busy", String(busy));
    const span = btn.querySelector("[data-google-label]") || btn.querySelector("span:last-of-type");
    if (span) {
      if (!btn.dataset.origLabel) btn.dataset.origLabel = span.textContent;
      span.textContent = busy ? (label || "Signing in…") : btn.dataset.origLabel;
    }
  }

  function finishMemberLogin(user, msgText) {
    try {
      sessionStorage.removeItem("profit-logged-out");
      sessionStorage.setItem("profit-verified-session", JSON.stringify(user));
      sessionStorage.setItem("pf-auth-just-logged-in", "1");
    } catch (_) {}
    showMsg(msgText || "Signed in with Google. Opening your member portal…", false);
    setTimeout(() => {
      location.replace("/member-home");
    }, 250);
  }

  function ensureLinkDialog() {
    if (linkDialog) return linkDialog;
    const st = document.createElement("style");
    st.textContent = `
      #pfGoogleLinkDialog{margin:auto;inset:0;width:min(420px,92vw);padding:0;border-radius:16px;border:1px solid var(--line,#232636);background:var(--card,#111320);color:var(--tx,#f6efdc);box-shadow:0 24px 60px rgba(0,0,0,.6);font-family:Inter,system-ui,sans-serif}
      #pfGoogleLinkDialog::backdrop{background:rgba(7,8,12,.76);backdrop-filter:blur(4px)}
      #pfGoogleLinkDialog form{padding:24px;display:grid;gap:14px}
      #pfGoogleLinkDialog h3{margin:0;font:800 20px/1.2 "Plus Jakarta Sans",Inter,sans-serif}
      #pfGoogleLinkDialog p{margin:0;font-size:13.5px;line-height:1.5;color:var(--mu,#9a9788)}
      #pfGoogleLinkDialog .pf-gl-email{color:var(--gold,#e8b93a);font-weight:600;word-break:break-word}
      #pfGoogleLinkDialog .pf-gl-field{position:relative}
      #pfGoogleLinkDialog input{width:100%;height:44px;padding:0 44px 0 14px;border-radius:12px;border:1px solid var(--field-line,#4A4E66);background:var(--bg2,#0b0d16);color:var(--tx,#f6efdc);font:400 14px/1.2 Inter,system-ui,sans-serif}
      #pfGoogleLinkDialog input:focus{outline:none;border-color:var(--gold,#e8b93a);box-shadow:0 0 0 3px rgba(232,185,58,.22)}
      #pfGoogleLinkDialog .pf-gl-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:38px;height:38px;border:0;background:transparent;color:var(--mu,#9a9788);cursor:pointer;display:grid;place-items:center}
      #pfGoogleLinkDialog .pf-gl-eye:hover{color:var(--gold,#e8b93a)}
      #pfGoogleLinkDialog .pf-gl-err{min-height:16px;font-size:12.5px;font-weight:500;color:var(--err,#f87171)}
      #pfGoogleLinkDialog .pf-gl-err[hidden]{display:none}
      #pfGoogleLinkDialog .pf-gl-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      #pfGoogleLinkDialog .pf-gl-acts{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}
      #pfGoogleLinkDialog .pf-gl-btn{height:42px;padding:0 18px;border-radius:999px;font:600 13.5px/1 "Plus Jakarta Sans",Inter,sans-serif;cursor:pointer;border:1px solid var(--field-line,#4A4E66);background:transparent;color:var(--tx,#f6efdc)}
      #pfGoogleLinkDialog .pf-gl-btn.primary{border:0;background:var(--gold,#e8b93a);color:var(--on,#1a1407);font-weight:700}
      #pfGoogleLinkDialog .pf-gl-btn:disabled{opacity:.6;cursor:not-allowed}
    `;
    document.head.appendChild(st);

    const dlg = document.createElement("dialog");
    dlg.id = "pfGoogleLinkDialog";
    dlg.setAttribute("aria-labelledby", "pfGoogleLinkTitle");
    dlg.innerHTML = `<form method="dialog" novalidate>
      <div>
        <h3 id="pfGoogleLinkTitle">Verify to link Google</h3>
        <p style="margin-top:6px">An existing ProFit member account uses <span class="pf-gl-email" id="pfGlEmail"></span>. Enter your ProFit password once to verify ownership and link your Google account.</p>
      </div>
      <div class="pf-gl-field">
        <label class="pf-gl-sr" for="pfGlPassword">ProFit password</label>
        <input type="password" id="pfGlPassword" autocomplete="current-password" placeholder="Enter your ProFit password" required>
        <button type="button" class="pf-gl-eye" id="pfGlEye" aria-label="Show password"><i class="fa-regular fa-eye"></i></button>
      </div>
      <div class="pf-gl-err" id="pfGlErr" role="alert" hidden></div>
      <div class="pf-gl-acts">
        <button type="button" class="pf-gl-btn" id="pfGlCancel">Cancel</button>
        <button type="submit" class="pf-gl-btn primary" id="pfGlSubmit">Verify &amp; link</button>
      </div>
    </form>`;
    document.body.appendChild(dlg);

    const pwInput = dlg.querySelector("#pfGlPassword");
    const eyeBtn = dlg.querySelector("#pfGlEye");
    const errBox = dlg.querySelector("#pfGlErr");
    const cancelBtn = dlg.querySelector("#pfGlCancel");
    const submitBtn = dlg.querySelector("#pfGlSubmit");
    const form = dlg.querySelector("form");

    eyeBtn.addEventListener("click", () => {
      const show = pwInput.type === "password";
      pwInput.type = show ? "text" : "password";
      eyeBtn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      eyeBtn.innerHTML = `<i class="fa-regular ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
    });

    cancelBtn.addEventListener("click", () => {
      dlg.close();
    });
    dlg.addEventListener("click", e => {
      if (e.target === dlg) dlg.close();
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      errBox.hidden = true;
      const password = pwInput.value;
      const token = dlg.dataset.linkToken || "";
      if (!password) {
        errBox.hidden = false;
        errBox.textContent = "Enter your ProFit password.";
        pwInput.focus();
        return;
      }
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      submitBtn.textContent = "Verifying…";
      try {
        const res = await window.ProFitAPI.post("/auth/google/link", {
          link_token: token,
          password
        });
        pwInput.value = "";
        dlg.close();
        finishMemberLogin(res.user, "Google account linked. Signing you in…");
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err?.message || "Could not verify your password. Please try again.";
      } finally {
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.textContent = "Verify & link";
      }
    });

    linkDialog = dlg;
    return dlg;
  }

  function openLinkPrompt(email, linkToken) {
    const dlg = ensureLinkDialog();
    dlg.dataset.linkToken = linkToken || "";
    const emailEl = dlg.querySelector("#pfGlEmail");
    const pwInput = dlg.querySelector("#pfGlPassword");
    const errBox = dlg.querySelector("#pfGlErr");
    if (emailEl) emailEl.textContent = email || "this email address";
    if (pwInput) pwInput.value = "";
    if (errBox) {
      errBox.hidden = true;
      errBox.textContent = "";
    }
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
      setTimeout(() => pwInput && pwInput.focus(), 40);
    } else {
      showMsg("An account with this email already exists. Please use a modern browser to link Google.", true);
    }
  }

  async function submitGoogleAuth(payload) {
    clearMsg();
    setBusy(true, "Connecting…");
    try {
      const res = await window.ProFitAPI.post("/auth/google", payload);
      if (res && res.status === "link_required") {
        setBusy(false);
        openLinkPrompt(res.email, res.link_token);
        return;
      }
      if (res && res.status === "authenticated" && res.user) {
        finishMemberLogin(
          res.user,
          res.created ? "Welcome to ProFit! Opening your member portal…" : "Signed in with Google. Opening your member portal…"
        );
        return;
      }
      throw new Error("Unexpected response from server.");
    } catch (err) {
      setBusy(false);
      showMsg(err?.message || "Google sign-in failed. Please try again.", true);
    }
  }

  async function handleCredentialResponse(response) {
    if (busy) return;
    const credential = response && response.credential;
    if (!credential) {
      showMsg("Google sign-in was cancelled or returned no credential.", true);
      return;
    }
    await submitGoogleAuth({ credential });
  }

  function loadGsiScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
        resolve();
        return;
      }
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
  }

  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = (async () => {
      try {
        const cfg = await window.ProFitAPI.get("/auth/google/config");
        if (cfg && cfg.client_id) clientId = cfg.client_id;
        oauthRedirectEnabled = Boolean(cfg && cfg.oauth_redirect_enabled);
      } catch (_) {
        /* Keep fallback Client ID when offline or config fetch fails */
      }
      return { clientId, oauthRedirectEnabled };
    })();
    return configPromise;
  }

  async function initGoogle() {
    await loadConfig();
    try {
      await loadGsiScript();
      if (window.google?.accounts?.oauth2) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: async resp => {
            if (resp && resp.error) {
              setBusy(false);
              showMsg(
                resp.error === "access_denied"
                  ? "Google sign-in was cancelled."
                  : "Google authorization could not be completed. Please try again.",
                true
              );
              return;
            }
            if (resp && resp.access_token) {
              await submitGoogleAuth({ access_token: resp.access_token });
              return;
            }
            setBusy(false);
            showMsg("Google sign-in returned no access token.", true);
          },
          error_callback: err => {
            setBusy(false);
            const t = err?.type || "";
            if (t === "popup_closed") {
              showMsg("Google sign-in window was closed before completing.", true);
            } else if (t === "popup_failed_to_open") {
              showMsg("Popup was blocked by your browser. Please allow popups for this site and try again.", true);
            } else {
              showMsg("Could not open Google sign-in. Please allow accounts.google.com and try again.", true);
            }
          }
        });
      }
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true
        });
        gsiReady = true;
      }
      if (!tokenClient && !gsiReady) throw new Error("gsi-missing");
    } catch (_) {
      gsiFailed = true;
    }
  }

  btn.addEventListener("click", async () => {
    if (busy) return;
    clearMsg();
    await loadConfig();
    if (tokenClient) {
      setBusy(true, "Waiting for Google…");
      try {
        tokenClient.requestAccessToken({ prompt: "select_account" });
      } catch (_) {
        setBusy(false);
        showMsg("Could not open Google sign-in. Please try again.", true);
      }
      return;
    }
    if (gsiReady && window.google?.accounts?.id) {
      window.google.accounts.id.prompt(notification => {
        if (notification && (notification.isNotDisplayed() || notification.isSkippedMoment())) {
          showMsg("Please enable popups or allow accounts.google.com to complete Google Sign-In.", true);
        }
      });
      return;
    }
    if (gsiFailed) {
      if (oauthRedirectEnabled) {
        setBusy(true, "Redirecting…");
        location.href = `/api/auth/google/login/?source=${encodeURIComponent(sourceName)}`;
        return;
      }
      showMsg("Google Sign-In could not load right now. Please allow accounts.google.com or try again.", true);
      return;
    }
    showMsg("Google Sign-In is still initializing. Please click again in a moment.", false);
  });

  async function handleQueryCallback() {
    const q = new URLSearchParams(location.search);
    const hasCallbackParams = q.has("google_authenticated") || q.has("google_link") || q.has("google_error");
    if (!hasCallbackParams) return;

    const cleanUrl = location.pathname;
    if (q.get("google_authenticated") === "1") {
      history.replaceState(null, "", cleanUrl);
      setBusy(true, "Opening portal…");
      try {
        const session = await window.ProFitAPI.get("/auth/session");
        if (session && session.user && String(session.user.role || "").toUpperCase() === "MEMBER") {
          finishMemberLogin(session.user);
          return;
        }
        throw new Error("Session role mismatch.");
      } catch (_) {
        setBusy(false);
        showMsg("Could not verify your Google session. Please try signing in again.", true);
      }
      return;
    }

    if (q.has("google_link")) {
      const linkToken = q.get("google_link") || "";
      const email = q.get("email") || "";
      history.replaceState(null, "", cleanUrl);
      openLinkPrompt(email, linkToken);
      return;
    }

    if (q.has("google_error")) {
      const code = q.get("google_error") || "oauth_error";
      const customMsg = q.get("google_msg");
      history.replaceState(null, "", cleanUrl);
      showMsg(customMsg || ERROR_MESSAGES[code] || "Google Sign-In failed. Please try again.", true);
    }
  }

  handleQueryCallback();
  initGoogle();
})();
