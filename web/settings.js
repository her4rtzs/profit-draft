// Settings page: clean grouped toggles, font size, and Owner-only live membership plan prices.
(() => {
  const $ = id => document.getElementById(id);
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    remove: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };

  const notice = $("settingsNotice");
  const flash = (msg, isErr) => {
    if (!notice) return;
    notice.hidden = false;
    notice.textContent = msg;
    notice.classList.toggle("error", !!isErr);
  };

  // ---- Dark Mode toggle ----
  const darkInput = $("prefDark");
  const syncDarkUI = () => {
    if (darkInput) darkInput.checked = document.body.classList.contains("dark");
  };
  syncDarkUI();
  darkInput?.addEventListener("change", () => {
    const wantDark = darkInput.checked;
    if (document.body.classList.contains("dark") !== wantDark) {
      $("themeToggle")?.click();
    } else {
      store.set("theme", wantDark ? "dark" : "light");
      if (!wantDark) store.set("pf-staff-explicit-light", "1");
      else store.remove("pf-staff-explicit-light");
    }
  });
  window.addEventListener("profit:theme-changed", syncDarkUI);

  // ---- Unread Badge toggle ----
  const badgeInput = $("prefBadge");
  if (badgeInput) {
    badgeInput.checked = store.get("pref-badge") !== "off";
    badgeInput.addEventListener("change", () => {
      const on = badgeInput.checked;
      store.set("pref-badge", on ? "on" : "off");
      document.body.classList.toggle("hide-notif-badge", !on);
    });
  }

  // ---- Font Size selector (functional across all Staff pages) ----
  const FONT_SCALE = { sm: "13.5px", md: "15px", lg: "16.5px" };
  const applyFontSize = size => {
    const key = FONT_SCALE[size] ? size : "md";
    document.documentElement.dataset.fontSize = key;
    document.documentElement.style.fontSize = FONT_SCALE[key];
    store.set("pf-font-size", key);
    document.querySelectorAll("[data-font-size]").forEach(btn => {
      const on = btn.dataset.fontSize === key;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", String(on));
    });
  };
  applyFontSize(store.get("pf-font-size") || "md");
  document.querySelectorAll("[data-font-size]").forEach(btn => {
    btn.addEventListener("click", () => applyFontSize(btn.dataset.fontSize));
  });

  // ---- Help & Support popup modal ----
  const helpModal = $("stHelpModal");
  const openHelp = () => { if (helpModal) helpModal.hidden = false; };
  const closeHelp = () => { if (helpModal) helpModal.hidden = true; };
  $("stHelpBtn")?.addEventListener("click", openHelp);
  $("stHelpClose")?.addEventListener("click", closeHelp);
  $("stHelpDone")?.addEventListener("click", closeHelp);
  helpModal?.addEventListener("click", e => { if (e.target === helpModal) closeHelp(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && helpModal && !helpModal.hidden) closeHelp(); });

  // ---- Change password shortcut ----
  $("stChangePwBtn")?.addEventListener("click", () => {
    if (typeof window.openChangePasswordModal === "function") {
      window.openChangePasswordModal();
    } else {
      document.querySelector("[data-change-password]")?.click();
    }
  });

  // ---- Owner-only Subscription Prices & Edit Gym Profile ----
  const pricesToggle = $("stPricesToggle");
  const pricesDrawer = $("planPricesDrawer");
  const pricesForm = $("planPricesForm");
  const saveBtn = $("savePlanPricesBtn");

  const gymToggle = $("stGymToggle");
  const gymDrawer = $("gymProfileDrawer");
  const gymForm = $("gymProfileForm");
  const saveGymBtn = $("saveGymProfileBtn");

  const isOwnerRole = () => {
    const r = String(window.ProFitAuth?.role || window.ProFitAuth?.user?.role || "").toUpperCase();
    if (r) return r === "OWNER" || r === "ADMIN";
    try {
      const raw = sessionStorage.getItem("profit-verified-session")
        || sessionStorage.getItem("profit-demo-session")
        || localStorage.getItem("profit-demo-session");
      const parsed = raw ? JSON.parse(raw) : null;
      const sr = String(parsed?.role || "").toUpperCase();
      return sr === "OWNER" || sr === "ADMIN";
    } catch {
      return false;
    }
  };

  const wireDrawer = (btn, drawer) => {
    if (!btn || !drawer) return;
    btn.addEventListener("click", () => {
      const open = drawer.hidden;
      drawer.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
  };
  wireDrawer(pricesToggle, pricesDrawer);
  wireDrawer(gymToggle, gymDrawer);

  const revealOwnerControls = () => {
    if (pricesToggle) pricesToggle.hidden = false;
    if (gymToggle) gymToggle.hidden = false;
  };

  const paintPlanInputs = plans => {
    if (!plans) return;
    const setVal = (id, key) => {
      const el = $(id);
      if (el && plans[key]) el.value = String(plans[key].price ?? "");
    };
    setVal("priceDaily", "daily");
    setVal("priceMonthly", "monthly");
    setVal("priceQuarterly", "quarterly");
    setVal("priceAnnual", "annual");
    const sub = $("stPricesSub");
    if (sub && plans.daily && plans.monthly && plans.quarterly && plans.annual) {
      sub.classList.remove("st-skel");
      const fmtP = n => "₱" + Number(n).toLocaleString("en-PH");
      sub.textContent = `Day ${fmtP(plans.daily.price)} · Monthly ${fmtP(plans.monthly.price)} · Quarterly ${fmtP(plans.quarterly.price)} · Annual ${fmtP(plans.annual.price)}`;
    }
    updatePriceSavings();
  };

  const updatePriceSavings = () => {
    const el = $("stPriceSavings");
    if (!el) return;
    const m = parseInt($("priceMonthly")?.value || "0", 10);
    const q = parseInt($("priceQuarterly")?.value || "0", 10);
    const save = 3 * m - q;
    el.textContent = save > 0
      ? `Quarterly saves members ₱${save.toLocaleString("en-PH")} compared with paying monthly. Saving updates prices across all pages.`
      : "Saving updates membership prices across the landing page, enrollment, cashier desk, and payments.";
  };
  ["priceMonthly", "priceQuarterly"].forEach(id => $(id)?.addEventListener("input", updatePriceSavings));

  const broadcastPlanUpdate = plans => {
    if (!plans) return;
    store.set("profit-plan-prices-v1", JSON.stringify(plans));
    if (window.PLANS) {
      ["daily", "monthly", "quarterly", "annual"].forEach(k => {
        if (window.PLANS[k] && plans[k]) window.PLANS[k].price = Number(plans[k].price);
      });
      window.dispatchEvent(new CustomEvent("profit:plans-updated", { detail: window.PLANS }));
    }
  };

  async function initOwnerControls() {
    if (isOwnerRole()) {
      revealOwnerControls();
      if (window.PLANS) paintPlanInputs(window.PLANS);
    }
    try {
      const res = await window.ProFitAPI.get("/staff/plans/", { silent: true });
      if (res && res.plans) {
        revealOwnerControls();
        paintPlanInputs(res.plans);
        broadcastPlanUpdate(res.plans);
      }
    } catch {
      if (isOwnerRole()) {
        // Fallback to public read if local DB is not yet migrated or in demo mode
        try {
          const pub = await window.ProFitAPI.get("/plans/", { silent: true });
          if (pub && pub.plans) paintPlanInputs(pub.plans);
        } catch { /* keep cached/default values */ }
      }
    }
  }

  pricesForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = {
      daily: parseInt($("priceDaily")?.value || "", 10),
      monthly: parseInt($("priceMonthly")?.value || "", 10),
      quarterly: parseInt($("priceQuarterly")?.value || "", 10),
      annual: parseInt($("priceAnnual")?.value || "", 10),
    };
    if (Object.values(payload).some(v => !Number.isFinite(v) || v < 1 || v > 500000)) {
      flash("Enter valid whole-peso amounts between 1 and 500,000.", true);
      return;
    }
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
    }
    try {
      const res = await window.ProFitAPI.patch("/staff/plans/", { plans: payload });
      if (res && res.plans) {
        paintPlanInputs(res.plans);
        broadcastPlanUpdate(res.plans);
      }
      flash("Subscription prices saved and updated across all pages.", false);
    } catch (err) {
      flash(err?.message || "Could not save subscription prices.", true);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save subscription prices";
      }
    }
  });

  // ---- Gym Profile form ----
  const DEFAULT_GYM = {
    name: "Functional Fitness Gym",
    tagline: "FUNCTIONAL FITNESS",
    phone: "0912 261 7663",
    address: "Alfonso, Calabarzon · Luksuhin-Mangas Road",
    opens: "07:00",
    closes: "21:00",
  };
  const updateOpenPill = (opens, closes) => {
    const pill = $("stGymOpenPill");
    if (!pill) return;
    const toMins = v => { const [h, m] = String(v || "07:00").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const isOpen = cur >= toMins(opens) && cur < toMins(closes);
    pill.textContent = isOpen ? "Open now" : "Closed now";
    pill.classList.toggle("is-closed", !isOpen);
  };
  const loadGymProfile = () => {
    let saved = {};
    try { saved = JSON.parse(store.get("profit-gym-profile") || "null") || {}; } catch { saved = {}; }
    const g = { ...DEFAULT_GYM, ...saved };
    if ($("gymNameInput")) $("gymNameInput").value = g.name || "";
    if ($("gymTaglineInput")) $("gymTaglineInput").value = g.tagline || "";
    if ($("gymPhoneInput")) $("gymPhoneInput").value = g.phone || "";
    if ($("gymAddressInput")) $("gymAddressInput").value = g.address || "";
    if ($("gymOpensInput")) $("gymOpensInput").value = g.opens || "07:00";
    if ($("gymClosesInput")) $("gymClosesInput").value = g.closes || "21:00";
    if ($("stGymSub")) $("stGymSub").textContent = g.name || "Functional Fitness Gym";
    updateOpenPill(g.opens || "07:00", g.closes || "21:00");
  };
  loadGymProfile();

  gymForm?.addEventListener("submit", e => {
    e.preventDefault();
    const name = ($("gymNameInput")?.value || "").trim();
    const tagline = ($("gymTaglineInput")?.value || "").trim() || "FUNCTIONAL FITNESS";
    const phone = ($("gymPhoneInput")?.value || "").trim();
    const address = ($("gymAddressInput")?.value || "").trim();
    const opens = ($("gymOpensInput")?.value || "07:00").trim();
    const closes = ($("gymClosesInput")?.value || "21:00").trim();
    if (!name) {
      flash("Enter a gym name.", true);
      return;
    }
    if (saveGymBtn) {
      saveGymBtn.disabled = true;
      saveGymBtn.textContent = "Saving...";
    }
    try {
      let existing = {};
      try { existing = JSON.parse(store.get("profit-gym-profile") || "null") || {}; } catch { existing = {}; }
      const updated = { ...existing, name, tagline, phone, address, opens, closes };
      store.set("profit-gym-profile", JSON.stringify(updated));
      document.querySelectorAll("[data-gym-name]").forEach(el => { el.textContent = name; });
      if ($("stGymSub")) $("stGymSub").textContent = name;
      updateOpenPill(opens, closes);
      const foot = document.querySelector(".st-foot");
      if (foot) foot.textContent = `ProFit · ${name}`;
      const sideTag = document.querySelector(".sidebar .headertxt small");
      if (sideTag) sideTag.textContent = tagline;
      flash("Gym profile saved.", false);
    } finally {
      if (saveGymBtn) {
        saveGymBtn.disabled = false;
        saveGymBtn.textContent = "Save gym profile";
      }
    }
  });

  // ---- Sticky section jump-nav scrollspy ----
  const navLinks = [...document.querySelectorAll("#stSideNav a[data-sec]")];
  if (navLinks.length && "IntersectionObserver" in window) {
    const setOn = id => navLinks.forEach(a => a.classList.toggle("on", a.dataset.sec === id));
    navLinks.forEach(a => a.addEventListener("click", () => setOn(a.dataset.sec)));
    const obs = new IntersectionObserver(entries => {
      entries.forEach(ent => { if (ent.isIntersecting) setOn(ent.target.id); });
    }, { rootMargin: "-25% 0px -60% 0px" });
    navLinks.forEach(a => { const sec = $(a.dataset.sec); if (sec) obs.observe(sec); });
  }

  initOwnerControls();
  window.addEventListener("profit-auth-ready", initOwnerControls);
})();
