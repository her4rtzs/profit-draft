// Staff trainers: KPIs, directory search/filter/grid-list, modals, assignments, and member requests.
(() => {
  const list = document.getElementById("trList");
  if (!list) return;

  const msg = document.getElementById("trMsg");
  const modalMsg = document.getElementById("trModalMsg");
  const api = window.ProFitAPI;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = n => (String(n || "?").trim().split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase()) || "TR";

  const say = (text, err = false) => {
    if (!msg) return;
    msg.textContent = text;
    msg.classList.toggle("err", err);
    if (text) setTimeout(() => { if (msg.textContent === text) msg.textContent = ""; }, 5000);
  };
  const sayModal = (text, err = false) => {
    if (!modalMsg) return;
    modalMsg.textContent = text;
    modalMsg.classList.toggle("err", err);
  };

  let trainers = [];
  let members = [];
  let requests = [];
  let viewMode = "grid";
  let openMenuId = null;

  const ACCENTS = ["gold", "cyan", "violet", "emerald"];
  const opt = (value, label, extra = "") => `<option value="${esc(value)}" ${extra}>${esc(label)}</option>`;

  function fmtReqDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function updateKPIs() {
    const total = trainers.length;
    const available = trainers.filter(t => t.is_active && !t.is_full).length;
    const onAssign = trainers.filter(t => Number(t.load || 0) > 0).length;
    const activeTrainers = trainers.filter(t => t.is_active);
    const totalLoad = activeTrainers.reduce((s, t) => s + Number(t.load || 0), 0);
    const totalCap = activeTrainers.reduce((s, t) => s + Number(t.max_members || 0), 0);
    const usagePct = totalCap > 0 ? Math.min(100, Math.round((totalLoad / totalCap) * 100)) : 0;

    const elTotal = document.getElementById("kpiTotalTrainers");
    const elAvail = document.getElementById("kpiAvailableTrainers");
    const elAssign = document.getElementById("kpiOnAssignment");
    const elUsage = document.getElementById("kpiCapacityUsage");

    if (elTotal) elTotal.textContent = String(total);
    if (elAvail) elAvail.textContent = String(available);
    if (elAssign) elAssign.textContent = String(onAssign);
    if (elUsage) elUsage.textContent = `${usagePct}%`;
  }

  function trainerStatus(t) {
    if (!t.is_active) return { key: "inactive", label: "Inactive", cls: "is-inactive" };
    if (t.is_full) return { key: "full", label: "Full", cls: "is-full" };
    return { key: "active", label: "Active", cls: "is-active" };
  }

  function trainerCard(t, idx) {
    const accent = ACCENTS[idx % ACCENTS.length];
    const pct = t.max_members ? Math.min(100, Math.round((t.load / t.max_members) * 100)) : 0;
    const capCls = pct >= 90 ? "is-cap-full" : pct >= 70 ? "is-cap-high" : pct >= 40 ? "is-cap-med" : "is-cap-low";
    const st = trainerStatus(t);
    const avatarHtml = t.avatar_url
      ? `<img src="${esc(t.avatar_url)}" alt="${esc(t.name)}">`
      : `<span>${esc(initials(t.name))}</span>`;

    return `<article class="tr-card tr-accent-${accent}" data-trainer-id="${t.id}">
      <div class="tr-card-top">
        <div class="tr-avatar">${avatarHtml}</div>
        <div class="tr-card-badges">
          <span class="tr-status ${st.cls}">${st.label}</span>
        </div>
      </div>

      <div class="tr-card-identity">
        <h3>${esc(t.name)}</h3>
        <p class="tr-spec">${esc(t.specialization || "General Fitness & Training")}</p>
      </div>

      <div class="tr-card-meta">
        <div><i class="fa-regular fa-calendar" aria-hidden="true"></i> <span>${esc(t.availability || "Schedule not set")}</span></div>
        <div><i class="fa-solid fa-users" aria-hidden="true"></i> <span>${t.load} / ${t.max_members} Members</span></div>
      </div>

      <div class="tr-progress-row" aria-label="${t.load} of ${t.max_members} members (${pct}%)">
        <div class="tr-progress-track">
          <span class="tr-progress-fill ${capCls}" style="width:${pct}%"></span>
        </div>
        <strong class="tr-progress-pct">${pct}%</strong>
      </div>

      <div class="tr-card-actions">
        <button type="button" class="tr-btn-outline" data-profile="${t.id}"><i class="fa-regular fa-eye" aria-hidden="true"></i> View Profile</button>
        <button type="button" class="tr-btn-edit" data-edit="${t.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>
      </div>
    </article>`;
  }

  function renderDirectory() {
    list.classList.toggle("is-list", viewMode === "list");
    const q = (document.getElementById("trSearch")?.value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("trStatusFilter")?.value || "all";

    const filtered = trainers.filter(t => {
      const st = trainerStatus(t).key;
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (q) {
        const hay = `${t.name} ${t.specialization || ""} ${t.availability || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!trainers.length) {
      list.innerHTML = `<div class="tr-empty"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i><strong>No trainers yet</strong><p>Add a trainer profile from an existing trainer login to get started.</p></div>`;
      return;
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="tr-empty"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i><strong>No matching trainers</strong><p>Try adjusting your search or status filter.</p></div>`;
      return;
    }
    list.innerHTML = filtered.map((t, i) => trainerCard(t, i)).join("");
  }

  async function loadTrainers() {
    try {
      trainers = await api.get("/staff/trainers/");
      updateKPIs();
      renderDirectory();
      const active = trainers.filter(t => t.is_active);
      const asTrainer = document.getElementById("asTrainer");
      if (asTrainer) {
        const keep = asTrainer.value;
        asTrainer.innerHTML = active.length
          ? opt("", "Choose trainer...") + active.map(t => opt(t.id, `${t.name}${t.is_full ? " (full)" : ` (${t.load}/${t.max_members})`}`, t.is_full ? "disabled" : "")).join("")
          : opt("", "No active trainers available");
        if (keep) asTrainer.value = keep;
      }
    } catch (err) {
      list.innerHTML = `<div class="tr-empty"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><strong>Could not load trainers</strong><p>${esc(err.message || "Please try again.")}</p><button type="button" class="tr-btn-gold" id="trRetryBtn" style="margin-top:8px">Retry</button></div>`;
      document.getElementById("trRetryBtn")?.addEventListener("click", refreshAll);
      say(err.message || "Failed to load trainers.", true);
    }
  }

  async function loadCandidates() {
    try {
      const rows = await api.get("/staff/trainers/candidates/");
      const sel = document.getElementById("trUser");
      if (sel) {
        sel.innerHTML = rows.length
          ? rows.map(u => opt(u.id, `${u.name} (${u.email || "no email"})`)).join("")
          : opt("", "No trainer logins without a profile");
      }
    } catch { /* keep current options */ }
  }

  async function loadMembers() {
    const pick = document.getElementById("asMember");
    try {
      const data = await api.get("/staff/members/");
      members = Array.isArray(data) ? data : (data?.results || []);
      if (!pick) return;
      const keep = pick.value;
      pick.innerHTML = members.length
        ? opt("", "Choose member...") + members.map(m => opt(m.id, `${m.name || m.username || "Member"} (${m.email || "no email"})`)).join("")
        : opt("", "No members yet");
      if (keep) pick.value = keep;
      showCurrent();
    } catch {
      if (pick && !pick.options.length) {
        pick.innerHTML = opt("", "Could not load members");
      }
      showCurrent();
    }
  }

  function showCurrent() {
    const memberId = document.getElementById("asMember")?.value;
    const m = members.find(x => String(x.id) === String(memberId));
    const curEl = document.getElementById("asCurrent");
    const remBtn = document.getElementById("asRemove");
    if (!curEl) return;
    if (!m) {
      curEl.hidden = true;
      curEl.innerHTML = "";
      curEl.classList.remove("has-trainer");
      if (remBtn) remBtn.hidden = true;
      return;
    }
    curEl.hidden = false;
    if (m.trainer) {
      curEl.innerHTML = `<i class="fa-solid fa-user-check" aria-hidden="true"></i> Currently assigned to <strong>${esc(m.trainer.name)}</strong>`;
      curEl.classList.add("has-trainer");
      if (remBtn) remBtn.hidden = false;
    } else {
      curEl.innerHTML = `<i class="fa-regular fa-circle" aria-hidden="true"></i> No trainer assigned yet`;
      curEl.classList.remove("has-trainer");
      if (remBtn) remBtn.hidden = true;
    }
  }

  function renderRequests() {
    const box = document.getElementById("reqList");
    const badge = document.getElementById("reqCountBadge");
    if (!box) return;
    if (badge) {
      badge.textContent = `${requests.length} pending`;
      badge.hidden = requests.length === 0;
    }
    if (!requests.length) {
      box.innerHTML = `<div class="tr-empty tr-empty-compact"><i class="fa-regular fa-circle-check" aria-hidden="true"></i><strong>All caught up</strong><p>No pending trainer requests from members.</p></div>`;
      return;
    }

    const activeTrainers = trainers.filter(t => t.is_active);
    box.innerHTML = `<table class="tr-req-table">
      <thead>
        <tr>
          <th>Member</th>
          <th>Requested Trainer</th>
          <th>Date</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map(r => {
          const trainerOptions = activeTrainers.length
            ? activeTrainers.map(t => {
                const selected = r.trainer_id && String(r.trainer_id) === String(t.id) ? "selected" : "";
                const disabled = t.is_full ? "disabled" : "";
                return opt(t.id, `${t.name}${t.is_full ? " (full)" : ""}`, `${selected} ${disabled}`);
              }).join("")
            : opt("", "No active trainers");

          return `<tr>
            <td>
              <div class="tr-req-member">
                <div class="tr-req-ava">${esc(initials(r.member_name))}</div>
                <div>
                  <strong>${esc(r.member_name)}</strong>
                  ${r.note ? `<small title="${esc(r.note)}">${esc(r.note)}</small>` : `<small>${r.trainer_name ? "Requested " + esc(r.trainer_name) : "Any available trainer"}</small>`}
                </div>
              </div>
            </td>
            <td>
              <select class="tr-req-select" id="rq${r.id}" aria-label="Trainer to assign for ${esc(r.member_name)}">
                ${trainerOptions}
              </select>
            </td>
            <td class="tr-req-date">${esc(fmtReqDate(r.created_at))}</td>
            <td><span class="tr-req-badge"><i class="fa-regular fa-clock" aria-hidden="true"></i> Pending</span></td>
            <td>
              <div class="tr-req-actions">
                <button type="button" class="tr-btn-approve" data-decide="${r.id}" data-approve="1"><i class="fa-solid fa-check" aria-hidden="true"></i> Approve</button>
                <button type="button" class="tr-btn-decline" data-decide="${r.id}" data-approve="0"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Decline</button>
              </div>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  async function loadRequests() {
    const box = document.getElementById("reqList");
    try {
      requests = await api.get("/staff/trainer-requests/?status=PENDING");
      renderRequests();
    } catch (err) {
      if (box) {
        box.innerHTML = `<div class="tr-empty tr-empty-compact"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><strong>Could not load requests</strong><p>${esc(err.message || "Please retry.")}</p></div>`;
      }
    }
  }

  async function refreshAll() {
    await Promise.all([loadTrainers(), loadMembers(), loadRequests()]);
    // Re-render requests once trainers are guaranteed loaded so select options match
    renderRequests();
  }

  // ---- Modals (Add/Edit Trainer & View Profile) ----
  const trModal = document.getElementById("trModal");
  const trForm = document.getElementById("trForm");
  const profModal = document.getElementById("trProfileModal");
  let activeProfileId = null;

  function openModal(el) {
    if (!el) return;
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(el) {
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function openAddModal() {
    trForm.reset();
    sayModal("");
    document.getElementById("trId").value = "";
    document.getElementById("trUserWrap").hidden = false;
    document.getElementById("trActiveWrap").hidden = true;
    document.getElementById("trModalTitle").textContent = "Add Trainer";
    document.getElementById("trModalSub").textContent = "Create a trainer profile from an existing trainer account.";
    document.getElementById("trSave").textContent = "Add Trainer";
    loadCandidates();
    openModal(trModal);
  }

  function openEditModal(t) {
    sayModal("");
    document.getElementById("trId").value = t.id;
    document.getElementById("trSpec").value = t.specialization || "";
    document.getElementById("trAvail").value = t.availability || "";
    document.getElementById("trCap").value = t.max_members;
    document.getElementById("trBio").value = t.bio || "";
    document.getElementById("trActive").checked = !!t.is_active;
    document.getElementById("trUserWrap").hidden = true;
    document.getElementById("trActiveWrap").hidden = false;
    document.getElementById("trModalTitle").textContent = `Edit ${t.name}`;
    document.getElementById("trModalSub").textContent = "Update specialization, schedule, capacity, or active status.";
    document.getElementById("trSave").textContent = "Save Changes";
    openModal(trModal);
  }

  function openProfileModal(t) {
    activeProfileId = t.id;
    const st = trainerStatus(t);
    document.getElementById("trProfAvatar").textContent = initials(t.name);
    document.getElementById("trProfName").textContent = t.name;
    document.getElementById("trProfSpec").textContent = t.specialization || "General Fitness & Training";
    document.getElementById("trProfStatus").textContent = st.label;
    document.getElementById("trProfLoad").textContent = `${t.load} / ${t.max_members}`;
    document.getElementById("trProfAvail").textContent = t.availability || "Not set";
    document.getElementById("trProfBio").textContent = t.bio || "No bio provided yet.";

    const assigned = members.filter(m => m.trainer && String(m.trainer.id) === String(t.id));
    document.getElementById("trProfMemCount").textContent = String(assigned.length);
    const memListEl = document.getElementById("trProfMemList");
    memListEl.innerHTML = assigned.length
      ? assigned.map(m => `<div class="tr-prof-mem-chip"><span>${esc(initials(m.name))}</span><div><strong>${esc(m.name)}</strong><small>${esc(m.plan || "Member")}</small></div></div>`).join("")
      : `<p class="tr-prof-empty">No members currently assigned to this trainer.</p>`;
    openModal(profModal);
  }

  document.getElementById("openAddTrainer")?.addEventListener("click", openAddModal);
  document.getElementById("closeTrModal")?.addEventListener("click", () => closeModal(trModal));
  document.getElementById("trReset")?.addEventListener("click", () => closeModal(trModal));
  trModal?.addEventListener("click", e => { if (e.target === trModal) closeModal(trModal); });

  document.getElementById("closeProfModal")?.addEventListener("click", () => closeModal(profModal));
  document.getElementById("closeProfBtn")?.addEventListener("click", () => closeModal(profModal));
  profModal?.addEventListener("click", e => { if (e.target === profModal) closeModal(profModal); });
  document.getElementById("profEditBtn")?.addEventListener("click", () => {
    const t = trainers.find(x => String(x.id) === String(activeProfileId));
    closeModal(profModal);
    if (t) openEditModal(t);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (openMenuId) { openMenuId = null; renderDirectory(); }
      if (trModal && !trModal.hidden) closeModal(trModal);
      if (profModal && !profModal.hidden) closeModal(profModal);
    }
  });

  // Search, Filter & Grid/List Toggle
  document.getElementById("trSearch")?.addEventListener("input", renderDirectory);
  document.getElementById("trStatusFilter")?.addEventListener("change", renderDirectory);
  document.getElementById("trViewGrid")?.addEventListener("click", () => {
    viewMode = "grid";
    document.getElementById("trViewGrid")?.classList.add("is-on");
    document.getElementById("trViewList")?.classList.remove("is-on");
    renderDirectory();
  });
  document.getElementById("trViewList")?.addEventListener("click", () => {
    viewMode = "list";
    document.getElementById("trViewList")?.classList.add("is-on");
    document.getElementById("trViewGrid")?.classList.remove("is-on");
    renderDirectory();
  });

  // Directory card interactions
  list.addEventListener("click", async e => {
    const menuToggle = e.target.closest("[data-menu-toggle]");
    if (menuToggle) {
      e.stopPropagation();
      const id = menuToggle.dataset.menuToggle;
      openMenuId = openMenuId === id ? null : id;
      renderDirectory();
      return;
    }
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      openMenuId = null;
      const t = trainers.find(x => String(x.id) === editBtn.dataset.edit);
      if (t) openEditModal(t);
      return;
    }
    const profBtn = e.target.closest("[data-profile]");
    if (profBtn) {
      openMenuId = null;
      const t = trainers.find(x => String(x.id) === profBtn.dataset.profile);
      if (t) openProfileModal(t);
      return;
    }
    const toggleBtn = e.target.closest("[data-toggle-active]");
    if (toggleBtn) {
      openMenuId = null;
      const t = trainers.find(x => String(x.id) === toggleBtn.dataset.toggleActive);
      if (!t) return;
      try {
        await api.patch(`/staff/trainers/${t.id}/`, { is_active: !t.is_active });
        say(`${t.name} is now ${!t.is_active ? "active" : "inactive"}.`);
        await refreshAll();
      } catch (err) {
        say(err.message || "Could not update trainer status.", true);
      }
    }
  });
  document.addEventListener("click", () => {
    if (openMenuId !== null) {
      openMenuId = null;
      renderDirectory();
    }
  });

  // Save Add/Edit Trainer Form
  trForm?.addEventListener("submit", async e => {
    e.preventDefault();
    sayModal("");
    const id = document.getElementById("trId").value;
    const saveBtn = document.getElementById("trSave");
    const body = {
      specialization: document.getElementById("trSpec").value.trim(),
      availability: document.getElementById("trAvail").value.trim(),
      max_members: Number(document.getElementById("trCap").value),
      bio: document.getElementById("trBio").value.trim(),
    };
    if (!body.max_members || body.max_members < 1) {
      return sayModal("Maximum members must be at least 1.", true);
    }
    if (!id && !document.getElementById("trUser").value) {
      return sayModal("Please select a trainer login account.", true);
    }
    const origText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      if (id) {
        body.is_active = document.getElementById("trActive").checked;
        await api.patch(`/staff/trainers/${id}/`, body);
        say("Trainer profile updated.");
      } else {
        body.user_id = Number(document.getElementById("trUser").value);
        await api.post("/staff/trainers/", body);
        say("Trainer added successfully.");
      }
      closeModal(trModal);
      await refreshAll();
      loadCandidates();
    } catch (err) {
      sayModal(err.message || "Failed to save trainer.", true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = origText;
    }
  });

  // Assign / Change / Remove Trainer
  document.getElementById("asMember")?.addEventListener("change", showCurrent);
  document.getElementById("asAssign")?.addEventListener("click", async () => {
    const memberId = document.getElementById("asMember")?.value;
    const trainerId = document.getElementById("asTrainer")?.value;
    const m = members.find(x => String(x.id) === String(memberId));
    const t = trainers.find(x => String(x.id) === String(trainerId));
    if (!m || !t) return say("Please select both a member and an active trainer.", true);
    const question = m.trainer && m.trainer.id !== t.id
      ? `Change ${m.name}'s trainer from ${m.trainer.name} to ${t.name}? Both trainers and the member will be notified.`
      : `Assign ${t.name} to ${m.name}? They will be notified.`;
    if (!confirm(question)) return;
    try {
      const res = await api.post(`/staff/members/${memberId}/trainer/`, { trainer_id: Number(trainerId) });
      say(res.detail || "Trainer assigned successfully.");
      await refreshAll();
    } catch (err) {
      say(err.message || "Could not assign trainer.", true);
    }
  });

  document.getElementById("asRemove")?.addEventListener("click", async () => {
    const memberId = document.getElementById("asMember")?.value;
    const m = members.find(x => String(x.id) === String(memberId));
    if (!m || !m.trainer) return say("This member has no trainer to remove.", true);
    if (!confirm(`Remove ${m.trainer.name} from ${m.name}? Both will be notified.`)) return;
    try {
      const res = await api.post(`/staff/members/${memberId}/trainer/remove/`, {});
      say(res.detail || "Trainer removed.");
      await refreshAll();
    } catch (err) {
      say(err.message || "Could not remove trainer.", true);
    }
  });

  // Approve / Decline Member Requests
  document.getElementById("reqList")?.addEventListener("click", async e => {
    const b = e.target.closest("[data-decide]");
    if (!b) return;
    const approve = b.dataset.approve === "1";
    const pick = document.getElementById(`rq${b.dataset.decide}`);
    const body = { approve };
    if (approve) {
      if (!pick || !pick.value) return say("Choose an active trainer to approve this request.", true);
      body.trainer_id = Number(pick.value);
    }
    b.disabled = true;
    try {
      await api.post(`/staff/trainer-requests/${b.dataset.decide}/decide/`, body);
      say(approve ? "Request approved. Member assigned and notified." : "Request declined. Member notified.");
      await refreshAll();
    } catch (err) {
      b.disabled = false;
      say(err.message || "Action failed.", true);
    }
  });

  loadCandidates();
  refreshAll();
})();
