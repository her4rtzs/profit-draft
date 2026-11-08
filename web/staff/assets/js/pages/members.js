/* Members: browse, member detail, new enrollment */
PF.ready(() => {
  const { esc, peso, fmtDate } = PF, db = PF.db, $ = PF.$, root = $('#content');
  const canPay = PF.can(['Owner', 'Cashier']);
  root.insertAdjacentHTML('beforeend', `<section class="grid g4" id="stats"></section><div id="tabs"></div><div id="view"></div>`);
  let filter = 'all', q = '', layout = 'table', detailId = null, photoData = '';

  const route = () => {
    const h = location.hash.replace('#', '');
    if (h.startsWith('detail=')) return { tab: 'detail', id: h.slice(7) };
    return { tab: h === 'new' ? 'new' : 'browse' };
  };
  const go = h => { history.replaceState(null, '', location.pathname + (h ? '#' + h : '')); render(); PF.refreshNav(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  function stats() {
    const ms = db.members(), now = new Date(), ms0 = new Date(now.getFullYear(), now.getMonth(), 1);
    const st = { active: 0, expiring: 0, expired: 0 }; ms.forEach(m => { const s = db.statusOf(m); if (st[s] != null) st[s]++; });
    $('#stats').innerHTML = [
      { label: 'Total members', value: ms.length, icon: 'users', tone: 'blue', sub: `${st.active + st.expiring} currently covered`, spark: [4, 5, 7, 8, 9, 11, ms.length], sparkColor: PF.COLORS.blue },
      ...(canPay ? [{ label: 'Collected this month', value: peso(db.sumPayments(ms0, now)), icon: 'wallet', tone: 'green', sub: 'completed payments', spark: db.revenueByMonth(now.getFullYear()).slice(-6), sparkColor: PF.COLORS.teal }] : []),
      { label: 'Expiring soon', value: st.expiring, icon: 'clock', tone: 'amber', sub: 'within 7 days' },
      { label: 'Active members', value: st.active, icon: 'user-check', tone: 'gold', sub: 'plan in good standing' }
    ].map(PF.statTile).join('');
  }

  function tabs(active) {
    $('#tabs').innerHTML = `<nav class="tabbar" aria-label="Members sections">
      <button class="tab ${active === 'browse' ? 'active' : ''}" data-go="">${PF.icon('users')}<span>Browse members</span><span class="count">${db.members().length}</span></button>
      <button class="tab ${active === 'detail' ? 'active' : ''}" data-go="${detailId ? 'detail=' + detailId : ''}" ${detailId ? '' : 'disabled style="opacity:.55"'}>${PF.icon('user')}<span>Member detail</span></button>
      ${PF.can(['Owner', 'Cashier']) ? `<button class="tab ${active === 'new' ? 'active' : ''}" data-go="new">${PF.icon('user-plus')}<span>New enrollment</span></button>` : ''}</nav>`;
    PF.$$('#tabs .tab').forEach(b => b.onclick = () => { if (!b.disabled) go(b.dataset.go); });
  }

  /* ---------- browse ---------- */
  function browse() {
    $('#view').innerHTML = `<div class="notice">${PF.icon('info')}<span>Click a row to open the member's profile. Use the actions button to renew, freeze or cancel.</span></div>
      <div class="card" style="margin-top:18px"><div class="toolbar"><label class="search search-box" style="max-width:none;min-width:0">${PF.icon('search')}<input id="q" type="search" placeholder="Search by name, ID, email or phone" value="${esc(q)}" aria-label="Search members"></label>
        <div class="chips" id="chips">${[['all', 'All'], ['active', 'Active'], ['expiring', 'Expiring soon'], ['expired', 'Expired']].map(c => `<button class="chip ${filter === c[0] ? 'active' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}</div>
        <div class="seg" style="margin-left:auto"><button data-l="table" class="${layout === 'table' ? 'active' : ''}">${PF.icon('list')}Table</button><button data-l="cards" class="${layout === 'cards' ? 'active' : ''}">${PF.icon('grid')}Cards</button></div></div>
        <div class="card-pad" style="padding-top:0"><div class="muted" id="count" style="margin-bottom:6px"></div><div id="list"></div></div></div>`;
    $('#q').oninput = PF.debounce(e => { q = e.target.value; list(); }, 120);
    PF.$$('#chips .chip').forEach(b => b.onclick = () => { filter = b.dataset.f; PF.$$('#chips .chip').forEach(x => x.classList.toggle('active', x === b)); list(); });
    PF.$$('.seg [data-l]').forEach(b => b.onclick = () => { layout = b.dataset.l; PF.$$('.seg [data-l]').forEach(x => x.classList.toggle('active', x === b)); list(); });
    list();
  }
  const matches = m => {
    const s = db.statusOf(m);
    if (filter !== 'all' && s !== filter) return false;
    const t = q.trim().toLowerCase();
    return !t || (m.name + ' ' + m.id + ' ' + m.email + ' ' + m.phone).toLowerCase().includes(t);
  };
  const dleft = m => { const d = db.daysLeft(m); return d < 0 ? `Expired ${-d} day${d === -1 ? '' : 's'} ago` : `${d} day${d === 1 ? '' : 's'} left`; };
  function list() {
    const rows = db.members().filter(matches);
    $('#count').textContent = `Showing ${rows.length} of ${db.members().length} members`;
    if (!rows.length) { $('#list').innerHTML = `<div class="empty">${PF.icon('search')}<h3>No members found</h3><span>Try a different search or filter.</span></div>`; return; }
    if (layout === 'cards') {
      $('#list').innerHTML = `<div class="cards-grid">${rows.map(m => `<article class="mcard" data-id="${m.id}"><div class="cell-user">${PF.avatar(m.name, 'md', m.photo)}<div style="min-width:0"><div class="nm">${esc(m.name)}</div><small>${m.id} · ${esc(m.email)}</small></div><button class="row-menu" style="margin-left:auto" data-menu="${m.id}" aria-label="Actions for ${esc(m.name)}">${PF.icon('more-v')}</button></div><div style="display:flex;justify-content:space-between;align-items:center">${PF.planTag(m.plan)}${PF.pill(db.statusOf(m))}</div><div class="muted">Ends ${fmtDate(m.end)} · ${dleft(m)}</div></article>`).join('')}</div>`;
      PF.$$('.mcard').forEach(c => c.onclick = e => { if (!e.target.closest('[data-menu]')) go('detail=' + c.dataset.id); });
    } else {
      $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Ends</th><th style="width:60px"></th></tr></thead><tbody>${rows.map(m => `<tr class="click" data-id="${m.id}"><td class="cell-first"><div class="cell-user">${PF.avatar(m.name, '', m.photo)}<div><div class="nm">${esc(m.name)}</div><small>${m.id} · ${esc(m.email)}</small></div></div></td><td data-label="Plan">${PF.planTag(m.plan)}</td><td data-label="Status">${PF.pill(db.statusOf(m))}</td><td data-label="Ends"><div><b>${fmtDate(m.end)}</b><div class="muted">${dleft(m)}</div></div></td><td class="cell-act"><button class="row-menu" data-menu="${m.id}" aria-label="Actions for ${esc(m.name)}">${PF.icon('more-v')}</button></td></tr>`).join('')}</tbody></table></div>`;
      PF.$$('#list tr.click').forEach(r => r.onclick = e => { if (!e.target.closest('[data-menu]')) go('detail=' + r.dataset.id); });
    }
    PF.$$('#list [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); memberMenu(b, b.dataset.menu); });
  }

  function memberMenu(anchor, id) {
    const m = db.member(id), s = db.statusOf(m);
    PF.menu(anchor, [
      { label: 'View profile', icon: 'eye', onClick: () => go('detail=' + id) },
      ...(canPay ? [{ label: 'Renew membership', icon: 'refresh', onClick: () => renewModal(id) }] : []),
      ...(PF.can(['Owner', 'Cashier']) ? ['hr', s === 'frozen' || s === 'cancelled'
        ? { label: 'Reactivate', icon: 'undo', onClick: () => { db.setHold(id, null); PF.toast(m.name + ' reactivated'); } }
        : { label: 'Freeze', icon: 'snowflake', onClick: async () => { if (await PF.confirm({ title: 'Freeze membership?', message: `${m.name} will not be able to check in until you reactivate.`, confirm: 'Freeze' })) { db.setHold(id, 'frozen'); PF.toast('Membership frozen'); } } },
        ...(s !== 'cancelled' ? [{ label: 'Cancel membership', icon: 'ban', danger: true, onClick: async () => { if (await PF.confirm({ title: 'Cancel membership?', message: `${m.name}'s membership will be cancelled. Their records are kept.`, confirm: 'Cancel membership', danger: true })) { db.setHold(id, 'cancelled'); PF.toast('Membership cancelled'); } } }] : [])] : [])
    ]);
  }

  function renewModal(id) {
    const m = db.member(id);
    const plans = db.plans().filter(p => p.active);
    PF.modal({
      title: 'Renew membership', html: `<p class="muted" style="margin-bottom:14px">${esc(m.name)} · currently ${esc(PF.statusLabel(db.statusOf(m)).toLowerCase())}, ends ${fmtDate(m.end)}</p>
      <div class="form-grid"><div class="field"><label>Plan</label><select class="select" id="rPlan">${PF.opts(plans.map(p => ({ value: p.id, label: `${p.name} · ${peso(p.price)}` })), m.plan)}</select></div>
      <div class="field"><label>Payment method</label><select class="select" id="rMethod">${PF.opts(db.methods().filter(x => x.source === 'desk').map(x => x.id), 'Cash')}</select></div>
      <div class="field full"><label>Amount</label><div class="input-ico"><span class="pre">₱</span><input class="input" id="rAmt" type="number" min="0" step="0.01"></div><span class="hint" id="rHint"></span></div></div>`,
      onOpen: el => { const upd = () => { const p = db.planOf($('#rPlan', el).value); $('#rAmt', el).value = p.price; const base = new Date(m.end) > new Date() ? new Date(m.end) : new Date(); $('#rHint', el).textContent = `New expiry: ${fmtDate(PF.addDays(base, p.days))}`; }; $('#rPlan', el).onchange = upd; upd(); },
      foot: [{ label: 'Cancel' }, { label: 'Record renewal', cls: 'btn-gold', icon: 'check', onClick: (close, el) => { db.recordPayment({ memberId: id, plan: $('#rPlan', el).value, method: $('#rMethod', el).value, amount: $('#rAmt', el).value, note: 'Renewal' }); PF.toast('Renewed — payment recorded'); } }]
    });
  }

  /* ---------- detail ---------- */
  function detail(id) {
    const m = db.member(id);
    if (!m) { $('#view').innerHTML = `<div class="card"><div class="empty">${PF.icon('user-x')}<h3>Member not found</h3><button class="btn btn-gold" data-go-b>Back to members</button></div></div>`; $('[data-go-b]').onclick = () => go(''); return; }
    detailId = id; tabs('detail');
    const s = db.statusOf(m), t = m.trainerId && db.trainer(m.trainerId), left = db.daysLeft(m);
    const total = Math.max(1, db.planOf(m.plan).days), used = Math.min(100, Math.max(0, Math.round((1 - left / total) * 100)));
    const pays = canPay ? db.memberPayments(id).slice(0, 5) : [], att = db.memberAttendance(id);
    $('#view').innerHTML = `<div class="grid g-side">
      <div class="grid" style="align-content:start">
        <article class="card card-pad"><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">${PF.avatar(m.name, 'lg', m.photo)}<div style="flex:1;min-width:200px"><h2 style="font-size:22px;font-weight:800">${esc(m.name)}</h2><div class="muted">${m.id} · Member since ${fmtDate(m.joined)}</div><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${PF.pill(s)}${PF.planTag(m.plan)}</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${canPay ? `<button class="btn btn-gold" id="dRenew">${PF.icon('refresh')}Renew</button>` : ''}<button class="btn" id="dMenu" aria-label="More actions">${PF.icon('more-h')}</button></div></div>
          <div style="margin-top:20px"><div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:8px"><span>${fmtDate(m.start)}</span><span>${left < 0 ? 'Expired' : left + ' days left'}</span><span>${fmtDate(m.end)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${used}%"></div></div></div></article>
        <article class="card card-pad"><div class="card-head"><h3>Recent attendance</h3></div>${att.length ? `<div class="activity">${att.map(a => `<div class="act"><span class="ai tone-green">${PF.icon('calendar-check')}</span><span><b>${fmtDate(a.at)}</b><small>${PF.fmtTime(a.at)} · ${PF.statusLabel(a.status)}</small></span></div>`).join('')}</div>` : '<div class="empty compact"><span>No visits in the last 30 days</span></div>'}</article>
        ${canPay ? `<article class="card card-pad"><div class="card-head"><h3>Payments</h3><div class="right"><a class="btn btn-sm" href="transactions.html?q=${encodeURIComponent(m.name)}">View all</a></div></div>${pays.length ? `<div class="tbl-wrap"><table class="tbl flat"><tbody>${pays.map(p => `<tr><td class="cell-first"><b>${p.id}</b><div class="muted">${PF.fmtDateTime(p.at)}</div></td><td data-label="Plan">${PF.planTag(p.plan)}</td><td data-label="Method">${esc(p.method)}</td><td class="num" data-label="Amount">${peso(p.amount)}</td><td data-label="Status">${PF.pill(p.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty compact"><span>No payments yet</span></div>'}</article>` : ''}
      </div>
      <div class="grid" style="align-content:start">
        <article class="card card-pad"><div class="card-head"><h3>Contact</h3><div class="right"><button class="btn btn-sm" id="dEdit">${PF.icon('pencil')}Edit</button></div></div><div class="kv"><div><span>Email</span><b>${esc(m.email)}</b></div><div><span>Phone</span><b>${esc(m.phone)}</b></div><div><span>Gender</span><b>${esc(m.gender || '—')}</b></div><div><span>Birthdate</span><b>${m.birthdate ? esc(m.birthdate) : '—'}</b></div><div><span>Emergency</span><b>${esc(m.emergency || '—')}</b></div></div></article>
        <article class="card card-pad"><div class="card-head"><h3>Trainer</h3></div>${t ? `<div class="cell-user">${PF.avatar(t.name, 'md')}<div><div class="nm">${esc(t.name)}</div><small>${esc(t.tags.join(' · '))}</small></div></div>` : '<p class="muted">No trainer assigned.</p>'}<a class="btn btn-block" style="margin-top:14px" href="trainers.html">${PF.icon('dumbbell')}${t ? 'Change trainer' : 'Assign a trainer'}</a></article>
        ${m.notes ? `<article class="card card-pad"><div class="card-head"><h3>Notes</h3></div><p style="color:var(--text-2)">${esc(m.notes)}</p></article>` : ''}</div></div>`;
    const dr = $('#dRenew'); if (dr) dr.onclick = () => renewModal(id);
    $('#dMenu').onclick = e => memberMenu(e.currentTarget, id);
    $('#dEdit').onclick = () => editModal(id);
  }
  function editModal(id) {
    const m = db.member(id);
    PF.modal({ title: 'Edit contact details', html: `<div class="form-grid"><div class="field full"><label>Full name</label><input class="input" id="eName" value="${esc(m.name)}"></div><div class="field"><label>Email</label><input class="input" id="eEmail" type="email" value="${esc(m.email)}"></div><div class="field"><label>Phone</label><input class="input" id="ePhone" value="${esc(m.phone)}"></div><div class="field full"><label>Emergency contact</label><input class="input" id="eEm" value="${esc(m.emergency)}"></div><div class="field full"><label>Notes</label><textarea class="textarea" id="eNotes">${esc(m.notes)}</textarea></div></div>`,
      foot: [{ label: 'Cancel' }, { label: 'Save changes', cls: 'btn-gold', onClick: (c, el) => { const n = $('#eName', el).value.trim(); if (!n) { $('#eName', el).classList.add('is-invalid'); return false; } db.updateMember(id, { name: n, email: $('#eEmail', el).value.trim(), phone: $('#ePhone', el).value.trim(), emergency: $('#eEm', el).value.trim(), notes: $('#eNotes', el).value.trim() }); PF.toast('Member updated'); } }] });
  }

  /* ---------- new enrollment ---------- */
  function enroll() {
    photoData = '';
    const plans = db.plans().filter(p => p.active), today = PF.dayKey(new Date());
    $('#view').innerHTML = `<form class="card card-pad" id="enForm" novalidate><div class="card-head"><div><h2>New enrollment</h2><p>Enroll a walk-in or cash-paying member.</p></div></div>
      <div class="form-grid">
        <div class="field full" style="grid-template-columns:auto 1fr;align-items:center;gap:16px"><span id="phPrev">${PF.avatar('New Member', 'lg')}</span><div><label class="btn btn-sm" for="phFile" style="cursor:pointer">${PF.icon('camera')}Upload photo</label><input type="file" id="phFile" accept="image/jpeg,image/png,image/webp" class="sr"><div class="hint" style="margin-top:6px">JPEG, PNG or WebP · 2 MB max (optional)</div></div></div>
        <div class="field"><label>Full name <span class="req">*</span></label><input class="input" id="fName" autocomplete="off"><span class="err" hidden></span></div>
        <div class="field"><label>Email <span class="req">*</span></label><input class="input" id="fEmail" type="email" autocomplete="off"><span class="err" hidden></span></div>
        <div class="field"><label>Phone <span class="req">*</span></label><input class="input" id="fPhone" inputmode="tel" placeholder="09xx xxx xxxx"><span class="err" hidden></span></div>
        <div class="field"><label>Birthdate</label><input class="input" id="fBirth" type="date" max="${today}"></div>
        <div class="field"><label>Gender</label><select class="select" id="fGender">${PF.opts(['Female', 'Male', 'Prefer not to say'], '', 'Select')}</select></div>
        <div class="field"><label>Emergency contact</label><input class="input" id="fEm" placeholder="Name · phone"></div>
        <div class="field"><label>Plan <span class="req">*</span></label><select class="select" id="fPlan">${PF.opts(plans.map(p => ({ value: p.id, label: `${p.name} · ${peso(p.price)}` })), 'monthly')}</select></div>
        <div class="field"><label>Start date</label><input class="input" id="fStart" type="date" value="${today}"><span class="hint" id="fEnd"></span></div>
        <div class="field"><label>Trainer</label><select class="select" id="fTrainer">${PF.opts(db.trainers().filter(t => t.status === 'active').map(t => ({ value: t.id, label: t.name })), '', 'No trainer yet')}</select></div>
        ${canPay ? `<div class="field"><label>Payment method</label><select class="select" id="fMethod">${PF.opts(db.methods().filter(x => x.source === 'desk').map(x => x.id), 'Cash', 'Don\'t record a payment')}</select></div>` : ''}
        <div class="field full"><label>Notes</label><textarea class="textarea" id="fNotes" placeholder="Injuries, goals, anything the coaches should know"></textarea></div></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap"><button type="button" class="btn" id="fCancel">Cancel</button><button class="btn btn-gold" type="submit">${PF.icon('user-plus')}Enroll member</button></div></form>`;
    const end = () => { const p = db.planOf($('#fPlan').value), s = $('#fStart').value ? new Date($('#fStart').value + 'T00:00') : new Date(); $('#fEnd').textContent = 'Expires ' + fmtDate(PF.addDays(s, p.days)); };
    $('#fPlan').onchange = end; $('#fStart').onchange = end; end();
    $('#fCancel').onclick = () => go('');
    $('#phFile').onchange = async e => { try { photoData = await PF.readImage(e.target.files[0]); $('#phPrev').innerHTML = `<span class="avatar lg"><img src="${photoData}" alt=""></span>`; } catch (err) { PF.toast(err.message, 'err'); e.target.value = ''; } };
    const bad = (el, msg) => { el.classList.add('is-invalid'); const er = el.parentElement.querySelector('.err'); if (er) { er.textContent = msg; er.hidden = false; } return false; };
    $('#enForm').addEventListener('input', e => { e.target.classList.remove('is-invalid'); const er = e.target.parentElement.querySelector('.err'); if (er) er.hidden = true; });
    $('#enForm').onsubmit = e => {
      e.preventDefault();
      const n = $('#fName'), em = $('#fEmail'), ph = $('#fPhone'); let ok = true;
      if (n.value.trim().length < 2) ok = bad(n, 'Enter the member\'s full name.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value.trim())) ok = bad(em, 'Enter a valid email address.');
      else if (db.members().some(m => m.email.toLowerCase() === em.value.trim().toLowerCase())) ok = bad(em, 'A member with this email already exists.');
      if (ph.value.replace(/\D/g, '').length < 10) ok = bad(ph, 'Enter a phone number with at least 10 digits.');
      if (!ok) { PF.toast('Please fix the highlighted fields.', 'err'); return; }
      const r = db.addMember({ name: n.value, email: em.value, phone: ph.value, birthdate: $('#fBirth').value, gender: $('#fGender').value, emergency: $('#fEm').value, plan: $('#fPlan').value, start: $('#fStart').value, trainerId: $('#fTrainer').value, method: canPay ? $('#fMethod').value : '', notes: $('#fNotes').value, photo: photoData });
      PF.toast(r.member.name + ' enrolled'); go('detail=' + r.member.id);
    };
  }

  function render() {
    stats(); const r = route();
    if (r.tab === 'detail') { detailId = r.id; tabs('detail'); detail(r.id); return; }
    tabs(r.tab);
    if (r.tab === 'new' && PF.can(['Owner', 'Cashier'])) enroll(); else browse();
  }
  window.addEventListener('hashchange', render);
  document.addEventListener('pf:data', () => { if (!document.querySelector('.modal-back') && route().tab !== 'new') render(); });
  render();
});
