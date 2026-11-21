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
    payments: "Receipts & GCash claims",
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

      new MutationObserver(() => {
        const cur = sidebar.querySelector('.nav-link[aria-selected="true"]');
        if (cur) syncTopTitle(cur.dataset.tab);
      }).observe(sidebar, { attributes: true, subtree: true, attributeFilter: ["aria-selected"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
