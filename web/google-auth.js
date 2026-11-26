/* ProFit Member Google Sign-In & Verified Account Linking.
   Strict Member-only authentication via Google Identity Services (ID token)
   with OAuth 2.0 redirect fallback. Staff/Admin login remains untouched. */
(() => {
  "use strict";

  const FALLBACK_CLIENT_ID = "752296461739-tpcmop84u41b31bo3eer33uv2v6fkauq.apps.googleusercontent.com";
  const ERROR_MESSAGES = {
    cancelled: "Google sign-in was cancelled.",
    not_linked: "This Google account is not connected to a ProFit account. Sign in with your email and password first, then connect Google in Settings.",
    staff_forbidden: "This Google account is not connected to a ProFit account.",
    account_disabled: "This account is not active yet. Contact the gym administrator.",
    already_linked_other: "This account is already linked to a different Google account.",
    google_sub_in_use: "This Google account is already linked to another ProFit user.",
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

  function defaultRedirectForRole() {
    return "/dashboard";
  }

  function finishLogin(user, targetRedirect, msgText) {
    try {
      sessionStorage.removeItem("profit-logged-out");
      sessionStorage.setItem("profit-verified-session", JSON.stringify(user));
      sessionStorage.setItem("pf-auth-just-logged-in", "1");
    } catch (_) { }
    const dest = targetRedirect || defaultRedirectForRole(user?.role);
    showMsg(msgText || "Signed in with Google. Redirecting…", false);
    setTimeout(() => {
      location.replace(dest);
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
        if (res && (res.requires_onboarding_gate || res.user?.requires_first_login_gate)) {
          await openOnboardingFlow(res.user);
        } else {
          finishLogin(res.user, res.redirect, "Google account linked. Signing you in…");
        }
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

  let otpDialog = null;
  let consentDialog = null;
  let legalCache = null;

  function ensureOnboardingStyles() {
    if (document.getElementById("pfOnboardingModalStyles")) return;
    const st = document.createElement("style");
    st.id = "pfOnboardingModalStyles";
    st.textContent = `
      dialog.pf-ob-dlg{margin:auto;inset:0;width:min(430px,92vw);max-height:92dvh;padding:0;border-radius:18px;border:1px solid #232636;background:#111320;color:#F6EFDC;box-shadow:0 32px 80px rgba(0,0,0,.72);font-family:Inter,system-ui,-apple-system,sans-serif;overflow:hidden}
      dialog.pf-ob-dlg.is-legal{width:min(760px,94vw);max-height:min(88dvh,780px);border-radius:16px}
      dialog.pf-ob-dlg.is-legal[open]{display:flex;flex-direction:column}
      dialog.pf-ob-dlg::backdrop{background:rgba(7,8,12,.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
      .pf-ob-box{padding:24px;display:grid;gap:14px}
      .pf-ob-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .pf-ob-badge{width:38px;height:38px;border-radius:11px;background:rgba(232,185,58,.14);border:1px solid rgba(232,185,58,.32);color:#E8B93A;display:grid;place-items:center;font-weight:800;font-size:16px;flex:none}
      .pf-ob-x{width:32px;height:32px;border-radius:999px;border:0;background:transparent;color:#9EA7B8;font-size:20px;line-height:1;cursor:pointer;display:grid;place-items:center}
      .pf-ob-x:hover{background:rgba(255,255,255,.08);color:#F6EFDC}
      .pf-ob-dlg h3{margin:0;font:700 20px/1.25 "Plus Jakarta Sans",Inter,sans-serif;color:#F6EFDC}
      .pf-ob-lead{margin:0;font-size:13.5px;line-height:1.55;color:#9a9788}
      .pf-ob-lead strong{color:#E8B93A;word-break:break-word}
      .pf-ob-lbl{display:block;font-size:12.5px;font-weight:600;color:#D6DCE8;margin-bottom:6px}
      .pf-ob-code{width:100%;height:48px;padding:0 14px;border-radius:11px;border:1px solid rgba(255,255,255,.18);background:#0A0E17;color:#F6EFDC;font:700 22px/1 Consolas,Menlo,monospace;letter-spacing:.45em;text-align:center}
      .pf-ob-code:focus{outline:none;border-color:#E8B93A;box-shadow:0 0 0 3px rgba(232,185,58,.22)}
      .pf-ob-alert{padding:10px 12px;border-radius:10px;font-size:12.5px;line-height:1.45;border:1px solid rgba(248,113,113,.38);background:rgba(248,113,113,.1);color:#FECACA}
      .pf-ob-alert.ok{border-color:rgba(52,211,153,.38);background:rgba(52,211,153,.1);color:#A7F3D0}
      .pf-ob-alert[hidden]{display:none}
      .pf-ob-btn{height:44px;padding:0 18px;border-radius:11px;border:0;background:#E8B93A;color:#141005;font:700 14px/1 "Plus Jakarta Sans",Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
      .pf-ob-btn:hover:not(:disabled){background:#F2C94C}
      .pf-ob-btn:disabled{opacity:.6;cursor:not-allowed}
      .pf-ob-btn.full{width:100%}
      .pf-ob-footrow{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:#9a9788;margin-top:2px}
      .pf-ob-resend{border:0;background:transparent;color:#F6EFDC;font:600 12px/1 Inter,sans-serif;cursor:pointer;padding:4px 0}
      .pf-ob-resend:hover:not(:disabled){color:#E8B93A}
      .pf-ob-resend:disabled{opacity:.5;cursor:not-allowed}
      /* Join-style Legal Modal for Onboarding */
      .pf-lg-form{display:flex;flex-direction:column;min-height:0;flex:1 1 auto;overflow:hidden}
      .pf-lg-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 22px;background:#0b0d16;border-bottom:1px solid #232636}
      .pf-lg-head-l{display:flex;align-items:center;gap:12px;min-width:0}
      .pf-lg-ico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#e8b93a;color:#1a1407;font-size:16px;flex:none}
      .pf-lg-head h3{margin:0;font-size:18px;font-weight:700;color:#f6efdc}
      .pf-lg-head p{margin:2px 0 0;font-size:12px;color:#9a9788}
      .pf-lg-x{width:44px;height:44px;border-radius:10px;border:1px solid #4A4E66;background:#0b0d16;color:#f6efdc;font-size:20px;line-height:1;display:grid;place-items:center;cursor:pointer;flex:none}
      .pf-lg-x:hover{background:rgba(255,255,255,.06)}
      .pf-lg-tabs{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 22px;background:#07080c;border-bottom:1px solid #232636}
      .pf-lg-tabgrp{display:flex;gap:8px;flex-wrap:wrap}
      .pf-lg-tab{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid #4A4E66;background:#0b0d16;color:#f6efdc;font:600 13px/1 "Plus Jakarta Sans",sans-serif;cursor:pointer;transition:background-color .15s ease}
      .pf-lg-tab:hover:not(.is-active){background:rgba(232,185,58,.12)}
      .pf-lg-tab.is-active{background:#e8b93a;color:#0b0f19;border-color:#e8b93a}
      .pf-lg-tab .chk{display:none;color:#4ade80;font-weight:800}
      .pf-lg-tab.is-read .chk{display:inline}
      .pf-lg-tab.is-active.is-read .chk{color:#1a1407}
      .pf-lg-prog{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:600;color:#9a9788}
      .pf-lg-progbar{width:90px;height:6px;background:#232636;border-radius:99px;overflow:hidden}
      .pf-lg-progfill{height:100%;width:0%;background:#4ade80;transition:width .25s ease}
      .pf-lg-body{flex:1 1 auto;min-height:220px;overflow-y:auto;padding:20px 22px;font-size:14px;line-height:1.65;color:#f6efdc;background:#0b0d16}
      .pf-lg-body .legal-sec{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #232636}
      .pf-lg-body .legal-sec:last-child{border-bottom:0;margin-bottom:0}
      .pf-lg-body h2{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;color:#f6efdc;margin:0 0 8px}
      .pf-lg-body .legal-num{width:24px;height:24px;border-radius:6px;display:inline-grid;place-items:center;background:#e8b93a;color:#1a1407;font-size:12px;font-weight:800;flex:none}
      .pf-lg-body p{margin:0 0 8px;color:#f6efdc}
      .pf-lg-body ul{margin:6px 0 0;padding-left:20px;display:grid;gap:5px;color:#f6efdc}
      .pf-lg-body a{color:#e8b93a;font-weight:600;text-decoration:underline}
      .pf-lg-foot{display:grid;gap:10px;padding:12px 22px 16px;border-top:1px solid #232636;background:#07080c}
      .pf-lg-checks{display:flex;flex-wrap:wrap;gap:10px 20px}
      .pf-lg-chk{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#f6efdc;cursor:pointer;user-select:none}
      .pf-lg-chk.is-locked{opacity:.58;cursor:not-allowed}
      .pf-lg-chk input{width:17px;height:17px;accent-color:#e8b93a;cursor:pointer}
      .pf-lg-chk.is-locked input{cursor:not-allowed}
      .pf-lg-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .pf-lg-note{margin:0;font-size:12.5px;color:#9a9788}
      .pf-lg-acts{display:flex;align-items:center;gap:10px;margin-left:auto}
      .pf-lg-btn{height:44px;padding:0 18px;border-radius:999px;font:600 13.5px/1 "Plus Jakarta Sans",sans-serif;border:1px solid #4A4E66;background:#0b0d16;color:#f6efdc;cursor:pointer;transition:background-color .15s ease}
      .pf-lg-btn:hover:not(.primary):not(:disabled){background:rgba(255,255,255,.06)}
      .pf-lg-btn.primary{background:#e8b93a;color:#0b0f19;border-color:#e8b93a;font-weight:700}
      .pf-lg-btn.primary:hover:not(:disabled){background:#f0c44b;border-color:#f0c44b}
      .pf-lg-btn.primary:disabled{opacity:.48;cursor:not-allowed;pointer-events:none}
      @media(max-width:560px){.pf-lg-head,.pf-lg-tabs,.pf-lg-body,.pf-lg-foot{padding-left:14px;padding-right:14px}.pf-lg-row{flex-direction:column;align-items:stretch}.pf-lg-acts{justify-content:flex-end}}
    `;
    document.head.appendChild(st);
  }

  async function cancelOnboardingSession(dlg) {
    try {
      await window.ProFitAPI.post("/auth/logout", {});
    } catch (_) { }
    try {
      sessionStorage.removeItem("profit-verified-session");
      sessionStorage.removeItem("pf-auth-just-logged-in");
    } catch (_) { }
    if (dlg && dlg.open) dlg.close();
    setBusy(false);
  }

  function ensureOtpDialog() {
    if (otpDialog) return otpDialog;
    ensureOnboardingStyles();
    const dlg = document.createElement("dialog");
    dlg.id = "pfOnboardingOtpDialog";
    dlg.className = "pf-ob-dlg";
    dlg.setAttribute("aria-labelledby", "pfObOtpTitle");
    dlg.innerHTML = `<form class="pf-ob-box" method="dialog" novalidate>
      <div class="pf-ob-top">
        <span class="pf-ob-badge" aria-hidden="true">@</span>
        <button type="button" class="pf-ob-x" id="pfObOtpClose" aria-label="Cancel">&times;</button>
      </div>
      <div>
        <h3 id="pfObOtpTitle">Verify your email</h3>
        <p class="pf-ob-lead" style="margin-top:6px">We sent a 6-digit verification code to <strong id="pfObOtpEmail">your email</strong>. Check your inbox and spam folder, then enter the code below to complete your registration. Codes expire in 10 minutes.</p>
      </div>
      <div>
        <label class="pf-ob-lbl" for="pfObOtpCode">Email verification code</label>
        <input class="pf-ob-code" id="pfObOtpCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required>
      </div>
      <div class="pf-ob-alert" id="pfObOtpMsg" role="alert" hidden></div>
      <button type="submit" class="pf-ob-btn full" id="pfObOtpSubmit">Verify &amp; Continue</button>
      <div class="pf-ob-footrow">
        <span id="pfObOtpCountdown">Checking timer…</span>
        <button type="button" class="pf-ob-resend" id="pfObOtpResend">Resend code</button>
      </div>
    </form>`;
    document.body.appendChild(dlg);
    otpDialog = dlg;
    return dlg;
  }

  function ensureConsentDialog() {
    if (consentDialog) return consentDialog;
    ensureOnboardingStyles();
    const dlg = document.createElement("dialog");
    dlg.id = "pfOnboardingConsentDialog";
    dlg.className = "pf-ob-dlg is-legal";
    dlg.setAttribute("aria-labelledby", "pfObConsentTitle");
    dlg.innerHTML = `<form class="pf-lg-form" method="dialog" novalidate>
      <div class="pf-lg-head">
        <div class="pf-lg-head-l">
          <span class="pf-lg-ico" id="pfObLegalIco" aria-hidden="true"><i class="fa-regular fa-file-lines"></i></span>
          <div>
            <h3 id="pfObConsentTitle">Terms of Service</h3>
            <p id="pfObLegalSub">ProFit · Functional Fitness Gym · Last updated: October 2026</p>
          </div>
        </div>
        <button type="button" class="pf-lg-x" id="pfObConsentClose" aria-label="Close modal">&times;</button>
      </div>
      <div class="pf-lg-tabs">
        <div class="pf-lg-tabgrp" role="tablist" aria-label="Legal documents">
          <button type="button" class="pf-lg-tab is-active" role="tab" aria-selected="true" data-doc="terms">
            <i class="fa-regular fa-file-lines" aria-hidden="true"></i> Terms of Service <span class="chk" aria-hidden="true">&#10003;</span>
          </button>
          <button type="button" class="pf-lg-tab" role="tab" aria-selected="false" data-doc="privacy">
            <i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Privacy Policy <span class="chk" aria-hidden="true">&#10003;</span>
          </button>
        </div>
        <div class="pf-lg-prog" aria-live="polite">
          <span id="pfObLegalProgText">0 of 2 documents reviewed</span>
          <div class="pf-lg-progbar"><div class="pf-lg-progfill" id="pfObLegalProgFill"></div></div>
        </div>
      </div>
      <div class="pf-lg-body" id="pfObLegalBody" tabindex="0"></div>
      <div class="pf-lg-foot">
        <div class="pf-ob-alert" id="pfObConsentMsg" role="alert" hidden></div>
        <div class="pf-lg-checks">
          <label class="pf-lg-chk is-locked" id="pfObLblTerms" for="pfObAcceptTerms">
            <input type="checkbox" id="pfObAcceptTerms" disabled>
            <span>I have read and agree to the Terms of Service</span>
          </label>
          <label class="pf-lg-chk is-locked" id="pfObLblPrivacy" for="pfObAcceptPrivacy">
            <input type="checkbox" id="pfObAcceptPrivacy" disabled>
            <span>I have read and agree to the Privacy Policy</span>
          </label>
        </div>
        <div class="pf-lg-row">
          <p class="pf-lg-note" id="pfObLegalNote">Scroll to the end of both documents to enable checkboxes and &ldquo;I agree&rdquo;.</p>
          <div class="pf-lg-acts">
            <button type="button" class="pf-lg-btn" id="pfObConsentCancel">Cancel</button>
            <button type="submit" class="pf-lg-btn primary" id="pfObConsentSubmit" disabled>I agree</button>
          </div>
        </div>
      </div>
    </form>`;
    document.body.appendChild(dlg);
    consentDialog = dlg;
    return dlg;
  }

  function openConsentModal(statusInfo) {
    const dlg = ensureConsentDialog();
    const form = dlg.querySelector("form");
    const bodyEl = dlg.querySelector("#pfObLegalBody");
    const titleEl = dlg.querySelector("#pfObConsentTitle");
    const subEl = dlg.querySelector("#pfObLegalSub");
    const icoEl = dlg.querySelector("#pfObLegalIco");
    const progText = dlg.querySelector("#pfObLegalProgText");
    const progFill = dlg.querySelector("#pfObLegalProgFill");
    const noteEl = dlg.querySelector("#pfObLegalNote");
    const msgEl = dlg.querySelector("#pfObConsentMsg");
    const lblTos = dlg.querySelector("#pfObLblTerms");
    const lblPriv = dlg.querySelector("#pfObLblPrivacy");
    const tosChk = dlg.querySelector("#pfObAcceptTerms");
    const privChk = dlg.querySelector("#pfObAcceptPrivacy");
    const submitBtn = dlg.querySelector("#pfObConsentSubmit");
    const cancelBtn = dlg.querySelector("#pfObConsentCancel");
    const closeBtn = dlg.querySelector("#pfObConsentClose");
    const tabs = dlg.querySelectorAll(".pf-lg-tab[data-doc]");

    const DOCS = {
      terms: { url: "/terms", title: "Terms of Service", sub: "ProFit · Functional Fitness Gym · Last updated: October 2026", icon: "fa-regular fa-file-lines" },
      privacy: { url: "/privacy", title: "Privacy Policy", sub: "R.A. No. 10173 (Data Privacy Act of 2012) · Last updated: October 2026", icon: "fa-solid fa-shield-halved" }
    };
    const cache = legalCache || (legalCache = {});
    const loaded = { terms: false, privacy: false };
    const reviewed = { terms: false, privacy: false };
    let activeDoc = "terms";
    let submitting = false;

    const syncUI = () => {
      const count = (reviewed.terms ? 1 : 0) + (reviewed.privacy ? 1 : 0);
      if (progText) progText.textContent = `${count} of 2 documents reviewed`;
      if (progFill) progFill.style.width = `${count * 50}%`;
      tabs.forEach(t => t.classList.toggle("is-read", !!reviewed[t.dataset.doc]));
      if (tosChk) {
        tosChk.disabled = !reviewed.terms;
        if (!reviewed.terms) tosChk.checked = false;
        lblTos?.classList.toggle("is-locked", !reviewed.terms);
      }
      if (privChk) {
        privChk.disabled = !reviewed.privacy;
        if (!reviewed.privacy) privChk.checked = false;
        lblPriv?.classList.toggle("is-locked", !reviewed.privacy);
      }
      const bothReviewed = reviewed.terms && reviewed.privacy;
      const bothChecked = Boolean(tosChk?.checked && privChk?.checked);
      submitBtn.disabled = submitting || !(bothReviewed && bothChecked);
      if (noteEl) {
        if (!bothReviewed) {
          noteEl.textContent = "Scroll to the end of both documents to enable checkboxes and “I agree”.";
        } else if (!bothChecked) {
          noteEl.textContent = "Both documents reviewed. Check both boxes above to enable “I agree”.";
        } else {
          noteEl.textContent = "Ready — click “I agree” to finish signing in.";
        }
      }
    };

    const checkScrolledToEnd = () => {
      if (!loaded[activeDoc] || reviewed[activeDoc]) return;
      if (bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 18) {
        reviewed[activeDoc] = true;
        msgEl.hidden = true;
        syncUI();
      }
    };
    bodyEl.onscroll = checkScrolledToEnd;

    const loadDoc = key => {
      activeDoc = DOCS[key] ? key : "terms";
      const cfg = DOCS[activeDoc];
      if (titleEl) titleEl.textContent = cfg.title;
      if (subEl) subEl.textContent = cfg.sub;
      if (icoEl) icoEl.innerHTML = `<i class="${cfg.icon}" aria-hidden="true"></i>`;
      tabs.forEach(t => {
        const on = t.dataset.doc === activeDoc;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      if (cache[activeDoc]) {
        bodyEl.innerHTML = cache[activeDoc];
        loaded[activeDoc] = true;
        bodyEl.scrollTop = 0;
        requestAnimationFrame(checkScrolledToEnd);
        return;
      }
      loaded[activeDoc] = false;
      bodyEl.innerHTML = `<p style="color:#9a9788">Loading ${cfg.title}...</p>`;
      fetch(cfg.url, { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(html => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const card = doc.querySelector(".legal-card");
          cache[activeDoc] = card ? card.innerHTML : "<p>Could not load this document.</p>";
          loaded[activeDoc] = Boolean(card);
          bodyEl.innerHTML = cache[activeDoc];
          bodyEl.scrollTop = 0;
          requestAnimationFrame(checkScrolledToEnd);
        })
        .catch(() => {
          bodyEl.innerHTML = "<p>Could not load this document. Please close and try again.</p>";
        });
    };

    tabs.forEach(t => { t.onclick = () => loadDoc(t.dataset.doc); });

    [
      [lblTos, "terms", "Terms of Service"],
      [lblPriv, "privacy", "Privacy Policy"]
    ].forEach(([lbl, key, labelName]) => {
      if (!lbl) return;
      lbl.onclick = e => {
        if (!reviewed[key]) {
          e.preventDefault();
          loadDoc(key);
          msgEl.hidden = false;
          msgEl.className = "pf-ob-alert";
          msgEl.textContent = `Please scroll to the end of the ${labelName} before checking this box.`;
        }
      };
    });

    if (tosChk) tosChk.onchange = () => { msgEl.hidden = true; syncUI(); };
    if (privChk) privChk.onchange = () => { msgEl.hidden = true; syncUI(); };

    msgEl.hidden = true;
    msgEl.textContent = "";
    submitBtn.textContent = "I agree";
    syncUI();

    closeBtn.onclick = () => cancelOnboardingSession(dlg);
    cancelBtn.onclick = () => cancelOnboardingSession(dlg);
    dlg.oncancel = e => {
      e.preventDefault();
      cancelOnboardingSession(dlg);
    };

    form.onsubmit = async e => {
      e.preventDefault();
      msgEl.hidden = true;
      if (!reviewed.terms || !reviewed.privacy) {
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert";
        msgEl.textContent = "Please scroll to the end of both Terms of Service and Privacy Policy first.";
        loadDoc(!reviewed.terms ? "terms" : "privacy");
        return;
      }
      if (!tosChk?.checked || !privChk?.checked) {
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert";
        msgEl.textContent = "Please check both Terms of Service and Privacy Policy to continue.";
        return;
      }
      submitting = true;
      cancelBtn.disabled = true;
      submitBtn.textContent = "Completing…";
      syncUI();
      try {
        const res = await window.ProFitAPI.post("/auth/onboarding/consent", {
          accept_terms: true,
          accept_privacy: true
        });
        dlg.close();
        finishLogin(res.user, res.redirect || statusInfo.redirect, "Registration complete! Opening your workspace…");
      } catch (err) {
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert";
        msgEl.textContent = err?.message || "Could not record consent. Please try again.";
      } finally {
        submitting = false;
        cancelBtn.disabled = false;
        submitBtn.textContent = "I agree";
        syncUI();
      }
    };

    if (typeof dlg.showModal === "function" && !dlg.open) {
      dlg.showModal();
    }
    loadDoc("terms");
  }

  function openOtpModal(statusInfo) {
    const dlg = ensureOtpDialog();
    const emailEl = dlg.querySelector("#pfObOtpEmail");
    const codeInput = dlg.querySelector("#pfObOtpCode");
    const msgEl = dlg.querySelector("#pfObOtpMsg");
    const submitBtn = dlg.querySelector("#pfObOtpSubmit");
    const resendBtn = dlg.querySelector("#pfObOtpResend");
    const cdEl = dlg.querySelector("#pfObOtpCountdown");
    const closeBtn = dlg.querySelector("#pfObOtpClose");
    const form = dlg.querySelector("form");

    if (emailEl) emailEl.textContent = statusInfo.email || "your email";
    if (codeInput) {
      codeInput.value = "";
      codeInput.oninput = () => {
        const clean = codeInput.value.replace(/\D/g, "").slice(0, 6);
        if (codeInput.value !== clean) codeInput.value = clean;
      };
    }

    if (statusInfo.delivery_failed) {
      msgEl.hidden = false;
      msgEl.className = "pf-ob-alert";
      msgEl.textContent = "We couldn't send your code right now — click Resend code.";
    } else {
      msgEl.hidden = true;
      msgEl.textContent = "";
    }

    let remaining = Math.max(0, Number(statusInfo.cooldown_seconds || 0));
    let timer = null;
    const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
    const paintTimer = () => {
      if (remaining > 0) {
        resendBtn.disabled = true;
        cdEl.textContent = `You can request another code in ${remaining} seconds`;
      } else {
        resendBtn.disabled = false;
        cdEl.textContent = "Didn't receive the email?";
      }
    };
    const startTimer = secs => {
      stopTimer();
      remaining = Math.max(0, Math.round(secs || 0));
      paintTimer();
      if (remaining <= 0) return;
      timer = setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        paintTimer();
        if (remaining <= 0) stopTimer();
      }, 1000);
    };
    startTimer(remaining);

    closeBtn.onclick = () => {
      stopTimer();
      cancelOnboardingSession(dlg);
    };
    dlg.oncancel = e => {
      e.preventDefault();
      stopTimer();
      cancelOnboardingSession(dlg);
    };

    resendBtn.onclick = async () => {
      if (remaining > 0) return;
      resendBtn.disabled = true;
      resendBtn.textContent = "Sending…";
      msgEl.hidden = true;
      try {
        const res = await window.ProFitAPI.post("/auth/onboarding/otp/resend", {});
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert ok";
        msgEl.textContent = res.detail || "A new verification code was sent.";
        startTimer(res.cooldown_seconds || 60);
      } catch (err) {
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert";
        msgEl.textContent = err?.message || "Please wait before requesting another code.";
        if (err?.retry_after) startTimer(err.retry_after);
      } finally {
        resendBtn.textContent = "Resend code";
        paintTimer();
      }
    };

    form.onsubmit = async e => {
      e.preventDefault();
      const code = (codeInput?.value || "").trim();
      if (!/^\d{6}$/.test(code)) {
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert";
        msgEl.textContent = "Enter the 6-digit verification code.";
        codeInput?.focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying…";
      msgEl.hidden = true;
      try {
        const res = await window.ProFitAPI.post("/auth/onboarding/otp/verify", { code });
        stopTimer();
        dlg.close();
        if (res.needs_consent) {
          openConsentModal({ redirect: res.redirect || statusInfo.redirect });
        } else {
          finishLogin(res.user, res.redirect || statusInfo.redirect, "Email verified. Opening your workspace…");
        }
      } catch (err) {
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert";
        msgEl.textContent = err?.message || "That code is invalid or has expired.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Verify & Continue";
      }
    };

    if (typeof dlg.showModal === "function" && !dlg.open) {
      dlg.showModal();
      setTimeout(() => codeInput?.focus(), 40);
    }
  }

  async function openOnboardingFlow(user) {
    setBusy(false);
    clearMsg();
    try {
      const statusInfo = await window.ProFitAPI.get("/auth/onboarding/status");
      if (statusInfo.needs_otp) {
        openOtpModal(statusInfo);
        return;
      }
      if (statusInfo.needs_consent) {
        openConsentModal(statusInfo);
        return;
      }
      finishLogin(user, statusInfo.redirect);
    } catch (err) {
      showMsg(err?.message || "Could not load verification step. Please try again.", true);
    }
  }

  async function submitGoogleAuth(payload) {
    clearMsg();
    setBusy(true, "Connecting…");
    try {
      const res = await window.ProFitAPI.post("/auth/google", { ...payload, source: sourceName });
      if (res && res.status === "link_required") {
        setBusy(false);
        openLinkPrompt(res.email, res.link_token);
        return;
      }
      if (res && res.status === "authenticated" && res.user) {
        if (res.requires_onboarding_gate || res.user.requires_first_login_gate) {
          await openOnboardingFlow(res.user);
          return;
        }
        finishLogin(
          res.user,
          res.redirect,
          res.created ? "Welcome to ProFit! Opening your portal…" : "Signed in with Google. Redirecting…"
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
    const hasCallbackParams = q.has("google_authenticated") || q.has("google_link") || q.has("google_error") || q.has("error");
    if (!hasCallbackParams) return;

    const cleanUrl = location.pathname;
    if (q.get("error") === "not-linked") {
      history.replaceState(null, "", cleanUrl);
      showMsg(ERROR_MESSAGES.not_linked, true);
      return;
    }

    if (q.get("google_authenticated") === "1") {
      history.replaceState(null, "", cleanUrl);
      setBusy(true, "Opening portal…");
      try {
        const session = await window.ProFitAPI.get("/auth/session");
        if (session && session.user) {
          if (session.user.requires_first_login_gate) {
            await openOnboardingFlow(session.user);
            return;
          }
          finishLogin(session.user, defaultRedirectForRole(session.user.role));
          return;
        }
        throw new Error("Session missing.");
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

  async function checkPendingOnboardingSession() {
    const q = new URLSearchParams(location.search);
    if (q.get("google_authenticated") === "1") return;
    try {
      const sess = await window.ProFitAPI.get("/auth/session", { silent: true });
      if (sess && sess.user && sess.user.requires_first_login_gate) {
        await openOnboardingFlow(sess.user);
      }
    } catch (_) { }
  }

  handleQueryCallback();
  checkPendingOnboardingSession();
  initGoogle();
})();
