// Staff trainers: profiles and capacity, assigning and changing trainers with confirmation, and requests.
(() => {
  const list = document.getElementById("trList");
  if (!list) return;
  const msg = document.getElementById("trMsg");
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = (text, err = false) => { msg.textContent = text; msg.classList.toggle("err", err); };
  const api = window.ProFitAPI;

  let trainers = [];
  let members = [];

  const opt = (value, label, extra = "") => `<option value="${esc(value)}" ${extra}>${esc(label)}</option>`;

  function trainerCard(t) {
    const pct = t.max_members ? Math.min(100, Math.round((t.load / t.max_members) * 100)) : 0;
    const status = !t.is_active ? "Not accepting" : t.is_full ? "Full" : "Accepting";
    return `<article class="ann-card">
      <div class="ann-meta"><strong style="color:var(--text);font-size:16px">${esc(t.name)}</strong>
        <span class="ann-badge ${t.is_active && !t.is_full ? "published" : "archived"}">${status}</span></div>
      <p class="ann-msg">${esc(t.specialization || "General training")}${t.availability ? " · " + esc(t.availability) : ""}</p>
      <div aria-label="${t.load} of ${t.max_members} members">
        <div style="height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden">
          <span style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,#f2cb5c,#e8b93a);border-radius:999px;transition:width .4s ease"></span>
        </div>
        <small class="ann-msg">${t.load} of ${t.max_members} members</small>
      </div>
      <div class="ann-actions"><button class="ann-btn" type="button" data-edit="${t.id}">Edit</button></div>
    </article>`;
  }

  async function loadTrainers() {
    try {
      trainers = await api.get("/staff/trainers/");
      list.innerHTML = trainers.length
        ? trainers.map(trainerCard).join("")
        : `<div class="ann-empty"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i><p>No trainers yet. Add a trainer login first.</p></div>`;
      const active = trainers.filter(t => t.is_active);
      document.getElementById("asTrainer").innerHTML = active.length
        ? active.map(t => opt(t.id, `${t.name}${t.is_full ? " (full)" : ""}`, t.is_full ? "disabled" : "")).join("")
        : opt("", "No active trainers");
    } catch (err) { say(err.message, true); }
  }

  async function loadCandidates() {
    try {
      const rows = await api.get("/staff/trainers/candidates/");
      document.getElementById("trUser").innerHTML = rows.length
        ? rows.map(u => opt(u.id, `${u.name} (${u.email || "no email"})`)).join("")
        : opt("", "No trainer logins without a profile");
    } catch { /* leave the list as it is */ }
  }

  async function loadMembers() {
    try {
      members = await api.get("/staff/members/");
      const pick = document.getElementById("asMember");
      const keep = pick.value;
      pick.innerHTML = members.length
        ? members.map(m => opt(m.id, `${m.name} (${m.email || "no email"})`)).join("")
        : opt("", "No members yet");
      if (keep) pick.value = keep;
      showCurrent();
    } catch { /* keep what is shown */ }
  }

  function showCurrent() {
    const m = members.find(x => String(x.id) === document.getElementById("asMember").value);
    document.getElementById("asCurrent").textContent = m
      ? (m.trainer ? `Current trainer: ${m.trainer.name}` : "No trainer yet.")
      : "";
  }

  async function loadRequests() {
    const box = document.getElementById("reqList");
    try {
      const rows = await api.get("/staff/trainer-requests/?status=PENDING");
      box.innerHTML = rows.length ? rows.map(r => `<article class="ann-card">
          <div class="ann-meta"><strong style="color:var(--text)">${esc(r.member_name)}</strong><span>${r.trainer_name ? "asked for " + esc(r.trainer_name) : "any trainer"}</span></div>
          ${r.note ? `<p class="ann-body">${esc(r.note)}</p>` : ""}
          <div class="ann-field"><label for="rq${r.id}">Trainer to assign</label>
            <select id="rq${r.id}">${trainers.filter(t => t.is_active).map(t => opt(t.id, t.name, t.is_full ? "disabled" : "")).join("")}</select></div>
          <div class="ann-actions">
            <button class="ann-btn primary" type="button" data-decide="${r.id}" data-approve="1">Approve</button>
            <button class="ann-btn" type="button" data-decide="${r.id}" data-approve="0">Decline</button>
          </div>
        </article>`).join("")
        : `<div class="ann-empty"><i class="fa-regular fa-circle-check" aria-hidden="true"></i><p>No pending requests.</p></div>`;
    } catch (err) { box.innerHTML = `<div class="ann-empty"><p>${esc(err.message)}</p></div>`; }
  }

  async function refreshAll() { await Promise.all([loadTrainers(), loadMembers(), loadRequests()]); }

  // Add or edit a trainer profile.
  const form = document.getElementById("trForm");
  const fill = t => {
    document.getElementById("trId").value = t.id;
    document.getElementById("trSpec").value = t.specialization || "";
    document.getElementById("trAvail").value = t.availability || "";
    document.getElementById("trCap").value = t.max_members;
    document.getElementById("trBio").value = t.bio || "";
    document.getElementById("trActive").checked = !!t.is_active;
    document.getElementById("trUserWrap").hidden = true;
    document.getElementById("trActiveWrap").hidden = false;
    document.getElementById("trSave").textContent = "Save changes";
  };
  const reset = () => {
    form.reset();
    document.getElementById("trId").value = "";
    document.getElementById("trUserWrap").hidden = false;
    document.getElementById("trActiveWrap").hidden = true;
    document.getElementById("trSave").textContent = "Add trainer";
  };
  document.getElementById("trReset").addEventListener("click", reset);
  list.addEventListener("click", e => {
    const b = e.target.closest("[data-edit]");
    if (!b) return;
    const t = trainers.find(x => String(x.id) === b.dataset.edit);
    if (t) { fill(t); form.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const id = document.getElementById("trId").value;
    const body = {
      specialization: document.getElementById("trSpec").value.trim(),
      availability: document.getElementById("trAvail").value.trim(),
      max_members: Number(document.getElementById("trCap").value),
      bio: document.getElementById("trBio").value.trim(),
    };
    try {
      if (id) {
        body.is_active = document.getElementById("trActive").checked;
        await api.patch(`/staff/trainers/${id}/`, body);
        say("Trainer updated.");
      } else {
        body.user_id = Number(document.getElementById("trUser").value);
        await api.post("/staff/trainers/", body);
        say("Trainer added.");
      }
      reset();
      await refreshAll();
      loadCandidates();
    } catch (err) { say(err.message, true); }
  });

  // Assign, change, or remove, always with a confirmation.
  document.getElementById("asMember").addEventListener("change", showCurrent);
  document.getElementById("asAssign").addEventListener("click", async () => {
    const memberId = document.getElementById("asMember").value;
    const trainerId = document.getElementById("asTrainer").value;
    const m = members.find(x => String(x.id) === memberId);
    const t = trainers.find(x => String(x.id) === trainerId);
    if (!m || !t) return say("Pick a member and a trainer.", true);
    const question = m.trainer && m.trainer.id !== t.id
      ? `Change ${m.name}'s trainer from ${m.trainer.name} to ${t.name}? Both trainers and the member will be notified.`
      : `Assign ${t.name} to ${m.name}? They will be notified.`;
    if (!confirm(question)) return;
    try {
      const res = await api.post(`/staff/members/${memberId}/trainer/`, { trainer_id: Number(trainerId) });
      say(res.detail);
      await refreshAll();
    } catch (err) { say(err.message, true); }
  });
  document.getElementById("asRemove").addEventListener("click", async () => {
    const memberId = document.getElementById("asMember").value;
    const m = members.find(x => String(x.id) === memberId);
    if (!m || !m.trainer) return say("This member has no trainer to remove.", true);
    if (!confirm(`Remove ${m.trainer.name} from ${m.name}? Both will be notified.`)) return;
    try {
      const res = await api.post(`/staff/members/${memberId}/trainer/remove/`, {});
      say(res.detail);
      await refreshAll();
    } catch (err) { say(err.message, true); }
  });

  // Requests.
  document.getElementById("reqList").addEventListener("click", async e => {
    const b = e.target.closest("[data-decide]");
    if (!b) return;
    const approve = b.dataset.approve === "1";
    const pick = document.getElementById(`rq${b.dataset.decide}`);
    const body = { approve };
    if (approve) {
      if (!pick || !pick.value) return say("Choose a trainer to approve this request.", true);
      body.trainer_id = Number(pick.value);
    }
    try {
      await api.post(`/staff/trainer-requests/${b.dataset.decide}/decide/`, body);
      say(approve ? "Approved. The member is assigned and notified." : "Declined. The member is notified.");
      await refreshAll();
    } catch (err) { say(err.message, true); }
  });

  loadCandidates();
  refreshAll();
  document.addEventListener("profit:synced", () => {});
})();
