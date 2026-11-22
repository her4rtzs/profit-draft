/* ProFit Member Portal — Staff/Admin-style sidebar shell controller. */
(() => {
  const $ = id => document.getElementById(id);

  const TAB_TITLES = {
    overview: "Dashboard",
    membership: "My Membership",
    attendance: "Attendance History",
    payments: "Payment History",
    schedule: "Schedule",
    announcements: "Announcements & Notifications",
    diary: "Training diary",
    health: "Health & goals",
    profile: "My profile",
    settings: "Settings"
  };

  function setDrawer(open) {
    document.body.classList.toggle("member-side-drawer", !!open);
    const scrim = $("memberSideBackdrop");
    if (scrim) {
      scrim.hidden = !open;
      scrim.classList.toggle("on", !!open);
    }
    const menuBtn = $("memberMenuBtn");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", String(!!open));
  }

  function initCollapse() {
    try {
      if (localStorage.getItem("pf-side-collapsed") === "1") {
        document.body.classList.add("member-side-collapsed");
      }
    } catch { /* ignore */ }

    const btn = $("memberCollapseBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const collapsed = !document.body.classList.contains("member-side-collapsed");
      document.body.classList.toggle("member-side-collapsed", collapsed);
      try { localStorage.setItem("pf-side-collapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
    });
  }

  function initAccountMenu() {
    const card = $("memberSideUserCard");
    const accBtn = $("memberAccountBtn");
    const menu = $("memberSideAccountMenu");
    if (!card || !menu) return;

    const setOpen = open => {
      menu.classList.toggle("is-open", open);
      card.setAttribute("aria-expanded", String(open));
      if (accBtn) accBtn.setAttribute("aria-expanded", String(open));
    };

    const toggle = e => {
      if (e.target.closest(".side-account-menu")) return;
      e.stopPropagation();
      setOpen(!menu.classList.contains("is-open"));
    };

    card.addEventListener("click", toggle);
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(e);
      }
    });

    menu.addEventListener("click", e => {
      const item = e.target.closest("[data-member-goto], [data-logout]");
      if (!item) return;
      setOpen(false);
      setDrawer(false);
    });

    document.addEventListener("click", e => {
      if (menu.classList.contains("is-open") && !e.target.closest("#memberSideUserCard")) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (menu.classList.contains("is-open")) setOpen(false);
        if (document.body.classList.contains("member-side-drawer")) setDrawer(false);
      }
    });
  }

  const TAB_SUBTITLES = {
    overview: "Your gym overview",
    membership: "Plan & renewal",
    attendance: "Your check-in log",
    payments: "Receipts & payments",
    schedule: "Classes & bookings",
    announcements: "Gym notices & updates",
    diary: "Your training log",
    health: "Body metrics & goals",
    profile: "Your account details",
    settings: "App preferences"
  };

  function syncTopTitle(tabName) {
    const titleEl = $("memberTopTitle");
    if (titleEl && tabName) {
      titleEl.textContent = TAB_TITLES[tabName] || "Dashboard";
    }
    const eyebrowEl = $("mbTabEyebrow");
    if (eyebrowEl && tabName) {
      eyebrowEl.textContent = TAB_SUBTITLES[tabName] || "Member portal";
    }
    document.querySelectorAll("#memberSideAccountMenu [data-member-goto]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.memberGoto === tabName);
    });
    const moreTabs = new Set(["payments", "announcements", "diary", "health", "profile", "settings"]);
    document.querySelectorAll("#memberMobTabs [data-mob-tab]").forEach(btn => {
      btn.classList.toggle("on", btn.dataset.mobTab === tabName);
    });
    const moreBtn = $("memberMobMoreBtn");
    if (moreBtn) moreBtn.classList.toggle("on", moreTabs.has(tabName));
    document.querySelectorAll("#memberMobSheet [data-mob-tab]").forEach(btn => {
      btn.classList.toggle("sel", btn.dataset.mobTab === tabName);
    });
  }

  function initMobileBottomNav() {
    if ($("memberMobTabs")) return;
    const primary = [
      { id: "overview", label: "Home", icon: "fa-solid fa-house" },
      { id: "membership", label: "Plan", icon: "fa-regular fa-id-card" },
      { id: "attendance", label: "Check-ins", icon: "fa-regular fa-calendar-check" },
      { id: "schedule", label: "Schedule", icon: "fa-regular fa-clock" }
    ];
    const moreItems = [
      { id: "payments", label: "Payments", icon: "fa-solid fa-wallet" },
      { id: "announcements", label: "Announcements", icon: "fa-solid fa-bullhorn" },
      { id: "diary", label: "Training diary", icon: "fa-solid fa-book-open" },
      { id: "health", label: "Health & goals", icon: "fa-solid fa-heart-pulse" },
      { id: "profile", label: "My profile", icon: "fa-regular fa-user" },
      { id: "settings", label: "Settings", icon: "fa-solid fa-sliders" }
    ];

    const tabs = document.createElement("nav");
    tabs.id = "memberMobTabs";
    tabs.className = "pf-mob-tabs";
    tabs.setAttribute("aria-label", "Mobile navigation");
    tabs.innerHTML = primary.map(it =>
      `<button type="button" class="pf-mob-tab${it.id === "overview" ? " on" : ""}" data-mob-tab="${it.id}"><i class="${it.icon}" aria-hidden="true"></i><span>${it.label}</span></button>`
    ).join("") +
      `<button type="button" class="pf-mob-tab" id="memberMobMoreBtn" aria-expanded="false" aria-controls="memberMobSheet"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i><span>More</span></button>`;
    document.body.appendChild(tabs);

    const backdrop = document.createElement("div");
    backdrop.id = "memberMobBackdrop";
    backdrop.className = "pf-mob-backdrop";
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    const sheet = document.createElement("div");
    sheet.id = "memberMobSheet";
    sheet.className = "pf-mob-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "More pages");
    sheet.innerHTML = `<div class="pf-mob-sheet-bar" aria-hidden="true"></div><div class="pf-mob-sheet-chips">${moreItems.map(it =>
      `<button type="button" class="pf-mob-chip" data-mob-tab="${it.id}"><i class="${it.icon}" aria-hidden="true"></i><span>${it.label}</span></button>`
    ).join("")}<button type="button" class="pf-mob-chip is-danger" data-logout><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Log out</span></button></div>`;
    document.body.appendChild(sheet);

    const moreBtn = $("memberMobMoreBtn");
    const setSheet = open => {
      sheet.classList.toggle("on", open);
      backdrop.hidden = !open;
      backdrop.classList.toggle("on", open);
      moreBtn?.setAttribute("aria-expanded", String(open));
    };

    const goTab = tabId => {
      setSheet(false);
      const navTarget = document.querySelector(`.member-sidebar [data-member-tab="${tabId}"], .member-sidebar [data-member-goto="${tabId}"]`);
      if (navTarget) {
        navTarget.click();
      } else {
        location.hash = "#" + tabId;
      }
      syncTopTitle(tabId);
    };

    tabs.addEventListener("click", e => {
      const btn = e.target.closest("[data-mob-tab]");
      if (btn) { goTab(btn.dataset.mobTab); return; }
      if (e.target.closest("#memberMobMoreBtn")) {
        e.stopPropagation();
        setSheet(!sheet.classList.contains("on"));
      }
    });
    sheet.addEventListener("click", e => {
      const btn = e.target.closest("[data-mob-tab]");
      if (btn) { goTab(btn.dataset.mobTab); return; }
      if (e.target.closest("[data-logout]")) setSheet(false);
    });
    backdrop.addEventListener("click", () => setSheet(false));
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && sheet.classList.contains("on")) setSheet(false);
    });
  }

  function syncAnnouncementBadge() {
    const topCount = $("homeAnnounceCount");
    const sideBadge = $("sideAnnounceBadge");
    if (!topCount || !sideBadge) return;

    const update = () => {
      const n = parseInt(topCount.textContent || "0", 10) || 0;
      sideBadge.textContent = String(n);
      sideBadge.hidden = n <= 0;
    };

    update();
    new MutationObserver(update).observe(topCount, { childList: true, characterData: true, subtree: true });
  }

  function init() {
    initCollapse();
    initAccountMenu();
    initMobileBottomNav();
    syncAnnouncementBadge();

    $("memberMenuBtn")?.addEventListener("click", () => {
      setDrawer(!document.body.classList.contains("member-side-drawer"));
    });
    $("memberSideBackdrop")?.addEventListener("click", () => setDrawer(false));

    $("memberTopAvatar")?.addEventListener("click", () => {
      document.querySelector('.member-sidebar .nav-link[data-tab="profile"]')?.click();
    });
    $("allNotificationsLink")?.addEventListener("click", e => {
      e.preventDefault();
      const panel = $("notificationPanel");
      const toggle = $("notificationToggle");
      if (panel) panel.hidden = true;
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      document.querySelector('.member-sidebar .nav-link[data-tab="announcements"]')?.click();
    });

    const syncFromVisiblePanel = () => {
      const visible = document.querySelector("[data-panel]:not([hidden])");
      if (visible && visible.dataset.panel) {
        syncTopTitle(visible.dataset.panel);
        return;
      }
      const h = location.hash.slice(1);
      if (h && TAB_TITLES[h]) syncTopTitle(h);
    };

    document.addEventListener("click", e => {
      const gotoBtn = e.target.closest("[data-member-goto]");
      if (gotoBtn && gotoBtn.dataset.memberGoto) {
        syncTopTitle(gotoBtn.dataset.memberGoto);
      }
    });
    window.addEventListener("hashchange", syncFromVisiblePanel);
    setTimeout(syncFromVisiblePanel, 0);

    const sidebar = $("memberSidebar");
    if (sidebar) {
      sidebar.addEventListener("click", e => {
        const link = e.target.closest(".nav-link[data-tab]");
        if (!link) return;
        syncTopTitle(link.dataset.tab);
        setDrawer(false);
      });

      const active = sidebar.querySelector('.nav-link[aria-selected="true"]');
      if (active) syncTopTitle(active.dataset.tab);
      syncFromVisiblePanel();

      new MutationObserver(() => {
        syncFromVisiblePanel();
      }).observe(document.querySelector(".member-content") || document.body, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
