// ProFit member tools: diary with photos, health and goals, and profile editing.
// Diary and health data are kept per member in this browser. Photos are stored in IndexedDB via PF.media.
(() => {
  const $ = id => document.getElementById(id);
  const { esc, money, fmt, toast, modal, todayISO, parseISO, iso, compressImage, media, dayDiff, initialsOf } = PF;
  const hasDB = typeof DB !== "undefined";
  const MAX_PHOTOS = 6;
  const MOODS = [
    { emoji: "😫", label: "Rough" }, { emoji: "😕", label: "Meh" },
    { emoji: "😐", label: "Okay" }, { emoji: "🙂", label: "Good" }, { emoji: "🤩", label: "Great" }
  ];
  const ACT_EMOJI = { Strength: "💪", Cardio: "🏃", HIIT: "🔥", Mobility: "🧘", Sports: "⚽", "Rest day": "😴", Other: "✨" };
  const ACTIVITIES = ["Strength", "Cardio", "HIIT", "Mobility", "Sports", "Rest day", "Other"];
  const QUICK_TITLES = [
    { emoji: "🦵", label: "Leg day", t: "Leg day 🦵" },
    { emoji: "🏆", label: "New PR", t: "PR day 🏆" },
    { emoji: "🏋️", label: "Upper body", t: "Upper body 🏋️" },
    { emoji: "🏃", label: "Cardio sesh", t: "Cardio sesh 🏃" },
    { emoji: "🧘", label: "Recovery", t: "Recovery day 🧘" },
    { emoji: "😴", label: "Rest day", t: "Rest day 😴" }
  ];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const emptyBlock = (icon, title, text) => `<div class="pp-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const bmiCategory = b => (b < 18.5 ? "Underweight range" : b < 25 ? "Healthy range" : b < 30 ? "Overweight range" : "Obesity range");
  const validPhone = v => !v || /^[0-9+()\-\s]{7,20}$/.test(v);
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  // ---------- Who is signed in ----------
  function sessionMember() {
    try { return JSON.parse(localStorage.getItem("profit-member-logged-in") || "null"); } catch { return null; }
  }
  function ownerKey() {
    const m = sessionMember();
    if (m && (m.id || m.email)) return String(m.id || m.email);
    try {
      const s = JSON.parse(localStorage.getItem("profit-demo-session") || sessionStorage.getItem("profit-demo-session") || "null");
      if (s) return "demo-" + String(s.name || "member").toLowerCase().replace(/\s+/g, "-");
    } catch { /* ignore */ }
    return "guest";
  }
  const KEY = "profit-member-tools-v1:" + ownerKey();
  const blank = () => ({ diary: [], height: null, goalWeight: null, targetDate: "", weights: [], goals: [], bookings: [], plans: [] });
  let state = blank();
  try { state = { ...blank(), ...(JSON.parse(localStorage.getItem(KEY) || "null") || {}) }; } catch { /* start fresh */ }
  state.diary = state.diary.map(x => ({ photos: [], ...x }));
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { toast("Browser storage is full, so this change was not saved.", true); return false; }
  }

  // ---------- Tabs on member-home.html (member-portal.html switches its own tabs) ----------
  let selectTab = null;
  function goTab(name) {
    if (selectTab) selectTab(name);
    document.querySelector(`[data-panel="${name}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function initHomeTabs() {
    const sideTabs = [...document.querySelectorAll(".member-sidebar .nav-link[data-tab]")];
    const tabs = sideTabs.length ? sideTabs : [...document.querySelectorAll(".pp-tab")];
    if (!tabs.length) return;
    const names = tabs.map(t => t.dataset.tab);
    const hero = document.querySelector(".member-hero");
    const tabBanner = document.getElementById("mbTabBanner");
    const tabEyebrow = document.getElementById("mbTabEyebrow");
    const tabTitle = document.getElementById("mbTabTitle");
    const TAB_META = {
      schedule: ["Pick your sessions", "Schedule"],
      announcements: ["Latest from the gym", "Announcements"],
      diary: ["Your training log", "Workout diary"],
      health: ["Track your progress", "Health & goals"],
      attendance: ["Your gym visits", "Attendance History"],
      payments: ["Billing & payments", "Payment History"],
      membership: ["Your gym plan", "My Membership"],
      profile: ["Your account details", "My Profile"],
      settings: ["App preferences", "Settings"]
    };
    const select = (name, updateHash = true) => {
      tabs.forEach(t => {
        const on = t.dataset.tab === name;
        t.setAttribute("aria-selected", String(on));
        t.classList.toggle("active", on);
        if (on) t.setAttribute("aria-current", "page");
        else t.removeAttribute("aria-current");
        t.tabIndex = on ? 0 : -1;
      });
      // Fallback tab order if a panel has no nav button.
      if (!names.includes(name)) tabs[0].tabIndex = 0;
      document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
      if (hero) hero.hidden = name !== "overview";
      if (tabBanner) {
        const showBanner = name !== "overview";
        tabBanner.hidden = !showBanner;
        if (showBanner && TAB_META[name]) {
          if (tabEyebrow) tabEyebrow.textContent = TAB_META[name][0];
          if (tabTitle) tabTitle.textContent = TAB_META[name][1];
        }
      }
      if (updateHash) history.replaceState(null, "", "#" + name);
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t.dataset.tab));
      t.addEventListener("keydown", e => {
        const forward = sideTabs.length ? "ArrowDown" : "ArrowRight";
        const backward = sideTabs.length ? "ArrowUp" : "ArrowLeft";
        if (e.key !== forward && e.key !== backward) return;
        e.preventDefault();
        const next = names[(i + (e.key === forward ? 1 : names.length - 1)) % names.length];
        select(next);
        tabs.find(el => el.dataset.tab === next)?.focus();
      });
    });
    const hash = location.hash.slice(1);
    select(names.includes(hash) ? hash : names[0], false);
    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      if (names.includes(h)) select(h, false);
    });
    selectTab = select;
  }
  const SUN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.8" fill="currentColor" stroke="none"/><path d="M12 1.2v4M12 18.8v4M1.2 12h4M18.8 12h4M5.21 5.21l1.98 1.98M16.81 16.81l1.98 1.98M5.21 18.79l1.98-1.98M16.81 7.19l1.98-1.98"/></svg>';
  function syncThemeIcon() {
    const btn = $("memberTheme");
    if (!btn) return;
    const paint = () => { btn.innerHTML = document.body.classList.contains("dark") ? SUN_SVG : '<i class="fa-solid fa-moon"></i>'; };
    paint();
    window.__pfPaintThemeIcon = paint;
    btn.addEventListener("click", () => setTimeout(paint, 0));
  }

  // ---------- Photos: shared helpers ----------
  async function hydrate(root = document) {
    const imgs = [...root.querySelectorAll("img[data-photo-id]")];
    await Promise.all(imgs.map(img => media.url(img.dataset.photoId).then(u => {
      if (u) { img.src = u; img.hidden = false; }
    }).catch(() => {})));
  }
  function openLightbox(ids, start) {
    let i = start;
    const box = document.createElement("div");
    box.className = "pp-lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Photo viewer");
    box.innerHTML = `<button class="pp-icon-btn pp-lb-close" type="button" aria-label="Close photo"><i class="fa-solid fa-xmark"></i></button>
      <button class="pp-icon-btn pp-lb-nav pp-lb-prev" type="button" aria-label="Previous photo"><i class="fa-solid fa-chevron-left"></i></button>
      <figure><img alt=""><figcaption></figcaption></figure>
      <button class="pp-icon-btn pp-lb-nav pp-lb-next" type="button" aria-label="Next photo"><i class="fa-solid fa-chevron-right"></i></button>`;
    document.body.appendChild(box);
    const img = box.querySelector("img");
    const show = async () => {
      const u = await media.url(ids[i]).catch(() => null);
      if (u) img.src = u;
      box.querySelector("figcaption").textContent = `${i + 1} of ${ids.length}`;
      box.querySelector(".pp-lb-prev").disabled = i === 0;
      box.querySelector(".pp-lb-next").disabled = i === ids.length - 1;
    };
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && i < ids.length - 1) { i++; show(); }
      if (e.key === "ArrowLeft" && i > 0) { i--; show(); }
    };
    document.addEventListener("keydown", onKey);
    box.addEventListener("click", e => {
      if (e.target === box || e.target.closest(".pp-lb-close")) return close();
      if (e.target.closest(".pp-lb-prev") && i > 0) { i--; show(); }
      if (e.target.closest(".pp-lb-next") && i < ids.length - 1) { i++; show(); }
    });
    box.querySelector(".pp-lb-close").focus();
    show();
  }

  // ---------- Diary ----------
  let form = null;          // current draft: fields are read from the DOM on save
  let photos = [];          // [{kind:'saved', id, url} | {kind:'new', blob, url}]
  let removedIds = [];      // saved photos removed while editing; deleted only after the entry saves
  let editingId = null;
  let search = "";

  function diaryShellHTML() {
    return `<div class="pp-diary">
      <div class="pp-banner" id="diaryBanner"></div>
      <div class="pp-diary-layout">
        <form class="pp-card pp-diary-form" id="diaryForm" novalidate>
          <div class="pp-card-head"><div><h3 id="diaryFormTitle">New entry</h3><p class="pp-muted" id="diaryFormHint">Only you and the gym team can see this. Spill.</p></div></div>
          <div class="pp-field-row">
            <div class="pp-field"><label for="diaryDate">Date</label><input type="date" id="diaryDate" required><small class="pp-err" id="diaryDate-err" hidden></small></div>
            <div class="pp-field"><label>Training time</label>
              <div class="pp-unit-row">
                <input type="number" id="diaryHours" min="0" max="10" step="1" value="0" aria-label="Training hours">
                <span class="pp-unit-tag">hr</span>
                <input type="number" id="diaryMinutes" min="0" max="55" step="5" value="0" aria-label="Training minutes">
                <span class="pp-unit-tag">min</span>
              </div>
            </div>
          </div>
          <div class="pp-chip-row" id="diaryMinuteChips" aria-label="Quick training time"></div>
          <div class="pp-field"><span class="pp-label">Activity</span><div class="pp-chip-row" id="diaryActivity" role="radiogroup" aria-label="Activity"></div></div>
          <div class="pp-field"><span class="pp-label">How did it feel?</span><div class="pp-mood-row" id="diaryMoods" role="radiogroup" aria-label="Mood"></div></div>
          <div class="pp-field"><span class="pp-label">Start with a vibe</span><div class="pp-chip-row" id="diaryQuick"></div></div>
          <div class="pp-field"><label for="diaryTitle">Title</label><input id="diaryTitle" maxlength="100" placeholder="e.g. Leg day and an early night"></div>
          <div class="pp-field"><label for="diaryNotes">Notes</label><textarea id="diaryNotes" rows="5" maxlength="2000" placeholder="meals, workouts, sleep, wins and the stuff you'd tell your group chat..."></textarea><small class="pp-counter" id="diaryCount">0 / 2000</small></div>
          <div class="pp-field">
            <span class="pp-label">Photos <span class="pp-muted">(up to ${MAX_PHOTOS})</span></span>
            <!-- Rewritten from the old flat dashed box: an explicit button so
                 there is an obvious thing to press on touch, a live "n of MAX
                 left" so the limit is not discovered by hitting it, and the
                 format note demoted to a footnote. -->
            <label class="pp-drop" id="diaryDrop" for="diaryPhotos" tabindex="0">
              <span class="pp-drop-icon"><i class="fa-solid fa-camera" aria-hidden="true"></i></span>
              <span class="pp-drop-copy">
                <strong>Add photos</strong>
                <em>Tap to pick, or drop files here</em>
              </span>
              <span class="pp-drop-slots" id="diarySlots"></span>
            </label>
            <input type="file" id="diaryPhotos" accept="image/*" multiple hidden>
            <div class="pp-photo-grid" id="diaryPhotoGrid"></div>
            <small class="pp-err" id="diaryPhotos-err" hidden></small>
          </div>
          <div class="pp-actions pp-actions-end">
            <button type="button" class="pp-btn" id="diaryCancel" hidden>Cancel edit</button>
            <button type="submit" class="pp-btn pp-btn-primary" id="diarySave"><i class="fa-solid fa-floppy-disk"></i> Save entry</button>
          </div>
        </form>
        <section class="pp-card pp-diary-list" aria-label="Diary entries">
          <div class="pp-card-head"><div><h3>Your diary</h3><p class="pp-muted" id="diaryStats"></p></div>
            <label class="pp-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="diarySearch" placeholder="Search entries" aria-label="Search diary"></label></div>
          <div id="diaryTimeline"></div>
        </section>
      </div>
    </div>`;
  }

  function streakDays() {
    const days = new Set(state.diary.map(x => x.date));
    let d = new Date(), count = 0;
    if (!days.has(iso(d))) d.setDate(d.getDate() - 1);
    while (days.has(iso(d))) { count++; d.setDate(d.getDate() - 1); }
    return count;
  }
  function renderBanner() {
    const banner = $("diaryBanner");
    const t = todayISO();
    const entry = state.diary.find(x => x.date === t);
    const streak = streakDays();
    const d = new Date();
    const mon = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    const dow = d.toLocaleDateString("en-US", { weekday: "long" });
    const streakTxt = streak >= 2 ? `<span class="pp-streak">🔥 ${streak}-day logging streak</span>` : "";
    banner.innerHTML = `<div class="pp-banner-date" aria-hidden="true"><b>${d.getDate()}</b><small>${mon}</small></div>
      <div class="pp-banner-body${entry ? " ok" : ""}">
        <small class="pp-banner-kicker">${esc(dow)}${entry ? " · logged" : " · not logged yet"}</small>
        <strong>${entry ? esc(entry.title) : "How was today's session?"}</strong>
        <span>${entry ? "Saved to your diary — keep it coming." : "One line is enough. Future you will thank you."}</span>
      </div>
      ${streakTxt}
      ${entry
        ? `<button class="pp-btn pp-btn-soft" type="button" data-banner="edit" data-id="${esc(entry.id)}"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> Edit</button>`
        : `<button class="pp-btn pp-btn-primary" type="button" data-banner="new"><i class="fa-solid fa-plus" aria-hidden="true"></i> Log today</button>`}`;
  }
  function entryHTML(x) {
    const d = parseISO(x.date);
    const mood = x.mood != null ? MOODS[x.mood] : null;
    const count = x.photos?.length || 0;
    return `<article class="pp-entry" data-entry="${esc(x.id)}">
      <div class="pp-entry-top">
        <div class="pp-entry-date" aria-hidden="true"><strong>${d.getDate()}</strong><span>${esc(d.toLocaleDateString("en-US", { weekday: "short" }))}</span></div>
        <div class="pp-entry-main">
          <h4>${esc(x.title)}</h4>
          <div class="pp-chips">
            ${x.activity ? `<span class="pp-chip">${ACT_EMOJI[x.activity] || ""} ${esc(x.activity)}</span>` : ""}
            ${x.minutes ? `<span class="pp-chip"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${x.minutes < 60 ? `${x.minutes} min` : `${Math.floor(x.minutes / 60)} hr${x.minutes % 60 ? ` ${x.minutes % 60} min` : ""}`}</span>` : ""}
            ${mood ? `<span class="pp-chip pp-chip-mood">${mood.emoji} ${mood.label}</span>` : ""}
            ${count ? `<span class="pp-chip"><i class="fa-regular fa-image" aria-hidden="true"></i> ${count}</span>` : ""}
          </div>
        </div>
        <div class="pp-entry-actions">
          <button class="pp-icon-btn" type="button" data-entry-action="edit" aria-label="Edit entry"><i class="fa-regular fa-pen-to-square"></i></button>
          <button class="pp-icon-btn pp-icon-danger" type="button" data-entry-action="delete" aria-label="Delete entry"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
      ${x.notes ? `<p class="pp-notes">${esc(x.notes)}</p>` : ""}
      ${count ? `<div class="pp-thumbs">${x.photos.map((id, i) => `<button class="pp-thumb" type="button" data-view="${esc(x.id)}" data-index="${i}" aria-label="View photo ${i + 1}"><img data-photo-id="${esc(id)}" alt="" hidden></button>`).join("")}</div>` : ""}
    </article>`;
  }
  function renderDiary() {
    if (!$("diaryTimeline")) return;
    renderBanner();
    const q = search.trim().toLowerCase();
    const items = state.diary
      .filter(x => !q || [x.title, x.notes, x.activity].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated);
    const photoTotal = state.diary.reduce((n, x) => n + (x.photos?.length || 0), 0);
    $("diaryStats").textContent = `${state.diary.length} entr${state.diary.length === 1 ? "y" : "ies"} · ${photoTotal} photo${photoTotal === 1 ? "" : "s"}`;
    if (!items.length) {
      $("diaryTimeline").innerHTML = q
        ? emptyBlock("fa-magnifying-glass", "No entries match", "Try a different word.")
        : emptyBlock("fa-book-open", "Your story starts here", "Log a session, drop a photo, keep the streak alive 🔥");
      return;
    }
    let html = "", month = "";
    for (const x of items) {
      const label = parseISO(x.date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (label !== month) { html += `<h4 class="pp-month">${esc(label)}</h4>`; month = label; }
      html += entryHTML(x);
    }
    $("diaryTimeline").innerHTML = html;
    hydrate($("diaryTimeline"));
  }

  function setBusy(busy, text = "") {
    const save = $("diarySave");
    if (!save) return;
    save.disabled = busy;
    save.innerHTML = busy ? `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(text || "Saving…")}` : (editingId ? '<i class="fa-solid fa-floppy-disk"></i> Update entry' : '<i class="fa-solid fa-floppy-disk"></i> Save entry');
    $("diaryDrop")?.classList.toggle("is-busy", busy);
  }
  function photoError(msg) { const el = $("diaryPhotos-err"); if (el) { el.textContent = msg; el.hidden = !msg; } }
  async function paintPhotos() {
    for (const p of photos) if (!p.url && p.kind === "saved") p.url = await media.url(p.id).catch(() => null);
    $("diaryPhotoGrid").innerHTML = photos.map((p, i) => `<figure class="pp-photo-item"><img src="${esc(p.url || "")}" alt="Photo ${i + 1}"><button type="button" class="pp-photo-remove" data-remove="${i}" aria-label="Remove photo ${i + 1}"><i class="fa-solid fa-xmark"></i></button></figure>`).join("");
    $("diaryDrop").classList.toggle("is-full", photos.length >= MAX_PHOTOS);
    // Tell the member how much room is left before they pick, not after.
    const slots = $("diarySlots");
    if (slots) {
      const left = MAX_PHOTOS - photos.length;
      slots.textContent = left > 0 ? `${left} slot${left === 1 ? "" : "s"} left` : "Limit reached";
      slots.classList.toggle("is-zero", left <= 0);
    }
  }
  async function addFiles(files) {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return photoError(`You can add up to ${MAX_PHOTOS} photos per entry.`);
    const list = [...files].slice(0, room);
    photoError(files.length > room ? `Only ${room} more photo${room === 1 ? " fits" : "s fit"}. The rest were skipped.` : "");
    setBusy(true, "Preparing photos…");
    for (const f of list) {
      try {
        const blob = await compressImage(f);
        photos.push({ kind: "new", blob, url: URL.createObjectURL(blob) });
      } catch (err) { photoError(err.message); }
    }
    setBusy(false);
    paintPhotos();
  }
  function resetDiaryForm() {
    editingId = null;
    photos.forEach(p => { if (p.kind === "new") URL.revokeObjectURL(p.url); });
    photos = []; removedIds = [];
    form.reset();
    $("diaryDate").value = todayISO();
    $("diaryDate").max = todayISO();
    $("diaryMinutes").value = "0";
    $("diaryHours").value = "0";
    setMood(null); setActivity(null);
    $("diaryCount").textContent = "0 / 2000";
    $("diaryFormTitle").textContent = "New entry";
    $("diaryFormHint").textContent = "Only you and the gym team can see this. Spill.";
    $("diaryCancel").hidden = true;
    photoError("");
    paintPhotos();
    setBusy(false);
  }
  let mood = null, activity = null;
  // Training time is entered as hours + minutes but stored as one number, so
  // anything that reads `entry.minutes` elsewhere keeps working untouched.
  function setDuration(total) {
    const mins = Math.max(0, Number(total) || 0);
    $("diaryHours").value = String(Math.floor(mins / 60));
    $("diaryMinutes").value = String(mins % 60);
  }
  function readDuration() {
    const hrs = Math.max(0, Math.min(10, Math.round(Number($("diaryHours").value) || 0)));
    const mins = Math.max(0, Math.min(55, Math.round((Number($("diaryMinutes").value) || 0) / 5) * 5));
    return Math.min(600, hrs * 60 + mins);
  }
  function setMood(i) {
    mood = i;
    document.querySelectorAll("#diaryMoods [data-mood]").forEach(b => b.setAttribute("aria-checked", String(Number(b.dataset.mood) === i)));
  }
  function setActivity(name) {
    activity = name;
    document.querySelectorAll("#diaryActivity [data-activity]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.activity === name)));
  }
  function startEdit(entry) {
    editingId = entry.id;
    $("diaryDate").value = entry.date;
    $("diaryTitle").value = entry.title === "Untitled day" ? "" : entry.title;
    setDuration(entry.minutes || 0);
    $("diaryNotes").value = entry.notes || "";
    $("diaryCount").textContent = `${$("diaryNotes").value.length} / 2000`;
    setMood(entry.mood ?? null);
    setActivity(entry.activity || null);
    photos = (entry.photos || []).map(id => ({ kind: "saved", id, url: null }));
    removedIds = [];
    paintPhotos();
    $("diaryFormTitle").textContent = "Edit entry";
    $("diaryFormHint").textContent = `Editing the entry from ${parseISO(entry.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`;
    $("diaryCancel").hidden = false;
    setBusy(false);
    $("diaryForm").scrollIntoView({ behavior: "smooth", block: "start" });
    $("diaryTitle").focus({ preventScroll: true });
  }
  async function saveEntry(e) {
    e.preventDefault();
    photoError("");
    const date = $("diaryDate").value;
    const title = $("diaryTitle").value.trim();
    const notes = $("diaryNotes").value.trim();
    const minutes = readDuration();
    if (!date) { $("diaryDate-err").textContent = "Choose a date for this entry."; $("diaryDate-err").hidden = false; return; }
    if (date > todayISO()) { $("diaryDate-err").textContent = "Diary entries can't be dated in the future."; $("diaryDate-err").hidden = false; return; }
    if (!title && !notes && !photos.length) return toast("Add a title, some notes or a photo first.", true);
    const created = [];
    setBusy(true);
    try {
      const ids = [];
      for (const p of photos) {
        if (p.kind === "saved") ids.push(p.id);
        else { const id = await media.save(p.blob); created.push(id); ids.push(id); }
      }
      const entry = { id: editingId || uid(), date, title: title || "Untitled day", mood, activity: activity || "", minutes, notes, photos: ids, updated: Date.now() };
      const previous = state.diary;
      state.diary = editingId ? state.diary.map(x => (x.id === editingId ? entry : x)) : [entry, ...state.diary];
      if (!persist()) { state.diary = previous; throw new Error("Could not save the entry."); }
      for (const id of removedIds) await media.remove(id).catch(() => {});
      const wasEditing = !!editingId;
      resetDiaryForm();
      renderDiary();
      initMemberCalendar();
      window.__pfRedrawSchedule?.();
      toast(wasEditing ? "Entry updated. Nice work ✨" : "Entry saved. That's a W 🏆");
    } catch (err) {
      for (const id of created) await media.remove(id).catch(() => {});
      toast(err.message || "This entry could not be saved.", true);
    } finally {
      setBusy(false);
    }
  }
  function deleteEntry(entry) {
    modal({
      title: "Delete this entry?",
      body: `<p class="pp-muted">"${esc(entry.title)}" and its ${entry.photos?.length || 0} photo${entry.photos?.length === 1 ? "" : "s"} will be removed. This can't be undone.</p>`,
      confirmText: "Delete entry",
      danger: true,
      onConfirm: async () => {
        state.diary = state.diary.filter(x => x.id !== entry.id);
        if (!persist()) throw new Error("Could not delete the entry. Please try again.");
        for (const id of entry.photos || []) await media.remove(id).catch(() => {});
        if (editingId === entry.id) resetDiaryForm();
        renderDiary();
        toast("Entry deleted.");
      }
    });
  }
  function bindDiary() {
    const root = $("diaryRoot");
    root.innerHTML = diaryShellHTML();
    form = $("diaryForm");
    $("diaryMinuteChips").innerHTML = [15, 30, 45, 60, 90, 120].map(n => `<button type="button" class="pp-chip-btn" data-minutes="${n}">${n < 60 ? `${n} min` : `${Math.floor(n / 60)} hr${n % 60 ? ` ${n % 60} min` : ""}`}</button>`).join("");
    $("diaryQuick").innerHTML = QUICK_TITLES.map(q => `<button type="button" class="pp-chip-btn" data-quick="${esc(q.t)}">${esc(q.emoji)} ${esc(q.label)}</button>`).join("");
    $("diaryActivity").innerHTML = ACTIVITIES.map(a => `<button type="button" class="pp-chip-btn" role="radio" data-activity="${esc(a)}" aria-checked="false">${ACT_EMOJI[a] || ""} ${esc(a)}</button>`).join("");
    $("diaryMoods").innerHTML = MOODS.map((m, i) => `<button type="button" class="pp-mood" role="radio" data-mood="${i}" aria-checked="false" aria-label="${esc(m.label)}" title="${esc(m.label)}"><span class="pp-mood-emoji" aria-hidden="true">${m.emoji}</span><span>${esc(m.label)}</span></button>`).join("");
    $("diaryDate").value = todayISO();
    $("diaryDate").max = todayISO();

    $("diaryMinuteChips").addEventListener("click", e => {
      const b = e.target.closest("[data-minutes]");
      if (b) setDuration(b.dataset.minutes);
    });
    $("diaryQuick").addEventListener("click", e => {
      const b = e.target.closest("[data-quick]");
      if (!b) return;
      const input = $("diaryTitle");
      if (input.value.trim() && input.value.trim() !== b.dataset.quick) return toast("Clear the title first to swap the vibe.", true);
      input.value = b.dataset.quick;
      input.focus({ preventScroll: true });
    });
    $("diaryActivity").addEventListener("click", e => {
      const b = e.target.closest("[data-activity]");
      if (b) setActivity(activity === b.dataset.activity ? null : b.dataset.activity);
    });
    $("diaryMoods").addEventListener("click", e => {
      const b = e.target.closest("[data-mood]");
      if (!b) return;
      const i = Number(b.dataset.mood);
      setMood(mood === i ? null : i);
    });
    $("diaryNotes").addEventListener("input", () => { $("diaryCount").textContent = `${$("diaryNotes").value.length} / 2000`; });
    $("diaryPhotos").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });
    const drop = $("diaryDrop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", e => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
    drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("diaryPhotos").click(); } });
    $("diaryPhotoGrid").addEventListener("click", e => {
      const b = e.target.closest("[data-remove]");
      if (!b) return;
      const p = photos[Number(b.dataset.remove)];
      if (!p) return;
      if (p.kind === "saved") removedIds.push(p.id);
      else URL.revokeObjectURL(p.url);
      photos.splice(Number(b.dataset.remove), 1);
      paintPhotos();
    });
    form.addEventListener("submit", saveEntry);
    $("diaryCancel").addEventListener("click", resetDiaryForm);
    $("diarySearch").addEventListener("input", e => { search = e.target.value; renderDiary(); });

    $("diaryBanner").addEventListener("click", e => {
      const b = e.target.closest("[data-banner]");
      if (!b) return;
      if (b.dataset.banner === "edit") startEdit(state.diary.find(x => x.id === b.dataset.id));
      else { resetDiaryForm(); $("diaryTitle").focus({ preventScroll: true }); }
    });
    $("diaryTimeline").addEventListener("click", e => {
      const thumb = e.target.closest("[data-view]");
      if (thumb) {
        const entry = state.diary.find(x => x.id === thumb.dataset.view);
        if (entry) openLightbox(entry.photos, Number(thumb.dataset.index));
        return;
      }
      const act = e.target.closest("[data-entry-action]");
      if (!act) return;
      const entry = state.diary.find(x => x.id === act.closest("[data-entry]")?.dataset.entry);
      if (!entry) return;
      if (act.dataset.entryAction === "edit") startEdit(entry);
      if (act.dataset.entryAction === "delete") deleteEntry(entry);
    });
    resetDiaryForm();
    renderDiary();
  }

  // ---------- Health and goals ----------
  // Everything is stored canonically (cm / kg) so the numbers never drift; the
  // pickers below only change how the member reads and types them.
  const KG_PER_LB = 0.45359237, CM_PER_IN = 2.54;
  const UNITS_KEY = "pp-member-units-v1";
  const units = (() => {
    const fallback = { height: "cm", weight: "kg", logWeight: "kg" };
    try { return { ...fallback, ...(JSON.parse(localStorage.getItem(UNITS_KEY) || "null") || {}) }; } catch { return fallback; }
  })();
  const saveUnits = () => { try { localStorage.setItem(UNITS_KEY, JSON.stringify(units)); } catch { /* ignore */ } };
  const kgTo = (kg, u) => (u === "lb" ? kg / KG_PER_LB : kg);
  const toKg = (v, u) => (u === "lb" ? v * KG_PER_LB : v);
  const cmTo = (cm, u) => (u === "in" ? cm / CM_PER_IN : cm);
  const toCm = (v, u) => (u === "in" ? v * CM_PER_IN : v);
  const round1 = n => Math.round(n * 10) / 10;
  // 5 ft 7 in reads better than 67 in, so the imperial height gets two boxes.
  const splitFtIn = cm => {
    const totalIn = cm / CM_PER_IN;
    return { ft: Math.floor(totalIn / 12), inch: round1(totalIn - Math.floor(totalIn / 12) * 12) };
  };
  const joinFtIn = (ft, inch) => (ft * 12 + (inch || 0)) * CM_PER_IN;

  function drawChart(points) {
    const box = $("weightChart");
    if (!box) return;
    if (points.length < 2) {
      box.innerHTML = emptyBlock("fa-chart-line", "Log at least two weights", "Your trend line will appear here.");
      return;
    }
    const W = 640, H = 220, P = 36;
    const goal = state.goalWeight;
    const shown = kg => round1(kgTo(kg, units.logWeight)).toFixed(1);
    const vals = points.map(p => p.kg).concat(goal ? [goal] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    const y = v => P + ((hi - v) / (hi - lo)) * (H - P * 2);
    const x = i => P + (i / (points.length - 1)) * (W - P * 2);
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="4"><title>${esc(fmt(p.date))}: ${shown(p.kg)} ${units.logWeight}</title></circle>`).join("");
    const goalLine = goal
      ? `<line class="pp-goal-line" x1="${P}" x2="${W - P}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"></line><text x="${W - P}" y="${(y(goal) - 7).toFixed(1)}" text-anchor="end">Goal ${shown(goal)} ${units.logWeight}</text>`
      : "";
    const grid = [0, 1, 2].map(i => { const yy = P + (i * (H - P * 2)) / 2; return `<line x1="${P}" x2="${W - P}" y1="${yy}" y2="${yy}"></line>`; }).join("");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend across ${points.length} entries">${grid}${goalLine}<path class="pp-trend" d="${path}"></path>${dots}<text x="${P}" y="${P - 12}">${shown(hi)} ${units.logWeight}</text><text x="${P}" y="${H - 8}">${shown(lo)} ${units.logWeight}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${esc(fmt(points[points.length - 1].date))}</text></svg>`;
  }
  function renderHealth() {
    if (!$("healthForm")) return;
    const weights = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
    const first = weights[0], latest = weights[weights.length - 1];
    const heightM = state.height ? state.height / 100 : null;
    const bmi = latest && heightM ? latest.kg / (heightM * heightM) : null;
    $("statBmi").textContent = bmi ? bmi.toFixed(1) : "—";
    $("statBmiCat").textContent = bmi ? bmiCategory(bmi) : "Add height and a weight entry";
    $("statWeight").textContent = latest ? `${round1(kgTo(latest.kg, units.logWeight))} ${units.logWeight}` : "—";
    if (latest && first && weights.length > 1) {
      const delta = kgTo(latest.kg - first.kg, units.logWeight);
      $("statWeightChange").textContent = `${delta > 0 ? "+" : ""}${round1(delta).toFixed(1)} ${units.logWeight} since ${fmt(first.date)}`;
    } else {
      $("statWeightChange").textContent = "Log weight to see your change";
    }
    let pct = null;
    if (latest && first && state.goalWeight) {
      const total = state.goalWeight - first.kg;
      pct = total === 0 ? 100 : Math.max(0, Math.min(100, ((latest.kg - first.kg) / total) * 100));
    }
    $("statGoal").textContent = pct === null ? "—" : `${Math.round(pct)}%`;
    $("statGoalBar").style.width = `${pct ?? 0}%`;
    if (state.targetDate) {
      const d = dayDiff(new Date(), parseISO(state.targetDate));
      $("statDays").textContent = d > 0 ? `${d} day${d === 1 ? "" : "s"}` : d === 0 ? "Today" : "Passed";
      $("statTarget").textContent = `Target: ${fmt(state.targetDate)}`;
    } else {
      $("statDays").textContent = "—";
      $("statTarget").textContent = "Set a target date";
    }
    $("weightList").innerHTML = weights.length
      ? weights.slice(-8).reverse().map(w => `<div class="pp-mini-row"><span>${esc(fmt(w.date))}</span><strong>${round1(kgTo(w.kg, units.logWeight))} ${units.logWeight}</strong><button type="button" class="pp-icon-btn" data-del-weight="${esc(w.date)}" aria-label="Delete ${esc(fmt(w.date))} entry"><i class="fa-solid fa-xmark"></i></button></div>`).join("")
      : '<p class="pp-muted">No weight entries yet.</p>';
    $("goalList").innerHTML = state.goals.length
      ? state.goals.map(g => `<li class="pp-goal ${g.done ? "done" : ""}" data-goal="${esc(g.id)}"><label><input type="checkbox" data-toggle ${g.done ? "checked" : ""}><span>${esc(g.text)}</span></label>${g.due ? `<small>${esc(fmt(g.due))}</small>` : ""}<button type="button" class="pp-icon-btn" data-remove aria-label="Remove goal"><i class="fa-solid fa-trash-can"></i></button></li>`).join("")
      : '<li class="pp-muted">No goals yet. Add your first one above.</li>';
    drawChart(weights.slice(-30));
  }
  function initHealth() {
    if (!$("healthForm")) return;
    const hUnit = $("healthHeightUnit"), wUnit = $("healthGoalWeightUnit"), lUnit = $("weightUnit");
    hUnit.value = units.height;
    // One weight unit for the whole Health tab, so the goal box and the log can
    // never disagree about what a number means.
    units.logWeight = units.weight;
    wUnit.value = units.logWeight; lUnit.value = units.logWeight;

    // Refill the boxes so the placeholder/range hint match the unit picked.
    const heightBox = $("healthHeight"), heightInBox = $("healthHeightIn");
    const paintHeight = () => {
      const u = hUnit.value;
      units.height = u;
      const imperial = u === "ft";
      heightInBox.hidden = !imperial;
      const hint = $("heightHint");
      if (imperial) {
        heightBox.placeholder = "ft"; heightBox.step = "1"; heightBox.min = "1"; heightBox.max = "8";
        heightInBox.placeholder = "in"; heightBox.removeAttribute("aria-label");
        if (hint) hint.textContent = "e.g. 5 ft 7 in";
        const { ft, inch } = state.height ? splitFtIn(state.height) : { ft: "", inch: "" };
        heightBox.value = ft === "" ? "" : ft; heightInBox.value = inch === "" ? "" : inch;
      } else if (u === "in") {
        heightBox.placeholder = "e.g. 66"; heightBox.step = "0.5"; heightBox.min = "20"; heightBox.max = "98";
        if (hint) hint.textContent = "20 – 98 in";
        heightBox.value = state.height ? round1(cmTo(state.height, "in")) : "";
      } else {
        heightBox.placeholder = "e.g. 168"; heightBox.step = "0.5"; heightBox.min = "100"; heightBox.max = "250";
        if (hint) hint.textContent = "100 – 250 cm";
        heightBox.value = state.height ?? "";
      }
    };
    const paintGoalWeight = () => {
      const u = wUnit.value;
      units.weight = u;
      $("healthGoalWeight").placeholder = u === "lb" ? "e.g. 143" : "e.g. 65";
      $("healthGoalWeight").step = "0.1";
      const hint = $("goalWeightHint");
      if (hint) hint.textContent = u === "lb" ? "44 – 660 lb" : "20 – 300 kg";
      $("healthGoalWeight").value = state.goalWeight ? round1(kgTo(state.goalWeight, u)) : "";
    };
    const paintLogWeight = () => {
      const u = lUnit.value;
      units.logWeight = u;
      $("weightKg").placeholder = u === "lb" ? "Weight (lb)" : "Weight (kg)";
      $("weightKg").setAttribute("aria-label", u === "lb" ? "Weight in pounds" : "Weight in kilograms");
      $("weightKg").value = "";
    };
    paintHeight(); paintGoalWeight(); paintLogWeight();

    // Switching unit must never silently change the stored value — it just
    // re-reads the same canonical number in the new unit.
    hUnit.addEventListener("change", () => { paintHeight(); saveUnits(); renderHealth(); });
    const syncWeightUnits = () => {
      units.weight = units.logWeight;
      wUnit.value = units.logWeight; lUnit.value = units.logWeight;
      paintGoalWeight(); paintLogWeight(); saveUnits(); renderHealth();
    };
    wUnit.addEventListener("change", () => { units.logWeight = wUnit.value; syncWeightUnits(); });
    lUnit.addEventListener("change", () => { units.logWeight = lUnit.value; syncWeightUnits(); });

    $("weightDate").value = todayISO();
    $("weightDate").max = todayISO();
    $("healthForm").addEventListener("submit", e => {
      e.preventDefault();
      let h = null;
      if (hUnit.value === "ft") {
        const ft = Number(heightBox.value || 0), inch = Number(heightInBox.value || 0);
        h = heightBox.value === "" && heightInBox.value === "" ? null : joinFtIn(ft, inch);
      } else if (heightBox.value !== "") {
        h = toCm(Number(heightBox.value), hUnit.value);
      }
      const g = $("healthGoalWeight").value ? toKg(Number($("healthGoalWeight").value), wUnit.value) : null;
      const t = $("healthTarget").value || "";
      if (h !== null && (h < 100 || h > 250)) return toast(hUnit.value === "ft" ? "Height should be between 3 ft 3 in and 8 ft 2 in." : "Height should be between 100 and 250 cm.", true);
      if (g !== null && (g < 20 || g > 300)) return toast("Goal weight should be between 20 and 300 kg.", true);
      if (t && t < todayISO()) return toast("Target date should be today or later.", true);
      state.height = h === null ? null : round1(h); state.goalWeight = g === null ? null : round1(g); state.targetDate = t;
      if (persist()) { paintGoalWeight(); renderHealth(); toast("Health profile saved."); }
    });
    $("weightForm").addEventListener("submit", e => {
      e.preventDefault();
      const date = $("weightDate").value;
      const kg = $("weightKg").value ? toKg(Number($("weightKg").value), lUnit.value) : NaN;
      if (!date) return toast("Choose a date for this weight.", true);
      if (!(kg >= 20 && kg <= 300)) return toast(lUnit.value === "lb" ? "Enter a weight between 44 and 660 lb." : "Enter a weight between 20 and 300 kg.", true);
      state.weights = [...state.weights.filter(w => w.date !== date), { date, kg: round1(kg) }].sort((a, b) => a.date.localeCompare(b.date));
      if (persist()) { $("weightKg").value = ""; renderHealth(); toast("Weight logged."); }
    });
    $("weightList").addEventListener("click", e => {
      const b = e.target.closest("[data-del-weight]");
      if (!b) return;
      state.weights = state.weights.filter(w => w.date !== b.dataset.delWeight);
      if (persist()) { renderHealth(); toast("Weight entry removed."); }
    });
    $("goalForm").addEventListener("submit", e => {
      e.preventDefault();
      const text = $("goalText").value.trim();
      if (!text) return toast("Write your goal first.", true);
      state.goals = [{ id: uid(), text, due: $("goalDue").value || "", done: false }, ...state.goals];
      if (persist()) { $("goalText").value = ""; $("goalDue").value = ""; renderHealth(); toast("Goal added."); }
    });
    $("goalList").addEventListener("click", e => {
      const row = e.target.closest("[data-goal]");
      if (!row) return;
      const goal = state.goals.find(g => g.id === row.dataset.goal);
      if (!goal) return;
      if (e.target.closest("[data-toggle]")) goal.done = !goal.done;
      if (e.target.closest("[data-remove]")) state.goals = state.goals.filter(g => g.id !== goal.id);
      if (persist()) renderHealth();
    });
    renderHealth();
  }

  // ---------- Profile (member portal) ----------
  let profileDraft = null;
  const PROFILE_KEY = "profit-member-profile-v1";
  // Members signed in through the server: their photo, phone and address live in the database.
  const EMG_KEY = id => `profit-member-emergency-v1:${id}`;
  function verifiedAuthUser() {
    if (window.ProFitAuth?.user && window.ProFitAuth.user.email) return window.ProFitAuth.user;
    try {
      const raw = sessionStorage.getItem("profit-verified-session");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.email) return parsed;
    } catch { /* ignore */ }
    return null;
  }
  function formatUniqueMemberId(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (/^M\d{4,}$/i.test(s)) return s.toUpperCase();
    if (/^\d+$/.test(s)) return "M" + (202600 + Number(s));
    return s;
  }
  function serverMember() {
    const me = window.__pfMemberMe;
    if (me && me.user) {
      const mid = formatUniqueMemberId(me.user.memberId || me.user.id || "");
      let emg = {};
      if (mid) {
        try { emg = JSON.parse(localStorage.getItem(EMG_KEY(mid)) || "{}") || {}; } catch { /* ignore */ }
      }
      return {
        id: mid || "MEMBER", name: me.user.name || "Member", email: me.user.email || "", phone: me.user.phone || "",
        address: me.user.address || "", emergencyName: emg.emergencyName || "", emergencyPhone: emg.emergencyPhone || "",
        plan: me.membership?.planName || "Membership", start: null, end: me.membership?.expiry || null,
        photoId: null, photoData: me.user.photo || "", __server: true
      };
    }
    const authUser = verifiedAuthUser();
    if (authUser) {
      const mid = formatUniqueMemberId(authUser.memberId || authUser.id || "");
      let emg = {};
      if (mid) {
        try { emg = JSON.parse(localStorage.getItem(EMG_KEY(mid)) || "{}") || {}; } catch { /* ignore */ }
      }
      return {
        id: mid || "MEMBER", name: authUser.name || "Member", email: authUser.email || "", phone: authUser.phone || "",
        address: authUser.address || "", emergencyName: emg.emergencyName || "", emergencyPhone: emg.emergencyPhone || "",
        plan: "Membership", start: null, end: null,
        photoId: null, photoData: authUser.photo || "", __server: true
      };
    }
    return null;
  }
  function profileMember() {
    const srv = serverMember();
    if (srv) return srv;
    const s = sessionMember();
    if (s) {
      if (hasDB) { const m = DB.member(s.id); if (m) return m; }
      // No database on this page — the signed-in session still carries the contact
      // details a member actually edits, so the profile stays usable everywhere.
      return {
        id: s.id || "DEMO-0001", name: s.name || "Member", email: s.email || "", phone: s.phone || "",
        address: s.address || "", emergencyName: s.emergencyName || "", emergencyPhone: s.emergencyPhone || "",
        plan: s.plan, start: s.start, end: s.end, photoId: s.photoId || null, __sessionOnly: true
      };
    }
    // Signed out: the shell still shows a demo member, so give them a real,
    // editable profile rather than a dead end.
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { /* ignore */ }
    return {
      id: "DEMO-0001", name: "Demo Member", email: "member@profit.test", phone: "",
      address: "", emergencyName: "", emergencyPhone: "", plan: "monthly",
      photoId: null, __local: true, ...(saved || {})
    };
  }
  function persistProfileMember(m) {
    if (hasDB) { try { DB.save(); } catch { /* ignore */ } }
    if (!m) return;
    if (m.__server) {
      try { localStorage.setItem(EMG_KEY(m.id), JSON.stringify({ emergencyName: m.emergencyName, emergencyPhone: m.emergencyPhone })); } catch { /* ignore */ }
      return;
    }
    if (m.__local) {
      try {
        const { __local, __sessionOnly, ...rest } = m;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(rest));
      } catch { /* ignore */ }
    } else if (m.__sessionOnly) {
      try { localStorage.setItem("profit-member-logged-in", JSON.stringify({ ...(sessionMember() || {}), ...m })); } catch { /* ignore */ }
    }
  }
  function renderProfile() {
    const root = $("profileRoot");
    if (!root) return;
    const m = profileMember();
    if (!m) {
      root.innerHTML = emptyBlock("fa-user-lock", "Sign in to edit your profile", "Your details appear here once you are signed in to your membership.");
      return;
    }
    const hasEnd = Boolean(m.end) && !Number.isNaN(new Date(m.end).getTime());
    const d = hasEnd ? dayDiff(new Date(), new Date(m.end)) : null;
    const status = d === null ? ["active", "Active"] : d < 0 ? ["expired", "Expired"] : d <= 7 ? ["expiring", "Expiring soon"] : ["active", "Active"];
    const planLabel = (typeof PLANS !== "undefined" && PLANS[m.plan]?.label) || m.plan || "Membership";
    const plan = String(planLabel).replace(/\b[a-z]/g, c => c.toUpperCase());
    profileDraft = null;
    const avaSeed = m.email || m.name || m.id || "member";
    const fallbackAva = window.ProFitAvatar ? window.ProFitAvatar.resolve(m.photoData, avaSeed) : "";
    if (window.ProFitAvatar) {
      ["memberInitials", "menuInitials", "memberTopInitials"].forEach(id => {
        const el = document.getElementById(id);
        if (el) window.ProFitAvatar.paint(el, { photo: m.photoData || "", seed: avaSeed, alt: m.name || "Member" });
      });
    }
    const sideNameEl = document.getElementById("memberName");
    if (sideNameEl && m.name && (!sideNameEl.textContent || sideNameEl.textContent.trim() === "Member")) {
      sideNameEl.textContent = String(m.name).split(" ")[0];
    }
    const sidePlanEl = document.getElementById("memberPlan");
    if (sidePlanEl && plan && (!sidePlanEl.textContent || sidePlanEl.textContent.trim() === "Membership")) {
      sidePlanEl.textContent = plan;
    }
    const hasName = String(m.name || "").trim().split(/\s+/).filter(Boolean).length >= 2;
    const hasPhoto = Boolean(m.photoId || m.photoData);
    const hasPhone = String(m.phone || "").trim().length >= 7;
    const hasEmg = String(m.emergencyName || "").trim().length >= 2 || String(m.emergencyPhone || "").trim().length >= 7;
    const checks = [
      { ok: hasName, label: "Add your name" },
      { ok: hasPhoto, label: "Upload a photo" },
      { ok: hasPhone, label: "Add a mobile number" },
      { ok: hasEmg, label: "Add emergency contact" }
    ];
    const pct = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);
    const circ = 201.06;
    const offset = (circ * (1 - pct / 100)).toFixed(2);
    const avaInner = `${fallbackAva ? `<img src="${esc(fallbackAva)}" alt="">` : `<span>${esc(initialsOf(m.name))}</span>`}${m.photoId && !m.photoData ? `<img data-photo-id="${esc(m.photoId)}" alt="" hidden>` : ""}`;

    root.innerHTML = `<div class="mb-prof-shell">
      <section class="mb-prof-hero" aria-label="Profile overview">
        <div class="mb-prof-hero-left">
          <label class="mb-prof-ava-wrap" for="profilePhotoInput" title="Change photo" tabindex="0">
            <div class="mb-prof-ava">${avaInner}</div>
            <span class="mb-prof-ava-badge" aria-hidden="true"><i class="fa-solid fa-camera"></i></span>
          </label>
          <input type="file" id="profilePhotoInput" accept="image/*" hidden>
          <div class="mb-prof-hero-copy">
            <span class="mb-prof-eyebrow">SIGNED IN AS</span>
            <h2 id="mbProfHeroName">${esc(m.name)}</h2>
            <span class="mb-prof-role-pill"><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(plan)} &middot; ${status[1]}</span>
            <p class="mb-prof-meta">
              <span><i class="fa-regular fa-id-badge" aria-hidden="true"></i> ${esc(m.id)}</span>
              <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${hasEnd ? `Ends ${esc(fmt(m.end))}` : "No active expiry"}</span>
            </p>
            <div class="mb-prof-hero-btns">
              <button type="button" class="mb-prof-pw-btn" id="mbProfChangePwBtn"><i class="fa-solid fa-lock" aria-hidden="true"></i> Change password</button>
              ${hasPhoto ? `<button type="button" class="mb-prof-pw-btn" id="profilePhotoRemove"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Remove photo</button>` : ""}
            </div>
          </div>
        </div>
        <div class="mb-prof-hero-right">
          <div class="mb-prof-ring-wrap">
            <svg class="mb-prof-ring-svg" viewBox="0 0 80 80" aria-hidden="true">
              <circle class="mb-prof-ring-track" cx="40" cy="40" r="32"></circle>
              <circle class="mb-prof-ring-arc" id="mbProfRingArc" cx="40" cy="40" r="32" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"></circle>
            </svg>
            <div class="mb-prof-ring-center">
              <strong id="mbProfRingPct">${pct}%</strong>
              <small>complete</small>
            </div>
          </div>
          <ul class="mb-prof-checks" id="mbProfChecks">
            ${checks.map(c => `<li class="${c.ok ? "is-done" : ""}"><i class="fa-${c.ok ? "solid fa-check" : "regular fa-clock"}" aria-hidden="true"></i> ${c.label}</li>`).join("")}
          </ul>
        </div>
      </section>

      <div class="mb-prof-grid">
        <form class="pp-card mb-prof-form-card" id="profileForm" novalidate>
          <div class="pp-card-head">
            <div>
              <h3><i class="fa-regular fa-id-card" aria-hidden="true" style="color:#e8b93a;margin-right:6px"></i> Your details</h3>
              <p class="pp-muted">Shown in the sidebar, the header avatar, and your gym check-in pass.</p>
            </div>
            <span class="pp-unsaved" id="profileDirty" hidden><i class="fa-solid fa-circle" aria-hidden="true"></i> Unsaved changes</span>
          </div>
          <div class="pp-form-grid">
            <div class="pp-field"><label for="pfName">Full name</label><input id="pfName" maxlength="80" value="${esc(m.name)}" placeholder="First and last name"><small class="pp-err" id="pfName-err" hidden></small></div>
            <div class="pp-field"><label for="pfEmail">Email (for sign-in)</label><input id="pfEmail" type="email" maxlength="120" value="${esc(m.email)}"${m.__server ? " readonly" : ""}><small class="pp-err" id="pfEmail-err" hidden></small></div>
            <div class="pp-field"><label for="pfPhone">Mobile number</label><input id="pfPhone" type="tel" maxlength="20" value="${esc(m.phone)}" placeholder="09XX XXX XXXX"><small class="pp-err" id="pfPhone-err" hidden></small></div>
            <div class="pp-field"><label for="pfAddress">Home address</label><input id="pfAddress" maxlength="160" value="${esc(m.address)}" placeholder="Street, barangay, city"></div>
            <div class="pp-field"><label for="pfEmgName">Emergency contact name</label><input id="pfEmgName" maxlength="80" value="${esc(m.emergencyName)}" placeholder="Contact person"></div>
            <div class="pp-field"><label for="pfEmgPhone">Emergency contact phone</label><input id="pfEmgPhone" type="tel" maxlength="20" value="${esc(m.emergencyPhone)}" placeholder="09XX XXX XXXX"><small class="pp-err" id="pfEmgPhone-err" hidden></small></div>
          </div>
          <div class="pp-actions pp-actions-end" style="margin-top:auto;padding-top:16px">
            <button type="button" class="pp-btn" id="profileDiscard">Discard changes</button>
            <button type="submit" class="pp-btn pp-btn-primary"><i class="fa-solid fa-floppy-disk"></i> Save profile</button>
          </div>
        </form>

        <aside class="pp-card mb-prof-preview-card" aria-label="How you appear">
          <div class="pp-card-head">
            <div>
              <h3><i class="fa-regular fa-eye" aria-hidden="true" style="color:#e8b93a;margin-right:6px"></i> How you appear</h3>
              <p class="pp-muted">Updates live as you edit.</p>
            </div>
          </div>
          <div class="mb-prev-block">
            <span class="mb-prev-lbl">SIDEBAR</span>
            <div class="mb-prev-chip">
              <div class="mb-prev-mini-ava">${avaInner}</div>
              <div>
                <strong id="mbPrevName">${esc(m.name)}</strong>
                <small>${esc(plan)}</small>
              </div>
            </div>
          </div>
          <div class="mb-prev-block">
            <span class="mb-prev-lbl">CHECK-IN PASS</span>
            <div class="mb-prev-pass">
              <div>
                <strong id="mbPrevPassName">${esc(m.name)}</strong>
                <small id="mbPrevPhone">${esc(m.phone || m.id)}</small>
              </div>
              <span class="pp-status ${status[0]}">${status[1]}</span>
            </div>
          </div>
          <div class="mb-ava-picker" style="margin-top:auto;padding-top:10px">
            <div class="mb-ava-head"><strong>Quick avatar</strong><span>Change anytime</span></div>
            <div class="mb-ava-grid" role="radiogroup" aria-label="Choose an avatar">
              ${["av-1", "av-2", "av-3", "av-4", "av-5", "av-6"].map(pid => {
                const pSrc = window.ProFitAvatar ? window.ProFitAvatar.resolve(pid, pid) : "";
                const isSel = String(m.photoData || "") === pid;
                return `<button type="button" class="mb-ava-opt${isSel ? " sel" : ""}" data-pick-avatar="${pid}" aria-pressed="${isSel}" title="Use avatar ${pid.slice(-1)}">${pSrc ? `<img src="${esc(pSrc)}" alt="Avatar ${pid.slice(-1)}">` : pid}</button>`;
              }).join("")}
            </div>
          </div>
        </aside>
      </div>
    </div>`;
    hydrate(root);
    bindProfile(root);
    root.querySelector("#mbProfChangePwBtn")?.addEventListener("click", () => {
      if (window.PFChangePassword && typeof window.PFChangePassword.open === "function") {
        window.PFChangePassword.open();
      } else {
        toast("Change password is available after signing in.", true);
      }
    });
    const syncLivePreview = () => {
      const f = root.querySelector("#profileForm");
      if (!f) return;
      const nm = f.pfName.value.trim() || m.name || "Member";
      const ph = f.pfPhone.value.trim();
      const emg = f.pfEmgName.value.trim() || f.pfEmgPhone.value.trim();
      if ($("mbProfHeroName")) $("mbProfHeroName").textContent = nm;
      if ($("mbPrevName")) $("mbPrevName").textContent = nm;
      if ($("mbPrevPassName")) $("mbPrevPassName").textContent = nm;
      if ($("mbPrevPhone")) $("mbPrevPhone").textContent = ph || m.id;
      const liveChecks = [
        nm.split(/\s+/).filter(Boolean).length >= 2,
        hasPhoto,
        ph.length >= 7,
        emg.length >= 2
      ];
      const livePct = Math.round((liveChecks.filter(Boolean).length / 4) * 100);
      if ($("mbProfRingPct")) $("mbProfRingPct").textContent = `${livePct}%`;
      if ($("mbProfRingArc")) $("mbProfRingArc").style.strokeDashoffset = (circ * (1 - livePct / 100)).toFixed(2);
      const listEl = $("mbProfChecks");
      if (listEl) {
        const labels = ["Add your name", "Upload a photo", "Add a mobile number", "Add emergency contact"];
        listEl.innerHTML = labels.map((lbl, idx) =>
          `<li class="${liveChecks[idx] ? "is-done" : ""}"><i class="fa-${liveChecks[idx] ? "solid fa-check" : "regular fa-clock"}" aria-hidden="true"></i> ${lbl}</li>`
        ).join("");
      }
    };
    root.querySelector("#profileForm")?.addEventListener("input", syncLivePreview);
  }
  function bindProfile(root) {
    const form = root.querySelector("#profileForm");
    const dirty = root.querySelector("#profileDirty");
    form.addEventListener("input", () => { dirty.hidden = false; });
    root.querySelector("#profileDiscard").addEventListener("click", renderProfile);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const m = profileMember();
      if (!m) return;
      const v = {
        name: form.pfName.value.trim(), email: form.pfEmail.value.trim(), phone: form.pfPhone.value.trim(),
        address: form.pfAddress.value.trim(), emergencyName: form.pfEmgName.value.trim(), emergencyPhone: form.pfEmgPhone.value.trim()
      };
      root.querySelectorAll(".pp-err").forEach(el => { el.hidden = true; el.textContent = ""; });
      const fail = (id, msg) => { const el = root.querySelector(`#${id}-err`); el.textContent = msg; el.hidden = false; };
      let ok = true;
      if (v.name.split(/\s+/).filter(Boolean).length < 2) { fail("pfName", "Enter your first and last name."); ok = false; }
      if (!validEmail(v.email)) { fail("pfEmail", "Enter a valid email address."); ok = false; }
      else if (hasDB && DB.members.some(x => x.id !== m.id && x.email.toLowerCase() === v.email.toLowerCase())) { fail("pfEmail", "Another account already uses this email."); ok = false; }
      if (!validPhone(v.phone)) { fail("pfPhone", "Enter a valid mobile number."); ok = false; }
      if (!validPhone(v.emergencyPhone)) { fail("pfEmgPhone", "Enter a valid phone number."); ok = false; }
      if (!ok) return toast("Please fix the highlighted fields.", true);

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        if (m.__server) {
          const r = await window.ProFitAPI.patch("/member/me/", { name: v.name, phone: v.phone, address: v.address });
          if (r?.name) v.name = r.name;
          if (window.__pfMemberMe?.user) {
            window.__pfMemberMe.user.name = v.name;
            window.__pfMemberMe.user.phone = r?.phone ?? v.phone;
            window.__pfMemberMe.user.address = r?.address ?? v.address;
          }
          window.__pfRefreshProfileCard?.();
        }
        Object.assign(m, v);
        persistProfileMember(m);
        if (!m.__local) {
          const session = sessionMember() || {};
          try {
            localStorage.setItem("profit-member-logged-in", JSON.stringify({ ...session, name: v.name, email: v.email, phone: v.phone, address: v.address, emergencyName: v.emergencyName, emergencyPhone: v.emergencyPhone }));
            const verified = JSON.parse(sessionStorage.getItem("profit-verified-session") || "null");
            if (verified) sessionStorage.setItem("profit-verified-session", JSON.stringify({ ...verified, name: v.name }));
          } catch { /* ignore */ }
        }
        const firstRaw = v.name.split(/\s+/)[0] || "Member";
        const firstCap = firstRaw.charAt(0).toUpperCase() + firstRaw.slice(1);
        const greeting = $("memberGreeting");
        if (greeting) greeting.innerHTML = `${esc(firstCap)},<br>let's get<br>to work.`;
        const head = $("memberName");
        if (head) head.textContent = v.name;
        const initials = initialsOf(v.name);
        [$("memberInitials"), $("memberTopInitials")].forEach(el => {
          if (el && !el.querySelector("img")) el.textContent = initials;
        });
        const profSub = $("mbStProfSub");
        if (profSub) profSub.textContent = `${v.name} · ${v.email}`;
        toast("Profile updated.");
        renderProfile();
      } catch (err) {
        toast(err.message || "Could not save your profile.", true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    root.querySelectorAll("[data-pick-avatar]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const presetId = btn.dataset.pickAvatar;
        const m = profileMember();
        if (!m || !presetId) return;
        if (m.__server) {
          try {
            const r = await window.ProFitAPI.patch("/member/me/", { photo: presetId });
            if (window.__pfMemberMe?.user) window.__pfMemberMe.user.photo = r.photo || presetId;
          } catch (err) {
            toast(err.message || "Could not save avatar.", true);
            return;
          }
        }
        m.photoData = presetId;
        m.photoId = "";
        persistProfileMember(m);
        window.__pfPaintAvatars?.(presetId);
        toast("Avatar updated.");
        renderProfile();
      });
    });
    const photoInput = root.querySelector("#profilePhotoInput");
    photoInput.addEventListener("change", async e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (profileMember()?.__server) {
        try {
          let side = 360, q = 0.82, url = "";
          for (let i = 0; i < 5; i++) {
            const blob = await compressImage(file, side, q);
            url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("The photo could not be read.")); r.readAsDataURL(blob); });
            if (url.length <= 240000) break;
            side = Math.round(side * 0.8); q = Math.max(0.6, q - 0.06);
          }
          if (url.length > 240000) throw new Error("That photo is too large. Choose a smaller one.");
          const r = await window.ProFitAPI.patch("/member/me/", { photo: url });
          window.__pfMemberMe.user.photo = r.photo;
          window.__pfPaintAvatars?.(r.photo);
          toast("Profile photo saved.");
          renderProfile();
        } catch (err) { toast(err.message || "The photo could not be saved.", true); }
        return;
      }
      try {
        const blob = await compressImage(file, 800, 0.86);
        const id = await media.save(blob);
        const m = profileMember();
        const old = m.photoId;
        m.photoId = id;
        persistProfileMember(m);
        if (old) await media.remove(old).catch(() => {});
        toast("Profile photo updated.");
        renderProfile();
      } catch (err) { toast(err.message || "The photo could not be saved.", true); }
    });
    root.querySelector("#profilePhotoRemove")?.addEventListener("click", async () => {
      const m = profileMember();
      if (m?.__server) {
        try {
          await window.ProFitAPI.patch("/member/me/", { photo: "" });
          window.__pfMemberMe.user.photo = "";
          window.__pfPaintAvatars?.("");
          toast("Profile photo removed.");
          renderProfile();
        } catch (err) { toast(err.message || "The photo could not be removed.", true); }
        return;
      }
      if (!m?.photoId) return;
      const old = m.photoId;
      m.photoId = null;
      persistProfileMember(m);
      await media.remove(old).catch(() => {});
      toast("Profile photo removed.");
      renderProfile();
    });
  }


  // ---------- Member portal layout and theme ----------
  function markMemberLayout() {
    const dash = $("memberDashboard");
    if (sessionMember() && dash && !dash.hidden) document.body.classList.add("is-member");
  }
  function portalThemeSetup() {
    if ($("memberTheme") || document.querySelector(".sidebar")) return; // layout pages handle their own theme
    let dark = true;
    try { dark = localStorage.getItem("theme") !== "light"; } catch { /* default dark */ }
    document.body.classList.toggle("dark", dark);
    const nav = document.querySelector(".portal-nav");
    if (!nav || $("portalTheme")) return;
    const btn = document.createElement("button");
    btn.id = "portalTheme";
    btn.type = "button";
    btn.className = "theme-toggle";
    const paint = () => {
      const d = document.body.classList.contains("dark");
      btn.innerHTML = d ? SUN_SVG : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
      btn.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode");
    };
    btn.addEventListener("click", () => {
      const d = !document.body.classList.contains("dark");
      document.body.classList.toggle("dark", d);
      try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* ignore */ }
      paint();
    });
    paint();
    nav.appendChild(btn);
  }

  // ---------- Member menu, calendar, schedule and settings ----------
  const PREFS_KEY = "profit-member-prefs";
  const readPrefs = () => { try { return { classReminders: true, weeklyRecap: true, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || "null") || {}) }; } catch { return { classReminders: true, weeklyRecap: true }; } };
  const writePrefs = p => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ } };

  // Accent colour — the same list the staff workspace offers, so the member's
  // choice paints the whole product the same way.
  const ACCENT_SWATCHES = [
    { id: "gold", label: "Gold", hex: "#e0b94a" },
  ];
  const ACCENT_KEY = "pp-accent";
  const readAccent = () => {
    let v = "gold";
    try { v = localStorage.getItem(ACCENT_KEY) || localStorage.getItem("pf-accent") || "gold"; } catch { /* ignore */ }
    if (!ACCENT_SWATCHES.some(a => a.id === v)) v = "gold";
    return { value: v };
  };
  const writeAccent = v => {
    try {
      localStorage.setItem(ACCENT_KEY, v);
      localStorage.setItem("pf-accent", v);
      localStorage.setItem("accent", v);
    } catch { /* ignore */ }
    document.documentElement.dataset.accent = v;
  };

  // Only show classes actually configured by a trainer or gym staff (no hardcoded demo coaches).
  const getTimetable = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("profit-trainer-classes-v1") || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch { /* ignore */ }
    return Array.isArray(window.ProFitLiveTimetable) ? window.ProFitLiveTimetable : [];
  };
  const DOW_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const classesOn = dateISO => getTimetable().filter(c => c.dow === parseISO(dateISO).getDay()).sort((a, b) => a.time.localeCompare(b.time));
  const bookedOn = dateISO => state.bookings.filter(b => b.date === dateISO).sort((a, b) => a.time.localeCompare(b.time));
  // A member's own sessions sit alongside the gym timetable.
  const plansOn = dateISO => (state.plans || []).filter(p => p.date === dateISO).sort((a, b) => a.time.localeCompare(b.time));
  function checkinDays() {
    const set = new Set(state.diary.map(x => x.date));
    // window.__pfAttendanceDays is already stored as local YYYY-MM-DD strings
    // (fixed in member-home.html render())
    (window.__pfAttendanceDays || []).forEach(d => set.add(d));
    // Demo checkins are only merged when running in offline/demo mode without a real member session
    if (!window.__pfMemberMe) {
      try {
        JSON.parse(localStorage.getItem("profit-member-demo-checkins") || "[]").forEach(x => {
          const raw = String(x.date || "");
          if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            set.add(raw); // already a local date string, use as-is
          } else if (raw.length > 10) {
            // Full ISO timestamp — parse and extract local date parts
            const d = new Date(raw);
            if (!isNaN(d.getTime())) {
              const pad = n => String(n).padStart(2, "0");
              set.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
            }
          }
        });
      } catch { /* ignore */ }
    }
    return set;
  }
  function monthCells(anchor) {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const startDow = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < startDow; i++) out.push(null);
    for (let d = 1; d <= total; d++) out.push(iso(new Date(y, m, d)));
    return out;
  }
  function calendarHTML(anchor, selectedISO) {
    const today = todayISO();
    const checkins = checkinDays();
    const marks = d => {
      const f = [];
      if (checkins.has(d)) f.push("checkin");
      if (state.bookings.some(b => b.date === d)) f.push("booked");
      if (state.diary.some(x => x.date === d)) f.push("diary");
      return f;
    };
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let monthVisits = 0, bestStreak = 0, curStreak = 0;
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dIso = iso(new Date(y, m, dayNum));
      if (checkins.has(dIso)) {
        monthVisits++;
        curStreak++;
        if (curStreak > bestStreak) bestStreak = curStreak;
      } else {
        curStreak = 0;
      }
    }
    const pctDays = Math.round((monthVisits / Math.max(daysInMonth, 1)) * 100);

    const cells = monthCells(anchor).map(d => {
      if (!d) return `<span class="pp-cal-pad" aria-hidden="true"></span>`;
      const cls = ["pp-cal-day"];
      if (checkins.has(d)) cls.push("is-checkin");
      if (d === today) cls.push("is-today");
      if (d === selectedISO) cls.push("is-selected");
      const dots = marks(d).map(f => `<i class="pp-cal-dot ${f}"></i>`).join("");
      return `<button type="button" class="${cls.join(" ")}" data-cal-day="${esc(d)}" aria-label="${esc(fmt(d))}"><b>${parseISO(d).getDate()}</b><span class="pp-cal-dots" aria-hidden="true">${dots}</span></button>`;
    }).join("");
    return `<div class="pp-cal-head">
        <button type="button" class="pp-icon-btn" data-cal-move="-1" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button>
        <strong>${esc(anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" }))}</strong>
        <button type="button" class="pp-icon-btn" data-cal-move="1" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="pp-cal-grid" role="group" aria-label="Calendar">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<span class="pp-cal-dow" aria-hidden="true">${d}</span>`).join("")}
        ${cells}
      </div>
      <div class="pp-cal-stats">
        <div class="pp-cal-stat"><strong>${monthVisits}</strong><span>Visits</span></div>
        <div class="pp-cal-stat"><strong>${bestStreak}</strong><span>Best streak</span></div>
        <div class="pp-cal-stat"><strong>${pctDays}%</strong><span>Days in</span></div>
      </div>`;
  }
  function daySummaryHTML(d) {
    const parts = [`<strong>${esc(fmt(d))}</strong>`];
    parts.push(checkinDays().has(d)
      ? `<span class="pp-chip pp-chip-good"><i class="fa-solid fa-circle-check"></i> Checked in</span>`
      : `<span class="pp-chip pp-muted">No check-in</span>`);
    bookedOn(d).forEach(b => parts.push(`<span class="pp-chip">${b.emoji} ${esc(b.name)} · ${esc(b.time)}</span>`));
    plansOn(d).forEach(p => parts.push(`<span class="pp-chip pp-chip-gold">🗒️ ${esc(p.title)} · ${esc(p.time)}</span>`));
    const logged = state.diary.find(x => x.date === d);
    if (logged) parts.push(`<span class="pp-chip">📓 ${esc(logged.title)}</span>`);
    return parts.join("");
  }

  function initMemberCalendar() {
    const root = $("memberCalendar");
    if (!root) return;
    let anchor = new Date(), selected = todayISO();
    const draw = () => {
      root.innerHTML = calendarHTML(anchor, selected) + `<div class="pp-cal-summary">${daySummaryHTML(selected)}</div>`;
    };
    root.addEventListener("click", e => {
      const mv = e.target.closest("[data-cal-move]");
      if (mv) { anchor = new Date(anchor.getFullYear(), anchor.getMonth() + Number(mv.dataset.calMove), 1); return draw(); }
      const day = e.target.closest("[data-cal-day]");
      if (day) { selected = day.dataset.calDay; draw(); }
    });
    draw();
  }

  function renderUpNext() {
    const box = $("upNextList");
    if (!box) return;
    const today = todayISO();
    const classRows = [...state.bookings].filter(b => b.date >= today).map(b => ({
      key: b.date + "|" + b.time, name: `${b.emoji} ${b.name}`, detail: `${fmt(b.date)} · ${b.time} · ${b.coach || "Coach"}`, mine: false
    }));
    const planRows = [...(state.plans || [])].filter(p => p.date >= today).map(p => ({
      key: "plan|" + p.id, name: `🗒️ ${p.title}`, detail: `${fmt(p.date)} · ${p.time}${p.mins ? ` · ${p.mins} min` : ""} · Your own activity`, mine: true
    }));
    const rows = [...classRows, ...planRows].sort((a, b) => a.detail.localeCompare(b.detail)).slice(0, 4);
    if (!rows.length) {
      box.innerHTML = `<p class="pp-muted">Nothing booked yet. Pick a class from the schedule, or add one of your own sessions.</p>`;
      return;
    }
    box.innerHTML = rows.map(r => `<div class="member-list-row">
      <span><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></span>
      <button class="pp-icon-btn" type="button" data-cancel="${esc(r.key)}" data-mine="${r.mine}" aria-label="Cancel ${esc(r.name.replace(/^[^\s]+\s/, ""))}"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join("");
    box.querySelectorAll("[data-cancel]").forEach(btn => btn.addEventListener("click", () => {
      if (btn.dataset.mine === "true") {
        const id = btn.dataset.cancel.split("|")[1];
        state.plans = (state.plans || []).filter(p => p.id !== id);
      } else {
        const [date, time] = btn.dataset.cancel.split("|");
        state.bookings = state.bookings.filter(b => !(b.date === date && b.time === time));
      }
      persist();
      renderUpNext();
      initScheduleList();
      toast("Booking cancelled.");
    }));
  }

  function initSchedule() {
    const root = $("scheduleRoot");
    if (!root) return;
    root.innerHTML = `<div class="mb-sched-split">
        <div class="pp-card mb-sched-cal">
          <div class="pp-card-head"><div><h3>Book a class</h3><p class="pp-muted">Tap a day to see what is running. Cancel any time.</p></div></div>
          <div id="scheduleCal" class="pp-cal"></div>
        </div>
        <div class="pp-card mb-sched-day" id="scheduleDayCard"></div>
      </div>
      <div class="pp-card" id="myPlanCard"></div>`;
    let anchor = new Date(), selected = todayISO();
    const cal = $("scheduleCal");
    const drawCal = () => { cal.innerHTML = calendarHTML(anchor, selected); };
    cal.addEventListener("click", e => {
      const mv = e.target.closest("[data-cal-move]");
      if (mv) { anchor = new Date(anchor.getFullYear(), anchor.getMonth() + Number(mv.dataset.calMove), 1); return drawCal(); }
      const day = e.target.closest("[data-cal-day]");
      if (day) { selected = day.dataset.calDay; drawCal(); drawDay(); }
    });
    const card = $("scheduleDayCard");
    const drawDay = () => {
      const list = classesOn(selected);
      const booked = bookedOn(selected);
      const personal = plansOn(selected);
      card.innerHTML = `<div class="pp-card-head"><div><h3>${esc(fmt(selected))}</h3><p class="pp-muted">${esc(DOW_LABEL[parseISO(selected).getDay()])}</p></div></div>` +
        (personal.length ? `<div class="pp-class-list">${personal.map(p => `<div class="pp-class-row is-mine">
            <span class="pp-class-emoji" aria-hidden="true">🗒️</span>
            <div class="pp-class-copy"><strong>${esc(p.title)}</strong><small>${esc(p.time)}${p.mins ? ` · ${p.mins} min` : ""} · Added by you</small></div>
            <button class="pp-btn pp-btn-soft" type="button" data-del-plan="${esc(p.id)}" aria-label="Remove ${esc(p.title)}"><i class="fa-solid fa-trash-can"></i></button>
          </div>`).join("")}</div>` : "") +
        (list.length ? `<div class="pp-class-list">${list.map(c => {
          const on = isBooked(selected, c.time);
          return `<div class="pp-class-row ${on ? "is-booked" : ""}">
            <span class="pp-class-emoji" aria-hidden="true">${c.emoji}</span>
            <div class="pp-class-copy"><strong>${esc(c.name)}</strong><small>${esc(c.time)} · ${c.mins} min · ${esc(c.coach)} · ${c.cap} spots</small></div>
            <button class="pp-btn ${on ? "pp-btn-soft" : "pp-btn-primary"}" type="button" data-book="${esc(c.time)}">${on ? "Cancel" : "Book"}</button>
          </div>`;
        }).join("")}</div>`
        : (!personal.length ? `<p class="pp-muted">No classes scheduled on this day. Try another date, book the gym floor below, or add something of your own.</p>` : "")) +
        (booked.length ? `<p class="pp-muted pp-small">Booked today: ${esc(booked.map(b => b.name).join(", "))}</p>` : "");
    };
    card.addEventListener("click", e => {
      const del = e.target.closest("[data-del-plan]");
      if (del) {
        state.plans = (state.plans || []).filter(p => p.id !== del.dataset.delPlan);
        persist(); drawDay(); renderMyPlans(); window.__pfRefreshMemberSpace?.();
        return toast("Removed from your schedule.");
      }
      const b = e.target.closest("[data-book]");
      if (!b) return;
      const time = b.dataset.book;
      const cls = classesOn(selected).find(c => c.time === time);
      if (!cls) return;
      if (isBooked(selected, time)) {
        state.bookings = state.bookings.filter(x => !(x.date === selected && x.time === time));
        persist(); drawDay(); toast("Booking cancelled.");
      } else {
        state.bookings = [{ date: selected, time, name: cls.name, coach: cls.coach, emoji: cls.emoji }, ...state.bookings];
        persist(); drawDay(); toast(`${cls.name} booked for ${fmt(selected)} at ${time}.`);
      }
      renderUpNext();
      initScheduleList();
    });

    // Members can put their own sessions on the timetable too — a solo session,
    // a run, physio, anything the timetable does not cover.
    const myCard = $("myPlanCard");
    const renderMyPlans = () => {
      const items = [...(state.plans || [])].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      myCard.innerHTML = `<div class="pp-card-head"><div><h3>My own activities</h3><p class="pp-muted">Training the timetable does not list — a solo session, a run, physio.</p></div></div>
        <form class="pp-inline-form" id="myPlanForm" novalidate>
          <input id="myPlanTitle" maxlength="80" placeholder="e.g. Leg day, 5k run, physio" aria-label="Activity">
          <input type="date" id="myPlanDate" value="${esc(selected)}" aria-label="Date">
          <input type="time" id="myPlanTime" value="18:00" aria-label="Time">
          <input type="number" id="myPlanMins" min="0" max="600" step="5" placeholder="Min" aria-label="Minutes">
          <button class="pp-btn pp-btn-primary" type="submit"><i class="fa-solid fa-plus"></i> Add</button>
        </form>
        <div id="myPlanList" class="pp-mini-list"></div>`;
      $("myPlanList").innerHTML = items.length
        ? items.map(p => `<div class="pp-mini-row"><span><strong>${esc(p.title)}</strong><small> ${esc(fmt(p.date))} · ${esc(p.time)}${p.mins ? ` · ${p.mins} min` : ""}</small></span><button type="button" class="pp-icon-btn" data-del-plan="${esc(p.id)}" aria-label="Remove ${esc(p.title)}"><i class="fa-solid fa-xmark"></i></button></div>`).join("")
        : '<p class="pp-muted pp-small">Nothing added yet.</p>';
      $("myPlanForm").addEventListener("submit", ev => {
        ev.preventDefault();
        const title = $("myPlanTitle").value.trim();
        if (title.length < 2) return toast("Give the activity a name.", true);
        state.plans = [{ id: "p" + Date.now().toString(36), date: $("myPlanDate").value || selected, time: $("myPlanTime").value || "18:00", title, mins: Number($("myPlanMins").value) || 0 }, ...(state.plans || [])];
        persist();
        renderMyPlans(); drawDay(); window.__pfRefreshMemberSpace?.();
        toast(`${title} added to your schedule.`);
      });
      myCard.querySelectorAll("[data-del-plan]").forEach(btn => btn.addEventListener("click", () => {
        state.plans = (state.plans || []).filter(p => p.id !== btn.dataset.delPlan);
        persist(); renderMyPlans(); drawDay(); window.__pfRefreshMemberSpace?.();
        toast("Removed from your schedule.");
      }));
    };
    myCard.addEventListener("click", e => {
      const del = e.target.closest("[data-del-plan]");
      if (!del) return;
      state.plans = (state.plans || []).filter(p => p.id !== del.dataset.delPlan);
      persist(); renderMyPlans(); drawDay(); window.__pfRefreshMemberSpace?.();
    });

    window.__pfRedrawSchedule = () => { drawCal(); drawDay(); renderMyPlans(); };
    drawCal(); drawDay(); renderMyPlans();
  }
  function initScheduleList() { window.__pfRedrawSchedule?.(); }
  function isBooked(dateISO, time) { return state.bookings.some(b => b.date === dateISO && b.time === time); }
  window.__pfRefreshMemberSpace = () => { initMemberCalendar(); renderUpNext(); window.__pfRedrawSchedule?.(); };

  function initMemberSettings() {
    const root = $("memberSettingsRoot");
    if (!root) return;
    const prefs = readPrefs();
    const dark = document.body.classList.contains("dark");
    const m = profileMember() || {};
    const displayName = m.name || window.__pfMemberMe?.user?.name || "Member";
    const displayEmail = m.email || window.__pfMemberMe?.user?.email || "";
    const profSubText = displayEmail ? `${displayName} · ${displayEmail}` : "Manage your name, photo, and contact info";
    let savedFont = "md";
    let badgeOn = true;
    try {
      savedFont = localStorage.getItem("pf-font-size") || "md";
      badgeOn = localStorage.getItem("pref-badge") !== "off";
    } catch { /* ignore */ }

    root.innerHTML = `<section class="mb-st-shell" aria-label="Member settings">
      <nav class="mb-st-sidenav" id="mbStSideNav" aria-label="Settings sections">
        <button type="button" data-st-jump="mbStAccount" class="on"><i class="fa-regular fa-user" aria-hidden="true"></i> Account</button>
        <button type="button" data-st-jump="mbStNotifications"><i class="fa-regular fa-bell" aria-hidden="true"></i> Notifications</button>
        <button type="button" data-st-jump="mbStAppearance"><i class="fa-regular fa-sun" aria-hidden="true"></i> Appearance</button>
        <button type="button" data-st-jump="mbStGeneral"><i class="fa-solid fa-globe" aria-hidden="true"></i> General</button>
        <button type="button" data-st-jump="mbStInstall"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Install the app</button>
        <button type="button" data-st-jump="mbStData"><i class="fa-solid fa-database" aria-hidden="true"></i> My Data</button>
      </nav>
      <div class="mb-st-stack">
      <!-- Account (Member-allowed items only; Change Password lives inside Settings) -->
      <article class="mb-st-card" id="mbStAccount">
        <div class="mb-st-head"><i class="fa-regular fa-user" aria-hidden="true"></i> Account</div>
        <button class="mb-st-row" type="button" data-member-goto="profile">
          <div class="mb-st-lead">
            <span class="mb-st-ico" aria-hidden="true"><i class="fa-regular fa-user"></i></span>
            <div class="mb-st-copy"><span>Edit Profile</span><small id="mbStProfSub">${esc(profSubText)}</small></div>
          </div>
          <span class="mb-st-end"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>
        </button>
        <button class="mb-st-row" type="button" id="mbStChangePwBtn">
          <div class="mb-st-lead">
            <span class="mb-st-ico" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>
            <div class="mb-st-copy"><span>Change Password</span><small>Update your account sign-in password</small></div>
          </div>
          <span class="mb-st-end"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>
        </button>
      </article>

      <!-- Notifications -->
      <article class="mb-st-card" id="mbStNotifications">
        <div class="mb-st-head"><i class="fa-regular fa-bell" aria-hidden="true"></i> Notifications</div>
        <label class="mb-st-row mb-st-toggle-row">
          <div class="mb-st-copy"><span>Unread Badge</span><small>Show unread count on the bell icon</small></div>
          <input type="checkbox" id="mbPrefBadge" ${badgeOn ? "checked" : ""}>
        </label>
        <label class="mb-st-row mb-st-toggle-row">
          <div class="mb-st-copy"><span>Class Reminders</span><small>Remind me an hour before a booked class</small></div>
          <input type="checkbox" data-pref="classReminders" ${prefs.classReminders ? "checked" : ""}>
        </label>
        <label class="mb-st-row mb-st-toggle-row">
          <div class="mb-st-copy"><span>Weekly Recap</span><small>Summary of my weekly visits and streak</small></div>
          <input type="checkbox" data-pref="weeklyRecap" ${prefs.weeklyRecap ? "checked" : ""}>
        </label>
        <button class="mb-st-row" type="button" data-member-goto="announcements">
          <span>All Notifications</span>
          <span class="mb-st-end"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>
        </button>
      </article>

      <!-- Appearance & Accessibility -->
      <article class="mb-st-card" id="mbStAppearance">
        <div class="mb-st-head"><i class="fa-regular fa-sun" aria-hidden="true"></i> Appearance &amp; Accessibility</div>
        <label class="mb-st-row mb-st-toggle-row">
          <div class="mb-st-copy"><span>Dark Mode</span><small>Switch between dark obsidian and warm ivory</small></div>
          <input type="checkbox" id="mbPrefDark" ${dark ? "checked" : ""}>
        </label>
        <div class="mb-st-font-row">
          <span>Font Size</span>
          <div class="mb-st-pills" role="radiogroup" aria-label="Font size">
            <button type="button" role="radio" data-mb-font="sm" class="${savedFont === "sm" ? "active" : ""}" aria-checked="${savedFont === "sm"}">Small</button>
            <button type="button" role="radio" data-mb-font="md" class="${savedFont === "md" ? "active" : ""}" aria-checked="${savedFont === "md"}">Medium</button>
            <button type="button" role="radio" data-mb-font="lg" class="${savedFont === "lg" ? "active" : ""}" aria-checked="${savedFont === "lg"}">Large</button>
          </div>
        </div>
        <div class="mb-st-font-prev" id="mbStFontPrev">
          <strong>Preview</strong>
          <span>Your Monthly Plan is active. Show your QR at the front desk to check in.</span>
        </div>
        <label class="mb-st-row mb-st-toggle-row">
          <div class="mb-st-copy"><span>High Contrast Mode</span><small>Increase contrast for text, borders, inputs, and buttons in both Light and Dark themes.</small></div>
          <input type="checkbox" id="mbPrefHighContrast" data-a11y="contrast">
        </label>
        <label class="mb-st-row mb-st-toggle-row">
          <div class="mb-st-copy"><span>Enhanced Focus Indicators</span><small>Show a prominent orange focus outline around the currently focused button, input, link, or menu item.</small></div>
          <input type="checkbox" id="mbPrefEnhancedFocus" data-a11y="focus">
        </label>
      </article>

      <!-- General -->
      <article class="mb-st-card" id="mbStGeneral">
        <div class="mb-st-head"><i class="fa-solid fa-globe" aria-hidden="true"></i> General</div>
        <div class="mb-st-row">
          <span>Language</span>
          <span class="mb-st-end">English</span>
        </div>
        <button class="mb-st-row" type="button" id="mbStHelpBtn">
          <span>Help &amp; Support</span>
          <span class="mb-st-end"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>
        </button>
      </article>

      <!-- Install the app -->
      <article class="mb-st-card" id="mbStInstall">
        <div class="mb-st-head"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Install the app</div>
        <div class="mb-st-install-body">
          <p id="installHelpStatus" role="status" style="margin:0 0 10px;font-weight:600">You can add ProFit to your home screen.</p>
          <div data-install-steps>
            <p style="margin:0 0 6px;font-weight:700">iPhone (Safari)</p>
            <ol style="margin:0 0 12px 18px;padding:0">
              <li>Open ProFit in Safari.</li>
              <li>Tap the Share button.</li>
              <li>Tap Add to Home Screen, then Add.</li>
            </ol>
            <p style="margin:0 0 6px;font-weight:700">Android (Chrome)</p>
            <ol style="margin:0 0 0 18px;padding:0">
              <li>Open ProFit in Chrome.</li>
              <li>Tap the three-dot menu.</li>
              <li>Tap Install app (or Add to Home screen), then Install.</li>
            </ol>
          </div>
        </div>
      </article>

      <!-- My data & Logout -->
      <article class="mb-st-card" id="mbStData">
        <div class="mb-st-head"><i class="fa-solid fa-database" aria-hidden="true"></i> My Data</div>
        <button class="mb-st-row mb-st-danger-row" type="button" id="resetMemberTools">
          <div class="mb-st-copy"><span>Reset local training data</span><small>Clears diary, goals, and bookings saved in this browser</small></div>
          <span class="mb-st-end"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></span>
        </button>
      </article>

      <article class="mb-st-card mb-st-logout-card">
        <button class="mb-st-logout-btn" type="button" data-logout>
          <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Logout
        </button>
      </article>
      </div>
    </section>`;

    // Side section jump-nav
    const navBtns = [...root.querySelectorAll("[data-st-jump]")];
    navBtns.forEach(btn => btn.addEventListener("click", () => {
      navBtns.forEach(b => b.classList.toggle("on", b === btn));
      const target = document.getElementById(btn.dataset.stJump);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    // Change Password modal trigger inside Settings
    root.querySelector("#mbStChangePwBtn")?.addEventListener("click", () => {
      if (window.PFChangePassword && typeof window.PFChangePassword.open === "function") {
        window.PFChangePassword.open();
      } else {
        toast("Change password is available after signing in.", true);
      }
    });

    // Dark Mode toggle
    const darkToggle = root.querySelector("#mbPrefDark");
    darkToggle?.addEventListener("change", () => {
      const d = darkToggle.checked;
      document.body.classList.toggle("dark", d);
      try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* ignore */ }
      window.__pfPaintThemeIcon?.();
    });

    // Unread Badge toggle
    const badgeToggle = root.querySelector("#mbPrefBadge");
    badgeToggle?.addEventListener("change", () => {
      const on = badgeToggle.checked;
      try { localStorage.setItem("pref-badge", on ? "on" : "off"); } catch { /* ignore */ }
      document.body.classList.toggle("hide-notif-badge", !on);
      toast("Preference saved.");
    });

    // Font Size selector (scales both preview text and portal content)
    const FONT_SCALE = { sm: "13px", md: "15px", lg: "17.5px" };
    const PREVIEW_SIZE = { sm: "12px", md: "14px", lg: "17px" };
    const applyFont = size => {
      const key = FONT_SCALE[size] ? size : "md";
      document.documentElement.dataset.fontSize = key;
      document.documentElement.style.fontSize = FONT_SCALE[key];
      const prevEl = root.querySelector("#mbStFontPrev span");
      if (prevEl) prevEl.style.fontSize = PREVIEW_SIZE[key];
      try { localStorage.setItem("pf-font-size", key); } catch { /* ignore */ }
      root.querySelectorAll("[data-mb-font]").forEach(btn => {
        const on = btn.dataset.mbFont === key;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-checked", String(on));
      });
    };
    applyFont(savedFont);
    root.querySelectorAll("[data-mb-font]").forEach(btn => btn.addEventListener("click", () => applyFont(btn.dataset.mbFont)));
    window.ProFitA11y?.sync();

    // Help & Support modal with interactive Contact / FAQs / Terms / Privacy tabs (exact OG info)
    root.querySelector("#mbStHelpBtn")?.addEventListener("click", () => {
      modal({
        title: "Help & Support",
        confirmText: "Close",
        body: `<div class="mb-help-modal-body">
          <div class="mb-st-pills" role="tablist" aria-label="Help topics" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" role="tab" class="active" data-mb-help="contact" aria-selected="true" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px"><i class="fa-solid fa-headset" aria-hidden="true"></i> Contact</button>
            <button type="button" role="tab" data-mb-help="faqs" aria-selected="false" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px"><i class="fa-regular fa-circle-question" aria-hidden="true"></i> FAQs</button>
            <button type="button" role="tab" data-mb-help="terms" aria-selected="false" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px"><i class="fa-solid fa-file-contract" aria-hidden="true"></i> Terms</button>
            <button type="button" role="tab" data-mb-help="privacy" aria-selected="false" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Privacy</button>
          </div>
          <div style="max-height:50vh;overflow-y:auto;padding-right:4px">
            <div data-mb-help-pane="contact" style="display:grid;gap:10px">
              <a href="tel:+639060536064" style="display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);text-decoration:none;color:inherit">
                <span class="mb-st-ico"><i class="fa-solid fa-phone" aria-hidden="true"></i></span>
                <div><strong style="display:block;font-size:13.5px">Call Functional Performance</strong><small style="opacity:.75">0906 053 6064</small></div>
              </a>
              <a href="mailto:FunctionalPerformance.2022@gmail.com" style="display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);text-decoration:none;color:inherit">
                <span class="mb-st-ico"><i class="fa-regular fa-envelope" aria-hidden="true"></i></span>
                <div><strong style="display:block;font-size:13.5px">Email</strong><small style="opacity:.75">FunctionalPerformance.2022@gmail.com</small></div>
              </a>
              <div style="display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)">
                <span class="mb-st-ico"><i class="fa-solid fa-location-dot" aria-hidden="true"></i></span>
                <div><strong style="display:block;font-size:13.5px">Address</strong><small style="opacity:.75">Luksuhin - Mangas Rd., Saray, Mangas 1, Alfonso, Cavite, Philippines</small></div>
              </div>
            </div>
            <div data-mb-help-pane="faqs" hidden style="display:grid;gap:10px;font-size:13px">
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">How do I sign in?</strong><span style="opacity:.8">Use the email or username and password you set when joining online, or the account details provided by the Gym.</span></div>
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">I forgot my password. What do I do?</strong><span style="opacity:.8">Use the Forgot password? link on the Sign in page to receive a 6-digit verification code, or contact the gym front desk.</span></div>
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">How do I check my membership, payments, and attendance?</strong><span style="opacity:.8">After you sign in, your member home shows your membership status, expiry date, recent paid invoices, and recent gym check-ins.</span></div>
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">How do I request a trainer?</strong><span style="opacity:.8">You can request a trainer from your member home. The Gym reviews every request and may approve, change, or decline it.</span></div>
            </div>
            <div data-mb-help-pane="terms" hidden style="display:grid;gap:10px;font-size:13px">
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">Terms of Service (Last updated: October 2026)</strong><span style="opacity:.8">By using ProFit, the gym management system used by Functional Performance (the "Gym"), you agree to keep your login private, provide accurate details, and report unauthorized access immediately.</span></div>
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">Memberships, Attendance &amp; Payments</strong><span style="opacity:.8">Sign-up is free and starts a seven-day trial with app access only. To activate a gym membership, pay cash at the desk or submit a GCash claim with a reference number and screenshot link for staff review. Memberships automatically expire at the end of the plan period unless renewed.</span></div>
            </div>
            <div data-mb-help-pane="privacy" hidden style="display:grid;gap:10px;font-size:13px">
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">Privacy Policy (Last updated: October 2026)</strong><span style="opacity:.8">Data controller: Functional Performance. Passwords and one-time verification codes are stored only as secure hashes, traffic runs over HTTPS, and access is limited by role (Data Privacy Act of 2012 / Republic Act No. 10173).</span></div>
              <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1)"><strong style="display:block;margin-bottom:4px">Retention &amp; Contact</strong><span style="opacity:.8">Attendance and payment history remain stored so you can renew without losing records. For privacy requests, contact 0906 053 6064 or FunctionalPerformance.2022@gmail.com.</span></div>
            </div>
          </div>
        </div>`
      });
      setTimeout(() => {
        const wrap = document.querySelector(".mb-help-modal-body");
        if (!wrap) return;
        const cancelBtn = wrap.closest(".pp-modal, dialog, [role='dialog']")?.querySelector("[data-cancel], .pp-btn:not(.pp-btn-primary)");
        if (cancelBtn && /cancel/i.test(cancelBtn.textContent || "")) cancelBtn.hidden = true;
        wrap.querySelectorAll("[data-mb-help]").forEach(btn => {
          btn.addEventListener("click", () => {
            const key = btn.dataset.mbHelp;
            wrap.querySelectorAll("[data-mb-help]").forEach(b => {
              const on = b === btn;
              b.classList.toggle("active", on);
              b.setAttribute("aria-selected", String(on));
            });
            wrap.querySelectorAll("[data-mb-help-pane]").forEach(p => {
              p.hidden = p.dataset.mbHelpPane !== key;
            });
          });
        });
      }, 0);
    });

    root.querySelectorAll("[data-pref]").forEach(input => input.addEventListener("change", () => {
      const next = readPrefs();
      next[input.dataset.pref] = input.checked;
      writePrefs(next);
      toast("Preference saved.");
    }));
    root.querySelector("#resetMemberTools")?.addEventListener("click", () => modal({
      title: "Reset your training data?",
      body: `<p class="pp-muted">This clears your diary entries, goals, weight log, bookings and check-ins stored in this browser. Your membership is not affected.</p>`,
      confirmText: "Reset data",
      danger: true,
      onConfirm: () => {
        state = blank();
        try { localStorage.removeItem("profit-member-demo-checkins"); } catch { /* ignore */ }
        persist();
        initSchedule(); renderUpNext(); initMemberCalendar();
        toast("Your training data was reset.");
      }
    }));
  }

  // ---------- Header menu ----------
  function bindMemberMenu() {
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-member-goto]");
      if (!b || e.target.closest("#memberMenu")) return;
      goTab(b.dataset.memberGoto);
    });
    const btn = $("memberMenuToggle"), menu = $("memberMenu");
    if (!btn || !menu) return;
    const setOpen = open => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", e => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest(".member-user")) setOpen(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
    menu.addEventListener("click", e => {
      const b = e.target.closest("[data-member-goto]");
      if (!b) return;
      setOpen(false);
      goTab(b.dataset.memberGoto);
    });
  }

  // ---------- Start ----------
  function paintMemberBrand() {
    let gym = { name: "ProFit", logo: "" };
    try { gym = { ...gym, ...(JSON.parse(localStorage.getItem("profit-gym-profile") || "null") || {}) }; } catch { /* storage blocked */ }
    const name = (gym.name || "ProFit").trim();
    const brand = $("homeGymName");
    if (brand) brand.textContent = name;
    const img = $("homeLogoImg"), icon = $("homeLogoIcon");
    if (img && gym.logo) { img.src = gym.logo; img.hidden = false; if (icon) icon.hidden = true; }
    document.title = `My membership · ${name}`;

    // Bell in the ribbon: how many announcements are waiting for this member.
    const chip = document.querySelector(".member-top-chip");
    if (chip) {
      const count = window.ProFitAnnouncements ? window.ProFitAnnouncements.forAudience("Members").length : 0;
      const badge = $("homeAnnounceCount");
      if (badge) badge.textContent = String(count);
      chip.hidden = count === 0;
      chip.classList.toggle("has-new", count > 0);
      chip.setAttribute("role", "button");
      chip.setAttribute("tabindex", "0");
      chip.setAttribute("aria-label", `${count} gym announcement${count === 1 ? "" : "s"}`);
      chip.addEventListener("click", () => {
        goTab("announcements");
        const latest = window.ProFitAnnouncements.forAudience("Members")[0];
        if (latest) toast(latest.title);
      });
      chip.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chip.click(); } });
    }
  }

  function init() {
    initHomeTabs();
    syncThemeIcon();
    portalThemeSetup();
    markMemberLayout();
    bindMemberMenu();
    paintMemberBrand();
    if ($("diaryRoot")) bindDiary();
    initHealth();
    initMemberCalendar();
    initSchedule();
    renderUpNext();
    initMemberSettings();
    renderProfile();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
