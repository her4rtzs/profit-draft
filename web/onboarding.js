/* Member 8-step onboarding wizard inspired by ProFit's Kettle mascot flow.
   Automatically adapts to desktop/mobile with no role/view switcher. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const STEPS = [
    { key: "welcome", label: "Welcome", say: "Hi, I'm Kettle! Let's set up your profile." },
    { key: "avatar", label: "Avatar", say: "Pick an avatar to get started. You can change it later." },
    { key: "about", label: "About you", say: "Nice! What should we call you?" },
    { key: "goals", label: "Goals", say: "What are you training for?" },
    { key: "stats", label: "Body stats", say: "Tell us about you. This step is optional." },
    { key: "emergency", label: "Emergency contact", say: "Who should we call in an emergency?" },
    { key: "review", label: "Review", say: "Look good? Check your details before saving." },
    { key: "done", label: "Finish", say: "You're all set. Let's lift!" }
  ];

  const GOALS = [
    { label: "Build strength", icon: "fa-dumbbell" },
    { label: "Lose weight", icon: "fa-fire" },
    { label: "Improve endurance", icon: "fa-person-running" },
    { label: "Stay active", icon: "fa-bolt" },
    { label: "Mobility & recovery", icon: "fa-heart-pulse" }
  ];
  const LEVELS = ["Beginner", "Intermediate", "Advanced"];
  const TIMES = [
    { label: "Morning", icon: "fa-sun" },
    { label: "Afternoon", icon: "fa-cloud-sun" },
    { label: "Evening", icon: "fa-moon" }
  ];

  const state = {
    step: 0,
    returnToReview: false,
    avatarId: "av-1",
    name: "",
    phone: "",
    goals: [],
    experienceLevel: "",
    bestTime: "",
    heightCm: "",
    weightKg: "",
    healthNotes: "",
    emergencyName: "",
    emergencyPhone: "",
    trialEndsAt: ""
  };

  const stepList = $("obStepList");
  const backBtn = $("obBackBtn");
  const progBar = $("obProgBar");
  const progFill = $("obProgFill");
  const bubble = $("obBubble");
  const mainEl = $("obMain");
  const footEl = $("obFoot");
  const globalErr = $("obGlobalErr");

  function validFullName(raw) {
    const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
    return parts.length >= 2 && /[A-Za-z]/.test(parts[0]) && /[A-Za-z]/.test(parts[parts.length - 1]);
  }
  function validPhoneDigits(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    return d.length >= 10 && d.length <= 13;
  }

  function advance() {
    if (state.returnToReview && STEPS[state.step].key !== "review") {
      state.returnToReview = false;
      state.step = STEPS.findIndex(s => s.key === "review");
    } else {
      state.step = Math.min(STEPS.length - 1, state.step + 1);
    }
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatTrialEnd() {
    if (!state.trialEndsAt) return "Your 7-day free trial has started.";
    const d = new Date(state.trialEndsAt);
    if (Number.isNaN(d.getTime())) return "Your 7-day free trial has started.";
    return `Your trial runs until ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`;
  }

  function renderSidebarAndChrome() {
    const idx = state.step;
    const pct = Math.max(8, Math.round(((idx + 1) / STEPS.length) * 100));
    progFill.style.width = `${idx === STEPS.length - 1 ? 100 : pct}%`;
    progBar.setAttribute("aria-valuenow", String(idx + 1));
    backBtn.hidden = idx === 0 || idx === STEPS.length - 1;
    bubble.textContent = STEPS[idx].say;
    globalErr.textContent = "";

    if (stepList) {
      stepList.innerHTML = STEPS.map((s, i) => {
        const cls = i < idx ? "is-done" : i === idx ? "is-on" : "";
        return `<li class="${cls}"><b>${i < idx ? "&#10003;" : i + 1}</b>${esc(s.label)}</li>`;
      }).join("");
    }
  }

  function render() {
    renderSidebarAndChrome();
    const key = STEPS[state.step].key;

    if (key === "welcome") {
      mainEl.innerHTML = `
        <h1>Welcome to ProFit</h1>
        <p class="ob-sub">A few quick steps so the gym team can support your training.</p>
        <div class="ob-trial">
          <b>7-day free trial active</b><br>
          ${esc(formatTrialEnd())} Explore your profile now, then pay in cash at the desk or submit a GCash claim whenever you are ready to activate full gym access.
        </div>`;
      footEl.innerHTML = `<button type="button" class="ob-btn" id="obNextBtn">Get started</button>`;
      $("obNextBtn").addEventListener("click", advance);
      return;
    }

    if (key === "avatar") {
      const presets = window.ProFitAvatar ? window.ProFitAvatar.presets() : [];
      mainEl.innerHTML = `
        <h1>Pick your avatar</h1>
        <p class="ob-sub">Choose one of six faceless avatars. You can upload a photo later in your profile.</p>
        <div class="ob-grid3 ob-av-grid" role="radiogroup" aria-label="Choose an avatar">
          ${presets.map(p => `
            <button type="button" class="ob-tile ob-av ${state.avatarId === p.id ? "is-sel ob-pop" : ""}" data-ava="${esc(p.id)}" role="radio" aria-checked="${state.avatarId === p.id}">
              <img src="${p.dataUrl}" alt="${esc(p.label)} avatar">
              <span>${esc(p.label)}</span>
            </button>`).join("")}
        </div>`;
      footEl.innerHTML = `<button type="button" class="ob-btn" id="obNextBtn">${state.returnToReview ? "Back to review" : "Next"}</button>`;
      mainEl.querySelectorAll("[data-ava]").forEach(btn => {
        btn.addEventListener("click", () => { state.avatarId = btn.dataset.ava; render(); });
      });
      $("obNextBtn").addEventListener("click", advance);
      return;
    }

    if (key === "about") {
      mainEl.innerHTML = `
        <h1>About you</h1>
        <p class="ob-sub">This is how coaches and front desk staff will recognize your account.</p>
        <div class="ob-field">
          <label for="obName">Full name</label>
          <input type="text" id="obName" value="${esc(state.name)}" placeholder="e.g. Maria Santos" autocomplete="name">
          <span class="ob-err" id="obNameErr"></span>
        </div>
        <div class="ob-field">
          <label for="obPhone">Mobile number</label>
          <input type="tel" id="obPhone" value="${esc(state.phone)}" placeholder="e.g. 09171234567" autocomplete="tel">
          <span class="ob-err" id="obPhoneErr"></span>
        </div>`;
      footEl.innerHTML = `<button type="button" class="ob-btn" id="obNextBtn">${state.returnToReview ? "Back to review" : "Next"}</button>`;
      $("obNextBtn").addEventListener("click", () => {
        const nameVal = $("obName").value.trim();
        const phoneVal = $("obPhone").value.trim();
        let ok = true;
        if (!validFullName(nameVal)) {
          $("obNameErr").textContent = "Enter your first and last name.";
          $("obName").classList.add("is-invalid");
          ok = false;
        } else {
          $("obNameErr").textContent = "";
          $("obName").classList.remove("is-invalid");
        }
        if (!validPhoneDigits(phoneVal)) {
          $("obPhoneErr").textContent = "Enter a valid mobile number (10 to 13 digits).";
          $("obPhone").classList.add("is-invalid");
          ok = false;
        } else {
          $("obPhoneErr").textContent = "";
          $("obPhone").classList.remove("is-invalid");
        }
        if (!ok) return;
        state.name = nameVal;
        state.phone = phoneVal;
        advance();
      });
      return;
    }

    if (key === "goals") {
      mainEl.innerHTML = `
        <div class="ob-lbl" style="margin-top:0">Fitness goals (pick at least one)</div>
        <div class="ob-grid2">
          ${GOALS.map(g => `
            <button type="button" class="ob-tile ${state.goals.includes(g.label) ? "is-sel" : ""}" data-goal="${esc(g.label)}">
              <i class="fa-solid ${g.icon} ob-ico" aria-hidden="true"></i>
              <span>${esc(g.label)}</span>
            </button>`).join("")}
        </div>
        <span class="ob-err" id="obGoalsErr"></span>

        <div class="ob-lbl">Experience level</div>
        <div class="ob-row">
          ${LEVELS.map(l => `<button type="button" class="ob-chip ${state.experienceLevel === l ? "is-sel" : ""}" data-level="${esc(l)}">${esc(l)}</button>`).join("")}
        </div>
        <span class="ob-err" id="obLevelErr"></span>

        <div class="ob-lbl">Best time to train</div>
        <div class="ob-grid3">
          ${TIMES.map(t => `
            <button type="button" class="ob-tile ${state.bestTime === t.label ? "is-sel" : ""}" data-time="${esc(t.label)}">
              <i class="fa-solid ${t.icon} ob-ico" aria-hidden="true"></i>
              <span>${esc(t.label)}</span>
            </button>`).join("")}
        </div>
        <span class="ob-err" id="obTimeErr"></span>`;
      footEl.innerHTML = `<button type="button" class="ob-btn" id="obNextBtn">${state.returnToReview ? "Back to review" : "Next"}</button>`;

      mainEl.querySelectorAll("[data-goal]").forEach(btn => {
        btn.addEventListener("click", () => {
          const v = btn.dataset.goal;
          state.goals = state.goals.includes(v) ? state.goals.filter(x => x !== v) : [...state.goals, v];
          render();
        });
      });
      mainEl.querySelectorAll("[data-level]").forEach(btn => {
        btn.addEventListener("click", () => { state.experienceLevel = btn.dataset.level; render(); });
      });
      mainEl.querySelectorAll("[data-time]").forEach(btn => {
        btn.addEventListener("click", () => { state.bestTime = btn.dataset.time; render(); });
      });
      $("obNextBtn").addEventListener("click", () => {
        let ok = true;
        $("obGoalsErr").textContent = state.goals.length ? "" : "Pick at least one goal.";
        if (!state.goals.length) ok = false;
        $("obLevelErr").textContent = state.experienceLevel ? "" : "Choose your experience level.";
        if (!state.experienceLevel) ok = false;
        $("obTimeErr").textContent = state.bestTime ? "" : "Choose your best time to train.";
        if (!state.bestTime) ok = false;
        if (ok) advance();
      });
      return;
    }

    if (key === "stats") {
      mainEl.innerHTML = `
        <h1>Body stats</h1>
        <p class="ob-sub">Optional details to help coaches tailor your training safely.</p>
        <div class="ob-grid2">
          <div class="ob-field">
            <label for="obHeight">Height (cm)</label>
            <input type="number" id="obHeight" min="80" max="250" step="0.1" value="${esc(state.heightCm)}" placeholder="e.g. 165">
            <span class="ob-err" id="obHeightErr"></span>
          </div>
          <div class="ob-field">
            <label for="obWeight">Weight (kg)</label>
            <input type="number" id="obWeight" min="25" max="300" step="0.1" value="${esc(state.weightKg)}" placeholder="e.g. 60">
            <span class="ob-err" id="obWeightErr"></span>
          </div>
        </div>
        <div class="ob-field">
          <label for="obHealth">Health notes</label>
          <span class="ob-hint"><i class="fa-solid fa-lock" aria-hidden="true"></i> Visible to gym staff only</span>
          <textarea id="obHealth" maxlength="500" placeholder="Allergies, past injuries, or conditions your trainer should know about...">${esc(state.healthNotes)}</textarea>
        </div>`;
      footEl.innerHTML = `
        <button type="button" class="ob-btn is-ghost" id="obSkipBtn">Skip</button>
        <button type="button" class="ob-btn" id="obNextBtn">${state.returnToReview ? "Back to review" : "Next"}</button>`;
      $("obSkipBtn").addEventListener("click", () => {
        state.heightCm = ""; state.weightKg = ""; state.healthNotes = "";
        advance();
      });
      $("obNextBtn").addEventListener("click", () => {
        const h = $("obHeight").value.trim();
        const w = $("obWeight").value.trim();
        let ok = true;
        if (h && (Number(h) < 80 || Number(h) > 250)) {
          $("obHeightErr").textContent = "Enter a height between 80 and 250 cm.";
          ok = false;
        } else $("obHeightErr").textContent = "";
        if (w && (Number(w) < 25 || Number(w) > 300)) {
          $("obWeightErr").textContent = "Enter a weight between 25 and 300 kg.";
          ok = false;
        } else $("obWeightErr").textContent = "";
        if (!ok) return;
        state.heightCm = h;
        state.weightKg = w;
        state.healthNotes = $("obHealth").value.trim();
        advance();
      });
      return;
    }

    if (key === "emergency") {
      mainEl.innerHTML = `
        <h1>Emergency contact</h1>
        <p class="ob-sub">Optional — someone the gym can reach if needed.</p>
        <div class="ob-field">
          <label for="obEmgName">Contact name</label>
          <input type="text" id="obEmgName" value="${esc(state.emergencyName)}" placeholder="e.g. Elena Santos">
        </div>
        <div class="ob-field">
          <label for="obEmgPhone">Contact number</label>
          <input type="tel" id="obEmgPhone" value="${esc(state.emergencyPhone)}" placeholder="e.g. 09171234567">
          <span class="ob-err" id="obEmgPhoneErr"></span>
        </div>`;
      footEl.innerHTML = `
        <button type="button" class="ob-btn is-ghost" id="obSkipBtn">Skip</button>
        <button type="button" class="ob-btn" id="obNextBtn">${state.returnToReview ? "Back to review" : "Review"}</button>`;
      $("obSkipBtn").addEventListener("click", () => {
        state.emergencyName = ""; state.emergencyPhone = "";
        advance();
      });
      $("obNextBtn").addEventListener("click", () => {
        const en = $("obEmgName").value.trim();
        const ep = $("obEmgPhone").value.trim();
        if (ep && !validPhoneDigits(ep)) {
          $("obEmgPhoneErr").textContent = "Enter a valid phone number (10 to 13 digits).";
          return;
        }
        $("obEmgPhoneErr").textContent = "";
        state.emergencyName = en;
        state.emergencyPhone = ep;
        advance();
      });
      return;
    }

    if (key === "review") {
      const presets = window.ProFitAvatar ? window.ProFitAvatar.presets() : [];
      const chosen = presets.find(p => p.id === state.avatarId) || presets[0];
      const avaSrc = chosen ? chosen.dataUrl : "";
      const statsText = [
        state.heightCm ? `${state.heightCm} cm` : "",
        state.weightKg ? `${state.weightKg} kg` : "",
        state.healthNotes ? state.healthNotes : ""
      ].filter(Boolean).join(" &middot; ") || "Skipped";
      const emgText = state.emergencyName || state.emergencyPhone
        ? [esc(state.emergencyName), esc(state.emergencyPhone)].filter(Boolean).join(" &middot; ")
        : "Skipped";

      mainEl.innerHTML = `
        <h1>Review your details</h1>
        <p class="ob-sub">You can edit any section before saving.</p>
        <div class="ob-rev">
          <div class="ob-rev-ic">${avaSrc ? `<img src="${avaSrc}" alt="">` : '<i class="fa-solid fa-user"></i>'}</div>
          <div class="ob-rev-copy"><small>Avatar</small><b>${esc(chosen ? chosen.label : "Selected avatar")}</b></div>
          <button type="button" class="ob-edit" data-jump="1">Edit</button>
        </div>
        <div class="ob-rev">
          <div class="ob-rev-ic"><i class="fa-solid fa-user" aria-hidden="true"></i></div>
          <div class="ob-rev-copy"><small>About you</small><b>${esc(state.name)}<br>${esc(state.phone)}</b></div>
          <button type="button" class="ob-edit" data-jump="2">Edit</button>
        </div>
        <div class="ob-rev">
          <div class="ob-rev-ic"><i class="fa-solid fa-bullseye" aria-hidden="true"></i></div>
          <div class="ob-rev-copy"><small>Goals</small><b>${esc(state.goals.join(", "))}<br>${esc(state.experienceLevel)} &middot; ${esc(state.bestTime)}</b></div>
          <button type="button" class="ob-edit" data-jump="3">Edit</button>
        </div>
        <div class="ob-rev">
          <div class="ob-rev-ic"><i class="fa-solid fa-ruler-vertical" aria-hidden="true"></i></div>
          <div class="ob-rev-copy"><small>Body stats</small><b>${statsText}</b></div>
          <button type="button" class="ob-edit" data-jump="4">Edit</button>
        </div>
        <div class="ob-rev">
          <div class="ob-rev-ic"><i class="fa-solid fa-kit-medical" aria-hidden="true"></i></div>
          <div class="ob-rev-copy"><small>Emergency contact</small><b>${emgText}</b></div>
          <button type="button" class="ob-edit" data-jump="5">Edit</button>
        </div>`;
      footEl.innerHTML = `<button type="button" class="ob-btn" id="obSaveBtn">Save and finish</button>`;

      mainEl.querySelectorAll("[data-jump]").forEach(btn => {
        btn.addEventListener("click", () => {
          state.returnToReview = true;
          state.step = Number(btn.dataset.jump);
          render();
        });
      });
      $("obSaveBtn").addEventListener("click", saveOnboarding);
      return;
    }

    if (key === "done") {
      const avaSrc = window.ProFitAvatar ? window.ProFitAvatar.resolve(state.avatarId, state.name) : "";
      const firstName = (state.name.split(" ")[0] || "Member").trim();
      mainEl.innerHTML = `
        <div class="ob-big">
          ${avaSrc ? `<img class="ob-pop" src="${avaSrc}" alt="">` : ""}
          <h1 style="margin-top:14px">Welcome, ${esc(firstName)}!</h1>
          <div class="ob-tag"><i class="fa-solid fa-check" aria-hidden="true"></i> Profile saved</div>
          <div class="ob-trial">
            <b>Your free trial is live.</b><br>
            ${esc(formatTrialEnd())} Open your dashboard to explore your profile or submit a GCash payment claim anytime.
          </div>
        </div>`;
      footEl.innerHTML = `<a href="/member-home" class="ob-btn" id="obOpenDashboard">Open my dashboard</a>`;
    }
  }

  async function saveOnboarding() {
    const btn = $("obSaveBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
    globalErr.textContent = "";
    try {
      await window.ProFitAPI.patch("/member/me/", {
        name: state.name,
        phone: state.phone,
        photo: state.avatarId,
        onboarding: {
          goals: state.goals,
          experience_level: state.experienceLevel,
          best_time: state.bestTime,
          height_cm: state.heightCm,
          weight_kg: state.weightKg,
          health_notes: state.healthNotes,
          emergency_name: state.emergencyName,
          emergency_phone: state.emergencyPhone,
          completed: true
        }
      });
      // Sync verified browser session so /member-home opens directly without bouncing to /login.
      try {
        sessionStorage.removeItem("profit-logged-out");
        const sess = await window.ProFitAPI.get("/auth/session/");
        if (sess && sess.user) {
          sessionStorage.setItem("profit-verified-session", JSON.stringify(sess.user));
          if (window.ProFitAuth) window.ProFitAuth.user = sess.user;
        }
      } catch (_) {}
      state.returnToReview = false;
      state.step = STEPS.length - 1;
      render();
    } catch (err) {
      globalErr.textContent = err.message || "Could not save your setup. Please try again.";
      if (btn) { btn.disabled = false; btn.textContent = "Save and finish"; }
    }
  }

  backBtn.addEventListener("click", () => {
    if (state.step > 0 && state.step < STEPS.length - 1) {
      state.returnToReview = false;
      state.step -= 1;
      render();
    }
  });

  async function bootstrap() {
    try {
      sessionStorage.removeItem("profit-logged-out");
      const data = await window.ProFitAPI.get("/member/me/");
      const u = data?.user || {};
      const m = data?.membership || {};
      const ob = u.onboarding || {};
      if (u.name && !u.name.includes("@")) state.name = u.name;
      if (u.phone) state.phone = u.phone;
      if (u.photo && /^av-[1-6]$/.test(u.photo)) state.avatarId = u.photo;
      if (m.trialEndsAt) state.trialEndsAt = m.trialEndsAt;
      if (Array.isArray(ob.goals)) state.goals = ob.goals;
      if (ob.experience_level) state.experienceLevel = ob.experience_level;
      if (ob.best_time) state.bestTime = ob.best_time;
      if (ob.height_cm) state.heightCm = ob.height_cm;
      if (ob.weight_kg) state.weightKg = ob.weight_kg;
      if (ob.health_notes) state.healthNotes = ob.health_notes;
      if (ob.emergency_name) state.emergencyName = ob.emergency_name;
      if (ob.emergency_phone) state.emergencyPhone = ob.emergency_phone;
    } catch (_) {
      // Keep blank defaults if /member/me fails before auth completes
    } finally {
      render();
    }
  }

  bootstrap();
})();
