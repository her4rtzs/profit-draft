// Member dashboard for member-portal.html: membership countdown, gym pass, streaks and check-in,
// attendance, receipts, and class and trainer schedules. Loads after member-portal.js and member-tabs.js.
(() => {
  const dash = document.getElementById("memberDashboard");
  if (!dash || typeof DB === "undefined") return;
  const $ = id => document.getElementById(id);
  const { esc, money, fmt, toast, modal, parseISO, iso, dayDiff, media, compressImage, initialsOf, today } = PF;

  const sessionMember = () => { try { return JSON.parse(localStorage.getItem("profit-member-logged-in") || "null"); } catch { return null; } };
  const currentMember = () => { const s = sessionMember(); return s ? DB.member(s.id) : null; };
  const save = () => DB.save();
  const planLabel = k => PLANS[k]?.label || k;
  const isFrozen = m => !!m.frozenUntil && dayDiff(new Date(), parseISO(m.frozenUntil)) >= 0;
  const daysLeft = m => dayDiff(new Date(), m.end);
  const emptyBlock = (icon, title, text) => `<div class="pp-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const checkinsOf = m => DB.checkins.filter(c => c.memberId === m.id).sort((a, b) => a.date - b.date);
  const dayKeys = m => new Set(checkinsOf(m).map(c => iso(c.date)));
  const bookKey = m => "profit-member-bookings-v1:" + m.id;
  const toolsKey = m => "profit-member-tools-v1:" + m.id;

  function bookings(m) {
    try { const v = JSON.parse(localStorage.getItem(bookKey(m)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  function setBookings(m, list) {
    try { localStorage.setItem(bookKey(m), JSON.stringify(list)); return true; }
    catch { toast("This browser could not save your booking.", true); return false; }
  }
  function diaryCount(m) {
    try { const s = JSON.parse(localStorage.getItem(toolsKey(m)) || "null"); return Array.isArray(s?.diary) ? s.diary.length : 0; } catch { return 0; }
  }
  function hydrate(root) {
    root.querySelectorAll("img[data-photo-id]").forEach(img => {
      media.url(img.dataset.photoId).then(u => { if (u) { img.src = u; img.hidden = false; } }).catch(() => {});
    });
  }

  function membershipState(m) {
    if (m.cancelledAt) return { key: "expired", label: "Cancelled", msg: "Your membership is cancelled. Renew at the front desk to come back." };
    if (isFrozen(m)) return { key: "pending", label: "Frozen", msg: `Frozen until ${fmt(parseISO(m.frozenUntil))}. Check-ins resume after that.` };
    const d = daysLeft(m);
    if (d < 0) return { key: "expired", label: "Expired", msg: `Expired on ${fmt(m.end)}. Renew at the front desk to keep training.` };
    if (d <= 7) return { key: "pending", label: "Expiring soon", msg: `Renew by ${fmt(m.end)} to avoid a gap in your training.` };
    return { key: "active", label: "Active", msg: `Valid until ${fmt(m.end)}.` };
  }
  function streaks(m) {
    const keys = dayKeys(m), now = today();
    let d = now;
    if (!keys.has(iso(d))) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    let current = 0;
    while (keys.has(iso(d))) { current++; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); }
    let longest = 0, run = 0, prev = null;
    for (const k of [...keys].sort()) {
      run = prev && dayDiff(parseISO(prev), parseISO(k)) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = k;
    }
    const all = checkinsOf(m);
    const month = all.filter(c => c.date.getMonth() === now.getMonth() && c.date.getFullYear() === now.getFullYear()).length;
    return { current, longest, month, total: all.length, checkedInToday: keys.has(iso(now)) };
  }
  function countdownHTML(m) {
    const s = membershipState(m), d = daysLeft(m);
    const big = m.cancelledAt ? "Cancelled" : isFrozen(m) ? "Frozen" : d < 0 ? "Expired" : d === 0 ? "Ends today" : `${d} day${d === 1 ? "" : "s"} left`;
    return `<div class="pp-countdown ${s.key}"><i class="fa-regular fa-hourglass-half" aria-hidden="true"></i><div><strong>${esc(big)}</strong><span>${esc(s.msg)}</span></div></div>`;
  }
  function heatHTML(m) {
    const keys = dayKeys(m), now = today(), cells = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), k = iso(d), on = keys.has(k);
      cells.push(`<span class="pp-heat-cell${on ? " on" : ""}" title="${esc(fmt(d))}${on ? " · visited" : ""}"></span>`);
    }
    const visits = cells.filter(c => c.includes(" on")).length;
    return `<div class="pp-heat" role="img" aria-label="${visits} visit days in the last 12 weeks">${cells.join("")}</div>`;
  }
  function checklist(m) {
    return [
      { done: !!(m.phone && m.address && m.emergencyName), label: "Complete your personal details", hint: "Phone, address and emergency contact", goto: "personal" },
      { done: checkinsOf(m).length > 0, label: "Check in at the gym", hint: "Use Check in today below", goto: "overview" },
      { done: bookings(m).length > 0, label: "Book your first class", hint: "Boxing, Circuit or Functional Training", goto: "schedules" },
      { done: diaryCount(m) > 0, label: "Write your first diary entry", hint: "A note or photo about your day", goto: "diary" }
    ];
  }
  function nextClassHTML(m) {
    const booked = CLASSES.filter(c => bookings(m).includes(c.id));
    if (!booked.length) {
      return `<div class="pp-card-head"><div><h3>Your classes</h3><p class="pp-muted">You have no bookings yet. Pick a class that suits your level.</p></div></div>
        <button type="button" class="pp-btn pp-btn-block" data-goto="schedules"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i> Browse classes</button>`;
    }
    return `<div class="pp-card-head"><div><h3>Your classes</h3><p class="pp-muted">${booked.length} booked</p></div></div>
      <ul class="pp-booked">${booked.map(c => `<li><span class="pp-class-tag">${esc(c.name)}</span><span>${esc(c.days.join(" · "))} · ${esc(c.time)}</span></li>`).join("")}</ul>`;
  }
  function overviewHTML(m) {
    const s = membershipState(m), st = streaks(m), items = checklist(m);
    const done = items.filter(i => i.done).length, pct = Math.round((done / items.length) * 100);
    const blocked = s.key === "expired" || isFrozen(m) || !!m.cancelledAt;
    const steps = done === items.length
      ? `<div class="pp-all-done"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><div><strong>You're all set!</strong><span>Keep the streak going and enjoy your training.</span></div></div>`
      : `<ol class="pp-steps">${items.map(i => `<li class="${i.done ? "done" : ""}"><button type="button" class="pp-step" data-goto="${i.goto}"><span class="pp-step-dot" aria-hidden="true">${i.done ? '<i class="fa-solid fa-check"></i>' : ""}</span><span class="pp-step-text"><strong>${esc(i.label)}</strong><small>${esc(i.hint)}</small></span></button></li>`).join("")}</ol>`;
    return `<div class="pp-ov-grid">
      <section class="pp-card pp-pass" aria-label="Gym pass">
        <header class="pp-pass-head"><span><i class="fa-solid fa-ticket" aria-hidden="true"></i> ProFit Gym Pass</span><span class="pp-status ${s.key}">${esc(s.label)}</span></header>
        <div class="pp-pass-qr"><div id="passQr" class="pp-qr"></div></div>
        <p class="pp-pass-id">${esc(m.id)}</p>
        <p class="pp-muted">Show this code at the front desk to check in.</p>
      </section>
      <section class="pp-card pp-streak-card">
        <div class="pp-card-head"><div><h3>Training streak</h3><p class="pp-muted">Check in on back-to-back days to build your streak.</p></div></div>
        <div class="pp-counters">
          <div class="pp-metric"><strong>${st.current}</strong><span>day streak</span></div>
          <div class="pp-metric"><strong>${st.month}</strong><span>visits this month</span></div>
          <div class="pp-metric"><strong>${st.total}</strong><span>total visits</span></div>
        </div>
        ${heatHTML(m)}
        <div class="pp-legend"><span class="pp-heat-cell"></span> No visit <span class="pp-heat-cell on"></span> Visited</div>
        <button type="button" class="pp-btn pp-btn-primary pp-btn-block" data-checkin ${st.checkedInToday || blocked ? "disabled" : ""}><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${st.checkedInToday ? "Checked in today" : "Check in today"}</button>
      </section>
      <section class="pp-card pp-start">
        <div class="pp-card-head"><div><h3>Get started</h3><p class="pp-muted">${done} of ${items.length} steps done</p></div><span class="pp-pct">${pct}%</span></div>
        <div class="pp-bar"><span style="width:${pct}%"></span></div>
        ${steps}
      </section>
      <section class="pp-card pp-next">${nextClassHTML(m)}</section>
    </div>`;
  }
  function attendanceHTML(m) {
    const st = streaks(m), log = [...checkinsOf(m)].reverse().slice(0, 40);
    return `<div class="pp-card">
        <div class="pp-card-head"><div><h3>Attendance</h3><p class="pp-muted">Your visits over the last 12 weeks.</p></div></div>
        ${heatHTML(m)}
        <div class="pp-legend"><span class="pp-heat-cell"></span> No visit <span class="pp-heat-cell on"></span> Visited</div>
      </div>
      <div class="pp-card" style="margin-top:16px">
        <div class="pp-card-head"><div><h3>Visit history</h3><p class="pp-muted">${st.total} total · ${st.month} this month · longest streak ${st.longest} day${st.longest === 1 ? "" : "s"}</p></div></div>
        ${log.length
          ? `<div class="pp-table-wrap"><table class="pp-table"><thead><tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Where</th></tr></thead><tbody>${log.map(c => `<tr><td>${esc(fmt(c.date))}</td><td>${esc(c.time || "—")}</td><td>ProFit Gym</td></tr>`).join("")}</tbody></table></div>`
          : emptyBlock("fa-calendar-xmark", "No visits yet", "Your check-ins show up here. Use Check in today on the Overview tab.")}
      </div>`;
  }
  function receiptsHTML(m) {
    const pays = DB.payments.filter(p => p.memberId === m.id).sort((a, b) => b.date - a.date);
    const total = pays.reduce((n, p) => n + p.amount, 0);
    return `<div class="pp-card">
      <div class="pp-card-head"><div><h3>Payments and receipts</h3><p class="pp-muted">Total paid <strong>${money(total)}</strong> across ${pays.length} payment${pays.length === 1 ? "" : "s"}.</p></div></div>
      ${pays.length
        ? `<div class="pp-table-wrap"><table class="pp-table"><thead><tr><th scope="col">Receipt</th><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Method</th><th scope="col" class="num">Amount</th><th scope="col"><span class="pp-sr">Receipt</span></th></tr></thead><tbody>
          ${pays.map(p => `<tr><td>${esc(p.ref)}</td><td>${esc(fmt(p.date))}</td><td>${esc(planLabel(p.plan))}</td><td>${esc(p.method)}</td><td class="num">${money(p.amount)}</td><td class="num"><button type="button" class="pp-link" data-receipt="${esc(p.ref)}"><i class="fa-solid fa-receipt" aria-hidden="true"></i> View receipt</button></td></tr>`).join("")}
          </tbody></table></div>`
        : emptyBlock("fa-receipt", "No payments yet", "Payments recorded by the gym appear here with a receipt you can print.")}
    </div>`;
  }
  function scheduleHTML(m) {
    const booked = bookings(m);
    const trainers = TRAINERS.map(t => `<article class="pp-trainer"><span class="pp-avatar sm" aria-hidden="true">${esc(initialsOf(t.name))}</span><div><strong>${esc(t.name)}</strong><small>${esc(t.specialty)}</small><span class="pp-badge-info"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${esc(t.days)}</span></div></article>`).join("");
    const classes = CLASSES.map(c => {
      const on = booked.includes(c.id), coach = TRAINERS.find(t => t.id === c.trainer);
      return `<article class="pp-class${on ? " booked" : ""}">
        <header><span class="pp-class-name">${esc(c.name)}</span><span class="pp-badge-info"><i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(coach?.name || "Coach")}</span></header>
        <p class="pp-muted">${esc(c.blurb)}</p>
        <dl class="pp-class-meta">
          <div><dt>Days</dt><dd>${esc(c.days.join(" · "))}</dd></div>
          <div><dt>Time</dt><dd>${esc(c.time)}</dd></div>
          <div><dt>Length</dt><dd>${c.minutes} minutes</dd></div>
          <div><dt>Level</dt><dd>${esc(c.level)}</dd></div>
        </dl>
        <button type="button" class="pp-btn ${on ? "" : "pp-btn-primary"} pp-btn-block" data-book="${esc(c.id)}" aria-pressed="${on}">${on ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Booked. Tap to cancel' : '<i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> Book this class'}</button>
      </article>`;
    }).join("");
    return `<h3 class="pp-section-title">Trainers</h3><div class="pp-trainers">${trainers}</div>
      <h3 class="pp-section-title">Classes</h3><div class="pp-class-grid">${classes}</div>`;
  }

  function renderQr(m) {
    const el = $("passQr");
    if (!el) return;
    el.innerHTML = "";
    try {
      if (window.QRCode) {
        new QRCode(el, { text: "PROFIT-PASS:" + m.id, width: 164, height: 164, colorDark: "#0b0f14", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
        return;
      }
    } catch { /* fall back to the text version below */ }
    el.innerHTML = '<div class="pp-qr-fallback"><i class="fa-solid fa-qrcode" aria-hidden="true"></i><span>The QR code needs an internet connection. Show your member ID at the front desk.</span></div>';
  }
  function renderHeader(m) {
    const s = membershipState(m);
    $("dashName").textContent = m.name;
    $("dashMeta").textContent = `${planLabel(m.plan)} plan · Member ID ${m.id}`;
    $("dashCountdown").innerHTML = countdownHTML(m);
    const av = $("dashAvatar");
    av.className = "pp-avatar xl" + (m.photoId ? " has-photo" : "");
    av.innerHTML = esc(initialsOf(m.name)) + (m.photoId ? `<img data-photo-id="${esc(m.photoId)}" alt="" hidden>` : "");
    hydrate(av);
    $("statusDisplay").textContent = s.label;
    $("daysDisplay").textContent = daysLeft(m) < 0 ? "0" : String(daysLeft(m));
    $("checkinsDisplay").textContent = String(checkinsOf(m).length);
    $("planDisplay").textContent = planLabel(m.plan);
  }
  function renderTab(name) {
    const m = currentMember();
    if (!m) return;
    if (name === "overview") { $("overviewRoot").innerHTML = overviewHTML(m); renderQr(m); hydrate($("overviewRoot")); }
    if (name === "attendance") $("attendanceRoot").innerHTML = attendanceHTML(m);
    if (name === "payments") $("receiptsRoot").innerHTML = receiptsHTML(m);
    if (name === "schedules") $("scheduleRoot").innerHTML = scheduleHTML(m);
  }
  function renderAll() {
    const m = currentMember();
    if (!m) return;
    renderHeader(m);
    ["overview", "attendance", "payments", "schedules"].forEach(renderTab);
  }

  function checkIn(m) {
    if (membershipState(m).key === "expired" || m.cancelledAt || isFrozen(m)) {
      return toast("Check-in is paused for this membership. Please see the front desk.", true);
    }
    if (streaks(m).checkedInToday) return toast("You are already checked in today.");
    DB.checkins.push({ date: today(), time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), memberId: m.id });
    save();
    toast("Checked in. Enjoy your workout!");
    renderAll();
  }
  function toggleBooking(m, id) {
    const list = bookings(m);
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    if (!setBookings(m, next)) return;
    const c = CLASSES.find(x => x.id === id);
    toast(next.includes(id) ? `${c.name} booked. See you there!` : `${c.name} booking cancelled.`);
    renderAll();
  }
  function openReceipt(m, ref) {
    const p = DB.payments.find(x => x.ref === ref && x.memberId === m.id);
    if (!p) return;
    modal({
      title: "Payment receipt",
      confirmText: "Print receipt",
      cancelText: "Close",
      body: `<article class="pp-receipt" id="receiptPrint">
        <header><strong>ProFit Functional Fitness Gym</strong><span>Official receipt</span></header>
        <dl>
          <dt>Receipt no.</dt><dd>${esc(p.ref)}</dd>
          <dt>Date</dt><dd>${esc(fmt(p.date))}</dd>
          <dt>Member</dt><dd>${esc(m.name)} (${esc(m.id)})</dd>
          <dt>Plan</dt><dd>${esc(planLabel(p.plan))} membership</dd>
          <dt>Method</dt><dd>${esc(p.method)}</dd>
        </dl>
        <div class="pp-receipt-total"><span>Amount paid</span><strong>${money(p.amount)}</strong></div>
        <span class="pp-status active">Paid</span>
      </article>`,
      onConfirm: () => { window.print(); return false; }
    });
  }

  dash.addEventListener("click", e => {
    const m = currentMember();
    if (!m) return;
    const tab = e.target.closest(".member-detail-tab[data-tab]");
    if (tab) { renderTab(tab.dataset.tab); return; }
    const go = e.target.closest("[data-goto]");
    if (go) { document.querySelector(`.member-detail-tab[data-tab="${go.dataset.goto}"]`)?.click(); return; }
    if (e.target.closest("[data-checkin]")) { checkIn(m); return; }
    const book = e.target.closest("[data-book]");
    if (book) { toggleBooking(m, book.dataset.book); return; }
    const receipt = e.target.closest("[data-receipt]");
    if (receipt) { openReceipt(m, receipt.dataset.receipt); return; }
    if (e.target.closest("#dashPhotoBtn")) $("dashPhotoInput").click();
  });
  $("dashPhotoInput").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    const m = currentMember();
    if (!file || !m) return;
    try {
      const blob = await compressImage(file, 800, 0.86);
      const id = await media.save(blob);
      const old = m.photoId;
      m.photoId = id;
      save();
      if (old) await media.remove(old).catch(() => {});
      toast("Profile photo updated.");
      renderAll();
    } catch (err) { toast(err.message || "The photo could not be saved.", true); }
  });

  renderAll();
})();
