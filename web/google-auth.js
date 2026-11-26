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

  function defaultRedirectForRole(role) {
    const r = String(role || "").toUpperCase();
    if (r === "ADMIN" || r === "OWNER") return "/index";
    if (r === "CASHIER") return "/cashier";
    if (r === "TRAINER" || r === "COACH") return "/trainer/index";
    return "/member-home";
  }

  function finishLogin(user, targetRedirect, msgText) {
    try {
      sessionStorage.removeItem("profit-logged-out");
      sessionStorage.setItem("profit-verified-session", JSON.stringify(user));
      sessionStorage.setItem("pf-auth-just-logged-in", "1");
    } catch (_) {}
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
      dialog.pf-ob-dlg{margin:auto;inset:0;width:min(430px,92vw);max-height:92dvh;padding:0;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:#0F1420;color:#F6EFDC;box-shadow:0 32px 80px rgba(0,0,0,.72);font-family:Inter,system-ui,-apple-system,sans-serif;overflow:hidden}
      dialog.pf-ob-dlg.is-wide{width:min(580px,94vw)}
      dialog.pf-ob-dlg::backdrop{background:rgba(4,7,14,.74);backdrop-filter:blur(6px)}
      .pf-ob-box{padding:24px;display:grid;gap:14px}
      .pf-ob-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .pf-ob-badge{width:38px;height:38px;border-radius:11px;background:rgba(232,185,58,.14);border:1px solid rgba(232,185,58,.32);color:#E8B93A;display:grid;place-items:center;font-weight:800;font-size:16px;flex:none}
      .pf-ob-x{width:32px;height:32px;border-radius:999px;border:0;background:transparent;color:#9EA7B8;font-size:20px;line-height:1;cursor:pointer;display:grid;place-items:center}
      .pf-ob-x:hover{background:rgba(255,255,255,.08);color:#F6EFDC}
      .pf-ob-dlg h3{margin:0;font:800 20px/1.25 "Plus Jakarta Sans",Inter,sans-serif;color:#F6EFDC}
      .pf-ob-lead{margin:0;font-size:13.5px;line-height:1.55;color:#9EA7B8}
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
      .pf-ob-cancel{height:40px;padding:0 16px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#171F33;color:#F6EFDC;font:600 13px/1 Inter,sans-serif;cursor:pointer}
      .pf-ob-cancel:disabled{opacity:.6;cursor:not-allowed}
      .pf-ob-footrow{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:#9EA7B8;margin-top:2px}
      .pf-ob-resend{border:0;background:transparent;color:#F6EFDC;font:600 12px/1 Inter,sans-serif;cursor:pointer;padding:4px 0}
      .pf-ob-resend:hover:not(:disabled){color:#E8B93A}
      .pf-ob-resend:disabled{opacity:.5;cursor:not-allowed}
      .pf-ob-chead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;border-bottom:1px solid rgba(255,255,255,.1)}
      .pf-ob-clead{display:flex;align-items:center;gap:12px}
      .pf-ob-clead small{display:block;font-size:12px;color:#9EA7B8;margin-top:2px}
      .pf-ob-scroll{max-height:min(44vh,340px);overflow-y:auto;padding:18px 22px;display:grid;gap:14px;font-size:13px;line-height:1.6;color:#AEB7C8}
      .pf-ob-part{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#E8B93A;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1)}
      .pf-ob-doc h1,.pf-ob-doc h2,.pf-ob-doc h3{color:#F6EFDC;font-size:14px;margin:10px 0 4px}
      .pf-ob-doc p,.pf-ob-doc li{color:#AEB7C8;font-size:12.5px;line-height:1.58;margin:4px 0}
      .pf-ob-doc ul,.pf-ob-doc ol{margin:4px 0 8px;padding-left:18px}
      .pf-ob-doc a{color:#E8B93A}
      .pf-ob-shield{padding:11px 13px;border-radius:11px;background:rgba(232,185,58,.08);border:1px solid rgba(232,185,58,.28);color:#F6EFDC;font-size:12.5px;line-height:1.45}
      .pf-ob-cfoot{padding:14px 22px 18px;border-top:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.2);display:grid;gap:10px}
      .pf-ob-pill{padding:8px 12px;border-radius:9px;background:rgba(232,185,58,.08);border:1px solid rgba(232,185,58,.28);color:#E8B93A;font-size:12px;font-weight:600;text-align:center}
      .pf-ob-checks{display:grid;gap:7px}
      .pf-ob-chk{display:flex;align-items:center;gap:9px;font-size:13px;color:#F6EFDC;cursor:pointer}
      .pf-ob-chk input{width:17px;height:17px;accent-color:#E8B93A;cursor:pointer}
      .pf-ob-acts{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}
    `;
    document.head.appendChild(st);
  }

  async function cancelOnboardingSession(dlg) {
    try {
      await window.ProFitAPI.post("/auth/logout", {});
    } catch (_) {}
    try {
      sessionStorage.removeItem("profit-verified-session");
      sessionStorage.removeItem("pf-auth-just-logged-in");
    } catch (_) {}
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

  async function loadLegalSections() {
    if (legalCache) return legalCache;
    const fallback = {
      terms: "<h2>1. Acceptance of Terms</h2><p>By accessing ProFit, you agree to abide by Functional Fitness Gym policies, keep your account credentials secure, and use the portal strictly for your authorized role.</p>",
      privacy: "<h2>2. Data Privacy Act of 2012 (R.A. No. 10173)</h2><p>Functional Fitness Gym collects only the profile, attendance, and payment verification information required to manage gym operations and protect your account.</p>"
    };
    try {
      const [tRes, pRes] = await Promise.all([
        fetch("/terms", { cache: "no-store" }),
        fetch("/privacy", { cache: "no-store" })
      ]);
      const parseCard = async res => {
        if (!res.ok) return "";
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const card = doc.querySelector(".legal-card");
        return card ? card.innerHTML : "";
      };
      const [termsHtml, privacyHtml] = await Promise.all([parseCard(tRes), parseCard(pRes)]);
      legalCache = {
        terms: termsHtml || fallback.terms,
        privacy: privacyHtml || fallback.privacy
      };
    } catch (_) {
      legalCache = fallback;
    }
    return legalCache;
  }

  function ensureConsentDialog() {
    if (consentDialog) return consentDialog;
    ensureOnboardingStyles();
    const dlg = document.createElement("dialog");
    dlg.id = "pfOnboardingConsentDialog";
    dlg.className = "pf-ob-dlg is-wide";
    dlg.setAttribute("aria-labelledby", "pfObConsentTitle");
    dlg.innerHTML = `<form method="dialog" novalidate>
      <div class="pf-ob-chead">
        <div class="pf-ob-clead">
          <span class="pf-ob-badge" aria-hidden="true">&#128196;</span>
          <div>
            <h3 id="pfObConsentTitle" style="font-size:17px">Terms of Service &amp; Privacy Policy</h3>
            <small>ProFit · Functional Fitness Gym</small>
          </div>
        </div>
        <button type="button" class="pf-ob-x" id="pfObConsentClose" aria-label="Cancel">&times;</button>
      </div>
      <div class="pf-ob-scroll" id="pfObConsentScroll">
        <div class="pf-ob-part"><span>Part I &middot; Terms of Service</span><span>Functional Fitness Gym</span></div>
        <div class="pf-ob-doc" id="pfObTermsBody">Loading Terms of Service…</div>
        <div class="pf-ob-part"><span>Part II &middot; Privacy Policy</span><span>R.A. No. 10173 Compliant</span></div>
        <div class="pf-ob-doc" id="pfObPrivacyBody">Loading Privacy Policy…</div>
        <div class="pf-ob-shield">By clicking <strong>&ldquo;I Agree&rdquo;</strong> below, you confirm that you have read, understood, and accepted the ProFit Terms of Service and Privacy Policy.</div>
      </div>
      <div class="pf-ob-cfoot">
        <div class="pf-ob-pill">&#10003; Click &ldquo;I Agree&rdquo; to confirm and complete registration.</div>
        <div class="pf-ob-checks">
          <label class="pf-ob-chk" for="pfObAcceptTerms">
            <input type="checkbox" id="pfObAcceptTerms">
            <span>I agree to the Terms of Service</span>
          </label>
          <label class="pf-ob-chk" for="pfObAcceptPrivacy">
            <input type="checkbox" id="pfObAcceptPrivacy">
            <span>I agree to the Privacy Policy</span>
          </label>
        </div>
        <div class="pf-ob-alert" id="pfObConsentMsg" role="alert" hidden></div>
        <div class="pf-ob-acts">
          <button type="button" class="pf-ob-cancel" id="pfObConsentCancel">Cancel</button>
          <button type="submit" class="pf-ob-btn" id="pfObConsentSubmit">&#10003; I Agree</button>
        </div>
      </div>
    </form>`;
    document.body.appendChild(dlg);
    consentDialog = dlg;
    return dlg;
  }

  function openConsentModal(statusInfo) {
    const dlg = ensureConsentDialog();
    const tosChk = dlg.querySelector("#pfObAcceptTerms");
    const privChk = dlg.querySelector("#pfObAcceptPrivacy");
    const msgEl = dlg.querySelector("#pfObConsentMsg");
    const submitBtn = dlg.querySelector("#pfObConsentSubmit");
    const cancelBtn = dlg.querySelector("#pfObConsentCancel");
    const closeBtn = dlg.querySelector("#pfObConsentClose");
    const form = dlg.querySelector("form");

    if (tosChk) tosChk.checked = false;
    if (privChk) privChk.checked = false;
    msgEl.hidden = true;
    msgEl.textContent = "";
    submitBtn.disabled = false;
    submitBtn.innerHTML = "&#10003; I Agree";

    loadLegalSections().then(docs => {
      const tb = dlg.querySelector("#pfObTermsBody");
      const pb = dlg.querySelector("#pfObPrivacyBody");
      if (tb) tb.innerHTML = docs.terms;
      if (pb) pb.innerHTML = docs.privacy;
    });

    closeBtn.onclick = () => cancelOnboardingSession(dlg);
    cancelBtn.onclick = () => cancelOnboardingSession(dlg);
    dlg.oncancel = e => {
      e.preventDefault();
      cancelOnboardingSession(dlg);
    };

    form.onsubmit = async e => {
      e.preventDefault();
      msgEl.hidden = true;
      if (!tosChk?.checked || !privChk?.checked) {
        msgEl.hidden = false;
        msgEl.className = "pf-ob-alert";
        msgEl.textContent = "Please check both Terms of Service and Privacy Policy to continue.";
        return;
      }
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      submitBtn.textContent = "Completing registration…";
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
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.innerHTML = "&#10003; I Agree";
      }
    };

    if (typeof dlg.showModal === "function" && !dlg.open) {
      dlg.showModal();
    }
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
    } catch (_) {}
  }

  handleQueryCallback();
  checkPendingOnboardingSession();
  initGoogle();
})();
