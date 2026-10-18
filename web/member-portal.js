(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  const plans = {
    monthly: { label: "Monthly", price: 800, days: 30 },
    quarterly: { label: "Quarterly", price: 2100, days: 90 },
    annual: { label: "Annual", price: 7500, days: 365 }
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function showToast(msg, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; padding: 12px 20px;
      background: ${type === "success" ? "#4CAF50" : "#F44336"};
      color: white; border-radius: 999px; z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideUp 0.3s ease-out;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function saveDB() { try { DB.save(); } catch (e) { console.error("DB save failed:", e); } }

  if ($("year")) $("year").textContent = new Date().getFullYear();

  // ---------- Gym branding ----------
  (() => {
    let gym = { name: "ProFit", tagline: "FUNCTIONAL FITNESS", logo: "" };
    try { gym = { ...gym, ...(JSON.parse(localStorage.getItem("profit-gym-profile") || "null") || {}) }; } catch { /* storage blocked */ }
    const name = (gym.name || "ProFit").trim();
    if ($("portalGymName")) $("portalGymName").textContent = name;
    if ($("portalGymTag")) $("portalGymTag").textContent = (gym.tagline || "FUNCTIONAL FITNESS").trim();
    document.title = document.title.replace(/^ProFit/, name.split(" ")[0] || "ProFit");
    const img = $("portalLogoImg"), icon = $("portalLogoIcon");
    if (img && gym.logo) { img.src = gym.logo; img.hidden = false; if (icon) icon.hidden = true; }
    const brand = document.querySelector(".portal-brand");
    if (brand) brand.href = "member-portal.html";
  })();

  // ---------- Public contact details ----------
  // Rendered from ProFitGym so the portal, the trainer portal and the footer
  // never drift apart if the front desk's number changes.
  (() => {
    const g = window.ProFitGym;
    if (!g) return;
    const e = window.ProFitGym.esc;
    const phone = $("gymPhone");
    if (phone) { phone.textContent = e(g.phone); phone.href = "tel:" + String(g.phone).replace(/[^+\d]/g, ""); }
    const mail = $("gymEmail");
    if (mail) { mail.textContent = e(g.email); mail.href = "mailto:" + g.email; }
    const addr = $("gymAddress");
    if (addr) addr.textContent = e(g.address);
    const hours = $("gymHours");
    if (hours && Array.isArray(g.hours)) {
      hours.innerHTML = g.hours.map(row =>
        '<div><b>' + e(row.days) + '</b><span>' + e(row.time) + "</span></div>"
      ).join("");
    }
  })();

  // ---------- Pay-in details ----------
  // The selected method's own account block, so the payer can send first and
  // paste the reference second.
  (() => {
    const panel = $("payInPanel");
    const method = $("preferredPayment");
    if (!panel || !method || !window.ProFitGym) return;
    const e = window.ProFitGym.esc;
    const rows = Array.isArray(window.ProFitGym.payIn) ? window.ProFitGym.payIn : [];

    const paint = () => {
      // Match on label exactly; a method with no account block (cash) renders
      // its own instruction instead of falling through to the first entry.
      const chosen = rows.find(r => r.label === method.value);
      if (!chosen) { panel.hidden = true; return; }
      panel.hidden = false;
      // Cash has nowhere to send money, so "Send your X to" would be wrong —
      // each entry may supply its own lead instead.
      const lead = chosen.lead || ("Send your " + chosen.label + " to");
      // Account rows only for methods that actually have an account number.
      const acct = chosen.number
        ? '<div class="pay-in-row"><small>Account name</small><b>' + e(chosen.accountName) + "</b></div>" +
          '<div class="pay-in-row"><small>Account number</small>' +
            '<b class="pay-in-num">' + e(chosen.number) + "</b>" +
            '<button type="button" class="pay-in-copy" data-copy="' + e(chosen.number) + '" aria-label="Copy account number">' +
              '<i class="fa-regular fa-copy"></i> Copy</button></div>'
        : "";
      panel.innerHTML =
        '<div class="pay-in-head"><i class="fa-solid ' + e(chosen.icon) + '"></i>' +
          "<strong>" + e(lead) + "</strong></div>" +
        acct +
        '<p class="pay-in-note"><i class="fa-solid fa-circle-info"></i> ' + e(chosen.note) + "</p>";
    };

    panel.addEventListener("click", ev => {
      const btn = ev.target.closest(".pay-in-copy");
      if (!btn) return;
      const text = btn.dataset.copy || "";
      const done = () => {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
        btn.classList.add("is-ok");
        setTimeout(() => { btn.innerHTML = original; btn.classList.remove("is-ok"); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(done);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (err) { /* clipboard blocked */ }
        ta.remove(); done();
      }
    });

    method.addEventListener("change", paint);
    paint();
  })();

  // ---------- Staff-side bell ----------
  // sidebar.js owns the feed on staff pages; elsewhere this writes straight into
  // the same key, so the front desk sees a portal request on next load.
  function staffNotify(item) {
    if (window.ProFitNotify) { window.ProFitNotify.push(item); return; }
    try {
      const key = "profit-notifications-v1";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      const arr = Array.isArray(list) ? list : [];
      if (arr.some(n => n.id === item.id)) return;
      arr.unshift({ read: false, time: "Just now", ...item });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 40)));
    } catch { /* storage blocked */ }
  }

  const enrollForm = $("enrollForm"), result = $("portalResult");
  const money = value => "₱" + Number(value).toLocaleString("en-US");

  function selectedPlan() {
    const key = document.querySelector('input[name="plan"]:checked')?.value || "monthly";
    return { key, ...plans[key] };
  }

  function updatePlanSummary() {
    const current = selectedPlan();
    const summary = $("planSummary");
    if (!summary) return;
    summary.querySelector("strong").textContent = `${current.label} · ${money(current.price)}`;
    summary.querySelector("span").textContent = `${current.days} days access`;
    const amount = $("paymentAmount");
    if (amount && !amount.dataset.touched) amount.value = String(current.price);
    markSteps();
  }

  // ---- Progress rail -------------------------------------------------------
  // Three numbered stops above the form. A stop turns gold once that section
  // holds everything the gym needs, so the applicant can see how far in they
  // are and jump back to a section by clicking its stop.
  function sectionReady(step) {
    if (step === 1) return ["fullName", "email", "phone"].every(id => ($(id)?.value || "").trim().length > 1);
    if (step === 2) return !!document.querySelector('input[name="plan"]:checked');
    return ["paymentAmount", "paymentRef"].every(id => ($(id)?.value || "").trim().length > 0);
  }
  function markSteps() {
    const rail = $("portalSteps");
    if (!rail) return;
    let highest = 0;
    for (let s = 1; s <= 3; s++) if (sectionReady(s)) highest = s;
    rail.querySelectorAll(".portal-step").forEach(btn => {
      const step = Number(btn.dataset.step);
      const done = sectionReady(step);
      btn.classList.toggle("is-done", done && step <= highest);
      btn.classList.toggle("is-on", step === Math.min(highest + 1, 3));
      if (step === Math.min(highest + 1, 3)) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
    });
  }
  if (enrollForm) {
    enrollForm.addEventListener("input", markSteps);
    enrollForm.addEventListener("change", markSteps);
    $("portalSteps")?.addEventListener("click", e => {
      const btn = e.target.closest(".portal-step");
      if (!btn) return;
      const anchor = enrollForm.querySelector(`[data-step-anchor="${btn.dataset.step}"]`);
      if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "center" });
      // Focus the first empty field in that section so the keyboard follows.
      const field = enrollForm.querySelector(`[data-step-anchor="${btn.dataset.step}"]`)
        ?.nextElementSibling?.querySelector("input, select");
      if (field) setTimeout(() => field.focus({ preventScroll: true }), 320);
    });
    markSteps();
  }

  function showResult(title, message, isError = false) {
    result.hidden = false;
    result.classList.toggle("error", isError);
    result.replaceChildren();
    const strong = document.createElement("strong"), paragraph = document.createElement("p");
    strong.textContent = title;
    paragraph.textContent = message;
    result.append(strong, paragraph);
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearResult() { result.hidden = true; result.classList.remove("error"); }

  const MODE_COPY = {
    enroll: ["Start your membership", "Payment details go straight to the front desk for verification."],
    track: ["Track your request", "See where your application is and pick up your sign-in details."],
    login: ["Welcome back", "Access your membership account."]
  };

  window.showMode = function (mode) {
    const names = Object.keys(MODE_COPY);
    const active = names.includes(mode) ? mode : "enroll";
    names.forEach(name => { const el = $(`${name}Form`); if (el) el.hidden = name !== active; });

    ["enroll", "track", "login"].forEach(name => {
      const tab = $(`${name}Tab`);
      if (!tab) return;
      const on = name === active;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    $$("#portalNavLinks [data-goto]").forEach(btn => btn.classList.toggle("is-on", btn.dataset.goto === active));

    // The 1-2-3 enrollment rail only makes sense while enrolling — showing it
    // above the sign-in or track form read as leftover chrome.
    const steps = $("portalSteps");
    if (steps) steps.hidden = active !== "enroll";
    const stepsNote = document.querySelector(".portal-steps-note");
    if (stepsNote) stepsNote.hidden = active !== "enroll";

    $("portalHeading").textContent = MODE_COPY[active][0];
    $("portalSubheading").textContent = MODE_COPY[active][1];
    const icon = document.querySelector(".portal-heading-icon i");
    if (icon) icon.className = `fa-solid ${active === "track" ? "fa-magnifying-glass-chart" : active === "login" ? "fa-right-to-bracket" : "fa-user-plus"}`;
    clearResult();
    const track = $("trackResult");
    if (track && active !== "track") track.hidden = true;
    if (history.replaceState && location.hash !== `#${active}`) history.replaceState(null, "", `#${active}`);
  };

  // ---------- Signed-in state ----------
  const loggedInMember = localStorage.getItem("profit-member-logged-in");

  function memberSession() { try { return JSON.parse(loggedInMember || "null"); } catch { return null; } }

  function showMemberDashboard(member) {
    const dashboard = $("memberDashboard");
    const greeting = $("memberGreeting");
    const user = $("portalUser");
    const navLinks = $("portalNavLinks");
    const cta = $("portalCta");
    const shell = $("mainContent");
    const publicBlock = $("portalPublic");
    if (!dashboard) return;

    if (greeting) { greeting.hidden = false; greeting.textContent = `Hi, ${member.name.split(" ")[0]}`; }
    if (user) {
      user.hidden = false;
      const face = $("portalFace");
      if (face) face.textContent = (member.name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("") || "M").toUpperCase();
      const uname = $("portalUserName");
      if (uname) uname.textContent = member.name.split(" ")[0];
    }
    if (navLinks) navLinks.hidden = true;
    if (cta) cta.hidden = true;
    if (publicBlock) publicBlock.hidden = true;
    dashboard.hidden = false;
    shell?.classList.add("member-mode");
    document.body.classList.add("is-member");

    const record = DB.member(member.id) || member;
    const payment = DB.payments?.filter(p => p.memberId === member.id).sort((a, b) => b.date - a.date)[0];
    const daysLeft = record.end instanceof Date ? Math.max(0, daysBetween(new Date(), record.end)) : 0;
    const checkins = DB.checkins?.filter(c => c.memberId === member.id).length || 0;

    const statusDisplay = $("statusDisplay");
    if (statusDisplay) statusDisplay.innerHTML = `<span class="pp-pill is-ok">Active</span>`;

    const daysDisplay = $("daysDisplay");
    if (daysDisplay) daysDisplay.textContent = daysLeft > 0 ? daysLeft : "Expired";

    const checkinsDisplay = $("checkinsDisplay");
    if (checkinsDisplay) checkinsDisplay.textContent = checkins;

    const planDisplay = $("planDisplay");
    const planKey = payment?.plan || member.plan || "monthly";
    if (planDisplay) planDisplay.innerHTML = `<strong>${esc(plans[planKey]?.label || "Standard")} · ${money(plans[planKey]?.price || 800)}</strong>`;

    // Announcement the gym has published for members.
    if (window.ProFitAnnouncements) {
      const latest = window.ProFitAnnouncements.forAudience("Members")[0];
      if (latest && !$("dashNotice")) {
        const box = document.createElement("div");
        box.className = "pp-announce dash-announce";
        box.id = "dashNotice";
        box.innerHTML = `<div class="pp-announce-head"><span class="pp-chip">From the gym</span><small>${esc(window.ProFitAnnouncements.timeAgo(latest.at))}</small></div>
          <strong>${esc(latest.title)}</strong><p>${esc(latest.message)}</p>`;
        dashboard.prepend(box);
      }
    }
  }

  // ---------- Modes ----------
  ["enroll", "track", "login"].forEach(name => {
    const tab = $(`${name}Tab`);
    if (tab) tab.addEventListener("click", () => window.showMode(name));
  });
  $$("#portalNavLinks [data-goto]").forEach(btn => btn.addEventListener("click", () => window.showMode(btn.dataset.goto)));

  // The mobile drawer (#portalBurger) is wired once in pf-common.js, which both
  // portals load — it only depends on the shared #portalNav* ids.
  const trackCta = $("portalCta");
  if (trackCta) trackCta.addEventListener("click", e => { e.preventDefault(); window.showMode("track"); });

  // Theme (member-tabs.js bails out when #portalTheme already exists)
  (() => {
    const btn = $("portalTheme");
    if (!btn) return;
    let dark = true;
    try { dark = localStorage.getItem("theme") !== "light"; } catch { /* default dark */ }
    document.body.classList.toggle("dark", dark);
    const paint = () => {
      const d = document.body.classList.contains("dark");
      btn.innerHTML = `<i class="fa-solid ${d ? "fa-sun" : "fa-moon"}" aria-hidden="true"></i>`;
      btn.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode");
    };
    btn.addEventListener("click", () => {
      const d = !document.body.classList.contains("dark");
      document.body.classList.toggle("dark", d);
      try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* ignore */ }
      paint();
    });
    paint();
  })();

  // Header menu → the matching dashboard tab
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-member-goto]");
    if (!b) return;
    const map = { overview: "overview", profile: "personal", health: "health" };
    const tabName = map[b.dataset.memberGoto];
    if (tabName) {
      const tab = document.querySelector(`.member-detail-tab[data-tab="${tabName}"]`);
      if (tab) { tab.click(); tab.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    }
    location.href = `member-home.html#${b.dataset.memberGoto}`;
  });

  if (loggedInMember) showMemberDashboard(memberSession());

  $$('input[name="plan"]').forEach(input => input.addEventListener("change", () => {
    $$(".plan-option").forEach(card => card.classList.toggle("selected", card.querySelector("input").checked));
    const amount = $("paymentAmount");
    if (amount) amount.dataset.touched = "";
    updatePlanSummary();
  }));

  $$(".portal-field input, .portal-field select").forEach(field => field.addEventListener("input", () => {
    const error = field.closest(".portal-field")?.querySelector(".field-error");
    if (error) error.textContent = "";
    if (field.id === "paymentAmount") field.dataset.touched = "1";
  }));

  const toggle = $("togglePassword");
  if (toggle) toggle.addEventListener("click", () => {
    const field = $("loginPassword"), visible = field.type === "password";
    field.type = visible ? "text" : "password";
    toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    toggle.innerHTML = `<i class="fa-regular ${visible ? "fa-eye-slash" : "fa-eye"}"></i>`;
  });

  function trackingCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return `PFT-${out}`;
  }

  function validate(formData) {
    const name = String(formData.get("fullName") || "").trim().replace(/\s+/g, " ");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const plan = String(formData.get("plan") || "");
    const payment = String(formData.get("preferredPayment") || "");
    const paymentRef = String(formData.get("paymentRef") || "").trim();
    const paymentAmount = Number(String(formData.get("paymentAmount") || "").replace(/[^\d.]/g, ""));
    let valid = true;
    ["nameError", "emailError", "phoneError", "termsError", "refError"].forEach(id => { if ($(id)) $(id).textContent = ""; });
    if (name.length < 2 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) { $("nameError").textContent = "Enter a valid full name."; valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { $("emailError").textContent = "Enter a valid email address."; valid = false; }
    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) { $("phoneError").textContent = "Enter a valid mobile number."; valid = false; }
    if (!plans[plan] || !["GCash", "Cash", "Bank transfer"].includes(payment)) valid = false;
    if (paymentRef.length < 4 || paymentRef.length > 40) { if ($("refError")) $("refError").textContent = "Add the reference number the gym can match against."; valid = false; }
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) { if ($("refError") && !$("refError").textContent) $("refError").textContent = "Enter the peso amount you are paying."; valid = false; }
    if (!$("terms").checked) { $("termsError").textContent = "Please confirm the details and consent."; valid = false; }
    return { valid, name, email, phone, plan, payment, paymentRef, paymentAmount };
  }

  enrollForm.addEventListener("submit", async event => {
    event.preventDefault();
    clearResult();
    const data = validate(new FormData(enrollForm));
    if (!data.valid) return;
    const submit = enrollForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.querySelector("span").textContent = "Submitting…";
    try {
      if (!DB.applications) DB.applications = [];
      const appId = "app-" + Date.now();
      const ref = trackingCode();
      const createdAt = new Date().toISOString();
      DB.applications.push({
        id: appId,
        ref,
        name: data.name,
        email: data.email,
        phone: data.phone,
        plan: data.plan,
        payment: data.payment,
        paymentRef: data.paymentRef,
        amount: data.paymentAmount,
        paymentStatus: "awaiting-verification",
        status: "pending",
        createdAt,
        notes: ""
      });
      saveDB();

      staffNotify({
        id: "request:" + appId, type: "request", icon: "fa-file-signature",
        title: "New membership request",
        message: `${data.name} · ${plans[data.plan].label} · ${data.payment} ${money(data.paymentAmount)} — ref ${data.paymentRef}`,
        tag: "request:" + appId
      });

      result.hidden = false;
      result.classList.remove("error");
      result.innerHTML = `<strong>Request received — tracking code <span class="track-code">${esc(ref)}</span></strong>
        <p>We logged your ${esc(data.payment)} payment reference <strong>${esc(data.paymentRef)}</strong>. The front desk verifies it and approves in one step.</p>
        <p class="track-hint">Keep the code above. Open <button type="button" class="link-btn" onclick="showMode('track')">Track request</button> any time to see your status and your sign-in details.</p>`;
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });

      enrollForm.reset();
      $$(".plan-option").forEach(card => card.classList.toggle("selected", card.querySelector("input").checked));
      const amount = $("paymentAmount");
      if (amount) amount.dataset.touched = "";
      updatePlanSummary();
      try { localStorage.setItem("profit-last-track", ref); } catch { /* ignore */ }
    } catch (error) {
      showResult("Enrollment not submitted", error.message || "The enrollment service is unavailable. Your request was not saved.", true);
    } finally {
      submit.disabled = false;
      submit.querySelector("span").textContent = "Submit enrollment request";
    }
  });

  // ---------- Track request ----------
  const trackForm = $("trackForm"), trackResult = $("trackResult");
  if (trackForm) trackForm.addEventListener("submit", e => {
    e.preventDefault();
    const query = $("trackQuery").value.trim().toLowerCase();
    if (!query) return;
    const apps = DB.applications || [];
    const app = apps.find(a => String(a.ref || "").toLowerCase() === query)
      || apps.filter(a => String(a.email || "").toLowerCase() === query)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
    if (!app) {
      trackResult.hidden = false;
      trackResult.className = "track-result is-error";
      trackResult.innerHTML = `<strong>No request found</strong><p>Check the email address or tracking code and try again. New here? Switch to <button type="button" class="link-btn" onclick="showMode('enroll')">Enroll</button>.</p>`;
      return;
    }
    trackResult.hidden = false;
    trackResult.className = "track-result";
    const approved = app.status === "approved";
    const declined = app.status === "declined";
    const steps = [
      ["Request submitted", true, `${plans[app.plan]?.label || "Membership"} plan via ${app.payment}`],
      ["Payment reference captured", !!app.paymentRef, app.paymentRef ? `${app.payment} · ${money(app.amount || plans[app.plan]?.price || 0)}` : "Not provided"],
      ["Verified by the front desk", approved, approved ? `Payment matched on ${new Date(app.reviewedAt || Date.now()).toLocaleDateString()}` : "Usually within the day"],
      ["Membership activated", approved, approved ? "Your account is ready to sign in." : "Waiting on the review above"]
    ];
    trackResult.innerHTML = `
      <div class="track-head">
        <div><small>Tracking code</small><strong class="track-code">${esc(app.ref || "—")}</strong></div>
        <span class="pp-pill ${approved ? "is-ok" : declined ? "is-bad" : "is-warn"}">${approved ? "Approved" : declined ? "Declined" : "Under review"}</span>
      </div>
      <ol class="track-steps">
        ${steps.map(([label, done, note]) => `<li class="${done ? "is-done" : ""}"><span><i class="fa-solid ${done ? "fa-check" : "fa-clock"}"></i></span><div><strong>${esc(label)}</strong><small>${esc(note)}</small></div></li>`).join("")}
      </ol>
      ${approved ? `<div class="track-credentials">
          <strong><i class="fa-solid fa-key"></i> Your sign-in details</strong>
          <p>Everything you need to get in — this is the account the gym created for you.</p>
          <dl>
            <div><dt>Email</dt><dd>${esc(app.email)}</dd></div>
            <div><dt>Password</dt><dd>password</dd></div>
            <div><dt>Member ID</dt><dd>${esc((DB.members || []).find(m => String(m.email).toLowerCase() === String(app.email).toLowerCase())?.id || "—")}</dd></div>
          </dl>
          <button type="button" class="portal-submit" onclick="showMode('login')"><span>Sign in now</span><i class="fa-solid fa-arrow-right"></i></button>
        </div>` : ""}
      ${declined ? `<div class="track-credentials is-declined"><strong><i class="fa-solid fa-ban"></i> Not approved</strong><p>${esc(app.notes || "The gym could not approve this request. Call the front desk for details.")}</p></div>` : ""}
      ${!approved && !declined ? `<p class="track-hint">Signed up with a different email? Use the code above instead.</p>` : ""}`;
    trackResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // Login form
  const loginForm = $("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", e => {
      e.preventDefault();
      const email = $("loginEmail").value.trim();
      const password = $("loginPassword").value;
      const member = DB.members?.find(m => String(m.email).toLowerCase() === email.toLowerCase());
      if (!member || password !== "password") {
        showToast("Invalid email or password", "error");
        return;
      }
      localStorage.setItem("profit-member-logged-in", JSON.stringify(member));
      showToast("Welcome back! " + member.name, "success");
      setTimeout(() => location.reload(), 500);
    });
  }

  // Tab switching for member detail
  $$(".member-detail-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      $$(".member-detail-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
      $$(".member-detail-content").forEach(content => { content.hidden = content.dataset.content !== tabName; });
    });
  });

  // Logout
  window.logoutMember = function () {
    if (confirm("Are you sure you want to logout?")) {
      localStorage.removeItem("profit-member-logged-in");
      showToast("Signed out", "success");
      setTimeout(() => location.reload(), 500);
    }
  };

  updatePlanSummary();

  // Deep link: member-portal.html#track / #login / #enroll
  const initial = (location.hash || "").replace("#", "");
  window.showMode(["enroll", "track", "login"].includes(initial) ? initial : "enroll");
})();
