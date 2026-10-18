(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => iso(new Date());
  const parseISO = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y - 0, m - 1, d); };
  const fmtDate = v => (v instanceof Date ? v : parseISO(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const SESSION_KEY = "profit-trainer-logged-in";
  const TOOLS_PREFIX = "profit-member-tools-v1:";
  const TT = window.ProFitTimetable || [];
  const COACHES = window.ProFitCoaches || [...new Set(TT.map(s => s.coach))].sort();

  // A staff-side TRAINER sign-in already says who this is, so the coach picker
  // is skipped and the right roster opens straight away.
  const session = () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { /* ignore */ }
    if (s) return s;
    let demo = null;
    try { demo = JSON.parse(localStorage.getItem("profit-demo-session") || "null"); } catch { /* ignore */ }
    if (demo && String(demo.role || "").toUpperCase() === "TRAINER") {
      const known = (window.ProFitCoaches || []).find(c => c.name === demo.name);
      const name = known ? known.name : (window.ProFitCoaches?.[0]?.name || "Coach");
      return { name, at: demo.at || new Date().toISOString(), auto: true };
    }
    return null;
  };
  const rememberMe = name => { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ name, at: new Date().toISOString() })); } catch { /* ignore */ } };
  const isMine = entry => {
    const me = session()?.name;
    if (!me) return false;
    return entry.coach === me || entry.coach === "Coaches";
  };

  // ---------- Gym branding ----------
  (() => {
    let gym = { name: "ProFit", tagline: "FUNCTIONAL FITNESS", logo: "" };
    try { gym = { ...gym, ...(JSON.parse(localStorage.getItem("profit-gym-profile") || "null") || {}) }; } catch { /* storage blocked */ }
    const name = (gym.name || "ProFit").trim();
    if ($("portalGymName")) $("portalGymName").textContent = name;
    if ($("portalGymTag")) $("portalGymTag").textContent = "TRAINER PORTAL";
    document.title = document.title.replace(/^ProFit/, name.split(" ")[0] || "ProFit");
    const img = $("portalLogoImg"), icon = $("portalLogoIcon");
    if (img && gym.logo) { img.src = gym.logo; img.hidden = false; if (icon) icon.hidden = true; }
  })();

  // ---------- Theme ----------
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

  if ($("year")) $("year").textContent = new Date().getFullYear();

  // ---------- Bookings across members ----------
  // Each member keeps their own tools bucket under this prefix; the roster is
  // the union of every bucket, filtered to this coach's sessions.
  function allBookings() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(TOOLS_PREFIX)) continue;
      const owner = key.slice(TOOLS_PREFIX.length);
      let value = null;
      try { value = JSON.parse(localStorage.getItem(key) || "null"); } catch { continue; }
      (value && Array.isArray(value.bookings) ? value.bookings : []).forEach(b => out.push({ ...b, owner }));
    }
    return out;
  }
  function ownerName(owner) {
    if (owner === "guest" || !owner) return "Guest member";
    if (owner.startsWith("demo-")) {
      return owner.slice(5).replace(/-/g, " ").replace(/\b[a-z]/g, c => c.toUpperCase());
    }
    try {
      if (typeof DB !== "undefined" && Array.isArray(DB.members)) {
        const m = DB.members.find(x => x.id === owner || x.email === owner);
        if (m) return m.name;
      }
    } catch { /* no database on this page */ }
    return `Member ${owner}`;
  }
  function ownerPlan(owner) {
    try {
      if (typeof DB !== "undefined" && Array.isArray(DB.members)) {
        const m = DB.members.find(x => x.id === owner || x.email === owner);
        if (m) return m.plan;
      }
    } catch { /* ignore */ }
    return "";
  }

  const sessionsOn = dateISO => TT
    .filter(s => s.dow === parseISO(dateISO).getDay() && isMine(s))
    .sort((a, b) => a.time.localeCompare(b.time));

  function attendeesOf(sessionEntry, dateISO) {
    return allBookings().filter(b => b.date === dateISO && b.time === sessionEntry.time && b.name === sessionEntry.name);
  }

  // ---------- Session / sign-in ----------
  function renderCoachGrid() {
    const grid = $("coachGrid");
    if (!grid) return;
    grid.innerHTML = COACHES.map(name => {
      const week = TT.filter(s => s.coach === name).length;
      const days = [...new Set(TT.filter(s => s.coach === name).map(s => DOW[s.dow].slice(0, 3)))].join(" · ");
      const initials = name.replace(/^Coach\s+/i, "").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "C";
      return `<button class="tp-coach" type="button" data-coach="${esc(name)}">
        <span class="pp-avatar" aria-hidden="true">${esc(initials)}</span>
        <b>${esc(name)}</b>
        <small>${week} session${week === 1 ? "" : "s"} a week</small>
        <span class="tp-days">${esc(days)}</span>
      </button>`;
    }).join("");
    grid.querySelectorAll("[data-coach]").forEach(btn => btn.addEventListener("click", () => {
      rememberMe(btn.dataset.coach);
      showDashboard();
    }));
  }

  function showPublic() {
    const pub = $("trainerPublic"), dash = $("trainerDash"), shell = $("mainContent");
    if (pub) pub.hidden = false;
    if (dash) dash.hidden = true;
    shell?.classList.remove("member-mode");
    const user = $("portalUser"), links = $("portalNavLinks"), greet = $("trainerGreeting");
    if (user) user.hidden = true;
    if (links) links.hidden = false;
    if (greet) greet.hidden = true;
    renderCoachGrid();
  }

  // ---------- Dashboard ----------
  function setPanel(name) {
    $$("#portalNavLinks [data-goto]").forEach(b => b.classList.toggle("is-on", b.dataset.goto === name));
    $$(".pp-tab").forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
    if (history.replaceState) history.replaceState(null, "", "#" + name);
  }

  function sessionRow(s, dateISO) {
    const rows = attendeesOf(s, dateISO);
    const pct = Math.min(100, Math.round((rows.length / (s.cap || 1)) * 100));
    return `<div class="tp-session">
      <span class="tp-emoji" aria-hidden="true">${s.emoji}</span>
      <span class="tp-time">${esc(s.time)}<small>${s.mins} MIN</small></span>
      <span class="tp-copy"><strong>${esc(s.name)}</strong><small>${esc(s.coach)} · ${s.cap} spots · ${esc(DOW[parseISO(dateISO).getDay()])}</small></span>
      <span class="tp-fill"><span class="tp-fill-bar"><i style="width:${pct}%"></i></span>${rows.length}/${s.cap} booked</span>
    </div>`;
  }

  function emptyLine(text) {
    return `<p class="pp-muted" style="margin:6px 0 0">${esc(text)}</p>`;
  }

  function renderHero() {
    const me = session();
    if (!me) return;
    const first = me.name.replace(/^Coach\s+/i, "").split(" ")[0];
    const now = new Date();
    const hour = now.getHours();
    const salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    $("trainerTitle").textContent = `${salutation}, ${me.name}`;
    $("trainerSubtitle").textContent = `${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} — here is what is on for you.`;

    const today = todayISO();
    const todaySessions = sessionsOn(today);
    const week = [...Array(7).keys()].map(i => { const d = new Date(); d.setDate(d.getDate() + i); return iso(d); });
    const weekSessions = week.reduce((n, d) => n + sessionsOn(d).length, 0);
    const weekBooked = week.reduce((n, d) => n + sessionsOn(d).reduce((sum, s) => sum + attendeesOf(s, d).length, 0), 0);
    const nowMin = hour * 60 + now.getMinutes();
    const next = todaySessions.find(s => toMin(s.time) > nowMin);

    $("statToday").textContent = String(todaySessions.length);
    $("statWeek").textContent = String(weekSessions);
    $("statBooked").textContent = String(weekBooked);
    $("statNext").textContent = next ? next.time : "—";
    $("statNextLabel").textContent = next ? next.name : (todaySessions.length ? "all done for today" : "no session today");
    $("todayMeta").textContent = todaySessions.length
      ? `${todaySessions.length} session${todaySessions.length === 1 ? "" : "s"} · ${todaySessions.reduce((n, s) => n + attendeesOf(s, today).length, 0)} members booked in`
      : "Nothing scheduled today.";
  }
  const toMin = hhmm => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

  function renderToday() {
    const list = $("todayList");
    if (!list) return;
    const today = todayISO();
    const rows = sessionsOn(today);
    list.innerHTML = rows.length ? rows.map(s => sessionRow(s, today)).join("") : emptyLine("No sessions today. Check the calendar for the rest of your week.");
  }

  function renderAnnounce() {
    const box = $("trainerAnnounceList");
    if (!box || !window.ProFitAnnouncements) return;
    const items = window.ProFitAnnouncements.forAudience("Trainers");
    box.innerHTML = items.length
      ? items.slice(0, 6).map(item => `<article class="pp-announce">
          <div class="pp-announce-head"><span class="pp-chip">From the gym</span><small>${esc(window.ProFitAnnouncements.timeAgo(item.at))}</small></div>
          <strong>${esc(item.title)}</strong><p>${esc(item.message)}</p></article>`).join("")
      : `<p class="pp-muted pp-small">No announcements right now.</p>`;
  }

  function renderNoteSessions() {
    const sel = $("noteSession");
    if (!sel) return;
    const today = todayISO();
    const rows = [...Array(7).keys()].map(i => { const d = new Date(); d.setDate(d.getDate() + i); return d; })
      .flatMap(d => sessionsOn(iso(d)).map(s => ({ s, d: iso(d) })));
    sel.innerHTML = rows.length
      ? rows.map(({ s, d }) => `<option value="${esc(d + "|" + s.time + "|" + s.name)}">${esc(fmtDate(d))} · ${esc(s.time)} · ${esc(s.name)}</option>`).join("")
      : `<option value="">No sessions this week</option>`;
  }

  // ---------- Calendar ----------
  let anchor = new Date(), selected = todayISO();
  function calendarHTML() {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const first = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span class="pp-cal-pad" aria-hidden="true"></span>');
    for (let d = 1; d <= total; d++) {
      const key = iso(new Date(y, m, d));
      const cls = ["pp-cal-day"];
      if (key === todayISO()) cls.push("is-today");
      if (key === selected) cls.push("is-selected");
      const dots = sessionsOn(key).length ? '<i class="pp-cal-dot booked"></i>' : "";
      cells.push(`<button type="button" class="${cls.join(" ")}" data-cal-day="${esc(key)}" aria-label="${esc(fmtDate(key))}"><b>${d}</b><span class="pp-cal-dots" aria-hidden="true">${dots}</span></button>`);
    }
    return `<div class="pp-cal-head">
        <button type="button" class="pp-icon-btn" data-cal-move="-1" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button>
        <strong>${esc(anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" }))}</strong>
        <button type="button" class="pp-icon-btn" data-cal-move="1" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="pp-cal-grid" role="group" aria-label="Calendar">
        ${["S", "M", "T", "W", "T", "F", "S"].map(d => `<span class="pp-cal-dow" aria-hidden="true">${d}</span>`).join("")}
        ${cells.join("")}
      </div>`;
  }
  function renderCal() {
    const root = $("trainerCal");
    if (!root) return;
    root.innerHTML = calendarHTML();
    const box = $("calDayList");
    const rows = sessionsOn(selected);
    box.innerHTML = `<p class="pp-muted" style="margin:0 0 8px"><strong style="color:var(--text)">${esc(fmtDate(selected))}</strong></p>`
      + (rows.length ? rows.map(s => sessionRow(s, selected)).join("") : emptyLine("No sessions for you on this day."));
  }

  // ---------- Roster ----------
  function renderRoster() {
    const box = $("rosterList");
    if (!box) return;
    const days = [...Array(7).keys()].map(i => { const d = new Date(); d.setDate(d.getDate() + i); return iso(d); });
    const rows = [];
    days.forEach(d => sessionsOn(d).forEach(s => attendeesOf(s, d).forEach(b => rows.push({ ...b, when: d, time: s.time, emoji: s.emoji }))));
    rows.sort((a, b) => (a.when + a.time).localeCompare(b.when + b.time));
    box.innerHTML = rows.length ? rows.map(r => {
      const name = ownerName(r.owner);
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "M";
      const plan = ownerPlan(r.owner);
      return `<div class="tp-person">
        <span class="pp-avatar" aria-hidden="true">${esc(initials)}</span>
        <span><b>${esc(name)}</b><small>${esc(r.emoji)} ${esc(r.name)}${plan ? " · " + esc(String(plan).replace(/\b[a-z]/g, c => c.toUpperCase())) : ""}</small></span>
        <span class="tp-when">${esc(fmtDate(r.when))} · ${esc(r.time)}</span>
      </div>`;
    }).join("") : emptyLine("Nobody booked into your sessions yet this week.");
  }

  function showDashboard() {
    const pub = $("trainerPublic"), dash = $("trainerDash"), shell = $("mainContent");
    if (pub) pub.hidden = true;
    if (dash) dash.hidden = false;
    shell?.classList.add("member-mode");
    const me = session();
    if (!me) return;
    const user = $("portalUser"), links = $("portalNavLinks"), greet = $("trainerGreeting");
    if (user) {
      user.hidden = false;
      const initials = me.name.replace(/^Coach\s+/i, "").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "C";
      if ($("portalFace")) $("portalFace").textContent = initials;
      if ($("portalUserName")) $("portalUserName").textContent = me.name.replace(/^Coach\s+/i, "").split(" ")[0];
    }
    if (greet) { greet.hidden = false; greet.textContent = me.name; }
    if (links) links.hidden = false;

    renderHero();
    renderToday();
    renderAnnounce();
    renderNoteSessions();
    renderCal();
    renderRoster();

    const hash = location.hash.slice(1);
    setPanel(["overview", "calendar", "roster"].includes(hash) ? hash : "overview");
  }

  // ---------- Wiring ----------
  $$("#portalNavLinks [data-goto]").forEach(b => b.addEventListener("click", () => setPanel(b.dataset.goto)));
  $$(".pp-tab").forEach(t => t.addEventListener("click", () => setPanel(t.dataset.tab)));
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-trainer-goto]");
    if (b) { setPanel(b.dataset.trainerGoto); $("memberMenu") && ($("memberMenu").hidden = true); }
  });
  const menuBtn = $("memberMenuToggle"), menu = $("memberMenu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", e => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute("aria-expanded", String(!menu.hidden)); });
    document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest(".member-user")) { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", e => { if (e.key === "Escape") menu.hidden = true; });
  }
  const logout = $("logoutBtn");
  if (logout) logout.addEventListener("click", () => {
    if (!confirm("Sign out of the trainer portal?")) return;
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    // Signing out of an auto-opened coach view must also end the staff session,
    // otherwise the portal would just reopen itself on the next load.
    let demo = null;
    try { demo = JSON.parse(localStorage.getItem("profit-demo-session") || "null"); } catch { /* ignore */ }
    if (demo && String(demo.role || "").toUpperCase() === "TRAINER") {
      try { localStorage.removeItem("profit-demo-session"); sessionStorage.removeItem("profit-demo-session"); } catch { /* ignore */ }
      location.replace("login.html");
      return;
    }
    showPublic();
  });

  const cal = $("trainerCal");
  if (cal) cal.addEventListener("click", e => {
    const mv = e.target.closest("[data-cal-move]");
    if (mv) { anchor = new Date(anchor.getFullYear(), anchor.getMonth() + Number(mv.dataset.calMove), 1); return renderCal(); }
    const day = e.target.closest("[data-cal-day]");
    if (day) { selected = day.dataset.calDay; renderCal(); }
  });

  const noteForm = $("noteForm");
  if (noteForm) noteForm.addEventListener("submit", e => {
    e.preventDefault();
    const value = $("noteSession").value;
    const text = $("noteText").value.trim();
    if (!value) return;
    if (text.length < 3) { toast("Write a short message first.", true); return; }
    const [date, time, name] = value.split("|");
    window.ProFitNotify?.push({
      type: "trainer", icon: "fa-dumbbell", title: "Trainer schedule updated",
      message: `${session().name} · ${name} on ${fmtDate(date)} at ${time} — ${text}`,
      tag: "trainer:" + Date.now().toString(36)
    });
    noteForm.reset();
    toast("Update sent to the front desk.");
  });

  function toast(msg, isError) {
    let el = document.querySelector(".pp-toast");
    if (!el) { el = document.createElement("div"); el.className = "pp-toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
    el.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;padding:12px 20px";
    el.hidden = false;
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.hidden = true; }, 2800);
  }

  // Start
  if (session()) showDashboard(); else showPublic();
})();
