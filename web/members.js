// Members console: browse, applications, member detail and enrollment.
// Reads and writes the shared DB from data.js and always persists with DB.save().
(() => {
  const $ = id => document.getElementById(id);
  const { esc, money, initialsOf, fmt, today, toast, modal, dayDiff, media, parseISO, iso, todayISO, fmtDateTime } = PF;
  const PER_PAGE = 5;
  const PLAN_KEYS = Object.keys(PLANS);
  const state = { view: matchMedia("(max-width: 768px)").matches ? "cards" : "table", tab: "browse", filter: "all", sort: "name-asc", query: "", page: 1, app: "pending", selectedId: null, subtab: "overview", pickerQuery: "" };

  const AVATAR_PALETTES = [
    '#2563EB', // Blue
    '#7C3AED', // Purple
    '#059669', // Emerald Green
    '#D97706', // Amber / Orange
    '#0284C7', // Cyan
    '#DC2626', // Red
    '#4F46E5', // Indigo
    '#DB2777'  // Pink
  ];
  function avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  }

  function updateStats() {
    const members = DB.members || [];
    const total = members.length;
    let active = 0, expiring = 0, expired = 0;
    members.forEach(m => {
      const k = statusFor(m).key;
      if (k === 'active') active++;
      else if (k === 'expiring') expiring++;
      else if (['expired', 'cancelled'].includes(k)) expired++;
    });
    if ($('statTotal')) $('statTotal').textContent = total;
    if ($('statActive')) $('statActive').textContent = active;
    if ($('statExpiring')) $('statExpiring').textContent = expiring;
    if ($('statExpired')) $('statExpired').textContent = expired;
  }

  // ---------- Rules ----------
  const left = m => dayDiff(new Date(), m.end);
  const isFrozen = m => !!m.frozenUntil && dayDiff(new Date(), parseISO(m.frozenUntil)) >= 0;
  function statusFor(m) {
    if (m.cancelledAt) return { key: "cancelled", label: "Cancelled" };
    if (isFrozen(m)) return { key: "frozen", label: "Frozen" };
    const d = left(m);
    if (d < 0) return { key: "expired", label: "Expired" };
    if (d <= 7) return { key: "expiring", label: "Expiring soon" };
    return { key: "active", label: "Active" };
  }
  const planLabel = k => PLANS[k]?.label || k;
  const expiryText = m => {
    const d = left(m);
    if (d < 0) return `Expired on ${fmt(m.end)}`;
    if (d === 0) return "Expires today";
    return `Expires ${fmt(m.end)} · ${d} day${d === 1 ? "" : "s"} left`;
  };
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const validPhone = v => !v || /^[0-9+()\-\s]{7,20}$/.test(v);
  const findByEmail = (email, exceptId) => DB.members.find(m => m.email.toLowerCase() === String(email).trim().toLowerCase() && m.id !== exceptId);
  const save = () => DB.save();
  // Everything the front desk does lands in the shared activity bell.
  const notify = input => { try { window.ProFitNotify?.push(input); } catch { /* bell unavailable */ } };

  // Writes go to the Django API first. Only after the server accepts them do we
  // pull fresh data (DB.sync(false)) so every screen shows what the server holds.
  const tempPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const buf = crypto.getRandomValues(new Uint32Array(12));
    return Array.from(buf, n => chars[n % chars.length]).join("") + "!7";
  };
  const refreshFromServer = async () => {
    if (!(await DB.sync(false))) throw new Error("Saved, but the list could not be refreshed. Reload the page.");
  };
  async function createMember({ name, email, phone = "", address = "", plan, method, start = today(), recordPayment = true }) {
    if (!PLANS[plan]) throw new Error("This plan is no longer available. Choose another plan.");
    const password = tempPassword();
    // With a payment, the payments endpoint starts the membership. Without one,
    // the create call starts it directly so no payment row is invented.
    const body = { name, email, password, phone, address };
    if (!recordPayment) { body.plan = plan; body.start_date = iso(start); }
    const created = await ProFitAPI.post("/staff/members/", body);
    if (recordPayment) {
      await ProFitAPI.post("/staff/payments/", { member_id: created.id, plan, method: METHOD_CODE[method] || "CASH" });
    }
    await refreshFromServer();
    const m = DB.members.find(x => x.serverId === created.id);
    notify({ type: "member", icon: "fa-user-check", title: "New member enrolled",
      message: `${name} joined the ${PLANS[plan].label} plan. Member ID ${m ? m.id : created.id}.`,
      tag: "member:" + created.id });
    return { member: m, password };
  }
  async function renewMember(m, plan, method) {
    if (!m.serverId) throw new Error("This member is not on the server yet.");
    const res = await ProFitAPI.post("/staff/payments/", { member_id: m.serverId, plan, method: METHOD_CODE[method] || "CASH" });
    await refreshFromServer();
    const fresh = DB.member(m.id) || m;
    const p = res.payment;
    notify({ type: "payment", icon: "fa-wallet", title: "Payment received",
      message: `${method || "Cash"} payment of ${money(p.amount_centavos / 100)} recorded for ${fresh.name}. Receipt ${p.ref}.`,
      tag: "pay:" + p.ref });
    return { payment: { amount: p.amount_centavos / 100 }, end: fresh.end };
  }
  // Shows the one-time temporary password. The server never returns it again.
  function showTempPassword(name, email, password) {
    modal({ title: "Member created", confirmText: "Done", cancelText: "Close",
      body: `<p class="pp-muted">${esc(name)} can sign in with <strong>${esc(email)}</strong> and this temporary password. Write it down now; it is not shown again.</p>
        <p><code style="font-size:1.1rem;user-select:all">${esc(password)}</code></p>` });
  }

  // ---------- Shared UI pieces ----------
  const emptyBlock = (icon, title, text) => `<div class="pp-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const avatar = (m, cls = "") => m.photoId
    ? `<span class="pp-avatar ${cls} has-photo" aria-hidden="true">${esc(initialsOf(m.name))}<img data-photo-id="${esc(m.photoId)}" alt="" hidden></span>`
    : `<span class="pp-avatar ${cls}" aria-hidden="true">${esc(initialsOf(m.name))}</span>`;
  function hydratePhotos() {
    document.querySelectorAll("img[data-photo-id]").forEach(img => {
      media.url(img.dataset.photoId).then(u => { if (u) { img.src = u; img.hidden = false; } }).catch(() => {});
    });
  }
  const setErr = (fieldId, msg) => {
    const el = $(fieldId + "-err");
    if (el) { el.textContent = msg; el.hidden = false; }
    $(fieldId)?.setAttribute("aria-invalid", "true");
  };
  function clearErrors(root) {
    root.querySelectorAll(".pp-err").forEach(e => { e.hidden = true; e.textContent = ""; });
    root.querySelectorAll("[aria-invalid]").forEach(e => e.removeAttribute("aria-invalid"));
  }

  // ---------- Browse ----------
  const memberCard = m => {
    const s = statusFor(m), d = left(m);
    const bg = avatarColor(m.name);
    const sub = d < 0 ? "Expired" : (d === 0 ? "Expires today" : `${d} days left`);
    return `<article class="member-grid-card" tabindex="0" role="button" data-open="${esc(m.id)}" aria-label="Open ${esc(m.name)}">
      <div class="card-top-row">
        <div class="member-cell">
          <span class="member-avatar-pill" style="background:${bg};">${esc(initialsOf(m.name))}</span>
          <div class="member-info-col">
            <strong>${esc(m.name)}</strong>
            <small>${esc(m.email)}</small>
          </div>
        </div>
        <button class="members-action-btn" type="button" data-row-menu="${esc(m.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(m.name)}">
          <i class="fa-solid fa-ellipsis"></i>
        </button>
      </div>
      <dl class="card-mid-info">
        <div><dt>Plan</dt><dd>${esc(planLabel(m.plan))}</dd></div>
        <div><dt>Status</dt><dd><span class="badge-status badge-${s.key}"><span class="badge-dot"></span> ${s.label}</span></dd></div>
        <div><dt>Expiry</dt><dd>${esc(fmt(m.end))}</dd></div>
        <div><dt>Remaining</dt><dd>${esc(sub)}</dd></div>
      </dl>
    </article>`;
  };

  const MENU_ITEMS = m => [
    { act: "profile", icon: "fa-id-card", label: "View full profile" },
    { act: "edit", icon: "fa-pen-to-square", label: "Edit details" },
    { act: "renew", icon: "fa-rotate", label: m.cancelledAt ? "Reactivate with renewal" : "Renew membership" },
    { act: "freeze", icon: isFrozen(m) ? "fa-play" : "fa-snowflake", label: isFrozen(m) ? "Unfreeze membership" : "Freeze membership" },
    { sep: true },
    { act: "cancel", icon: "fa-ban", label: "Cancel membership", danger: true, disabled: !!m.cancelledAt }
  ];

  const rowHTML = m => {
    const s = statusFor(m);
    const d = left(m);
    const bg = avatarColor(m.name);
    const sub = d < 0 ? "-" : (d === 0 ? "Expires today" : `${d} day${d === 1 ? "" : "s"} left`);
    return `<tr data-row="${esc(m.id)}" tabindex="0">
      <td>
        <div class="member-cell">
          <span class="member-avatar-pill" style="background:${bg};">${esc(initialsOf(m.name))}</span>
          <div class="member-info-col">
            <strong>${esc(m.name)}</strong>
            <small>${esc(m.email)}</small>
          </div>
        </div>
      </td>
      <td><span class="member-plan-text">${esc(planLabel(m.plan))}</span></td>
      <td><span class="badge-status badge-${s.key}"><span class="badge-dot"></span> ${s.label}</span></td>
      <td>
        <div class="member-expiry-cell">
          <span class="member-expiry-date">${esc(fmt(m.end))}</span>
          <span class="member-expiry-sub">${esc(sub)}</span>
        </div>
      </td>
      <td style="text-align:right">
        <button class="members-action-btn" type="button" data-row-menu="${esc(m.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${esc(m.name)}" title="More actions">
          <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
        </button>
      </td>
    </tr>`;
  };

  function renderPagination(current, totalPages) {
    if (totalPages <= 1) return "";
    let html = `<button class="pager-btn" type="button" data-page="${current - 1}" ${current <= 1 ? "disabled" : ""} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const delta = 1;
    const range = [];
    for (let i = Math.max(2, current - delta); i <= Math.min(totalPages - 1, current + delta); i++) {
      range.push(i);
    }
    
    html += `<button class="pager-btn ${current === 1 ? "active" : ""}" type="button" data-page="1">1</button>`;
    if (range.length && range[0] > 2) html += `<span class="pager-ellipsis">...</span>`;
    
    range.forEach(p => {
      html += `<button class="pager-btn ${current === p ? "active" : ""}" type="button" data-page="${p}">${p}</button>`;
    });
    
    if (range.length && range[range.length - 1] < totalPages - 1) html += `<span class="pager-ellipsis">...</span>`;
    if (totalPages > 1) {
      html += `<button class="pager-btn ${current === totalPages ? "active" : ""}" type="button" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    html += `<button class="pager-btn" type="button" data-page="${current + 1}" ${current >= totalPages ? "disabled" : ""} aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button>`;
    return html;
  }

  function renderBrowse() {
    updateStats();
    const q = state.query.trim().toLowerCase();
    let all = [...DB.members];

    if (state.sort === "name-asc") {
      all.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sort === "name-desc") {
      all.sort((a, b) => b.name.localeCompare(a.name));
    } else if (state.sort === "expiry-soon") {
      all.sort((a, b) => (new Date(a.end) - new Date(b.end)));
    } else if (state.sort === "plan") {
      all.sort((a, b) => String(a.plan || '').localeCompare(String(b.plan || '')));
    }

    const list = all.filter(m => {
      const k = statusFor(m).key;
      const byStatus = state.filter === "all" || k === state.filter || (state.filter === "expired" && k === "cancelled");
      return byStatus && (!q || [m.name, m.id, m.email, m.phone].some(v => String(v || "").toLowerCase().includes(q)));
    });

    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * PER_PAGE;
    const slice = list.slice(start, start + PER_PAGE);
    const empty = emptyBlock("fa-user-slash", "No members match", q || state.filter !== "all" ? "Try another search or clear the filter to see everyone." : "Enroll your first member from the New enrollment tab.");
    
    if ($("countBrowse")) $("countBrowse").textContent = all.length;
    $("memberSummary").textContent = list.length ? `Showing ${start + 1}–${start + slice.length} of ${list.length} members` : "No members found";
    
    const table = state.view === "table";
    $("memberTableWrap").hidden = !table;
    $("memberGrid").hidden = table;
    
    if (table) {
      $("memberTableWrap").innerHTML = slice.length
        ? `<table class="members-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Membership Plan</th>
                <th scope="col">Status</th>
                <th scope="col">Expiry Date</th>
                <th scope="col" style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody>${slice.map(rowHTML).join("")}</tbody>
          </table>`
        : empty;
    } else {
      $("memberGrid").innerHTML = slice.length ? slice.map(memberCard).join("") : empty;
    }
    
    $("memberPager").innerHTML = renderPagination(state.page, pages);

    // Update filter dropdown items
    document.querySelectorAll("#filterDropdownMenu [data-filter]").forEach(b => {
      b.classList.toggle("active", b.dataset.filter === state.filter);
    });
    // Update sort dropdown items
    document.querySelectorAll("#sortDropdownMenu [data-sort]").forEach(b => {
      b.classList.toggle("active", b.dataset.sort === state.sort);
    });
    // Update view dropdown items
    document.querySelectorAll("#viewDropdownMenu [data-view]").forEach(b => {
      b.classList.toggle("active", b.dataset.view === state.view);
    });
    if ($("viewIcon")) {
      $("viewIcon").className = state.view === "table" ? "fa-solid fa-table-list" : "fa-solid fa-table-cells-large";
    }
  }

  // ---------- Member actions: freeze, unfreeze, cancel, and the "..." menu ----------
  function freezeDialog(m) {
    if (isFrozen(m)) {
      const remaining = Math.max(0, dayDiff(new Date(), parseISO(m.frozenUntil)));
      return modal({
        title: `Unfreeze ${m.name}'s membership?`,
        confirmText: "Unfreeze now",
        body: `<p class="pp-muted">Access resumes today. The ${remaining} unused day${remaining === 1 ? "" : "s"} come off the end date, so the member keeps only the time they paid for.</p>`,
        onConfirm: () => {
          m.end = addDays(m.end, -remaining);
          m.frozenUntil = null;
          save(); renderAll();
          toast(`${m.name}'s membership is active again.`);
        }
      });
    }
    modal({
      title: `Freeze ${m.name}'s membership`,
      confirmText: "Freeze membership",
      body: `<p class="pp-muted">Check-ins pause while frozen. The end date moves forward by the same number of days, so no paid time is lost.</p>
        <div class="pp-field"><label for="fDays">Freeze for</label><select id="fDays"><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option></select></div>`,
      onConfirm: box => {
        const days = Number(box.querySelector("#fDays").value);
        m.frozenUntil = iso(addDays(today(), days));
        m.end = addDays(m.end, days);
        save(); renderAll();
        toast(`Frozen for ${days} days. Check-ins are paused until then.`);
      }
    });
  }
  function cancelDialog(m) {
    modal({
      title: `Cancel ${m.name}'s membership?`,
      confirmText: "Yes, cancel membership",
      cancelText: "Keep membership",
      danger: true,
      body: `<p class="pp-muted">Access ends today and check-ins stop. Payment history and profile details are kept, and the member can come back anytime by renewing.</p>`,
      onConfirm: () => {
        m.cancelledAt = new Date().toISOString();
        m.frozenUntil = null;
        m.end = today();
        save(); renderAll();
        toast(`${m.name}'s membership is cancelled.`);
      }
    });
  }
  function runMenuAction(act, m) {
    if (act === "profile") return openDetail(m.id, "overview");
    if (act === "edit") return openDetail(m.id, "edit");
    if (act === "renew") return renewalDialog(m);
    if (act === "freeze") return freezeDialog(m);
    if (act === "cancel") return cancelDialog(m);
  }
  let openMenuEl = null;
  function closeMenu() {
    if (!openMenuEl) return;
    openMenuEl.remove();
    openMenuEl = null;
    document.querySelectorAll('[data-row-menu][aria-expanded="true"]').forEach(b => b.setAttribute("aria-expanded", "false"));
  }
  function showRowMenu(btn, m) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "pp-menu";
    el.setAttribute("role", "menu");
    el.dataset.id = m.id;
    el.innerHTML = MENU_ITEMS(m).map(it => it.sep
      ? '<div class="pp-menu-sep" role="separator"></div>'
      : `<button type="button" role="menuitem" data-act="${it.act}"${it.danger ? ' class="danger"' : ""}${it.disabled ? " disabled" : ""}><i class="fa-solid ${it.icon}" aria-hidden="true"></i> ${esc(it.label)}</button>`).join("");
    document.body.appendChild(el);
    const r = btn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const below = r.bottom + 8 + h <= window.innerHeight;
    el.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
    el.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
    btn.setAttribute("aria-expanded", "true");
    openMenuEl = el;
    el.querySelector("button:not([disabled])")?.focus({ preventScroll: true });
  }
  document.addEventListener("click", e => {
    const item = e.target.closest(".pp-menu [data-act]");
    if (item && openMenuEl) {
      const m = DB.member(openMenuEl.dataset.id);
      closeMenu();
      if (m) runMenuAction(item.dataset.act, m);
      return;
    }
    if (!e.target.closest(".pp-menu") && !e.target.closest("[data-row-menu]")) closeMenu();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, { passive: true });

  // ---------- Applications ----------
  const appCard = a => {
    const statusMap = { pending: ["pending", "Pending review"], approved: ["active", "Approved"], declined: ["expired", "Declined"] };
    const [cls, label] = statusMap[a.status] || ["pending", a.status];
    const verified = a.paymentVerified === true;
    const pendingActions = a.status === "pending"
      ? `${a.paymentRef && !verified
          ? `<button class="pp-btn" type="button" data-app-action="verify" data-id="${esc(a.id)}"><i class="fa-solid fa-shield-halved"></i> Mark payment verified</button>`
          : ""}
         <button class="pp-btn pp-btn-primary" type="button" data-app-action="approve" data-id="${esc(a.id)}"><i class="fa-solid fa-check"></i> Approve</button>
         <button class="pp-btn pp-btn-danger" type="button" data-app-action="decline" data-id="${esc(a.id)}"><i class="fa-solid fa-xmark"></i> Decline</button>`
      : a.status === "declined"
        ? `<button class="pp-btn" type="button" data-app-action="reconsider" data-id="${esc(a.id)}"><i class="fa-solid fa-rotate-left"></i> Move back to pending</button>`
        : `<span class="pp-muted"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Member record created</span>`;
    const actions = pendingActions;
    const payRow = a.paymentRef
      ? `<div class="pp-verify ${verified ? "is-ok" : ""}">
           <span class="pp-verify-icon"><i class="fa-solid ${verified ? "fa-circle-check" : "fa-receipt"}" aria-hidden="true"></i></span>
           <div class="pp-verify-copy">
             <small>Transaction reference</small>
             <code>${esc(a.paymentRef)}</code>
             <strong>${esc(a.payment || "Payment")} · ${money(a.amount || PLANS[a.plan]?.price || 0)}</strong>
           </div>
           <span class="pp-status ${verified ? "active" : "pending"}">${verified ? "Verified" : "Awaiting verification"}</span>
         </div>`
      : "";
    return `<article class="pp-app">
      <header><span class="pp-avatar" aria-hidden="true">${esc(initialsOf(a.name))}</span>
        <div class="pp-member-title"><h3>${esc(a.name)}</h3><span>${esc(a.email)}${a.phone ? " · " + esc(a.phone) : ""}</span></div>
        ${a.ref ? `<span class="pp-app-ref" title="Tracking code">${esc(a.ref)}</span>` : ""}
        <span class="pp-status ${cls}">${label}</span></header>
      <dl class="pp-kv pp-kv-3">
        <div><dt>Plan</dt><dd>${esc(planLabel(a.plan))} · ${money(PLANS[a.plan]?.price)}</dd></div>
        <div><dt>Preferred payment</dt><dd>${esc(a.payment || "Not set")}</dd></div>
        <div><dt>Submitted</dt><dd>${esc(a.createdAt ? fmtDateTime(a.createdAt) : "Unknown")}</dd></div>
      </dl>
      ${payRow}
      ${a.notes ? `<p class="pp-note-line"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i> ${esc(a.notes)}</p>` : ""}
      <footer class="pp-app-foot">${actions}</footer>
    </article>`;
  };
  function renderApps() {
    const apps = DB.applications || [];
    const count = k => apps.filter(a => a.status === k).length;
    $("appPendingCount").textContent = count("pending");
    $("appApprovedCount").textContent = count("approved");
    $("appDeclinedCount").textContent = count("declined");
    $("countApps").textContent = count("pending");
    document.querySelectorAll("#appFilters [data-app]").forEach(b => {
      const on = b.dataset.app === state.app;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const list = apps.filter(a => a.status === state.app).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const empty = { pending: ["fa-inbox", "No pending applications", "New sign-ups from the member portal appear here."],
                    approved: ["fa-circle-check", "No approved applications yet", "Approved applications show here for reference."],
                    declined: ["fa-ban", "No declined applications", "Declined applications are kept here with the reason."] }[state.app];
    $("appList").innerHTML = list.length ? list.map(appCard).join("") : emptyBlock(empty[0], empty[1], empty[2]);
  }
  function approveApp(app) {
    if (findByEmail(app.email)) return toast("A member with this email already exists.", true);
    modal({
      title: `Approve ${app.name}?`,
      confirmText: "Approve and create membership",
      body: `<p class="pp-muted">This creates a membership starting today on the <strong>${esc(planLabel(app.plan))}</strong> plan. The member can then sign in with their email.</p>
        <label class="pp-check"><input type="checkbox" id="mRecord" checked> Record the first payment of <strong>${money(PLANS[app.plan]?.price)}</strong> (${esc(app.payment || "Cash")})</label>`,
      onConfirm: async box => {
        if (findByEmail(app.email)) throw new Error("A member with this email already exists.");
        const { member: m, password } = await createMember({ name: app.name, email: app.email, phone: app.phone, plan: app.plan, method: app.payment, recordPayment: box.querySelector("#mRecord").checked });
        app.status = "approved";
        app.reviewedAt = new Date().toISOString();
        save();
        state.app = "approved";
        renderAll();
        toast(`${app.name} is now a member (${m ? m.id : "new"}).`);
        notify({ type: "request", icon: "fa-circle-check", title: "Membership approved",
          message: `${app.name}${app.ref ? ` (${app.ref})` : ""} can now sign in with ${app.email}.`,
          tag: "request:" + app.id });
        setTimeout(() => showTempPassword(app.name, app.email, password), 50);
      }
    });
  }
  function declineApp(app) {
    modal({
      title: `Decline ${app.name}'s application?`,
      confirmText: "Decline application",
      danger: true,
      body: `<label class="pp-field"><span>Reason (optional, kept on record)</span><textarea id="dNote" rows="3" maxlength="300" placeholder="e.g. Incomplete details, not yet eligible"></textarea></label>`,
      onConfirm: box => {
        app.status = "declined";
        app.notes = box.querySelector("#dNote").value.trim();
        app.reviewedAt = new Date().toISOString();
        save();
        state.app = "declined";
        renderAll();
        toast(`Application from ${app.name} declined.`);
        notify({ type: "request", icon: "fa-ban", title: "Application declined",
          message: `${app.name}${app.ref ? ` (${app.ref})` : ""} — ${app.notes || "no reason given"}.`,
          tag: "request:" + app.id });
      }
    });
  }
  function reconsiderApp(app) {
    app.status = "pending";
    app.notes = "";
    delete app.reviewedAt;
    save();
    state.app = "pending";
    renderAll();
    toast(`${app.name}'s application is back in pending.`);
  }

  // ---------- Member detail ----------
  function openDetail(id, sub = "overview") {
    state.selectedId = id;
    state.subtab = sub;
    setTab("detail");
  }
  function renderPicker(root) {
    const q = state.pickerQuery.trim().toLowerCase();
    const matches = [...DB.members]
      .filter(m => !q || [m.name, m.id, m.email].some(v => String(v).toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
    root.innerHTML = `<div class="pp-picker">
        <div class="pp-picker-head"><h2>Find a member</h2><p class="pp-muted">Choose someone to see their profile, payments and check-ins.</p></div>
        <label class="pp-search pp-search-wide"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="pickerSearch" type="search" placeholder="Start typing a name, ID or email" value="${esc(state.pickerQuery)}" aria-label="Find a member"></label>
        <div class="pp-picker-list">${matches.length ? matches.map(m => `
          <button class="pp-picker-item" type="button" data-open="${esc(m.id)}">${avatar(m, "sm")}
            <span class="pp-picker-text"><strong>${esc(m.name)}</strong><small>${esc(m.id)} · ${esc(planLabel(m.plan))}</small></span>
            <span class="pp-status ${statusFor(m).key}">${statusFor(m).label}</span></button>`).join("")
          : emptyBlock("fa-user-slash", "No matching members", "Try another name or ID.")}</div>
      </div>`;
    if (state.pickerQuery) {
      const input = $("pickerSearch");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  const SUBTABS = { overview: "Overview", payments: "Payments", checkins: "Check-ins", edit: "Edit details" };
  function overviewHTML(m, payments, checkins, total) {
    const last = checkins[checkins.length - 1];
    return `<div class="pp-info-grid">
      <section class="pp-card"><h3>Membership</h3><dl class="pp-dl">
        <dt>Plan</dt><dd>${esc(planLabel(m.plan))}</dd>
        <dt>Started</dt><dd>${m.start ? esc(fmt(m.start)) : "—"}</dd>
        <dt>Ends</dt><dd>${esc(fmt(m.end))}</dd>
        <dt>Status</dt><dd>${esc(expiryText(m))}</dd></dl></section>
      <section class="pp-card"><h3>Contact</h3><dl class="pp-dl">
        <dt>Email</dt><dd class="pp-truncate">${esc(m.email)}</dd>
        <dt>Mobile</dt><dd>${esc(m.phone || "Not added")}</dd>
        <dt>Address</dt><dd>${esc(m.address || "Not added")}</dd></dl></section>
      <section class="pp-card"><h3>Emergency contact</h3>${m.emergencyName || m.emergencyPhone
        ? `<dl class="pp-dl"><dt>Name</dt><dd>${esc(m.emergencyName || "—")}</dd><dt>Phone</dt><dd>${esc(m.emergencyPhone || "—")}</dd></dl>`
        : `<p class="pp-muted">Not added yet. The member can add this from their portal.</p>`}</section>
      <section class="pp-card"><h3>Summary</h3><dl class="pp-dl">
        <dt>Total paid</dt><dd>${money(total)}</dd>
        <dt>Payments</dt><dd>${payments.length}</dd>
        <dt>Check-ins</dt><dd>${checkins.length}</dd>
        <dt>Last check-in</dt><dd>${last ? esc(fmt(last.date)) : "None yet"}</dd></dl></section>
    </div>`;
  }
  function paymentsHTML(payments, total) {
    return `<section class="pp-card"><div class="pp-card-head"><h3>Payment history</h3><span class="pp-muted">Total paid ${money(total)}</span></div>
      ${payments.length ? `<div class="pp-table-wrap"><table class="pp-table"><thead><tr><th>Reference</th><th>Date</th><th>Plan</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>
        ${payments.map(p => `<tr><td>${esc(p.ref)}</td><td>${esc(fmt(p.date))}</td><td>${esc(planLabel(p.plan))}</td><td>${esc(p.method)}</td><td class="num">${money(p.amount)}</td></tr>`).join("")}
        </tbody></table></div>` : emptyBlock("fa-receipt", "No payments yet", "Record a renewal to add the first payment.")}</section>`;
  }
  function checkinsHTML(checkins) {
    const rows = [...checkins].reverse().slice(0, 30);
    return `<section class="pp-card"><div class="pp-card-head"><h3>Recent check-ins</h3><span class="pp-muted">${checkins.length} total</span></div>
      ${rows.length ? `<ol class="pp-timeline">${rows.map(c => `<li><strong>${esc(fmt(c.date))}</strong><span>${esc(c.time || "")}</span></li>`).join("")}</ol>`
        : emptyBlock("fa-calendar-xmark", "No check-ins yet", "Check-ins from the gym appear here.")}</section>`;
  }
  function editHTML(m) {
    const opt = k => `<option value="${k}" ${k === m.plan ? "selected" : ""}>${esc(PLANS[k].label)}</option>`;
    return `<form class="pp-card" id="editForm" novalidate>
      <div class="pp-form-grid">
        <div class="pp-field"><label for="eeName">Full name</label><input id="eeName" maxlength="80" value="${esc(m.name)}"><small class="pp-err" id="eeName-err" hidden></small></div>
        <div class="pp-field"><label for="eeEmail">Email (sign-in)</label><input id="eeEmail" type="email" maxlength="120" value="${esc(m.email)}"><small class="pp-err" id="eeEmail-err" hidden></small></div>
        <div class="pp-field"><label for="eePhone">Mobile number</label><input id="eePhone" type="tel" maxlength="20" value="${esc(m.phone)}"><small class="pp-err" id="eePhone-err" hidden></small></div>
        <div class="pp-field"><label for="eePlan">Plan</label><select id="eePlan">${PLAN_KEYS.map(opt).join("")}</select></div>
        <div class="pp-field pp-span-2"><label for="eeAddress">Home address</label><input id="eeAddress" maxlength="160" value="${esc(m.address)}"></div>
        <div class="pp-field"><label for="eeEmgName">Emergency contact name</label><input id="eeEmgName" maxlength="80" value="${esc(m.emergencyName)}"></div>
        <div class="pp-field"><label for="eeEmgPhone">Emergency contact phone</label><input id="eeEmgPhone" type="tel" maxlength="20" value="${esc(m.emergencyPhone)}"><small class="pp-err" id="eeEmgPhone-err" hidden></small></div>
        <div class="pp-field"><label for="eeEnd">Membership ends</label><input id="eeEnd" type="date" value="${iso(m.end)}"><small class="pp-err" id="eeEnd-err" hidden></small></div>
      </div>
      <div class="pp-actions pp-actions-end">
        <button class="pp-btn" type="reset">Discard changes</button>
        <button class="pp-btn pp-btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save changes</button>
      </div>
    </form>`;
  }
  function renderDetail() {
    const root = $("detailRoot");
    if (!root) return;

    if (!DB.members || DB.members.length === 0) {
      root.innerHTML = `
        <div class="pp-card pp-empty-detail" style="text-align:center;padding:48px 24px;">
          <i class="fa-solid fa-users-slash" style="font-size:44px;color:var(--muted);margin-bottom:14px;display:block;"></i>
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;">No members yet</h2>
          <p class="pp-muted" style="margin-bottom:20px;font-size:14px;">Enroll a member to see their details here.</p>
          <button class="pp-btn pp-btn-primary" type="button" id="detailGoEnroll"><i class="fa-solid fa-plus"></i> Enroll a member</button>
        </div>`;
      $("detailGoEnroll")?.addEventListener("click", () => setTab("enroll"));
      return;
    }

    if (!state.selectedId || !DB.member(state.selectedId)) {
      state.selectedId = DB.members[0].id;
    }
    const m = DB.member(state.selectedId);
    if (!m) return;

    const s = statusFor(m);
    const d = left(m);
    const daysLeftText = d < 0 ? "Expired" : (d === 0 ? "Expires today" : `${d} day${d === 1 ? "" : "s"} left`);
    const payments = DB.payments.filter(p => p.memberId === m.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const checkins = DB.checkins.filter(c => c.memberId === m.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalPaid = payments.reduce((n, p) => n + p.amount, 0);
    const bg = avatarColor(m.name);

    root.innerHTML = `
      <div class="member-detail-container">
        <!-- Top Toolbar -->
        <div class="detail-top-toolbar">
          <button class="pp-btn" type="button" id="btnBackToBrowse">
            <i class="fa-solid fa-arrow-left"></i> Browse Members
          </button>
          <div class="detail-picker-group">
            <label for="detailMemberSelect"><i class="fa-solid fa-users"></i> Member:</label>
            <select id="detailMemberSelect" class="detail-select-input">
              ${DB.members.map(item => `<option value="${esc(item.id)}" ${item.id === m.id ? 'selected' : ''}>${esc(item.name)} (${esc(item.id)}) — ${esc(planLabel(item.plan))}</option>`).join('')}
            </select>
          </div>
          <div class="detail-actions-group">
            <button class="pp-btn pp-btn-primary" type="button" data-detail-action="renew"><i class="fa-solid fa-rotate"></i> Renew</button>
            <button class="pp-btn" type="button" data-detail-action="edit"><i class="fa-solid fa-pen-to-square"></i> Edit Profile</button>
          </div>
        </div>

        <!-- 12-Column Grid Layout -->
        <div class="grid-12 member-detail-grid">
          <!-- Card 1: Header Banner (12 cols) -->
          <div class="col-12 pp-card member-detail-header-card">
            <div class="member-detail-avatar-wrap">
              <span class="member-avatar-pill is-lg" style="background:${bg};">${esc(initialsOf(m.name))}</span>
            </div>
            <div class="member-detail-title-wrap">
              <div class="member-detail-names">
                <h2>${esc(m.name)}</h2>
                <p class="pp-muted"><i class="fa-regular fa-id-badge"></i> Member ID: <strong>${esc(m.id)}</strong></p>
              </div>
              <div class="member-detail-badges">
                <span class="badge-status badge-${s.key}"><span class="badge-dot"></span> ${s.label}</span>
                <span class="pp-chip"><i class="fa-solid fa-ticket"></i> ${esc(planLabel(m.plan))}</span>
                <span class="pp-chip is-expiry"><i class="fa-regular fa-clock"></i> ${esc(daysLeftText)}</span>
              </div>
            </div>
            <div class="member-detail-quick-stats">
              <div class="quick-stat-box">
                <small>Total Paid</small>
                <strong>${money(totalPaid)}</strong>
              </div>
              <div class="quick-stat-box">
                <small>Check-ins</small>
                <strong>${checkins.length}</strong>
              </div>
            </div>
          </div>

          <!-- Card 2: Membership Information (6 cols) -->
          <div class="col-6 pp-card detail-card-stretch">
            <div class="pp-card-head">
              <h3><i class="fa-solid fa-id-card-clip"></i> Membership Details</h3>
              <span class="badge-status badge-${s.key}"><span class="badge-dot"></span> ${s.label}</span>
            </div>
            <dl class="detail-dl">
              <div><dt>Membership Plan</dt><dd>${esc(planLabel(m.plan))}</dd></div>
              <div><dt>Status</dt><dd>${esc(s.label)} (${esc(daysLeftText)})</dd></div>
              <div><dt>Started Date</dt><dd>${m.start ? esc(fmt(m.start)) : "—"}</dd></div>
              <div><dt>Expiry Date</dt><dd>${esc(fmt(m.end))}</dd></div>
              <div><dt>Days Left</dt><dd><strong>${esc(daysLeftText)}</strong></dd></div>
              <div><dt>Account ID</dt><dd><code>${esc(m.id)}</code></dd></div>
            </dl>
          </div>

          <!-- Card 3: Contact Details (6 cols) -->
          <div class="col-6 pp-card detail-card-stretch">
            <div class="pp-card-head">
              <h3><i class="fa-regular fa-address-book"></i> Contact Information</h3>
            </div>
            <dl class="detail-dl">
              <div><dt>Email Address</dt><dd class="pp-truncate">${esc(m.email)}</dd></div>
              <div><dt>Mobile Number</dt><dd>${esc(m.phone || "Not provided")}</dd></div>
              <div><dt>Home Address</dt><dd>${esc(m.address || "Not provided")}</dd></div>
              <div><dt>Emergency Contact</dt><dd>${esc(m.emergencyName || "Not provided")}</dd></div>
              <div><dt>Emergency Phone</dt><dd>${esc(m.emergencyPhone || "—")}</dd></div>
            </dl>
          </div>

          <!-- Card 4: Recent Payments (6 cols) -->
          <div class="col-6 pp-card detail-card-stretch">
            <div class="pp-card-head">
              <h3><i class="fa-solid fa-wallet"></i> Recent Payments</h3>
              <span class="pp-muted">${payments.length} total</span>
            </div>
            ${payments.length ? `
              <div class="pp-table-wrap">
                <table class="pp-table">
                  <thead>
                    <tr><th>Reference</th><th>Date</th><th>Method</th><th style="text-align:right">Amount</th></tr>
                  </thead>
                  <tbody>
                    ${payments.slice(0, 5).map(p => `
                      <tr>
                        <td><code>${esc(p.ref)}</code></td>
                        <td>${esc(fmt(p.date))}</td>
                        <td>${esc(p.method)}</td>
                        <td style="text-align:right"><strong>${money(p.amount)}</strong></td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="detail-sub-empty">
                <i class="fa-solid fa-receipt"></i>
                <p>No payments recorded yet</p>
                <button class="pp-btn pp-btn-sm" type="button" data-detail-action="renew"><i class="fa-solid fa-plus"></i> Record Payment</button>
              </div>
            `}
          </div>

          <!-- Card 5: Recent Check-ins (6 cols) -->
          <div class="col-6 pp-card detail-card-stretch">
            <div class="pp-card-head">
              <h3><i class="fa-solid fa-calendar-check"></i> Recent Check-ins</h3>
              <span class="pp-muted">${checkins.length} total</span>
            </div>
            ${checkins.length ? `
              <div class="pp-table-wrap">
                <table class="pp-table">
                  <thead>
                    <tr><th>Date</th><th>Time</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    ${checkins.slice(0, 5).map(c => `
                      <tr>
                        <td>${esc(fmt(c.date))}</td>
                        <td>${esc(c.time || "—")}</td>
                        <td><span class="badge-status badge-active"><span class="badge-dot"></span> Completed</span></td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="detail-sub-empty">
                <i class="fa-solid fa-calendar-xmark"></i>
                <p>No check-in visits recorded yet</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    $("btnBackToBrowse")?.addEventListener("click", () => setTab("browse"));
    $("detailMemberSelect")?.addEventListener("change", e => {
      openDetail(e.target.value);
    });
  }
  function renewalDialog(m) {
    const base = m.end >= today() ? m.end : today();
    const { box } = modal({
      title: `Record renewal for ${m.name}`,
      confirmText: "Record renewal",
      body: `<p class="pp-muted">Current end date: <strong>${esc(fmt(m.end))}</strong>. The new period starts ${m.end >= today() ? "after it" : "today"}.</p>
        <div class="pp-form-grid">
          <div class="pp-field"><label for="rPlan">Plan</label><select id="rPlan">${PLAN_KEYS.map(k => `<option value="${k}" ${k === m.plan ? "selected" : ""}>${esc(PLANS[k].label)} · ${money(PLANS[k].price)}</option>`).join("")}</select></div>
          <div class="pp-field"><label for="rMethod">Payment method</label><select id="rMethod">${METHODS.map(x => `<option>${esc(x)}</option>`).join("")}</select></div>
        </div>
        <p class="pp-note-line"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> New end date: <strong id="rEnd"></strong></p>`,
      onConfirm: async dlg => {
        const { payment, end } = await renewMember(m, dlg.querySelector("#rPlan").value, dlg.querySelector("#rMethod").value);
        state.subtab = "payments";
        renderAll();
        toast(`Renewal recorded for ${money(payment.amount)}. Valid until ${fmt(end)}.`);
      }
    });
    const update = () => { box.querySelector("#rEnd").textContent = fmt(addDays(base, PLANS[box.querySelector("#rPlan").value].days)); };
    box.querySelector("#rPlan").addEventListener("change", update);
    update();
  }
  async function saveEdit(form) {
    const m = DB.member(state.selectedId);
    if (!m) return;
    clearErrors(form);
    const v = {
      name: form.eeName.value.trim(), email: form.eeEmail.value.trim(), phone: form.eePhone.value.trim(),
      address: form.eeAddress.value.trim(), emergencyName: form.eeEmgName.value.trim(),
      emergencyPhone: form.eeEmgPhone.value.trim(), end: form.eeEnd.value, plan: form.eePlan.value
    };
    let ok = true;
    if (v.name.length < 2) { setErr("eeName", "Enter the member's full name."); ok = false; }
    if (!validEmail(v.email)) { setErr("eeEmail", "Enter a valid email address."); ok = false; }
    else if (findByEmail(v.email, m.id)) { setErr("eeEmail", "Another member already uses this email."); ok = false; }
    if (!validPhone(v.phone)) { setErr("eePhone", "Enter a valid mobile number."); ok = false; }
    if (!validPhone(v.emergencyPhone)) { setErr("eeEmgPhone", "Enter a valid phone number."); ok = false; }
    if (!v.end) { setErr("eeEnd", "Choose the membership end date."); ok = false; }
    if (!ok) return toast("Please fix the highlighted fields.", true);
    // The server stores name, phone and address only. Say so when other fields were changed.
    const notSaved = [];
    if (v.email.toLowerCase() !== (m.email || "").toLowerCase()) notSaved.push("email");
    if (v.emergencyName !== (m.emergencyName || "") || v.emergencyPhone !== (m.emergencyPhone || "")) notSaved.push("emergency contact");
    if (v.plan !== m.plan) notSaved.push("plan");
    if (v.end !== iso(m.end)) notSaved.push("end date");
    try {
      await ProFitAPI.patch(`/staff/members/${m.serverId}`, { name: v.name, phone: v.phone, address: v.address });
      await refreshFromServer();
    } catch (err) {
      return toast(err.message || "The details could not be saved.", true);
    }
    renderAll();
    toast(notSaved.length ? `Name, phone and address saved. Not saved yet: ${notSaved.join(", ")}.` : "Member details saved.", !!notSaved.length);
  }

  // ---------- Enrollment ----------
  function fillEnrollDefaults() {
    $("eStart").value = todayISO();
    const first = document.querySelector('input[name="ePlan"]');
    if (first && !document.querySelector('input[name="ePlan"]:checked')) first.checked = true;
    updateEnrollAmount();
  }
  function updateEnrollAmount() {
    const key = document.querySelector('input[name="ePlan"]:checked')?.value || PLAN_KEYS[0];
    $("eAmount").value = money(PLANS[key].price);
    document.querySelectorAll(".pp-plan-card").forEach(card => card.classList.toggle("selected", card.querySelector("input").checked));
  }
  function buildEnroll() {
    $("ePlans").innerHTML = PLAN_KEYS.map(k => `
      <label class="pp-plan-card"><input type="radio" name="ePlan" value="${k}">
        <span class="pp-plan-body"><strong>${esc(PLANS[k].label)}</strong><span class="pp-plan-price">${money(PLANS[k].price)}</span><small>${PLANS[k].days} days of access</small></span></label>`).join("");
    $("eMethod").innerHTML = METHODS.map(x => `<option>${esc(x)}</option>`).join("");
    fillEnrollDefaults();
  }

  // ---------- Rendering and tabs ----------
  function renderAll() {
    renderBrowse();
    renderApps();
    renderDetail();
    hydratePhotos();
  }
  function setTab(name) {
    state.tab = name;
    document.querySelectorAll(".pp-page-tab").forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    document.querySelectorAll("[data-pane]").forEach(p => p.classList.toggle("active", p.dataset.pane === name));
    if (name === "detail" && !state.selectedId && DB.members && DB.members.length) {
      state.selectedId = DB.members[0].id;
    }
    renderAll();
    if (name === "enroll") $("eName")?.focus({ preventScroll: true });
    if (location.hash.replace(/^#/, "") !== name) history.replaceState(null, "", `#${name}`);
  }

  // ---------- Events ----------
  document.querySelectorAll(".pp-page-tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  // Deep links from the header's quick actions: members.html#enroll, #applications …
  function tabFromHash() {
    const name = location.hash.replace(/^#/, "");
    if (name && document.querySelector(`.pp-page-tab[data-tab="${name}"]`)) setTab(name);
  }
  window.addEventListener("hashchange", tabFromHash);

  $("memberSearch")?.addEventListener("input", e => { state.query = e.target.value; state.page = 1; renderBrowse(); hydratePhotos(); });
  const memberFilters = document.querySelector("#memberFilters");
  if (memberFilters) {
    memberFilters.addEventListener("click", e => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      state.filter = b.dataset.filter;
      state.page = 1;
      renderBrowse();
    });
  }
  const openFrom = e => {
    const el = e.target.closest("[data-open]");
    if (el) openDetail(el.dataset.open);
  };
  $("memberGrid")?.addEventListener("click", openFrom);
  $("memberGrid")?.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open]")) { e.preventDefault(); openDetail(e.target.dataset.open); } });
  $("memberPager")?.addEventListener("click", e => {
    const b = e.target.closest("[data-page]");
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    renderBrowse();
    hydratePhotos();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.querySelector("#appFilters")?.addEventListener("click", e => {
    const b = e.target.closest("[data-app]");
    if (!b) return;
    state.app = b.dataset.app;
    renderApps();
  });
  $("appList")?.addEventListener("click", e => {
    const b = e.target.closest("[data-app-action]");
    if (!b) return;
    const app = (DB.applications || []).find(a => a.id === b.dataset.id);
    if (!app) return;
    if (b.dataset.appAction === "approve") approveApp(app);
    if (b.dataset.appAction === "decline") declineApp(app);
    if (b.dataset.appAction === "reconsider") reconsiderApp(app);
    if (b.dataset.appAction === "verify") {
      app.paymentVerified = !app.paymentVerified;
      save();
      renderApps();
      if (app.paymentVerified) {
        toast(`Payment verified for ${app.name}.`);
        notify({ type: "payment", icon: "fa-shield-halved", title: "Payment verified",
          message: `${app.payment || "Payment"} ${app.paymentRef || ""} matched for ${app.name}. Approval unblocked.`,
          tag: "verify:" + app.id });
      } else {
        toast(`Payment verification cleared for ${app.name}.`);
      }
    }
  });

  const detailRoot = $("detailRoot");
  if (detailRoot) {
    detailRoot.addEventListener("click", e => {
      const open = e.target.closest("[data-open]");
      if (open) return openDetail(open.dataset.open);
      const sub = e.target.closest("[data-subtab]");
      if (sub) { state.subtab = sub.dataset.subtab; return renderDetail(); }
      const act = e.target.closest("[data-detail-action]");
      if (!act) return;
      const m = DB.member(state.selectedId);
      if (act.dataset.detailAction === "back" || act.dataset.detailAction === "search") {
        state.selectedId = null;
        renderPicker(detailRoot);
      }
      if (act.dataset.detailAction === "renew" && m) renewalDialog(m);
      if (act.dataset.detailAction === "edit") { state.subtab = "edit"; renderDetail(); }
    });
    detailRoot.addEventListener("change", e => {
      if (e.target.id === "detailMemberSelect") {
        openDetail(e.target.value, state.subtab);
      }
    });
    detailRoot.addEventListener("input", e => {
      if (e.target.id === "pickerSearch") { state.pickerQuery = e.target.value; renderPicker(detailRoot); }
    });
    detailRoot.addEventListener("submit", e => {
      if (e.target.id === "editForm") { e.preventDefault(); saveEdit(e.target); }
    });
  }

  $("enrollForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const name = $("eName").value.trim(), email = $("eEmail").value.trim(), phone = $("ePhone").value.trim();
    const address = $("eAddress").value.trim(), start = $("eStart").value, method = $("eMethod").value;
    const plan = document.querySelector('input[name="ePlan"]:checked')?.value;
    const record = $("eRecord").checked;
    let ok = true;
    if (name.length < 2) { setErr("eName", "Enter the member's full name."); ok = false; }
    if (!validEmail(email)) { setErr("eEmail", "Enter a valid email address."); ok = false; }
    else if (findByEmail(email)) { setErr("eEmail", "A member with this email already exists."); ok = false; }
    if (!validPhone(phone)) { setErr("ePhone", "Enter a valid mobile number."); ok = false; }
    if (!start) { setErr("eStart", "Choose a start date."); ok = false; }
    if (!plan) { setErr("ePlan", "Choose a plan."); ok = false; }
    if (!ok) return toast("Please fix the highlighted fields.", true);
    try {
      const { member: m, password } = await createMember({ name, email, phone, address, plan, method, start: parseISO(start), recordPayment: record });
      form.reset();
      fillEnrollDefaults();
      toast(`${name} is enrolled${m ? ` as ${m.id}` : ""}.`);
      if (m) openDetail(m.id);
      showTempPassword(name, email, password);
    } catch (err) {
      toast(err.message || "The member could not be saved.", true);
    }
  });
  $("enrollForm").addEventListener("change", e => { if (e.target.name === "ePlan") updateEnrollAmount(); });
  $("enrollForm").addEventListener("reset", () => setTimeout(fillEnrollDefaults, 0));

  // Top bar search opens this page with ?q=...
  const q = new URLSearchParams(location.search).get("q");
  if (q) { state.query = q; $("memberSearch").value = q; }

  $("memberTableWrap").addEventListener("click", e => {
    const btn = e.target.closest("[data-row-menu]");
    if (btn) {
      e.stopPropagation();
      if (openMenuEl && openMenuEl.dataset.id === btn.dataset.rowMenu) return closeMenu();
      const m = DB.member(btn.dataset.rowMenu);
      if (m) showRowMenu(btn, m);
      return;
    }
    const row = e.target.closest("[data-row]");
    if (row) openDetail(row.dataset.row);
  });
  $("memberTableWrap").addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-row]")) { e.preventDefault(); openDetail(e.target.dataset.row); }
  });
  document.querySelectorAll("[data-view-mode]").forEach(b => b.addEventListener("click", () => { state.view = b.dataset.viewMode; renderBrowse(); }));
  // A phone gets cards, a desktop gets the table, even if the window is resized after load.
  matchMedia("(max-width: 768px)").addEventListener("change", e => { state.view = e.matches ? "cards" : "table"; renderBrowse(); });

  function setupDropdowns() {
    const pairs = [
      { btn: "filterDropdownBtn", menu: "filterDropdownMenu" },
      { btn: "sortDropdownBtn", menu: "sortDropdownMenu" },
      { btn: "viewDropdownBtn", menu: "viewDropdownMenu" }
    ];

    pairs.forEach(({ btn, menu }) => {
      const b = $(btn), m = $(menu);
      if (!b || !m) return;
      b.addEventListener("click", e => {
        e.stopPropagation();
        const open = !m.hidden;
        pairs.forEach(p => {
          const om = $(p.menu), ob = $(p.btn);
          if (om) om.hidden = true;
          if (ob) ob.setAttribute("aria-expanded", "false");
        });
        m.hidden = open;
        b.setAttribute("aria-expanded", String(!open));
      });
    });

    document.addEventListener("click", e => {
      pairs.forEach(({ btn, menu }) => {
        const m = $(menu), b = $(btn);
        if (m && !m.contains(e.target) && b && !b.contains(e.target)) {
          m.hidden = true;
          b.setAttribute("aria-expanded", "false");
        }
      });
    });

    const fMenu = $("filterDropdownMenu");
    if (fMenu) {
      fMenu.addEventListener("click", e => {
        const item = e.target.closest("[data-filter]");
        if (!item) return;
        state.filter = item.dataset.filter;
        state.page = 1;
        const lbl = $("filterLabel");
        if (lbl) lbl.textContent = item.textContent.trim();
        fMenu.hidden = true;
        $("filterDropdownBtn")?.setAttribute("aria-expanded", "false");
        renderBrowse();
      });
    }

    const sMenu = $("sortDropdownMenu");
    if (sMenu) {
      sMenu.addEventListener("click", e => {
        const item = e.target.closest("[data-sort]");
        if (!item) return;
        state.sort = item.dataset.sort;
        state.page = 1;
        const lbl = $("sortLabel");
        if (lbl) lbl.textContent = item.textContent.trim();
        sMenu.hidden = true;
        $("sortDropdownBtn")?.setAttribute("aria-expanded", "false");
        renderBrowse();
      });
    }

    const vMenu = $("viewDropdownMenu");
    if (vMenu) {
      vMenu.addEventListener("click", e => {
        const item = e.target.closest("[data-view]");
        if (!item) return;
        state.view = item.dataset.view;
        vMenu.hidden = true;
        $("viewDropdownBtn")?.setAttribute("aria-expanded", "false");
        renderBrowse();
      });
    }
  }

  const afterSync = window.pfAfterSync || (fn => fn());
  document.addEventListener("profit:synced", () => afterSync(renderAll));
  setupDropdowns();
  buildEnroll();
  afterSync(renderAll);
  tabFromHash();
})();
