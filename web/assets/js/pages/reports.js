/* Financial reports (Owner only) */
PF.ready(() => {
  const { esc, peso, fmtDate } = PF, db = PF.db, $ = PF.$, root = $('#content');
  let period = 'month';
  root.insertAdjacentHTML('beforeend', `<div class="card"><div class="toolbar"><div class="chips" id="chips">${[['month', 'This month'], ['last', 'Last month'], ['quarter', 'Last 90 days'], ['year', 'This year']].map(c => `<button class="chip ${c[0] === period ? 'active' : ''}" data-p="${c[0]}">${c[1]}</button>`).join('')}</div><span class="grow"></span><button class="btn" id="csv">${PF.icon('download')}Export CSV</button><button class="btn btn-gold" id="print">${PF.icon('printer')}Print / save PDF</button></div></div>
    <section class="grid g4" id="stats"></section>
    <section class="grid g-main"><article class="card card-pad"><div class="card-head"><div><h2>Revenue over time</h2><p id="rSub"></p></div></div><div class="chart" id="rev"></div></article><article class="card card-pad"><div class="card-head"><div><h2>By payment method</h2><p>Completed payments</p></div></div><div id="meth"></div></article></section>
    <section class="grid g2 keep1"><article class="card card-pad"><div class="card-head"><div><h2>By plan</h2><p>Revenue and number of sales</p></div></div><div id="plans"></div></article><article class="card card-pad"><div class="card-head"><div><h2>Top members</h2><p>Highest spend in the period</p></div></div><div id="top"></div></article></section>`);

  function range() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    if (period === 'month') return { a: new Date(y, m, 1), b: now, label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    if (period === 'last') return { a: new Date(y, m - 1, 1), b: new Date(y, m, 0, 23, 59, 59), label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    if (period === 'quarter') return { a: PF.addDays(PF.startOfDay(now), -89), b: now, label: 'Last 90 days' };
    return { a: new Date(y, 0, 1), b: now, label: 'Year to date ' + y };
  }
  function draw() {
    const { a, b, label } = range(), span = b - a;
    const inR = db.payments().filter(p => { const d = new Date(p.at); return d >= a && d <= b; }), ok = inR.filter(p => p.status === 'completed');
    const prevA = new Date(a - span - 1), prev = db.payments().filter(p => { const d = new Date(p.at); return d >= prevA && d < a && p.status === 'completed'; });
    const sum = x => x.reduce((s, p) => s + p.amount, 0), rev = sum(ok), prevRev = sum(prev), pct = prevRev ? Math.round((rev - prevRev) / prevRev * 100) : 0;
    const renewals = ok.filter(p => /renew/i.test(p.note)).length, newM = db.members().filter(m => { const d = new Date(m.joined); return d >= a && d <= b; }).length;
    $('#stats').innerHTML = [
      { label: 'Revenue', value: peso(rev), icon: 'wallet', tone: 'gold', trend: (pct >= 0 ? '+' : '-') + Math.abs(pct) + '%', sub: 'vs previous period' },
      { label: 'Completed payments', value: ok.length, icon: 'receipt', tone: 'green', sub: `${inR.length - ok.length} not completed` },
      { label: 'Average payment', value: peso(ok.length ? rev / ok.length : 0), icon: 'activity', tone: 'blue', sub: 'per transaction' },
      { label: 'New members', value: newM, icon: 'user-plus', tone: 'purple', sub: `${renewals} renewals logged` }].map(PF.statTile).join('');
    $('#rSub').textContent = label + ' · ' + peso(rev);
    // bucket: daily for ≤45 days, monthly otherwise
    const days = Math.ceil(span / PF.MS_DAY), daily = days <= 45, labels = [], vals = [];
    if (daily) for (let i = 0; i < days; i++) { const d = PF.addDays(PF.startOfDay(a), i); labels.push(PF.fmtShort(d)); vals.push(ok.filter(p => PF.dayKey(p.at) === PF.dayKey(d)).reduce((s, p) => s + p.amount, 0)); }
    else for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) { labels.push(d.toLocaleDateString('en-US', { month: 'short' })); vals.push(ok.filter(p => { const x = new Date(p.at); return x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear(); }).reduce((s, p) => s + p.amount, 0)); }
    if (daily) PF.charts.line($('#rev'), { labels, series: [{ name: 'Revenue', color: PF.COLORS.teal, values: vals }], height: 260, fmtY: v => '₱' + (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : v), fmtTip: peso, label: 'Revenue by day' });
    else PF.charts.bars($('#rev'), { labels, values: vals, height: 260, highlight: labels.length - 1, label: 'Revenue by month' });
    const mc = ['#10a37f', '#3b82f6', '#8b5cf6', '#e3ae2b', '#f59e0b', '#e5484d'];
    PF.charts.donut($('#meth'), { label: 'Revenue by method', center: { big: peso(rev), small: 'Total' }, fmt: peso, items: db.methods().map((m, i) => ({ label: m.id, value: sum(ok.filter(p => p.method === m.id)), color: mc[i % 6] })).filter(i => i.value) });
    const pl = db.plans().map(p => ({ p, n: ok.filter(x => x.plan === p.id).length, v: sum(ok.filter(x => x.plan === p.id)) })), max = Math.max(1, ...pl.map(x => x.v));
    $('#plans').innerHTML = `<div style="display:grid;gap:16px">${pl.map(x => `<div><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${PF.planTag(x.p.id)} <span class="muted">${x.n} sale${x.n === 1 ? '' : 's'}</span></span><b>${peso(x.v)}</b></div><div class="bar-track"><div class="bar-fill" style="width:${x.v / max * 100}%"></div></div></div>`).join('')}</div>`;
    const by = {}; ok.forEach(p => by[p.memberId] = (by[p.memberId] || 0) + p.amount);
    const top = Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 5);
    $('#top').innerHTML = top.length ? `<div class="activity">${top.map(([id, v], i) => { const m = db.member(id) || { name: 'Unknown' }; return `<a class="act" href="members.html#detail=${id}"><b style="width:18px;color:var(--muted)">${i + 1}</b>${PF.avatar(m.name, '', m.photo)}<span style="flex:1"><b>${esc(m.name)}</b><small>${id}</small></span><b>${peso(v)}</b></a>`; }).join('')}</div>` : '<div class="empty compact"><span>No payments in this period</span></div>';
    PF._report = { ok, label };
  }
  PF.$$('#chips .chip').forEach(b => b.onclick = () => { period = b.dataset.p; PF.$$('#chips .chip').forEach(x => x.classList.toggle('active', x === b)); draw(); });
  $('#csv').onclick = () => { const { ok, label } = PF._report; PF.csv('financial-report.csv', [['Report', label], ['Ref no.', 'Date', 'Member', 'Plan', 'Method', 'Amount (PHP)'], ...ok.map(p => [p.id, fmtDate(p.at), (db.member(p.memberId) || {}).name || '', db.planOf(p.plan).name, p.method, p.amount])]); PF.toast('Report exported'); };
  $('#print').onclick = () => window.print();
  document.addEventListener('pf:data', draw);
  draw();
});
