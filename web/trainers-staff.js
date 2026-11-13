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
  let statusFilter = "all";
  let specFilter = "all";

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
    if (t.on_leave || t.status === "on_leave") return { key: "on_leave", label: "On Leave", cls: "is-leave" };
    if (!t.is_active) return { key: "inactive", label: "Inactive", cls: "is-inactive" };
    if (t.is_full) return { key: "full", label: "Full", cls: "is-full" };
    return { key: "active", label: "Active", cls: "is-active" };
  }

  const BASE_SPECS = [
    "Conditioning", "CrossFit", "Flexibility", "Functional",
    "HIIT", "Mobility", "Strength", "Weight Loss", "Yoga",
  ];

  function populateSpecializations() {
    const menu = document.getElementById("trSpecMenu");
    const labelEl = document.getElementById("trSpecLabel");
    if (!menu) return;
    const merged = Array.from(new Set([
      ...BASE_SPECS,
      ...trainers.map(t => String(t.specialization || "").trim()).filter(Boolean),
    ])).sort((a, b) => a.localeCompare(b));
    if (specFilter !== "all" && !merged.includes(specFilter)) specFilter = "all";
    if (labelEl) labelEl.textContent = specFilter === "all" ? "All Specializations" : specFilter;
    const items = [{ value: "all", label: "All Specializations" }, ...merged.map(s => ({ value: s, label: s }))];
    menu.innerHTML = items.map(it =>
      `<button type="button" class="tr-combo-item${it.value === specFilter ? " is-selected" : ""}" role="option" aria-selected="${it.value === specFilter}" data-spec-val="${esc(it.value)}">${esc(it.label)}</button>`
    ).join("");
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

    const filtered = trainers.filter(t => {
      const st = trainerStatus(t).key;
      if (statusFilter === "active" && st !== "active" && st !== "full") return false;
      else if (statusFilter !== "all" && statusFilter !== "active" && st !== statusFilter) return false;
      if (specFilter !== "all" && !String(t.specialization || "").toLowerCase().includes(specFilter.toLowerCase())) return false;
      if (q) {
        const hay = `${t.name} ${t.specialization || ""} ${t.availability || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const countEl = document.getElementById("trCountLabel");
    if (countEl) countEl.textContent = `Trainers (${filtered.length})`;

    if (!trainers.length) {
      list.innerHTML = `<div class="tr-empty"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i><strong>No trainers yet</strong><p>Add a trainer profile from an existing trainer login to get started.</p></div>`;
      return;
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="tr-empty"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i><strong>No matching trainers</strong><p>Try adjusting your search or filter selection.</p></div>`;
      return;
    }
    list.innerHTML = filtered.map((t, i) => trainerCard(t, i)).join("");
  }

  async function loadTrainers() {
    try {
      trainers = await api.get("/staff/trainers/");
      updateKPIs();
      populateSpecializations();
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

  function renderMemberMenu(query = "") {
    const menu = document.getElementById("asMemberMenu");
    if (!menu) return;
    const q = String(query || "").trim().toLowerCase();
    const selectedId = document.getElementById("asMember")?.value || "";
    const matched = members.filter(m => {
      if (!q) return true;
      const hay = `${m.name || ""} ${m.email || ""} ${m.username || ""}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 30);

    if (!members.length) {
      menu.innerHTML = `<div class="tr-combo-empty">No members available</div>`;
      return;
    }
    if (!matched.length) {
      menu.innerHTML = `<div class="tr-combo-empty">No matching members</div>`;
      return;
    }
    menu.innerHTML = matched.map(m => {
      const active = String(m.id) === String(selectedId);
      const sub = m.trainer ? `Assigned: ${m.trainer.name}` : (m.email || "No trainer yet");
      return `<button type="button" class="tr-combo-item${active ? " is-selected" : ""}" role="option" aria-selected="${active}" data-member-id="${esc(m.id)}">
        <span class="tr-combo-main">${esc(m.name || m.username || "Member")}</span>
        <small class="tr-combo-sub">${esc(sub)}</small>
      </button>`;
    }).join("");
  }

  async function loadMembers() {
    const searchEl = document.getElementById("asMemberSearch");
    try {
      const data = await api.get("/staff/members/");
      members = Array.isArray(data) ? data : (data?.results || []);
      renderMemberMenu(searchEl?.value || "");
      showCurrent();
    } catch {
      const menu = document.getElementById("asMemberMenu");
      if (menu) menu.innerHTML = `<div class="tr-combo-empty">Could not load members</div>`;
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
      const specMenu = document.getElementById("trSpecMenu");
      if (specMenu && !specMenu.hidden) {
        specMenu.hidden = true;
        document.getElementById("trSpecBtn")?.setAttribute("aria-expanded", "false");
      }
      const memMenu = document.getElementById("asMemberMenu");
      if (memMenu && !memMenu.hidden) memMenu.hidden = true;
      if (trModal && !trModal.hidden) closeModal(trModal);
      if (profModal && !profModal.hidden) closeModal(profModal);
    }
  });

  // Status Tabs, Search, Specialization Dropdown & Grid/List Toggle
  document.querySelectorAll("[data-status-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      statusFilter = btn.dataset.statusTab || "all";
      document.querySelectorAll("[data-status-tab]").forEach(b => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderDirectory();
    });
  });
  document.getElementById("trSearch")?.addEventListener("input", renderDirectory);
  const specBtn = document.getElementById("trSpecBtn");
  const specMenu = document.getElementById("trSpecMenu");
  specBtn?.addEventListener("click", e => {
    e.stopPropagation();
    if (!specMenu) return;
    const willOpen = specMenu.hidden;
    specMenu.hidden = !willOpen;
    specBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });
  specMenu?.addEventListener("click", e => {
    const item = e.target.closest("[data-spec-val]");
    if (!item) return;
    specFilter = item.dataset.specVal || "all";
    populateSpecializations();
    specMenu.hidden = true;
    specBtn?.setAttribute("aria-expanded", "false");
    renderDirectory();
  });
  document.addEventListener("click", e => {
    if (specMenu && !specMenu.hidden && !e.target.closest("#trSpecWrap")) {
      specMenu.hidden = true;
      specBtn?.setAttribute("aria-expanded", "false");
    }
    const memMenu = document.getElementById("asMemberMenu");
    if (memMenu && !memMenu.hidden && !e.target.closest("#asMemberWrap")) {
      memMenu.hidden = true;
    }
  });
  document.getElementById("trViewGrid")?.addEventListener("click", () => {
    viewMode = "grid";
    document.getElementById("trViewGrid")?.classList.add("is-on");
    document.getElementById("trViewGrid")?.setAttribute("aria-pressed", "true");
    document.getElementById("trViewList")?.classList.remove("is-on");
    document.getElementById("trViewList")?.setAttribute("aria-pressed", "false");
    renderDirectory();
  });
  document.getElementById("trViewList")?.addEventListener("click", () => {
    viewMode = "list";
    document.getElementById("trViewList")?.classList.add("is-on");
    document.getElementById("trViewList")?.setAttribute("aria-pressed", "true");
    document.getElementById("trViewGrid")?.classList.remove("is-on");
    document.getElementById("trViewGrid")?.setAttribute("aria-pressed", "false");
    renderDirectory();
  });

  // Directory card interactions
  list.addEventListener("click", e => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      const t = trainers.find(x => String(x.id) === editBtn.dataset.edit);
      if (t) openEditModal(t);
      return;
    }
    const profBtn = e.target.closest("[data-profile]");
    if (profBtn) {
      const t = trainers.find(x => String(x.id) === profBtn.dataset.profile);
      if (t) openProfileModal(t);
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

  // Assign / Change / Remove Trainer (searchable member picker)
  const memSearchEl = document.getElementById("asMemberSearch");
  const memHiddenEl = document.getElementById("asMember");
  const memMenuEl = document.getElementById("asMemberMenu");
  const memClearEl = document.getElementById("asMemberClear");

  memSearchEl?.addEventListener("focus", () => {
    renderMemberMenu(memHiddenEl?.value ? "" : memSearchEl.value);
    if (memMenuEl) memMenuEl.hidden = false;
  });
  memSearchEl?.addEventListener("input", () => {
    if (memHiddenEl) memHiddenEl.value = "";
    if (memClearEl) memClearEl.hidden = !memSearchEl.value;
    showCurrent();
    renderMemberMenu(memSearchEl.value);
    if (memMenuEl) memMenuEl.hidden = false;
  });
  memClearEl?.addEventListener("click", () => {
    if (memHiddenEl) memHiddenEl.value = "";
    if (memSearchEl) memSearchEl.value = "";
    memClearEl.hidden = true;
    showCurrent();
    renderMemberMenu("");
    memSearchEl?.focus();
  });
  memMenuEl?.addEventListener("click", e => {
    const item = e.target.closest("[data-member-id]");
    if (!item) return;
    const m = members.find(x => String(x.id) === String(item.dataset.memberId));
    if (!m) return;
    if (memHiddenEl) memHiddenEl.value = String(m.id);
    if (memSearchEl) memSearchEl.value = m.name || m.username || "Member";
    if (memClearEl) memClearEl.hidden = false;
    memMenuEl.hidden = true;
    showCurrent();
  });
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
