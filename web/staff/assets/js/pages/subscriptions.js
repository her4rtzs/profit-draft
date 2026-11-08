/* Subscription Monitor (+ Overview tab) */
PF.ready(() => {
  const { esc, peso, fmtDate } = PF, db = PF.db, $ = PF.$, root = $('#content');
  const SIZE = 6; let view = 'monitor', q = '', plan = '', status = '', range = 'all', page = 1, sel = new Set();
  const hdr = PF.pageTabs([{ id: 'daily', label: 'Daily payment', icon: 'credit-card', href: 'payments.html' }, { id: 'subs', label: 'Subscription monitor', icon: 'refresh', href: 'subscriptions.html' }, ...(PF.can(['Owner']) ? [{ id: 'hist', label: 'Payment history', icon: 'clock', href: 'transactions.html' }] : [])], 'subs');
  root.insertAdjacentHTML('beforeend', `${hdr}<div class="seg" id="views" style="width:fit-content"><button data-v="monitor" class="active">${PF.icon('list')}Monitor</button><button data-v="overview">${PF.icon('chart')}Overview</button></div><section class="grid g5" id="stats"></section><div id="body"></div>`);

  const subStatus = m => { const s = db.statusOf(m); return s === 'expired' ? 'overdue' : s; };
  const planPrice = m => db.planOf(m.plan).price;
  const lastMethod = m => { const p = db.memberPayments(m.id).find(x => x.status === 'completed'); return p ? p.method : '—'; };
  function stats() {
    const ms = db.members(), by = { active: 0, expiring: 0, overdue: 0 }; ms.forEach(m => { const s = subStatus(m); if (by[s] != null) by[s]++; });
    const now = new Date(), rev = db.sumPayments(new Date(now.getFullYear(), now.getMonth(), 1), now);
    $('#stats').innerHTML = [
      { label: 'Total members', value: ms.length, icon: 'users', tone: 'gold', sub: 'all plans' },
      { label: 'Active subscriptions', value: by.active + by.expiring, icon: 'refresh', tone: 'green', sub: `${Math.round((by.active + by.expiring) / Math.max(1, ms.length) * 100)}% of members` },
      { label: 'Expiring in 7 days', value: by.expiring, icon: 'clock', tone: 'purple', sub: 'renew soon' },
      { label: 'Overdue', value: by.overdue, icon: 'alert-circle', tone: 'red', sub: 'expired, not renewed' },
      ...(PF.can(['Owner']) ? [{ label: 'Revenue this month', value: peso(rev), icon: 'wallet', tone: 'blue', sub: 'completed payments' }] : [{ label: 'Monthly plans', value: ms.filter(m => m.plan === 'monthly').length, icon: 'tag', tone: 'blue', sub: 'members' }])].map(PF.statTile).join('');
  }
  const inRange = m => { if (range === 'all') return true; const e = new Date(m.end), now = new Date(); const n = range === '7' ? 7 : range === '30' ? 30 : 90; return e >= PF.startOfDay(now) && e <= PF.addDays(now, n); };
  const filtered = () => db.members().filter(m => (!plan || m.plan === plan) && (!status || subStatus(m) === status) && inRange(m) && (!q || (m.name + m.id).toLowerCase().includes(q.toLowerCase())));

  function monitor() {
    $('#body').innerHTML = `<article class="card card-pad"><div class="toolbar" style="padding:0 0 14px"><label class="search search-box" style="max-width:none;min-width:0">${PF.icon('search')}<input id="q" type="search" placeholder="Search by member name or ID…" value="${esc(q)}" aria-label="Search"></label>
      <select class="select" id="plan" aria-label="Plan">${PF.opts(db.plans().map(p => ({ value: p.id, label: p.name + ' plan' })), plan, 'All plans')}</select>
      <select class="select" id="status" aria-label="Status">${PF.opts([{ value: 'active', label: 'Active' }, { value: 'expiring', label: 'Expiring soon' }, { value: 'overdue', label: 'Overdue' }, { value: 'frozen', label: 'Frozen' }, { value: 'cancelled', label: 'Cancelled' }], status, 'All status')}</select>
      <select class="select" id="range" aria-label="Expires within">${PF.opts([{ value: 'all', label: 'Any expiry date' }, { value: '7', label: 'Expires in 7 days' }, { value: '30', label: 'Expires in 30 days' }, { value: '90', label: 'Expires in 90 days' }], range)}</select>
      <button class="btn btn-gold" id="exp">${PF.icon('download')}Export</button></div>
      <div class="card-head"><div><h2>Subscription monitor</h2><p>List of all members with their subscription details and status.</p></div><div class="right muted" id="cnt"></div></div>
      <div id="bulk" class="notice" hidden style="margin-bottom:10px"></div><div id="list"></div><div class="pager" id="pager"></div></article>`;
    $('#q').oninput = PF.debounce(e => { q = e.target.value; page = 1; list(); }, 120);
    [['plan', v => plan = v], ['status', v => status = v], ['range', v => range = v]].forEach(([id, set]) => $('#' + id).onchange = e => { set(e.target.value); page = 1; list(); });
    $('#exp').onclick = () => { const r = filtered(); PF.csv('subscriptions.csv', [['Member ID', 'Name', 'Plan', 'Price', 'Last method', 'Start', 'Expires', 'Status'], ...r.map(m => [m.id, m.name, db.planOf(m.plan).name, planPrice(m), lastMethod(m), fmtDate(m.start), fmtDate(m.end), PF.statusLabel(subStatus(m))])]); PF.toast('Exported ' + r.length + ' rows'); };
    list();
  }
  function list() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / SIZE)); if (page > pages) page = pages;
    const slice = rows.slice((page - 1) * SIZE, page * SIZE);
    $('#cnt').textContent = `${rows.length} of ${db.members().length} members`;
    const bulk = $('#bulk');
    if (sel.size) { bulk.hidden = false; bulk.innerHTML = `${PF.icon('check-circle')}<span><b>${sel.size}</b> selected</span><span style="margin-left:auto;display:flex;gap:8px"><button class="btn btn-sm" id="bExp">${PF.icon('download')}Export selected</button><button class="btn btn-sm" id="bClr">Clear</button></span>`; $('#bClr').onclick = () => { sel.clear(); list(); }; $('#bExp').onclick = () => { PF.csv('selected-subscriptions.csv', [['Member ID', 'Name', 'Plan', 'Expires', 'Status'], ...db.members().filter(m => sel.has(m.id)).map(m => [m.id, m.name, db.planOf(m.plan).name, fmtDate(m.end), PF.statusLabel(subStatus(m))])]); }; } else bulk.hidden = true;
    if (!rows.length) { $('#list').innerHTML = `<div class="empty">${PF.icon('search')}<h3>No subscriptions match</h3><span>Clear a filter to see more.</span></div>`; $('#pager').innerHTML = ''; return; }
    $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" id="all" aria-label="Select all on this page" ${slice.every(m => sel.has(m.id)) ? 'checked' : ''}></th><th>Member</th><th>Plan</th><th>Last method</th><th>Start date</th><th>Expiration</th><th>Status</th><th style="width:130px">Actions</th></tr></thead><tbody>${slice.map(m => `<tr><td class="cell-act" style="justify-content:flex-start"><input type="checkbox" data-sel="${m.id}" aria-label="Select ${esc(m.name)}" ${sel.has(m.id) ? 'checked' : ''}></td><td class="cell-first"><div class="cell-user">${PF.avatar(m.name, '', m.photo)}<div><div class="nm">${esc(m.name)}</div><small>ID: ${m.id}</small></div></div></td><td data-label="Plan"><div><b>${esc(db.planOf(m.plan).name)} plan</b><div class="muted">${peso(planPrice(m))}</div></div></td><td data-label="Last method"><span class="cell-user" style="gap:8px">${lastMethod(m) === '—' ? '—' : PF.methodIcon(lastMethod(m)) + esc(lastMethod(m))}</span></td><td data-label="Start">${fmtDate(m.start)}</td><td data-label="Expires">${fmtDate(m.end)}</td><td data-label="Status">${PF.pill(subStatus(m))}</td><td class="cell-act"><a class="btn btn-sm" href="members.html#detail=${m.id}">View</a> <button class="row-menu" data-m="${m.id}" aria-label="More for ${esc(m.name)}">${PF.icon('more-v')}</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#all').onchange = e => { slice.forEach(m => e.target.checked ? sel.add(m.id) : sel.delete(m.id)); list(); };
    PF.$$('[data-sel]').forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); list(); });
    PF.$$('[data-m]').forEach(b => b.onclick = () => { const id = b.dataset.m; PF.menu(b, [{ label: 'View profile', icon: 'eye', href: 'members.html#detail=' + id }, ...(PF.can(['Owner', 'Cashier']) ? [{ label: 'Record renewal', icon: 'refresh', href: 'payments.html' }] : [])]); });
    PF.pager($('#pager'), { total: rows.length, page, size: SIZE, noun: 'members', onPage: p => { page = p; list(); } });
  }

  function overview() {
    const ms = db.members(), by = { active: 0, expiring: 0, overdue: 0, frozen: 0, cancelled: 0 }; ms.forEach(m => by[subStatus(m)]++);
    const soon = ms.filter(m => ['expiring', 'overdue'].includes(subStatus(m))).sort((a, b) => new Date(a.end) - new Date(b.end));
    const mrr = ms.filter(m => ['active', 'expiring'].includes(subStatus(m))).reduce((s, m) => s + planPrice(m) / db.planOf(m.plan).days * 30, 0);
    $('#body').innerHTML = `<section class="grid g2 keep1"><article class="card card-pad"><div class="card-head"><div><h2>Subscription status</h2><p>All ${ms.length} members</p></div></div><div id="dn"></div></article>
      <article class="card card-pad"><div class="card-head"><div><h2>Needs follow-up</h2><p>Expiring within 7 days or already overdue</p></div></div>${soon.length ? `<div class="activity">${soon.map(m => `<a class="act" href="members.html#detail=${m.id}">${PF.avatar(m.name, '', m.photo)}<span style="flex:1"><b>${esc(m.name)}</b><small>${esc(db.planOf(m.plan).name)} · ends ${fmtDate(m.end)}</small></span>${PF.pill(subStatus(m))}</a>`).join('')}</div>` : '<div class="empty compact"><span>Nobody needs follow-up right now</span></div>'}</article></section>
      <article class="card card-pad"><div class="card-head"><div><h2>Estimated monthly recurring value</h2><p>Active plans normalised to 30 days</p></div></div><div class="big" style="font-size:32px;font-weight:800">${peso(mrr)}</div></article>`;
    PF.charts.donut($('#dn'), { label: 'Subscription status', center: { big: ms.length, small: 'Members' }, items: [{ label: 'Active', value: by.active, color: PF.COLORS.teal }, { label: 'Expiring soon', value: by.expiring, color: PF.COLORS.gold }, { label: 'Overdue', value: by.overdue, color: PF.COLORS.red }, { label: 'Frozen', value: by.frozen, color: PF.COLORS.blue, optional: true }, { label: 'Cancelled', value: by.cancelled, color: '#94a3b8', optional: true }] });
  }
  const draw = () => { stats(); view === 'monitor' ? monitor() : overview(); };
  PF.$$('#views button').forEach(b => b.onclick = () => { view = b.dataset.v; PF.$$('#views button').forEach(x => x.classList.toggle('active', x === b)); draw(); });
  document.addEventListener('pf:data', () => { if (!document.querySelector('.modal-back')) { stats(); view === 'monitor' ? list() : overview(); } });
  draw();
});
