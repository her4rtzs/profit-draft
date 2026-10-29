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
    const tabs = [...document.querySelectorAll(".pp-tab")];
    if (!tabs.length) return;
    const names = tabs.map(t => t.dataset.tab);
    const select = (name, updateHash = true) => {
      tabs.forEach(t => {
        const on = t.dataset.tab === name;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      // Settings has no tab; keep one tab in the keyboard order for the tablist.
      if (!names.includes(name)) tabs[0].tabIndex = 0;
      document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
      if (updateHash) history.replaceState(null, "", "#" + name);
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t.dataset.tab));
      t.addEventListener("keydown", e => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = names[(i + (e.key === "ArrowRight" ? 1 : names.length - 1)) % names.length];
        select(next);
        document.querySelector(`.pp-tab[data-tab="${next}"]`)?.focus();
      });
    });
    const hash = location.hash.slice(1);
    select(names.includes(hash) ? hash : names[0], false);
    selectTab = select;
  }
  function syncThemeIcon() {
    const btn = $("memberTheme");
    if (!btn) return;
    const paint = () => { btn.innerHTML = `<i class="fa-solid ${document.body.classList.contains("dark") ? "fa-sun" : "fa-moon"}"></i>`; };
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
  function serverMember() {
    const me = window.__pfMemberMe;
    if (!me || !me.user || !me.user.memberId) return null;
    let emg = {};
    try { emg = JSON.parse(localStorage.getItem(EMG_KEY(me.user.memberId)) || "{}") || {}; } catch { /* ignore */ }
    return {
      id: me.user.memberId, name: me.user.name || "Member", email: me.user.email || "", phone: me.user.phone || "",
      address: me.user.address || "", emergencyName: emg.emergencyName || "", emergencyPhone: emg.emergencyPhone || "",
      plan: me.membership?.planName || "Membership", start: null, end: me.membership?.expiry || null,
      photoId: null, photoData: me.user.photo || "", __server: true
    };
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
    root.innerHTML = `<div class="pp-profile">
      <aside class="pp-card pp-profile-card">
        <div class="pp-avatar xl gold-frame ${m.photoId || m.photoData ? "has-photo" : ""}" aria-hidden="true">${esc(initialsOf(m.name))}${m.photoData ? `<img src="${esc(m.photoData)}" alt="">` : m.photoId ? `<img data-photo-id="${esc(m.photoId)}" alt="" hidden>` : ""}</div>
        <h3>${esc(m.name)}</h3>
        <p class="pp-muted">${esc(m.id)}</p>
        <div class="pp-chips pp-center"><span class="pp-chip">${esc(plan)}</span><span class="pp-status ${status[0]}">${status[1]}</span></div>
        <dl class="pp-dl">
          <dt>Membership ends</dt><dd>${hasEnd ? esc(fmt(m.end)) : "—"}</dd>
          <dt>Member since</dt><dd>${m.start && !Number.isNaN(new Date(m.start).getTime()) ? esc(fmt(m.start)) : "—"}</dd>
        </dl>
        <div class="pp-actions pp-center">
          <label class="pp-btn" for="profilePhotoInput" tabindex="0"><i class="fa-solid fa-camera" aria-hidden="true"></i> ${m.photoId || m.photoData ? "Change photo" : "Add photo"}</label>
          <input type="file" id="profilePhotoInput" accept="image/*" hidden>
          ${m.photoId || m.photoData ? `<button class="pp-btn" type="button" id="profilePhotoRemove"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Remove</button>` : ""}
        </div>
        <p class="pp-small pp-muted">Plan and payment changes are handled by the gym team.</p>
      </aside>
      <form class="pp-card" id="profileForm" novalidate>
        <div class="pp-card-head"><div><h3>Personal details</h3><p class="pp-muted">Keep your contact details up to date so the gym can reach you.</p></div>
          <span class="pp-unsaved" id="profileDirty" hidden><i class="fa-solid fa-circle" aria-hidden="true"></i> Unsaved changes</span></div>
        <div class="pp-form-grid">
          <div class="pp-field"><label for="pfName">Full name</label><input id="pfName" maxlength="80" value="${esc(m.name)}"${m.__server ? " readonly" : ""}><small class="pp-err" id="pfName-err" hidden></small></div>
          <div class="pp-field"><label for="pfEmail">Email (for sign-in)</label><input id="pfEmail" type="email" maxlength="120" value="${esc(m.email)}"${m.__server ? " readonly" : ""}><small class="pp-err" id="pfEmail-err" hidden></small></div>
          <div class="pp-field"><label for="pfPhone">Mobile number</label><input id="pfPhone" type="tel" maxlength="20" value="${esc(m.phone)}" placeholder="09XX XXX XXXX"><small class="pp-err" id="pfPhone-err" hidden></small></div>
          <div class="pp-field"><label for="pfAddress">Home address</label><input id="pfAddress" maxlength="160" value="${esc(m.address)}" placeholder="Street, barangay, city"></div>
          <div class="pp-field"><label for="pfEmgName">Emergency contact name</label><input id="pfEmgName" maxlength="80" value="${esc(m.emergencyName)}"></div>
          <div class="pp-field"><label for="pfEmgPhone">Emergency contact phone</label><input id="pfEmgPhone" type="tel" maxlength="20" value="${esc(m.emergencyPhone)}"><small class="pp-err" id="pfEmgPhone-err" hidden></small></div>
        </div>
        <div class="pp-actions pp-actions-end">
          <button type="button" class="pp-btn" id="profileDiscard">Discard changes</button>
          <button type="submit" class="pp-btn pp-btn-primary"><i class="fa-solid fa-floppy-disk"></i> Save profile</button>
        </div>
      </form>
    </div>`;
    hydrate(root);
    bindProfile(root);
  }
  function bindProfile(root) {
    const form = root.querySelector("#profileForm");
    const dirty = root.querySelector("#profileDirty");
    form.addEventListener("input", () => { dirty.hidden = false; });
    root.querySelector("#profileDiscard").addEventListener("click", renderProfile);
    form.addEventListener("submit", e => {
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
      if (v.name.length < 2) { fail("pfName", "Enter your full name."); ok = false; }
      if (!validEmail(v.email)) { fail("pfEmail", "Enter a valid email address."); ok = false; }
      else if (hasDB && DB.members.some(x => x.id !== m.id && x.email.toLowerCase() === v.email.toLowerCase())) { fail("pfEmail", "Another account already uses this email."); ok = false; }
      if (!validPhone(v.phone)) { fail("pfPhone", "Enter a valid mobile number."); ok = false; }
      if (!validPhone(v.emergencyPhone)) { fail("pfEmgPhone", "Enter a valid phone number."); ok = false; }
      if (!ok) return toast("Please fix the highlighted fields.", true);
      Object.assign(m, v);
      persistProfileMember(m);
      if (m.__server) {
        window.ProFitAPI.patch("/member/me/", { phone: v.phone, address: v.address }).then(r => {
          if (window.__pfMemberMe?.user) { window.__pfMemberMe.user.phone = r.phone; window.__pfMemberMe.user.address = r.address; }
          window.__pfRefreshProfileCard?.();
        }).catch(err => toast(err.message || "Phone and address could not be saved.", true));
      }
      if (!m.__local) {
        const session = sessionMember() || {};
        try { localStorage.setItem("profit-member-logged-in", JSON.stringify({ ...session, name: v.name, email: v.email, phone: v.phone, address: v.address, emergencyName: v.emergencyName, emergencyPhone: v.emergencyPhone })); } catch { /* ignore */ }
      }
      const greeting = $("memberGreeting");
      if (greeting) greeting.textContent = `Welcome, ${v.name.split(" ")[0]}!`;
      const initials = initialsOf(v.name);
      const face = $("memberInitials"); if (face) face.textContent = initials;
      const head = $("memberName"); if (head) head.textContent = v.name.split(" ")[0];
      toast("Profile updated.");
      renderProfile();
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
    { id: "spotify", label: "Spotify green", hex: "#1db954" },
    { id: "ocean", label: "Ocean", hex: "#2dd4bf" },
    { id: "indigo", label: "Indigo", hex: "#818cf8" },
    { id: "coral", label: "Coral", hex: "#fb7185" },
    { id: "emerald", label: "Emerald", hex: "#34d399" },
    { id: "sunset", label: "Sunset", hex: "#fb923c" }
  ];
  const ACCENT_KEY = "pp-accent";
  const readAccent = () => {
    let v = "gold";
    try { v = localStorage.getItem(ACCENT_KEY) || "gold"; } catch { /* ignore */ }
    if (!ACCENT_SWATCHES.some(a => a.id === v)) v = "gold";
    return { value: v };
  };
  const writeAccent = v => {
    try { localStorage.setItem(ACCENT_KEY, v); } catch { /* ignore */ }
    document.documentElement.dataset.accent = v;
  };

  // Weekly class timetable. Each entry repeats every week on its weekday, and
  // lives in config.js so the trainer portal runs off the very same week.
  const TIMETABLE = window.ProFitTimetable || [
    { dow: 0, time: "09:00", name: "Recovery & Stretch", coach: "Coach Bea", mins: 45, cap: 18, emoji: "🧘" },
    { dow: 1, time: "06:00", name: "Sunrise HIIT", coach: "Coach Mika", mins: 45, cap: 12, emoji: "🔥" },
    { dow: 1, time: "18:30", name: "Strength Basics", coach: "Coach Jun", mins: 60, cap: 10, emoji: "💪" },
    { dow: 2, time: "07:00", name: "Cardio Club", coach: "Coach Rei", mins: 40, cap: 16, emoji: "🏃" },
    { dow: 2, time: "19:00", name: "Boxing Fitness", coach: "Coach Dan", mins: 50, cap: 12, emoji: "🥊" },
    { dow: 3, time: "06:00", name: "Sunrise HIIT", coach: "Coach Mika", mins: 45, cap: 12, emoji: "🔥" },
    { dow: 3, time: "19:00", name: "Mobility Flow", coach: "Coach Bea", mins: 50, cap: 14, emoji: "🧘" },
    { dow: 4, time: "18:00", name: "Barbell Club", coach: "Coach Jun", mins: 60, cap: 8, emoji: "🏋️" },
    { dow: 5, time: "07:00", name: "Cardio Club", coach: "Coach Rei", mins: 40, cap: 16, emoji: "🏃" },
    { dow: 5, time: "17:30", name: "Friday Finisher", coach: "Coach Mika", mins: 45, cap: 12, emoji: "⚡" },
    { dow: 6, time: "08:00", name: "Team Sweat", coach: "Coaches", mins: 75, cap: 20, emoji: "⚽" }
  ];
  const DOW_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const classesOn = dateISO => TIMETABLE.filter(c => c.dow === parseISO(dateISO).getDay()).sort((a, b) => a.time.localeCompare(b.time));
  const bookedOn = dateISO => state.bookings.filter(b => b.date === dateISO).sort((a, b) => a.time.localeCompare(b.time));
  // A member's own sessions sit alongside the gym timetable.
  const plansOn = dateISO => (state.plans || []).filter(p => p.date === dateISO).sort((a, b) => a.time.localeCompare(b.time));
  function checkinDays() {
    const set = new Set(state.diary.map(x => x.date));
    (window.__pfAttendanceDays || []).forEach(d => set.add(d));
    try { JSON.parse(localStorage.getItem("profit-member-demo-checkins") || "[]").forEach(x => set.add(String(x.date).slice(0, 10))); } catch { /* ignore */ }
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
    const marks = d => {
      const f = [];
      if (checkinDays().has(d)) f.push("checkin");
      if (state.bookings.some(b => b.date === d)) f.push("booked");
      if (state.diary.some(x => x.date === d)) f.push("diary");
      return f;
    };
    const cells = monthCells(anchor).map(d => {
      if (!d) return `<span class="pp-cal-pad" aria-hidden="true"></span>`;
      const cls = ["pp-cal-day"];
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
        ${["S", "M", "T", "W", "T", "F", "S"].map((d, i) => `<span class="pp-cal-dow" aria-hidden="true">${d}</span>`).join("")}
        ${cells}
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
    root.innerHTML = `<div class="pp-card" style="margin-bottom:16px">
        <div class="pp-card-head"><div><h3>Book a class</h3><p class="pp-muted">Tap a day to see what is running. Cancel any time.</p></div></div>
        <div id="scheduleCal" class="pp-cal"></div>
      </div>
      <div class="pp-card" id="scheduleDayCard"></div>
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
    let session = null;
    try { session = JSON.parse(localStorage.getItem("profit-member-logged-in") || "null"); } catch { /* ignore */ }
    root.innerHTML = `<div class="pp-two">
      <div class="pp-card">
        <div class="pp-card-head"><div><h3>Appearance</h3><p class="pp-muted">Pick how ProFit looks on this device.</p></div></div>
        <div class="pp-segment" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" class="${dark ? "active" : ""}" data-theme-pick="dark" aria-checked="${dark}"><i class="fa-solid fa-moon"></i> Dark</button>
          <button type="button" role="radio" class="${dark ? "" : "active"}" data-theme-pick="light" aria-checked="${!dark}"><i class="fa-solid fa-sun"></i> Light</button>
        </div>
        <div class="pp-field" style="margin-top:18px">
          <span class="pp-label" id="lblMemberAccent">Accent colour</span>
          <div class="pp-swatches" role="radiogroup" aria-labelledby="lblMemberAccent">${ACCENT_SWATCHES.map(a => `<button type="button" class="pp-swatch" role="radio" data-accent="${a.id}" aria-checked="false" style="--sw:${a.hex}"><span class="pp-swatch-dot"></span><span class="pp-swatch-label">${esc(a.label)}</span></button>`).join("")}</div>
          <p class="pp-small pp-muted">Your favourite colour, everywhere in the app.</p>
        </div>
      </div>
      <div class="pp-card">
        <div class="pp-card-head"><div><h3>Notifications</h3><p class="pp-muted">What the gym can nudge you about.</p></div></div>
        <label class="pp-check"><input type="checkbox" data-pref="classReminders" ${prefs.classReminders ? "checked" : ""}><span>Class reminders an hour before I am booked in</span></label>
        <label class="pp-check"><input type="checkbox" data-pref="weeklyRecap" ${prefs.weeklyRecap ? "checked" : ""}><span>A weekly recap of my visits and progress</span></label>
        <div id="memberAnnounceList" class="pp-announce-list" style="padding:0;margin-top:14px"></div>
      </div>
    </div>
    <div class="pp-two">
      <div class="pp-card">
        <div class="pp-card-head"><div><h3>Account</h3><p class="pp-muted">Your membership details.</p></div></div>
        <dl class="pp-dl">
          <dt>Name</dt><dd id="acctName">${esc(session?.name || "Demo Member")}</dd>
          <dt>Email</dt><dd id="acctEmail">${esc(session?.email || "member@profit.test")}</dd>
          <dt>Phone</dt><dd id="acctPhone">${esc(session?.phone || "—")}</dd>
        </dl>
        <div class="pp-actions">
          <button class="pp-btn pp-btn-primary" type="button" data-member-goto="profile"><i class="fa-solid fa-pen"></i> Edit my profile</button>
          <button class="pp-btn" type="button" data-member-goto="profile"><i class="fa-solid fa-camera"></i> Change photo</button>
        </div>
      </div>
      <div class="pp-card pp-note">
        <div class="pp-card-head"><div><h3>My data</h3><p class="pp-muted">Diary, goals, weights and bookings stored in this browser.</p></div></div>
        <p>Nothing here leaves your device. You can clear it whenever you want a fresh start.</p>
        <div class="pp-actions"><button class="pp-btn pp-btn-danger" type="button" id="resetMemberTools"><i class="fa-solid fa-trash-can"></i> Reset my training data</button></div>
      </div>
    </div>`;

    const accent = readAccent();
    const paintAccents = () => root.querySelectorAll("[data-accent]").forEach(b => {
      const on = b.dataset.accent === accent.value;
      b.setAttribute("aria-checked", String(on));
      b.classList.toggle("is-on", on);
    });
    paintAccents();
    root.querySelectorAll("[data-accent]").forEach(btn => btn.addEventListener("click", () => {
      accent.value = btn.dataset.accent;
      writeAccent(accent.value);
      paintAccents();
      toast("Accent colour saved.");
    }));

    const announceBox = $("memberAnnounceList");
    if (announceBox && window.ProFitAnnouncements) {
      const items = window.ProFitAnnouncements.forAudience("Members");
      announceBox.innerHTML = items.length ? items.slice(0, 4).map(item => `<article class="pp-announce">
        <div class="pp-announce-head"><span class="pp-chip">From the gym</span><small>${esc(window.ProFitAnnouncements.timeAgo(item.at))}</small></div>
        <strong>${esc(item.title)}</strong><p>${esc(item.message)}</p></article>`).join("")
        : `<p class="pp-muted pp-small">No announcements right now.</p>`;
    }

    root.querySelectorAll("[data-theme-pick]").forEach(btn => btn.addEventListener("click", () => {
      const d = btn.dataset.themePick === "dark";
      document.body.classList.toggle("dark", d);
      try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* ignore */ }
      root.querySelectorAll("[data-theme-pick]").forEach(b => {
        const on = (b.dataset.themePick === "dark") === d;
        b.classList.toggle("active", on);
        b.setAttribute("aria-checked", String(on));
      });
      window.__pfPaintThemeIcon?.();
    }));
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
    const btn = $("memberMenuToggle"), menu = $("memberMenu");
    if (!btn || !menu) return;
    const setOpen = open => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", e => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest(".member-user")) setOpen(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-member-goto]");
      if (!b || menu.contains(b)) return;
      goTab(b.dataset.memberGoto);
    });
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
