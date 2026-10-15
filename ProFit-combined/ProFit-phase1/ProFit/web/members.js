// Members console: browse, applications, member detail and enrollment.
// Reads and writes the shared DB from data.js and always persists with DB.save().
(() => {
  const $ = id => document.getElementById(id);
  const { esc, money, initialsOf, fmt, today, toast, modal, dayDiff, media, parseISO, iso, todayISO, fmtDateTime } = PF;
  const PER_PAGE = 12;
  const PLAN_KEYS = Object.keys(PLANS);
  const state = { view: "table", tab: "browse", filter: "all", query: "", page: 1, app: "pending", selectedId: null, subtab: "overview", pickerQuery: "" };

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

  function addPayment({ memberId, plan, method, amount, date = today() }) {
    const p = { ref: DB.nextRef(), date, memberId, plan, method: method || "Cash", amount: amount ?? PLANS[plan].price };
    DB.payments.unshift(p);
    const who = DB.members.find(m => m.id === memberId);
    notify({ type: "payment", icon: "fa-wallet", title: "Payment received",
      message: `${method || "Cash"} payment of ${money(p.amount)} recorded for ${who ? who.name : memberId}. Receipt ${p.ref}.`,
      tag: "pay:" + p.ref });
    return p;
  }
  function createMember({ name, email, phone = "", address = "", plan, method, start = today(), recordPayment = true }) {
    if (!PLANS[plan]) throw new Error("This plan is no longer available. Choose another plan.");
    const m = {
      id: DB.nextMemberId(), name, email, phone, address, emergencyName: "", emergencyPhone: "", photoId: null,
      plan, start, end: addDays(start, PLANS[plan].days), checkins: 0
    };
    DB.members.push(m);
    if (recordPayment) addPayment({ memberId: m.id, plan, method, date: start });
    save();
    notify({ type: "member", icon: "fa-user-check", title: "New member enrolled",
      message: `${m.name} joined the ${PLANS[plan].label} plan. Member ID ${m.id}.`,
      tag: "member:" + m.id });
    return m;
  }
  function renewMember(m, plan, method) {
    const base = m.end >= today() ? m.end : today();
    m.plan = plan;
    m.cancelledAt = null;
    m.frozenUntil = null;
    m.end = addDays(base, PLANS[plan].days);
    const payment = addPayment({ memberId: m.id, plan, method });
    save();
    return { payment, end: m.end };
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
    const s = statusFor(m), d = Math.max(0, left(m)), total = PLANS[m.plan]?.days || 30;
    const pct = Math.min(100, Math.round((d / total) * 100));
    return `<article class="pp-member" tabindex="0" role="button" data-open="${esc(m.id)}" aria-label="Open ${esc(m.name)}">
      <header>${avatar(m)}<div class="pp-member-title"><h3>${esc(m.name)}</h3><span>${esc(m.id)}</span></div><span class="pp-status ${s.key}">${s.label}</span></header>
      <dl class="pp-kv"><div><dt>Plan</dt><dd>${esc(planLabel(m.plan))}</dd></div><div><dt>Email</dt><dd class="pp-truncate">${esc(m.email)}</dd></div></dl>
      <p class="pp-expiry">${esc(expiryText(m))}</p>
      <div class="pp-meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
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
    return `<tr data-row="${esc(m.id)}" tabindex="0">
      <td><div class="pp-cell-member">${avatar(m, "sm")}<div><strong>${esc(m.name)}</strong><small>${esc(m.id)} · ${esc(m.email)}</small></div></div></td>
      <td>${esc(planLabel(m.plan))}</td>
      <td><span class="pp-status ${s.key}">${s.label}</span></td>
      <td>${esc(fmt(m.end))}<small class="pp-muted pp-block">${esc(expiryText(m))}</small></td>
      <td class="pp-actions-cell"><button class="pp-icon-btn" type="button" data-row-menu="${esc(m.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${esc(m.name)}" title="More actions"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button></td>
    </tr>`;
  };
  function renderBrowse() {
    const q = state.query.trim().toLowerCase();
    const all = [...DB.members].sort((a, b) => a.name.localeCompare(b.name));
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
    $("countBrowse").textContent = all.length;
    $("memberSummary").textContent = list.length ? `Showing ${start + 1}–${start + slice.length} of ${list.length} member${list.length === 1 ? "" : "s"}` : "";
    const table = state.view === "table";
    $("memberTableWrap").hidden = !table;
    $("memberGrid").hidden = table;
    if (table) {
      $("memberTableWrap").innerHTML = slice.length
        ? `<table class="pp-table pp-members-table"><thead><tr><th scope="col">Member</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Ends</th><th scope="col"><span class="pp-sr">Actions</span></th></tr></thead><tbody>${slice.map(rowHTML).join("")}</tbody></table>`
        : empty;
    } else {
      $("memberGrid").innerHTML = slice.length ? slice.map(memberCard).join("") : empty;
    }
    $("memberPager").innerHTML = pages <= 1 ? "" :
      `<button class="pp-btn" type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-left"></i> Previous</button>
       <span class="pp-muted">Page ${state.page} of ${pages}</span>
       <button class="pp-btn" type="button" data-page="${state.page + 1}" ${state.page >= pages ? "disabled" : ""}>Next <i class="fa-solid fa-chevron-right"></i></button>`;
    document.querySelectorAll("#memberFilters [data-filter]").forEach(b => {
      const on = b.dataset.filter === state.filter;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    document.querySelectorAll("[data-view-mode]").forEach(b => {
      const on = b.dataset.viewMode === state.view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
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
      onConfirm: box => {
        if (findByEmail(app.email)) throw new Error("A member with this email already exists.");
        const m = createMember({ name: app.name, email: app.email, phone: app.phone, plan: app.plan, method: app.payment, recordPayment: box.querySelector("#mRecord").checked });
        app.status = "approved";
        app.reviewedAt = new Date().toISOString();
        save();
        state.app = "approved";
        renderAll();
        toast(`${app.name} is now a member (${m.id}).`);
        notify({ type: "request", icon: "fa-circle-check", title: "Membership approved",
          message: `${app.name}${app.ref ? ` (${app.ref})` : ""} can now sign in with ${app.email} and password "password".`,
          tag: "request:" + app.id });
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
    const m = state.selectedId && DB.member(state.selectedId);
    if (!m) { state.selectedId = null; renderPicker(root); return; }
    const s = statusFor(m);
    const payments = DB.payments.filter(p => p.memberId === m.id).sort((a, b) => b.date - a.date);
    const checkins = DB.checkins.filter(c => c.memberId === m.id).sort((a, b) => a.date - b.date);
    const total = payments.reduce((n, p) => n + p.amount, 0);
    const body = state.subtab === "payments" ? paymentsHTML(payments, total)
      : state.subtab === "checkins" ? checkinsHTML(checkins)
      : state.subtab === "edit" ? editHTML(m)
      : overviewHTML(m, payments, checkins, total);
    root.innerHTML = `
      <div class="pp-detail-head pp-card">
        <div class="pp-detail-id">${avatar(m, "lg")}
          <div><h2>${esc(m.name)}</h2><p class="pp-muted">${esc(m.id)} · ${esc(m.email)}${m.phone ? " · " + esc(m.phone) : ""}</p>
          <div class="pp-badges"><span class="pp-status ${s.key}">${s.label}</span><span class="pp-chip">${esc(planLabel(m.plan))}</span></div></div>
        </div>
        <div class="pp-actions">
          <button class="pp-btn pp-btn-primary" type="button" data-detail-action="renew"><i class="fa-solid fa-rotate"></i> Record renewal</button>
          <button class="pp-btn" type="button" data-detail-action="back"><i class="fa-solid fa-arrow-left"></i> All members</button>
        </div>
      </div>
      <nav class="pp-subtabs" role="tablist" aria-label="Member sections">
        ${Object.keys(SUBTABS).map(k => `<button type="button" role="tab" aria-selected="${state.subtab === k}" class="${state.subtab === k ? "active" : ""}" data-subtab="${k}">${SUBTABS[k]}</button>`).join("")}
      </nav>
      <div class="pp-subtab-body">${body}</div>`;
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
      onConfirm: dlg => {
        const { payment, end } = renewMember(m, dlg.querySelector("#rPlan").value, dlg.querySelector("#rMethod").value);
        state.subtab = "payments";
        renderAll();
        toast(`Renewal recorded for ${money(payment.amount)}. Valid until ${fmt(end)}.`);
      }
    });
    const update = () => { box.querySelector("#rEnd").textContent = fmt(addDays(base, PLANS[box.querySelector("#rPlan").value].days)); };
    box.querySelector("#rPlan").addEventListener("change", update);
    update();
  }
  function saveEdit(form) {
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
    Object.assign(m, {
      name: v.name, email: v.email, phone: v.phone, address: v.address,
      emergencyName: v.emergencyName, emergencyPhone: v.emergencyPhone, plan: v.plan, end: parseISO(v.end)
    });
    save();
    renderAll();
    toast("Member details saved.");
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
    renderAll();
    if (name === "enroll") $("eName").focus({ preventScroll: true });
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

  $("memberSearch").addEventListener("input", e => { state.query = e.target.value; state.page = 1; renderBrowse(); hydratePhotos(); });
  document.querySelector("#memberFilters").addEventListener("click", e => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    state.filter = b.dataset.filter;
    state.page = 1;
    renderBrowse();
  });
  const openFrom = e => {
    const el = e.target.closest("[data-open]");
    if (el) openDetail(el.dataset.open);
  };
  $("memberGrid").addEventListener("click", openFrom);
  $("memberGrid").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open]")) { e.preventDefault(); openDetail(e.target.dataset.open); } });
  $("memberPager").addEventListener("click", e => {
    const b = e.target.closest("[data-page]");
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    renderBrowse();
    hydratePhotos();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.querySelector("#appFilters").addEventListener("click", e => {
    const b = e.target.closest("[data-app]");
    if (!b) return;
    state.app = b.dataset.app;
    renderApps();
  });
  $("appList").addEventListener("click", e => {
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
  detailRoot.addEventListener("click", e => {
    const open = e.target.closest("[data-open]");
    if (open) return openDetail(open.dataset.open);
    const sub = e.target.closest("[data-subtab]");
    if (sub) { state.subtab = sub.dataset.subtab; return renderDetail(); }
    const act = e.target.closest("[data-detail-action]");
    if (!act) return;
    const m = DB.member(state.selectedId);
    if (act.dataset.detailAction === "back") { state.selectedId = null; renderDetail(); }
    if (act.dataset.detailAction === "renew" && m) renewalDialog(m);
  });
  detailRoot.addEventListener("input", e => {
    if (e.target.id === "pickerSearch") { state.pickerQuery = e.target.value; renderPicker(detailRoot); }
  });
  detailRoot.addEventListener("submit", e => {
    if (e.target.id === "editForm") { e.preventDefault(); saveEdit(e.target); }
  });

  $("enrollForm").addEventListener("submit", e => {
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
      const m = createMember({ name, email, phone, address, plan, method, start: parseISO(start), recordPayment: record });
      form.reset();
      fillEnrollDefaults();
      toast(`${name} is enrolled as ${m.id}.`);
      openDetail(m.id);
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

  buildEnroll();
  renderAll();
  tabFromHash();
})();
