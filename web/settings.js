// Settings page: switches and the color theme stay in sync with the header controls and persist in this browser.
(() => {
  const $ = id => document.getElementById(id);
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } }
  };
  const ACCENTS = { gold: "Gold", spotify: "Spotify", ocean: "Ocean", indigo: "Indigo", coral: "Coral", emerald: "Emerald", sunset: "Sunset" };
  const DEFAULT_ACCENT = "gold";
  const DEFAULTS = { prefDark: true, prefCompact: false, prefBadge: true };
  const current = {
    prefDark: store.get("theme") !== "light",
    prefCompact: store.get("sidebar") === "closed",
    prefBadge: store.get("pref-badge") !== "off"
  };
  let accent = ACCENTS[store.get("pp-accent")] ? store.get("pp-accent") : DEFAULT_ACCENT;
  document.documentElement.dataset.accent = accent;
  const onOff = v => (v ? "On" : "Off");

  // Each switch reuses the control the rest of the app already uses, so state never drifts.
  const apply = {
    prefDark: on => { if (document.body.classList.contains("dark") !== on) $("themeToggle")?.click(); },
    prefCompact: on => {
      const sidebar = document.querySelector(".sidebar");
      if (sidebar && sidebar.classList.contains("close") !== on) document.getElementById("sidebarToggle")?.click();
    },
    prefBadge: on => {
      store.set("pref-badge", on ? "on" : "off");
      document.body.classList.toggle("hide-notif-badge", !on);
    }
  };

  function paint() {
    Object.keys(DEFAULTS).forEach(id => {
      const input = $(id);
      if (input) input.checked = current[id];
      const chip = document.querySelector(`[data-default-for="${id}"]`);
      if (chip) chip.textContent = `Default: ${onOff(DEFAULTS[id])}`;
      const reset = document.querySelector(`[data-reset="${id}"]`);
      if (reset) reset.disabled = current[id] === DEFAULTS[id];
    });
    const chip = document.querySelector('[data-default-for="prefAccent"]');
    if (chip) chip.textContent = `Default: ${ACCENTS[DEFAULT_ACCENT]}`;
    const reset = document.querySelector('[data-reset="prefAccent"]');
    if (reset) reset.disabled = accent === DEFAULT_ACCENT;
    document.querySelectorAll("[data-accent-pick]").forEach(b => {
      const on = b.dataset.accentPick === accent;
      b.setAttribute("aria-checked", String(on));
      b.classList.toggle("active", on);
    });
  }

  function set(id, on) {
    current[id] = on;
    apply[id](on);
    paint();
  }
  function setAccent(name) {
    accent = name;
    document.documentElement.dataset.accent = name;
    store.set("pp-accent", name);
    paint();
  }

  Object.keys(DEFAULTS).forEach(id => {
    $(id)?.addEventListener("change", e => set(id, e.target.checked));
    document.querySelector(`[data-reset="${id}"]`)?.addEventListener("click", () => set(id, DEFAULTS[id]));
  });
  document.querySelectorAll("[data-accent-pick]").forEach(b => b.addEventListener("click", () => setAccent(b.dataset.accentPick)));
  document.querySelector('[data-reset="prefAccent"]')?.addEventListener("click", () => setAccent(DEFAULT_ACCENT));

  $("openNotifications")?.addEventListener("click", () => $("notificationToggle")?.click());

  // ---------- Gym profile ----------
  const GYM_KEY = "profit-gym-profile";
  const GYM_DEFAULTS = { name: "ProFit", tagline: "FUNCTIONAL FITNESS", hours: "", address: "", phone: "", logo: "" };
  const readGym = () => {
    try { return { ...GYM_DEFAULTS, ...(JSON.parse(store.get(GYM_KEY) || "null") || {}) }; }
    catch { return { ...GYM_DEFAULTS }; }
  };

  function initGymProfile() {
    const form = $("gymProfileForm");
    if (!form) return;
    const notice = $("settingsNotice");
    const flash = (msg, bad) => {
      if (!notice) return;
      notice.hidden = false;
      notice.textContent = msg;
      notice.classList.toggle("error", !!bad);
    };
    let g = readGym();
    const paint = () => {
      form.gymName.value = g.name;
      form.gymTagline.value = g.tagline;
      form.gymHours.value = g.hours;
      form.gymAddress.value = g.address;
      form.gymPhone.value = g.phone;
      const img = $("gymLogoPreview")?.querySelector("img");
      if (img) img.src = g.logo || "logo.jpg";
      if ($("gymLogoClear")) $("gymLogoClear").disabled = !g.logo;
    };
    // Persist, then let layout.js repaint the sidebar and header ribbon.
    const save = next => {
      g = { ...g, ...next };
      try { store.set(GYM_KEY, JSON.stringify(g)); } catch { flash("Browser storage is full, so the logo was not saved.", true); return; }
      paint();
      window.dispatchEvent(new CustomEvent("profit-gym-changed", { detail: g }));
    };

    $("gymLogo")?.addEventListener("change", e => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (!/^image\//.test(file.type)) return flash("Choose an image file for the logo.", true);
      if (file.size > 900 * 1024) return flash("That image is over 900 KB. Please pick a smaller one.", true);
      const reader = new FileReader();
      reader.onload = () => { save({ logo: String(reader.result) }); flash("Logo updated. It is live across ProFit."); };
      reader.onerror = () => flash("That image could not be read. Try another one.", true);
      reader.readAsDataURL(file);
    });
    $("gymLogoClear")?.addEventListener("click", () => { save({ logo: "" }); flash("Default logo restored."); });

    form.addEventListener("submit", e => {
      e.preventDefault();
      save({
        name: form.gymName.value.trim() || GYM_DEFAULTS.name,
        tagline: form.gymTagline.value.trim() || GYM_DEFAULTS.tagline,
        hours: form.gymHours.value.trim(),
        address: form.gymAddress.value.trim(),
        phone: form.gymPhone.value.trim()
      });
      flash("Gym profile saved.");
    });
    paint();
  }

  $("resetDemo")?.addEventListener("click", () => {
    if (!confirm("Reset all workspace records and notifications stored in this browser? This cannot be undone.")) return;
    DB.reset();
    try { localStorage.removeItem("profit-notifications-v1"); } catch { /* ignore */ }
    location.reload();
  });
  // ---------- Announcements ----------
  // One publish reaches three audiences at once: this feed, the member portal
  // and the trainer portal, plus the staff notification bell.
  function initAnnouncements() {
    const form = $("announceForm"), list = $("announceList");
    if (!form || !list) return;
    const notice = $("settingsNotice");
    const flash = (msg, bad) => { if (!notice) return; notice.hidden = false; notice.textContent = msg; notice.classList.toggle("error", !!bad); };

    const paint = () => {
      const items = window.ProFitAnnouncements.all();
      list.innerHTML = items.length ? items.map(item => `<article class="pp-announce">
          <div class="pp-announce-head">
            <span class="pp-chip">${window.ProFitAnnouncements.esc(item.audience)}</span>
            <small>${window.ProFitAnnouncements.esc(window.ProFitAnnouncements.timeAgo(item.at))}</small>
          </div>
          <strong>${window.ProFitAnnouncements.esc(item.title)}</strong>
          <p>${window.ProFitAnnouncements.esc(item.message)}</p>
          <button class="pp-icon-btn" type="button" data-ann-del="${item.id}" aria-label="Delete announcement" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </article>`).join("") : `<p class="pp-muted">Nothing published yet. Announcements show up on the member and trainer portals.</p>`;
    };

    form.addEventListener("submit", e => {
      e.preventDefault();
      const title = $("annTitle").value.trim(), message = $("annMessage").value.trim();
      if (!title || !message) return flash("Add a title and a message before publishing.", true);
      const item = window.ProFitAnnouncements.publish({ title, message, audience: $("annAudience").value });
      if (!item) return flash("That announcement could not be saved.", true);
      form.reset();
      paint();
      if (window.ProFitNotifications) {
        window.ProFitNotifications.push({
          type: "announce", icon: "fa-bullhorn",
          title: `Announcement published · ${item.audience}`,
          message: item.title, tag: "announce:" + item.id, time: "Just now"
        });
      }
      flash(`Published to ${item.audience.toLowerCase()}. Members and trainers will see it on their portals.`);
    });

    list.addEventListener("click", e => {
      const del = e.target.closest("[data-ann-del]");
      if (!del) return;
      window.ProFitAnnouncements.remove(del.dataset.annDel);
      paint();
      flash("Announcement removed.");
    });

    paint();
  }

  paint();
  initGymProfile();
  initAnnouncements();
})();
