/* Member 8-step onboarding wizard: Welcome, 6 Faceless Avatars, About You,
   Goals, Body Stats (optional), Emergency Contact (optional), Review, Done. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const STEPS = [
    { key: "welcome", label: "Welcome" },
    { key: "avatar", label: "Avatar" },
    { key: "about", label: "About you" },
    { key: "goals", label: "Goals" },
    { key: "stats", label: "Body stats" },
    { key: "emergency", label: "Emergency contact" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" }
  ];

  const GOAL_OPTIONS = [
    "Build strength",
    "Lose weight",
    "Improve endurance",
    "Stay active",
    "Mobility & recovery"
  ];
  const LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced"];
  const TIME_OPTIONS = ["Morning", "Afternoon", "Evening"];

  const state = {
    step: 0,
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

  const card = $("obCard");
  const backBtn = $("obBackBtn");
  const progBar = $("obProgBar");
  const progFill = $("obProgFill");
  const stepLabel = $("obStepLabel");
  const stepCount = $("obStepCount");
  const globalErr = $("obGlobalErr");

  function validFullName(raw) {
    const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
    return parts.length >= 2 && /[A-Za-z]/.test(parts[0]) && /[A-Za-z]/.test(parts[parts.length - 1]);
  }
  function validPhoneDigits(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    return d.length >= 10 && d.length <= 13;
  }

  function updateProgress() {
    const idx = state.step;
    const pct = Math.round(((idx + 1) / STEPS.length) * 100);
    progFill.style.width = `${pct}%`;
    progBar.setAttribute("aria-valuenow", String(idx + 1));
    stepLabel.textContent = STEPS[idx].label;
    stepCount.textContent = `Step ${idx + 1} of ${STEPS.length}`;
    backBtn.hidden = idx === 0 || idx === STEPS.length - 1;
    globalErr.textContent = "";
  }

  function render() {
    updateProgress();
    const key = STEPS[state.step].key;

    if (key === "welcome") {
      const trialEndText = state.trialEndsAt
        ? `Your 7-day free trial runs until ${new Date(state.trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
        : "Your 7-day free trial has started.";
      card.innerHTML = `
        <div class="ob-head">
          <h1>Welcome to ProFit</h1>
          <p>Let's set up your member profile in a few quick steps so the gym team can support your training.</p>
        </div>
        <div class="ob-trial-banner">
          <i class="fa-solid fa-sparkles" aria-hidden="true"></i>
          <div>
            <strong>7-day free trial active</strong>
            <span>${esc(trialEndText)} You can explore your profile now, and pay in cash at the desk or submit a GCash claim whenever you are ready to activate full gym access.</span>
          </div>
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-primary" id="obNextBtn">Get started <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </div>`;
      $("obNextBtn").addEventListener("click", () => { state.step = 1; render(); });
      return;
    }

    if (key === "avatar") {
      const presets = window.ProFitAvatar ? window.ProFitAvatar.presets() : [];
      card.innerHTML = `
        <div class="ob-head">
          <h1>Pick your avatar</h1>
          <p>Choose one of six faceless avatars for your profile. You can always upload a photo later.</p>
        </div>
        <div class="ob-avatar-grid" role="radiogroup" aria-label="Choose an avatar">
          ${presets.map(p => `
            <button type="button" class="ob-ava-btn ${state.avatarId === p.id ? "is-selected" : ""}" data-ava="${esc(p.id)}" role="radio" aria-checked="${state.avatarId === p.id}">
              <img src="${p.dataUrl}" alt="${esc(p.label)} avatar">
              <span>${esc(p.label)}</span>
            </button>`).join("")}
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-primary" id="obNextBtn">Next <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </div>`;
      card.querySelectorAll("[data-ava]").forEach(btn => {
        btn.addEventListener("click", () => {
          state.avatarId = btn.dataset.ava;
          render();
        });
      });
      $("obNextBtn").addEventListener("click", () => { state.step = 2; render(); });
      return;
    }

    if (key === "about") {
      card.innerHTML = `
        <div class="ob-head">
          <h1>About you</h1>
          <p>Confirm your real full name and mobile number so front desk staff can verify your account.</p>
        </div>
        <div class="ob-field">
          <label for="obName">Full name</label>
          <input type="text" id="obName" value="${esc(state.name)}" placeholder="e.g. Maria Santos" autocomplete="name">
          <span class="ob-field-err" id="obNameErr"></span>
        </div>
        <div class="ob-field">
          <label for="obPhone">Mobile number</label>
          <input type="tel" id="obPhone" value="${esc(state.phone)}" placeholder="e.g. 09171234567" autocomplete="tel">
          <span class="ob-field-hint">10 to 13 digits (e.g. 09171234567 or +639171234567).</span>
          <span class="ob-field-err" id="obPhoneErr"></span>
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-primary" id="obNextBtn">Next <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </div>`;
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
        state.step = 3;
        render();
      });
      return;
    }

    if (key === "goals") {
      card.innerHTML = `
        <div class="ob-head">
          <h1>Your training goals</h1>
          <p>Tell us what you want to focus on, your experience level, and when you prefer to train.</p>
        </div>
        <div class="ob-field">
          <label>Fitness goals (pick at least one)</label>
          <div class="ob-chips" id="obGoalChips">
            ${GOAL_OPTIONS.map(g => `<button type="button" class="ob-chip ${state.goals.includes(g) ? "is-on" : ""}" data-goal="${esc(g)}">${esc(g)}</button>`).join("")}
          </div>
          <span class="ob-field-err" id="obGoalsErr"></span>
        </div>
        <div class="ob-field">
          <label>Experience level</label>
          <div class="ob-chips" id="obLevelChips">
            ${LEVEL_OPTIONS.map(l => `<button type="button" class="ob-chip ${state.experienceLevel === l ? "is-on" : ""}" data-level="${esc(l)}">${esc(l)}</button>`).join("")}
          </div>
          <span class="ob-field-err" id="obLevelErr"></span>
        </div>
        <div class="ob-field">
          <label>Best time to train</label>
          <div class="ob-chips" id="obTimeChips">
            ${TIME_OPTIONS.map(t => `<button type="button" class="ob-chip ${state.bestTime === t ? "is-on" : ""}" data-time="${esc(t)}">${esc(t)}</button>`).join("")}
          </div>
          <span class="ob-field-err" id="obTimeErr"></span>
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-primary" id="obNextBtn">Next <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </div>`;
      card.querySelectorAll("[data-goal]").forEach(btn => {
        btn.addEventListener("click", () => {
          const val = btn.dataset.goal;
          if (state.goals.includes(val)) state.goals = state.goals.filter(x => x !== val);
          else state.goals = [...state.goals, val];
          render();
        });
      });
      card.querySelectorAll("[data-level]").forEach(btn => {
        btn.addEventListener("click", () => { state.experienceLevel = btn.dataset.level; render(); });
      });
      card.querySelectorAll("[data-time]").forEach(btn => {
        btn.addEventListener("click", () => { state.bestTime = btn.dataset.time; render(); });
      });
      $("obNextBtn").addEventListener("click", () => {
        let ok = true;
        $("obGoalsErr").textContent = state.goals.length ? "" : "Pick at least one goal.";
        if (!state.goals.length) ok = false;
        $("obLevelErr").textContent = state.experienceLevel ? "" : "Choose your experience level.";
        if (!state.experienceLevel) ok = false;
        $("obTimeErr").textContent = state.bestTime ? "" : "Choose your preferred training time.";
        if (!state.bestTime) ok = false;
        if (!ok) return;
        state.step = 4;
        render();
      });
      return;
    }

    if (key === "stats") {
      card.innerHTML = `
        <div class="ob-head">
          <h1>Body stats <small style="font-weight:500;color:var(--muted);font-size:.85rem">(Optional)</small></h1>
          <p>Share your height, weight, or any injuries/health notes so coaches can keep your workouts safe.</p>
        </div>
        <div class="ob-row">
          <div class="ob-field">
            <label for="obHeight">Height (cm)</label>
            <input type="number" id="obHeight" min="80" max="250" step="0.1" value="${esc(state.heightCm)}" placeholder="e.g. 168">
            <span class="ob-field-err" id="obHeightErr"></span>
          </div>
          <div class="ob-field">
            <label for="obWeight">Weight (kg)</label>
            <input type="number" id="obWeight" min="25" max="300" step="0.1" value="${esc(state.weightKg)}" placeholder="e.g. 64">
            <span class="ob-field-err" id="obWeightErr"></span>
          </div>
        </div>
        <div class="ob-field">
          <label for="obHealth">Health notes</label>
          <span class="ob-staff-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> Visible to gym staff only</span>
          <textarea id="obHealth" maxlength="500" placeholder="Allergies, past injuries, or conditions your trainer should know about...">${esc(state.healthNotes)}</textarea>
          <span class="ob-field-err" id="obHealthErr"></span>
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-ghost" id="obSkipBtn">Skip</button>
          <button type="button" class="ob-btn ob-btn-primary" id="obNextBtn">Next <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </div>`;
      $("obSkipBtn").addEventListener("click", () => { state.step = 5; render(); });
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
        state.step = 5;
        render();
      });
      return;
    }

    if (key === "emergency") {
      card.innerHTML = `
        <div class="ob-head">
          <h1>Emergency contact <small style="font-weight:500;color:var(--muted);font-size:.85rem">(Optional)</small></h1>
          <p>Who should the gym contact in case of an emergency?</p>
        </div>
        <div class="ob-field">
          <label for="obEmgName">Contact name</label>
          <input type="text" id="obEmgName" value="${esc(state.emergencyName)}" placeholder="e.g. Elena Santos">
          <span class="ob-field-err" id="obEmgNameErr"></span>
        </div>
        <div class="ob-field">
          <label for="obEmgPhone">Contact phone</label>
          <input type="tel" id="obEmgPhone" value="${esc(state.emergencyPhone)}" placeholder="e.g. 09171234567">
          <span class="ob-field-err" id="obEmgPhoneErr"></span>
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-ghost" id="obSkipBtn">Skip</button>
          <button type="button" class="ob-btn ob-btn-primary" id="obNextBtn">Review <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </div>`;
      $("obSkipBtn").addEventListener("click", () => { state.step = 6; render(); });
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
        state.step = 6;
        render();
      });
      return;
    }

    if (key === "review") {
      const avaSrc = window.ProFitAvatar ? window.ProFitAvatar.resolve(state.avatarId, state.name) : "";
      const statsSummary = [
        state.heightCm ? `${state.heightCm} cm` : "",
        state.weightKg ? `${state.weightKg} kg` : "",
        state.healthNotes ? `Health notes: ${state.healthNotes}` : ""
      ].filter(Boolean).join(" · ") || "Skipped";
      const emgSummary = state.emergencyName || state.emergencyPhone
        ? [state.emergencyName, state.emergencyPhone].filter(Boolean).join(" · ")
        : "Skipped";

      card.innerHTML = `
        <div class="ob-head">
          <h1>Review your details</h1>
          <p>Check your setup below. You can edit any section before saving.</p>
        </div>
        <div class="ob-review-list">
          <div class="ob-review-item">
            <div style="display:flex;align-items:center;gap:12px">
              ${avaSrc ? `<img src="${avaSrc}" alt="" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--border)">` : ""}
              <div><h3>Avatar</h3><p>Selected faceless avatar</p></div>
            </div>
            <button type="button" class="ob-edit-btn" data-jump="1">Edit</button>
          </div>
          <div class="ob-review-item">
            <div><h3>About you</h3><p>${esc(state.name)}<br>${esc(state.phone)}</p></div>
            <button type="button" class="ob-edit-btn" data-jump="2">Edit</button>
          </div>
          <div class="ob-review-item">
            <div><h3>Goals</h3><p>${esc(state.goals.join(", "))}<br>${esc(state.experienceLevel)} · Best time: ${esc(state.bestTime)}</p></div>
            <button type="button" class="ob-edit-btn" data-jump="3">Edit</button>
          </div>
          <div class="ob-review-item">
            <div><h3>Body stats</h3><p>${esc(statsSummary)}</p></div>
            <button type="button" class="ob-edit-btn" data-jump="4">Edit</button>
          </div>
          <div class="ob-review-item">
            <div><h3>Emergency contact</h3><p>${esc(emgSummary)}</p></div>
            <button type="button" class="ob-edit-btn" data-jump="5">Edit</button>
          </div>
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-primary" id="obSaveBtn">Save and finish</button>
        </div>`;

      card.querySelectorAll("[data-jump]").forEach(btn => {
        btn.addEventListener("click", () => {
          state.step = Number(btn.dataset.jump);
          render();
        });
      });
      $("obSaveBtn").addEventListener("click", saveOnboarding);
      return;
    }

    if (key === "done") {
      const avaSrc = window.ProFitAvatar ? window.ProFitAvatar.resolve(state.avatarId, state.name) : "";
      card.innerHTML = `
        <div class="ob-done">
          ${avaSrc ? `<img src="${avaSrc}" alt="">` : ""}
          <div class="ob-head">
            <h1>You're all set, ${esc(state.name.split(" ")[0] || "Member")}!</h1>
            <p>Your profile and avatar are saved. You can now open your member dashboard.</p>
          </div>
        </div>
        <div class="ob-actions">
          <a href="/member-home" class="ob-btn ob-btn-primary" id="obOpenDashboard">Open my dashboard <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
        </div>`;
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
      state.step = 7;
      render();
    } catch (err) {
      globalErr.textContent = err.message || "Could not save your setup. Please try again.";
      if (btn) { btn.disabled = false; btn.textContent = "Save and finish"; }
    }
  }

  backBtn.addEventListener("click", () => {
    if (state.step > 0 && state.step < STEPS.length - 1) {
      state.step -= 1;
      render();
    }
  });

  async function bootstrap() {
    try {
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
