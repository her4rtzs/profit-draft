/* Payment history (transactions) */
PF.ready(() => {
  const { esc, peso, fmtDate } = PF, db = PF.db, $ = PF.$, root = $('#content'), SIZE = 8;
  const params = new URLSearchParams(location.search);
  let q = params.get('q') || '', plan = '', method = '', status = '', range = 'month', from = '', to = '', page = 1;
  const tabs = PF.pageTabs([{ id: 'daily', label: 'Daily payment', icon: 'credit-card', href: 'payments.html' }, { id: 'subs', label: 'Subscription monitor', icon: 'refresh', href: 'subscriptions.html' }, { id: 'hist', label: 'Payment history', icon: 'clock', href: 'transactions.html' }], 'hist');
  root.insertAdjacentHTML('beforeend', `${tabs}<section class="grid g4" id="stats"></section>
    <article class="card card-pad"><div class="toolbar" style="padding:0 0 14px"><label class="search search-box" style="max-width:none;min-width:0">${PF.icon('search')}<input id="q" type="search" placeholder="Search by name, ref no. or ID…" value="${esc(q)}" aria-label="Search payments"></label>
      <select class="select" id="plan" aria-label="Plan">${PF.opts(db.plans().map(p => ({ value: p.id, label: p.name })), '', 'All plans')}</select>
      <select class="select" id="method" aria-label="Method">${PF.opts(db.methods().map(m => m.id), '', 'All methods')}</select>
      <select class="select" id="status" aria-label="Status">${PF.opts([{ value: 'completed', label: 'Completed' }, { value: 'pending', label: 'Pending' }, { value: 'failed', label: 'Failed' }, { value: 'voided', label: 'Voided' }], '', 'All status')}</select>
      <select class="select" id="range" aria-label="Period">${PF.opts([{ value: 'today', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: 'month', label: 'This month' }, { value: 'year', label: 'This year' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom range…' }], 'month')}</select>
      <span id="custom" style="display:none;gap:8px"><input class="input" type="date" id="from" aria-label="From" style="width:150px"><input class="input" type="date" id="to" aria-label="To" style="width:150px"></span>
      <button class="btn btn-gold" id="exp">${PF.icon('download')}Export</button></div><div id="list"></div><div class="pager" id="pager"></div></article>`);

  const bounds = () => { const now = new Date(), t0 = PF.startOfDay(now); switch (range) { case 'today': return [t0, now]; case '7': return [PF.addDays(t0, -6), now]; case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1), now]; case 'year': return [new Date(now.getFullYear(), 0, 1), now]; case 'custom': return [from ? new Date(from + 'T00:00') : new Date(0), to ? new Date(to + 'T23:59:59') : now]; default: return [new Date(0), now]; } };
  const nm = p => (db.member(p.memberId) || { name: 'Unknown' }).name;
  const filtered = () => { const [a, b] = bounds(), t = q.trim().toLowerCase(); return db.payments().filter(p => { const d = new Date(p.at); return d >= a && d <= b && (!plan || p.plan === plan) && (!method || p.method === method) && (!status || p.status === status) && (!t || (p.id + ' ' + nm(p) + ' ' + p.memberId + ' ' + (p.ref || '')).toLowerCase().includes(t)); }); };
  function stats() {
    const r = filtered(), ok = r.filter(p => p.status === 'completed'), sum = a => a.reduce((s, p) => s + p.amount, 0);
    $('#stats').innerHTML = [
      { label: 'Total payments', value: peso(sum(ok)), icon: 'wallet', tone: 'gold', sub: 'completed in period' },
      { label: 'Transactions', value: r.length, icon: 'receipt', tone: 'green', sub: `${ok.length} completed` },
      { label: 'Online payments', value: ok.filter(p => p.source === 'online').length, icon: 'smartphone', tone: 'blue', sub: peso(sum(ok.filter(p => p.source === 'online'))) },
      { label: 'Desk payments', value: ok.filter(p => p.source === 'desk').length, icon: 'banknote', tone: 'purple', sub: peso(sum(ok.filter(p => p.source === 'desk'))) }].map(PF.statTile).join('');
  }
  function list() {
    const rows = filtered(), slice = rows.slice((page - 1) * SIZE, page * SIZE);
    if (!rows.length) { $('#list').innerHTML = `<div class="empty">${PF.art.receipt()}<h3>No transactions found</h3><span>Try widening the period or clearing filters.</span></div>`; $('#pager').innerHTML = ''; return; }
    $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ref no.</th><th>Member</th><th>Plan</th><th>Method</th><th>Date & time</th><th class="num">Amount</th><th>Status</th><th style="width:56px">Actions</th></tr></thead><tbody>${slice.map(p => { const m = db.member(p.memberId) || { name: 'Unknown', id: '' }; return `<tr><td class="cell-first"><b>${p.id}</b></td><td data-label="Member"><div class="cell-user">${PF.avatar(m.name, 'sm', m.photo)}<div><div class="nm">${esc(m.name)}</div><small>${m.id}</small></div></div></td><td data-label="Plan">${PF.planTag(p.plan)}</td><td data-label="Method"><span class="cell-user" style="gap:8px">${PF.methodIcon(p.method)}${esc(p.method)}</span></td><td data-label="Date"><div>${fmtDate(p.at)}</div><div class="muted">${PF.fmtTime(p.at)}</div></td><td class="num" data-label="Amount">${peso(p.amount)}</td><td data-label="Status">${PF.pill(p.status)}</td><td class="cell-act"><button class="row-menu" data-id="${p.id}" aria-label="Actions for ${p.id}">${PF.icon('more-h')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
    PF.$$('#list .row-menu').forEach(b => b.onclick = () => { const p = db.payments().find(x => x.id === b.dataset.id); PF.menu(b, [{ label: 'View receipt', icon: 'receipt', onClick: () => receipt(p) }, ...(p.status === 'pending' ? [{ label: 'Mark completed', icon: 'check-circle', onClick: () => { db.setPaymentStatus(p.id, 'completed'); PF.toast(p.id + ' marked completed'); } }] : []), ...(p.status !== 'voided' && p.status !== 'failed' ? ['hr', { label: 'Void payment', icon: 'ban', danger: true, onClick: async () => { if (await PF.confirm({ title: 'Void ' + p.id + '?', message: 'The payment stays in the history as voided and no longer counts toward revenue.', confirm: 'Void payment', danger: true })) { db.setPaymentStatus(p.id, 'voided'); PF.toast(p.id + ' voided'); } } }] : [])]); });
    PF.pager($('#pager'), { total: rows.length, page, size: SIZE, noun: 'payments', onPage: n => { page = n; list(); } });
  }
  function receipt(p) {
    const m = db.member(p.memberId) || { name: 'Unknown', id: '' }, g = db.gym();
    PF.modal({ title: 'Receipt ' + p.id, html: `<div class="receipt" id="rcpt"><div class="r-head"><img src="${esc(g.logo || PF.assetBase + 'img/logo.jpg')}" alt=""><b style="font-size:16px">${esc(g.name)}</b><div class="muted">${esc(g.address)}</div></div><div class="kv" style="margin-top:8px"><div><span>Receipt no.</span><b>${p.id}</b></div><div><span>Date</span><b>${PF.fmtDateTime(p.at)}</b></div><div><span>Member</span><b>${esc(m.name)} (${m.id})</b></div><div><span>Plan</span><b>${esc(db.planOf(p.plan).name)}</b></div><div><span>Method</span><b>${esc(p.method)}</b></div>${p.ref ? `<div><span>Reference</span><b>${esc(p.ref)}</b></div>` : ''}<div><span>Received by</span><b>${esc(p.by || '—')}</b></div><div><span>Status</span><b>${PF.statusLabel(p.status)}</b></div></div><div class="r-total"><span>Total</span><span>${peso(p.amount, true)}</span></div></div>`,
      foot: [{ label: 'Close' }, { label: 'Print', icon: 'printer', cls: 'btn-gold', keep: true, onClick: () => { const w = window.open('', '_blank', 'width=420,height=640'); if (!w) { PF.toast('Allow pop-ups to print the receipt.', 'err'); return; } w.document.write(`<title>${p.id}</title><body style="font:14px system-ui;padding:24px">${$('#rcpt').innerHTML.replace(/<img[^>]*>/, '')}</body>`); w.document.close(); w.focus(); w.print(); } }] });
  }
  const redraw = () => { page = 1; stats(); list(); };
  $('#q').oninput = PF.debounce(e => { q = e.target.value; redraw(); }, 120);
  [['plan', v => plan = v], ['method', v => method = v], ['status', v => status = v]].forEach(([id, set]) => $('#' + id).onchange = e => { set(e.target.value); redraw(); });
  $('#range').onchange = e => { range = e.target.value; $('#custom').style.display = range === 'custom' ? 'flex' : 'none'; redraw(); };
  $('#from').onchange = e => { from = e.target.value; redraw(); }; $('#to').onchange = e => { to = e.target.value; redraw(); };
  $('#exp').onclick = () => { const r = filtered(); PF.csv('payment-history.csv', [['Ref no.', 'Member ID', 'Member', 'Plan', 'Method', 'Date', 'Amount (PHP)', 'Status', 'Reference'], ...r.map(p => [p.id, p.memberId, nm(p), db.planOf(p.plan).name, p.method, PF.fmtDateTime(p.at), p.amount, PF.statusLabel(p.status), p.ref || ''])]); PF.toast('Exported ' + r.length + ' transactions'); };
  if (q) range = 'all', $('#range').value = 'all';
  document.addEventListener('pf:data', () => { if (!document.querySelector('.modal-back')) { stats(); list(); } });
  stats(); list();
});
