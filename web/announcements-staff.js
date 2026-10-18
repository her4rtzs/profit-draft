// Staff announcements: list and filter the notices, create and edit drafts, publish, and archive.
(() => {
  const list = document.getElementById("annList");
  if (!list) return;
  const panel = document.getElementById("annFormPanel");
  const form = document.getElementById("annForm");
  const note = document.getElementById("annMsg");
  const audience = document.getElementById("annAudience");
  const membersWrap = document.getElementById("annMembersWrap");
  const membersBox = document.getElementById("annMembers");
  const publishBtn = document.getElementById("annPublish");
  const STATUS = { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmt = s => s ? new Date(s + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "No date";
  const say = (text, err = false) => { note.textContent = text; note.classList.toggle("err", err); };

  let filter = "";
  let notes = [];
  let members = [];
  let editing = null;

  function card(n) {
    const who = n.audience === "ALL" ? "All members" : `${n.member_ids.length} selected member${n.member_ids.length === 1 ? "" : "s"}`;
    const actions = [];
    if (n.status !== "ARCHIVED") actions.push(`<button class="ann-btn" type="button" data-act="edit" data-id="${n.id}">Edit</button>`);
    if (n.status === "DRAFT") actions.push(`<button class="ann-btn primary" type="button" data-act="publish" data-id="${n.id}">Publish</button>`);
    if (n.status !== "ARCHIVED") actions.push(`<button class="ann-btn" type="button" data-act="archive" data-id="${n.id}">Archive</button>`);
    return `<article class="ann-card">
      <div class="ann-meta">
        <span class="ann-badge ${n.status.toLowerCase()}">${STATUS[n.status]}</span>
        ${n.pinned ? '<span class="ann-badge pin"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> Pinned</span>' : ""}
        <span>${fmt(n.publish_on)}</span><span>· ${esc(who)}</span>
      </div>
      <h3>${esc(n.title)}</h3>
      <p class="ann-body">${esc(n.message)}</p>
      <div class="ann-actions">${actions.join("")}</div>
    </article>`;
  }

  async function load() {
    try {
      notes = await window.ProFitAPI.get(`/staff/announcements/${filter ? `?status=${filter}` : ""}`);
      list.innerHTML = notes.length
        ? notes.map(card).join("")
        : `<div class="ann-empty"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i><p>No announcements here yet.</p></div>`;
    } catch (err) {
      list.innerHTML = `<div class="ann-empty"><p>${esc(err.message || "Only the owner can manage announcements.")}</p></div>`;
    }
  }

  async function loadMembers() {
    if (!members.length) {
      try { members = await window.ProFitAPI.get("/staff/members/"); } catch { members = []; }
    }
  }
  function renderMembers(selected) {
    membersBox.innerHTML = members.length
      ? members.map(m => `<label><input type="checkbox" value="${m.id}" ${selected.includes(m.id) ? "checked" : ""}> <span>${esc(m.name)}</span> <small>${esc(m.email || "")}</small></label>`).join("")
      : `<p class="ann-msg">No members yet. Add a member first, then pick them here.</p>`;
  }
  const syncAudience = () => { membersWrap.hidden = audience.value !== "SELECTED"; };

  async function openForm(n = null) {
    editing = n;
    const locked = !!n && n.status === "PUBLISHED";
    document.getElementById("annId").value = n ? n.id : "";
    document.getElementById("annTitle").value = n ? n.title : "";
    document.getElementById("annMessage").value = n ? n.message : "";
    document.getElementById("annDate").value = n?.publish_on || todayIso();
    document.getElementById("annDate").disabled = locked;
    audience.value = n ? n.audience : "ALL";
    audience.disabled = locked;
    document.getElementById("annPinned").checked = !!n?.pinned;
    publishBtn.hidden = !!n && n.status !== "DRAFT";
    document.getElementById("annSave").textContent = locked ? "Save changes" : "Save draft";
    syncAudience();
    await loadMembers();
    renderMembers(n?.member_ids || []);
    panel.hidden = false;
    say("");
    document.getElementById("annTitle").focus();
  }

  function body() {
    const title = document.getElementById("annTitle").value.trim();
    const message = document.getElementById("annMessage").value.trim();
    if (editing && editing.status === "PUBLISHED") {
      return { title, message, pinned: document.getElementById("annPinned").checked };
    }
    return {
      title,
      message,
      audience: audience.value,
      publish_on: document.getElementById("annDate").value || null,
      pinned: document.getElementById("annPinned").checked,
      member_ids: audience.value === "SELECTED"
        ? [...membersBox.querySelectorAll("input:checked")].map(i => Number(i.value))
        : [],
    };
  }

  async function saveDraft() {
    const data = body();
    if (!data.title || !data.message) throw new Error("Title and message are required.");
    if (editing) return window.ProFitAPI.patch(`/staff/announcements/${editing.id}/`, data);
    return window.ProFitAPI.post("/staff/announcements/", data);
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await saveDraft();
      panel.hidden = true;
      say("Saved.");
      await load();
    } catch (err) { say(err.message, true); }
  });

  publishBtn.addEventListener("click", async () => {
    try {
      const saved = await saveDraft();
      await window.ProFitAPI.post(`/staff/announcements/${saved.id}/publish/`, {});
      panel.hidden = true;
      say("Published. Members get an alert.");
      await load();
    } catch (err) { say(err.message, true); }
  });

  document.getElementById("annCancel").addEventListener("click", () => { panel.hidden = true; });
  document.getElementById("annNew").addEventListener("click", () => openForm(null));
  audience.addEventListener("change", syncAudience);

  document.querySelectorAll(".ann-chip").forEach(chip => chip.addEventListener("click", () => {
    filter = chip.dataset.filter;
    document.querySelectorAll(".ann-chip").forEach(c => c.classList.toggle("is-on", c === chip));
    load();
  }));

  list.addEventListener("click", async e => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const n = notes.find(x => String(x.id) === btn.dataset.id);
    if (!n) return;
    if (btn.dataset.act === "edit") return openForm(n);
    try {
      if (btn.dataset.act === "publish") {
        await window.ProFitAPI.post(`/staff/announcements/${n.id}/publish/`, {});
        say("Published. Members get an alert.");
      }
      if (btn.dataset.act === "archive") {
        if (!confirm("Archive this announcement? Members will stop seeing it.")) return;
        await window.ProFitAPI.post(`/staff/announcements/${n.id}/archive/`, {});
        say("Archived.");
      }
      await load();
    } catch (err) { say(err.message, true); }
  });

  load();
})();
