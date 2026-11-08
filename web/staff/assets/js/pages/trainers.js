/* Trainers */
PF.ready(() => {
  const { esc, fmtShort } = PF, db = PF.db, $ = PF.$, root = $('#content');
  let filter = 'all', q = '', spec = '', reqTab = 'pending';
  root.insertAdjacentHTML('beforeend', `<section class="grid g4" id="stats"></section>
    <div class="card"><div class="toolbar"><div class="chips" id="chips">${[['all', 'All trainers'], ['active', 'Active'], ['leave', 'On leave'], ['inactive', 'Inactive']].map(c => `<button class="chip ${c[0] === 'all' ? 'active' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}</div><span class="grow"></span>
      <label class="search search-box" style="max-width:240px;min-width:0;flex:0 1 240px">${PF.icon('search')}<input id="q" type="search" placeholder="Search trainers…" aria-label="Search trainers"></label><select class="select" id="spec" aria-label="Specialization"></select><button class="btn btn-gold" id="add">${PF.icon('plus')}Add trainer</button></div></div>
    <article class="card card-pad"><div class="card-head"><div><h2 id="tTitle">Trainers</h2><p>Browse and manage all trainers in your gym.</p></div></div><div class="cards-grid" id="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))"></div></article>
    <section class="grid g2 keep1"><article class="card card-pad" id="assign"></article><article class="card card-pad" id="reqs"></article></section>`);

  const stars = t => `<span class="stars">${PF.icon('star')}${t.rating ? t.rating.toFixed(1) : '—'} <span class="muted">(${t.reviews} reviews)</span></span>`;
  function stats() {
    const ts = db.trainers(), act = ts.filter(t => t.status === 'active').length, pend = db.requests().filter(r => r.status === 'pending').length, rated = ts.filter(t => t.reviews), rv = rated.reduce((s, t) => s + t.reviews, 0), avg = rv ? rated.reduce((s, t) => s + t.rating * t.reviews, 0) / rv : 0;
    $('#stats').innerHTML = [
      { label: 'Total trainers', value: ts.length, icon: 'users', tone: 'gold', sub: 'on your team' },
      { label: 'Active trainers', value: act, icon: 'user-check', tone: 'green', sub: Math.round(act / Math.max(1, ts.length) * 100) + '% of total' },
      { label: 'Pending requests', value: pend, icon: 'clipboard', tone: 'purple', sub: 'awaiting approval' },
      { label: 'Average rating', value: avg.toFixed(1), icon: 'star', tone: 'blue', sub: `from ${rv} reviews` }].map(PF.statTile).join('');
    const tags = [...new Set(ts.flatMap(t => t.tags))].sort();
    $('#spec').innerHTML = PF.opts(tags, spec, 'All specializations');
  }
  function grid() {
    const rows = db.trainers().filter(t => (filter === 'all' || t.status === filter) && (!spec || t.tags.includes(spec)) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
    $('#tTitle').textContent = `Trainers (${rows.length})`;
    $('#grid').innerHTML = rows.length ? rows.map(t => { const load = db.trainerLoad(t.id); return `<article class="tcard"><div class="top">${PF.avatar(t.name, 'lg')}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:15px">${esc(t.name)}</b>${PF.pill(t.status)}</div><div class="muted">${esc(t.role)}</div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${t.tags.map((g, i) => `<span class="tag ${i % 2 ? 'b' : ''}">${esc(g)}</span>`).join('')}</div></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">${stars(t)}<span class="muted">${PF.icon('users')} ${load} / ${t.cap} members</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, load / t.cap * 100)}%"></div></div>
      <div class="actions"><button class="btn btn-sm" data-view="${t.id}">View profile</button><button class="btn btn-sm btn-gold" data-assign="${t.id}" ${t.status !== 'active' ? 'disabled' : ''}>Assign</button><button class="row-menu" data-menu="${t.id}" aria-label="More for ${esc(t.name)}">${PF.icon('more-h')}</button></div></article>`; }).join('') : `<div class="empty" style="grid-column:1/-1">${PF.icon('users')}<h3>No trainers match</h3><span>Adjust the filters above.</span></div>`;
    PF.$$('[data-view]').forEach(b => b.onclick = () => profile(b.dataset.view));
    PF.$$('[data-assign]').forEach(b => b.onclick = () => { $('#aTrainer').value = b.dataset.assign; $('#assign').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#aMember').focus(); });
    PF.$$('[data-menu]').forEach(b => b.onclick = () => { const t = db.trainer(b.dataset.menu); PF.menu(b, [{ label: 'View profile', icon: 'eye', onClick: () => profile(t.id) }, 'hr', ...['active', 'leave', 'inactive'].filter(s => s !== t.status).map(s => ({ label: 'Mark ' + PF.statusLabel(s).toLowerCase(), icon: s === 'active' ? 'check-circle' : s === 'leave' ? 'clock' : 'ban', onClick: () => { db.setTrainerStatus(t.id, s); PF.toast(t.name + ' is now ' + PF.statusLabel(s).toLowerCase()); } }))]); });
  }
  function profile(id) {
    const t = db.trainer(id), ms = db.members().filter(m => m.trainerId === id);
    PF.modal({ title: t.name, html: `<div class="cell-user" style="margin-bottom:14px">${PF.avatar(t.name, 'lg')}<div><div>${PF.pill(t.status)}</div>${stars(t)}<div class="muted" style="margin-top:4px">${esc(t.tags.join(' · '))}</div></div></div><div class="kv"><div><span>Email</span><b>${esc(t.email || '—')}</b></div><div><span>Phone</span><b>${esc(t.phone || '—')}</b></div><div><span>Capacity</span><b>${ms.length} / ${t.cap} members</b></div></div><h4 style="margin:16px 0 8px">Assigned members</h4>${ms.length ? `<div class="activity">${ms.map(m => `<a class="act" href="members.html#detail=${m.id}">${PF.avatar(m.name, 'sm')}<span><b>${esc(m.name)}</b><small>${m.id}</small></span></a>`).join('')}</div>` : '<p class="muted">No members assigned yet.</p>'}`, foot: [{ label: 'Close' }] });
  }
  function assign() {
    const ms = db.members().filter(m => db.statusOf(m) !== 'cancelled'), ts = db.trainers().filter(t => t.status === 'active');
    $('#assign').innerHTML = `<div class="card-head"><div><h2>Assign a trainer</h2><p>Quickly assign a trainer to a member or update an existing assignment.</p></div></div>
      <div class="form-grid"><div class="field"><label>Member</label><select class="select" id="aMember">${PF.opts(ms.map(m => ({ value: m.id, label: `${m.name} · ${m.id}` })), '', 'Select member')}</select></div>
      <div class="field"><label>Trainer</label><select class="select" id="aTrainer">${PF.opts(ts.map(t => ({ value: t.id, label: `${t.name} (${db.trainerLoad(t.id)}/${t.cap})` })), '', 'Select trainer')}</select></div>
      <div class="field full"><label>Current assignment</label><div id="aCur" class="muted" style="min-height:24px">Select a member to see their current trainer.</div></div></div>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-gold" id="aGo">Assign trainer</button><button class="btn" id="aClr">Clear</button></div>`;
    $('#aMember').onchange = () => { const m = db.member($('#aMember').value), t = m && m.trainerId && db.trainer(m.trainerId); $('#aCur').innerHTML = !m ? 'Select a member to see their current trainer.' : t ? `<span class="cell-user">${PF.avatar(t.name, 'sm')}<b>${esc(t.name)}</b> <small>${esc(t.tags.join(' · '))}</small></span>` : 'No trainer assigned yet.'; };
    $('#aClr').onclick = () => { $('#aMember').value = ''; $('#aTrainer').value = ''; $('#aMember').onchange(); };
    $('#aGo').onclick = () => {
      const mid = $('#aMember').value, tid = $('#aTrainer').value;
      if (!mid || !tid) { PF.toast('Pick both a member and a trainer.', 'err'); return; }
      const t = db.trainer(tid); if (db.trainerLoad(tid) >= t.cap && db.member(mid).trainerId !== tid) { PF.toast(t.name + ' is at full capacity.', 'err'); return; }
      db.assignTrainer(mid, tid); PF.toast(`${t.name} assigned to ${db.member(mid).name}`);
    };
  }
  function reqs() {
    const all = db.requests(), by = s => all.filter(r => r.status === s), cur = by(reqTab);
    $('#reqs').innerHTML = `<div class="card-head"><div><h2>Member requests</h2><p>Review and manage trainer requests from members.</p></div></div>
      <div class="seg" id="rTabs" style="margin-bottom:12px">${['pending', 'approved', 'declined'].map(s => `<button data-t="${s}" class="${s === reqTab ? 'active' : ''}">${PF.statusLabel(s)} (${by(s).length})</button>`).join('')}</div>
      ${cur.length ? `<div class="activity">${cur.map(r => { const m = db.member(r.memberId); return `<div class="act" style="flex-wrap:wrap">${PF.avatar(m.name, '')}<span style="flex:1;min-width:130px"><b>${esc(m.name)}</b><small>${esc(r.spec)} · ${fmtShort(r.at)}</small></span>${r.status === 'pending' ? `<button class="btn btn-sm btn-ok" data-ok="${r.id}">${PF.icon('check')}Approve</button><button class="btn btn-sm btn-danger" data-no="${r.id}">${PF.icon('x')}Decline</button>` : ''}</div>`; }).join('')}</div>` : `<div class="empty compact"><span>No ${reqTab} requests.</span></div>`}`;
    PF.$$('#rTabs button').forEach(b => b.onclick = () => { reqTab = b.dataset.t; reqs(); });
    PF.$$('[data-ok]').forEach(b => b.onclick = () => { db.resolveRequest(b.dataset.ok, 'approved'); PF.toast('Request approved'); });
    PF.$$('[data-no]').forEach(b => b.onclick = () => { db.resolveRequest(b.dataset.no, 'declined'); PF.toast('Request declined'); });
  }
  $('#add').onclick = () => PF.modal({ title: 'Add trainer', html: `<div class="form-grid"><div class="field full"><label>Full name <span class="req">*</span></label><input class="input" id="tn"></div><div class="field"><label>Email</label><input class="input" id="te" type="email"></div><div class="field"><label>Phone</label><input class="input" id="tp"></div><div class="field"><label>Specializations</label><input class="input" id="tt" placeholder="Strength, HIIT"><span class="hint">Separate with commas</span></div><div class="field"><label>Member capacity</label><input class="input" id="tc" type="number" min="1" value="12"></div></div>`,
    foot: [{ label: 'Cancel' }, { label: 'Add trainer', cls: 'btn-gold', onClick: (c, el) => { const n = $('#tn', el).value.trim(); if (n.length < 2) { $('#tn', el).classList.add('is-invalid'); return false; } db.addTrainer({ name: n, email: $('#te', el).value.trim(), phone: $('#tp', el).value.trim(), tags: $('#tt', el).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3), cap: Math.max(1, +$('#tc', el).value || 12) }); PF.toast(n + ' added'); } }] });
  PF.$$('#chips .chip').forEach(b => b.onclick = () => { filter = b.dataset.f; PF.$$('#chips .chip').forEach(x => x.classList.toggle('active', x === b)); grid(); });
  $('#q').oninput = PF.debounce(e => { q = e.target.value; grid(); }, 120);
  $('#spec').onchange = e => { spec = e.target.value; grid(); };
  const all = () => { stats(); grid(); assign(); reqs(); };
  document.addEventListener('pf:data', () => { if (!document.querySelector('.modal-back')) { const m = $('#aMember') && $('#aMember').value, t = $('#aTrainer') && $('#aTrainer').value; all(); if (m) { $('#aMember').value = m; $('#aMember').onchange(); } if (t) $('#aTrainer').value = t; } });
  all();
});
