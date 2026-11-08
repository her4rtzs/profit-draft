/* Payments & Billing — daily payment (record + today's collection + recent) */
PF.ready(() => {
  const { esc, peso } = PF, db = PF.db, $ = PF.$, root = $('#content');
  const tabs = PF.pageTabs([{ id: 'daily', label: 'Daily payment', icon: 'credit-card', href: 'payments.html' }, { id: 'subs', label: 'Subscription monitor', icon: 'refresh', href: 'subscriptions.html' }, ...(PF.can(['Owner']) ? [{ id: 'hist', label: 'Payment history', icon: 'clock', href: 'transactions.html' }] : [])], 'daily');
  root.insertAdjacentHTML('beforeend', `${tabs}<section class="grid g4" id="stats"></section>
    <section class="grid g-pay"><form class="card card-pad" id="form" novalidate><div class="card-head"><div><h2>Record a payment</h2><p>Add a new payment for a member.</p></div></div>
      <div class="form-grid"><div class="field"><label>Member <span class="req">*</span></label><div class="input-ico">${PF.icon('user')}<select class="select" id="member"></select></div><span class="err" hidden></span></div>
      <div class="field"><label>Plan <span class="req">*</span></label><div class="input-ico">${PF.icon('tag')}<select class="select" id="plan"></select></div></div>
      <div class="field"><label>Payment method <span class="req">*</span></label><div class="input-ico">${PF.icon('credit-card')}<select class="select" id="method"></select></div></div>
      <div class="field"><label>Amount <span class="req">*</span></label><div class="input-ico"><span class="pre">₱</span><input class="input" id="amount" type="number" min="1" step="0.01" placeholder="Enter amount"></div><span class="err" hidden></span></div>
      <div class="field"><label>Reference no.</label><input class="input" id="ref" placeholder="GCash / bank reference (optional)"></div>
      <div class="field"><label>Note</label><input class="input" id="note" placeholder="Optional"></div></div>
      <p class="hint" id="effect" style="margin:12px 0 0;color:var(--muted)"></p>
      <button class="btn btn-gold btn-block" style="margin-top:14px;height:48px" type="submit">${PF.icon('credit-card')}Record payment</button></form>
      <article class="pay-hero"><div style="display:flex;gap:12px;align-items:center"><span class="stat-ico tone-green">${PF.icon('calendar-check')}</span><b>Today's collection</b></div><div class="big" id="today"></div><div class="muted" id="todaySub"></div><a href="${PF.can(['Owner']) ? 'transactions.html' : 'payments.html'}" class="link-btn" style="justify-self:start;padding-left:0">View details →</a><div style="justify-self:center;margin-top:6px">${PF.art.receipt()}</div></article></section>
    <article class="card card-pad"><div class="card-head"><div><h2>Recent payments</h2><p>Latest transactions from all members.</p></div>${PF.can(['Owner']) ? `<div class="right"><a class="btn btn-sm" href="transactions.html">View all</a></div>` : ''}</div><div id="list"></div></article>`);

  function stats() {
    const now = new Date(), wk = PF.addDays(PF.startOfDay(now), -6), wkPrev = PF.addDays(wk, -7);
    const ps = db.payments(), inWeek = ps.filter(p => new Date(p.at) >= wk && p.status === 'completed'), prev = ps.filter(p => new Date(p.at) >= wkPrev && new Date(p.at) < wk && p.status === 'completed');
    const sum = a => a.reduce((s, p) => s + p.amount, 0), pct = (a, b) => b ? Math.round((a - b) / b * 100) : 0;
    const pend = ps.filter(p => p.status === 'pending').length;
    const paidMembers = new Set(inWeek.map(p => p.memberId)).size, prevMembers = new Set(prev.map(p => p.memberId)).size;
    const avg = inWeek.length ? sum(inWeek) / inWeek.length : 0, avgPrev = prev.length ? sum(prev) / prev.length : 0;
    const tr = v => Math.abs(v) > 200 ? '' : (v >= 0 ? '+' : '-') + Math.abs(v) + '%';
    $('#stats').innerHTML = [
      { label: 'Collected (7 days)', value: peso(sum(inWeek)), icon: 'wallet', tone: 'gold', trend: tr(pct(sum(inWeek), sum(prev))), sub: 'vs prior week' },
      { label: 'Members paid (7 days)', value: paidMembers, icon: 'users', tone: 'green', trend: tr(pct(paidMembers, prevMembers)), sub: 'vs prior week' },
      { label: 'Pending payments', value: pend, icon: 'clock', tone: 'purple', sub: 'need confirmation' },
      { label: 'Average payment', value: peso(avg), icon: 'activity', tone: 'blue', trend: tr(pct(avg, avgPrev)), sub: 'vs prior week' }].map(PF.statTile).join('');
    const t0 = PF.startOfDay(now), today = ps.filter(p => new Date(p.at) >= t0 && p.status === 'completed');
    $('#today').textContent = peso(sum(today)); $('#todaySub').textContent = `${today.length} payment${today.length === 1 ? '' : 's'} received today`;
  }
  function form() {
    const ms = db.members().filter(m => db.statusOf(m) !== 'cancelled'), cur = { m: $('#member').value, p: $('#plan').value, me: $('#method').value };
    $('#member').innerHTML = PF.opts(ms.map(m => ({ value: m.id, label: `${m.name} · ${m.id}` })), cur.m, 'Select member');
    $('#plan').innerHTML = PF.opts(db.plans().filter(p => p.active).map(p => ({ value: p.id, label: `${p.name} · ${peso(p.price)}` })), cur.p, 'Select plan');
    $('#method').innerHTML = PF.opts(db.methods().filter(x => x.source === 'desk').map(x => x.id), cur.me || 'Cash');
  }
  function effect() {
    const m = db.member($('#member').value), p = $('#plan').value && db.planOf($('#plan').value);
    $('#effect').textContent = m && p ? `Recording this will extend ${m.name}'s membership to ${PF.fmtDate(PF.addDays(new Date(m.end) > new Date() ? new Date(m.end) : new Date(), p.days))}.` : '';
  }
  function recent() {
    const rows = db.payments().slice(0, 6);
    $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Plan</th><th>Method</th><th class="num">Amount</th><th>Date & time</th><th>Status</th></tr></thead><tbody>${rows.map(p => { const m = db.member(p.memberId) || { name: 'Unknown', id: '' }; return `<tr><td class="cell-first"><div class="cell-user">${PF.avatar(m.name, '', m.photo)}<div><div class="nm">${esc(m.name)}</div><small>${m.id}</small></div></div></td><td data-label="Plan">${PF.planTag(p.plan)}</td><td data-label="Method"><span class="cell-user" style="gap:8px">${PF.methodIcon(p.method)}${esc(p.method)}</span></td><td class="num" data-label="Amount">${peso(p.amount)}</td><td data-label="Date"><div>${PF.fmtDate(p.at)}</div><div class="muted">${PF.fmtTime(p.at)}</div></td><td data-label="Status">${PF.pill(p.status)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  $('#member').onchange = () => { const m = db.member($('#member').value); if (m && !$('#plan').value) { $('#plan').value = m.plan; $('#plan').onchange(); } effect(); };
  $('#plan').onchange = () => { const p = $('#plan').value; if (p) $('#amount').value = db.planOf(p).price; effect(); };
  $('#form').addEventListener('input', e => { e.target.classList.remove('is-invalid'); const er = e.target.closest('.field') && e.target.closest('.field').querySelector('.err'); if (er) er.hidden = true; });
  $('#form').onsubmit = e => {
    e.preventDefault();
    const mem = $('#member'), amt = $('#amount'); let ok = true;
    const bad = (el, msg) => { el.classList.add('is-invalid'); const er = el.closest('.field').querySelector('.err'); if (er) { er.textContent = msg; er.hidden = false; } ok = false; };
    if (!mem.value) bad(mem, 'Choose a member.');
    if (!$('#plan').value) bad($('#plan'), 'Choose a plan.');
    if (!(+amt.value > 0)) bad(amt, 'Enter an amount greater than zero.');
    if (!ok) return;
    const p = db.recordPayment({ memberId: mem.value, plan: $('#plan').value, method: $('#method').value, amount: amt.value, ref: $('#ref').value.trim(), note: $('#note').value.trim() });
    PF.toast(`${p.id} recorded · ${peso(p.amount)}`); $('#form').reset(); form(); $('#effect').textContent = '';
  };
  const all = () => { stats(); recent(); };
  document.addEventListener('pf:data', all);
  form(); all(); effect();
});
