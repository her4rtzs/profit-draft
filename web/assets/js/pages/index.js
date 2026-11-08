/* Dashboard */
PF.ready(() => {
  const { esc, peso } = PF, db = PF.db, $ = PF.$, root = $('#content');
  const me = db.profile(), hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const first = me.name.split(' ')[0];

  root.insertAdjacentHTML('beforeend', `
    <div class="page-head greet"><span class="tile">${PF.icon('home')}</span><div><div class="hello">${hello},</div><h1>${me.role === 'Owner' ? 'Admin ' : ''}${esc(first)}</h1><p>Keep pushing. Progress takes time, but you're doing great.</p></div><div class="tagline" aria-hidden="true">Stronger<br>Healthier<br>Happier</div></div>
    <section class="grid g4" id="stats" aria-label="Key numbers"></section>
    <section class="dash" id="dash"></section>`);

  const css = document.createElement('style');
  css.textContent = `.dash{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}.s3{grid-column:span 3}.s4{grid-column:span 4}.s5{grid-column:span 5}
  @media(max-width:1240px){.s3,.s4,.s5{grid-column:span 6}}@media(max-width:760px){.s3,.s4,.s5{grid-column:span 12}}
  .year-nav{display:flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:12px;padding:3px;background:var(--card)}
  .year-nav b{min-width:64px;text-align:center}.year-nav button{width:30px;height:30px;border:0;background:transparent;border-radius:9px;display:grid;place-items:center}
  .year-nav button:hover{background:var(--gold-soft)}.year-nav button[disabled]{opacity:.35}`;
  document.head.appendChild(css);

  function render() {
    const members = db.members(), now = new Date();
    const by = { active: 0, expiring: 0, expired: 0, frozen: 0, cancelled: 0 };
    members.forEach(m => by[db.statusOf(m)]++);
    const live = members.filter(m => !['cancelled'].includes(db.statusOf(m)));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1), lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const joined = members.filter(m => new Date(m.joined) >= monthStart).length;
    const todayRec = db.attendanceFor(now).filter(a => a.status !== 'absent'), lastWk = db.attendanceFor(PF.addDays(now, -7)).filter(a => a.status !== 'absent');
    const rev = db.sumPayments(monthStart, now), revLast = db.sumPayments(lastStart, new Date(now.getFullYear(), now.getMonth(), 0, 23, 59));
    const pct = revLast ? Math.round((rev - revLast) / revLast * 100) : 0;
    const revSeries = db.revenueByMonth(now.getFullYear()).slice(Math.max(0, now.getMonth() - 6), now.getMonth() + 1);
    const attSeries = Array.from({ length: 7 }, (_, i) => db.attendanceFor(PF.addDays(now, i - 6)).filter(a => a.status !== 'absent').length);
    const expiringTotal = by.expiring;

    $('#stats').innerHTML = [
      { label: 'Total members', value: members.length, icon: 'users', tone: 'blue', trend: '+' + joined, sub: 'this month', spark: [3, 4, 4, 6, 7, 9, members.length], sparkColor: PF.COLORS.blue },
      { label: "Today's attendance", value: `${todayRec.length} / ${live.length}`, icon: 'calendar-check', tone: 'green', trend: (todayRec.length - lastWk.length >= 0 ? '+' : '-') + Math.abs(todayRec.length - lastWk.length), sub: 'vs last week', spark: attSeries, sparkColor: PF.COLORS.teal },
      ...(PF.can(['Owner', 'Cashier']) ? [{ label: 'Revenue this month', value: peso(rev), icon: 'wallet', tone: 'purple', trend: (pct >= 0 ? '+' : '-') + Math.abs(pct) + '%', sub: 'vs last month', spark: revSeries.length > 1 ? revSeries : [0, rev], sparkColor: PF.COLORS.purple }] : []),
      { label: 'Expiring soon', value: expiringTotal, icon: 'clock', tone: 'gold', sub: 'Within 7 days', spark: [1, 2, 1, 3, 2, 2, expiringTotal], sparkColor: PF.COLORS.gold }
    ].map(PF.statTile).join('');

    $('#dash').innerHTML = `
      <article class="card card-pad s4"><div class="card-head"><div><h2>Membership overview</h2><p>Current membership status</p></div><div class="right"><a class="btn btn-sm" href="members.html">View all</a></div></div><div id="cOverview"></div></article>
      <article class="card card-pad s5"><div class="card-head"><div><h2>Monthly revenue</h2><p id="revSub"></p></div><div class="right"><div class="year-nav"><button id="yPrev" aria-label="Previous year">${PF.icon('chevron-left')}</button><b id="yLbl"></b><button id="yNext" aria-label="Next year">${PF.icon('chevron-right')}</button></div></div></div><div class="chart" id="cRevenue"></div></article>
      <article class="card card-pad s3"><div class="card-head"><h2>Recent activity</h2><div class="right"><a class="btn btn-sm" href="notifications.html">View all</a></div></div><div class="activity" id="cActivity"></div></article>
      <article class="card card-pad s5"><div class="card-head"><div><h2>Daily attendance</h2><p id="attSub"></p></div><div class="right"><div class="seg" id="attMode" role="tablist"><button data-m="days" class="active">Days</button><button data-m="week">Week</button><button data-m="month">Month</button><button data-m="year">Year</button></div></div></div>
        <div class="legend" style="margin:0 0 6px"><span><i style="background:${PF.COLORS.teal}"></i>Present</span><span><i style="background:${PF.COLORS.red}"></i>Absent</span><span style="margin-left:auto;display:flex;gap:4px"><button class="icon-btn" style="width:30px;height:30px" id="aPrev" aria-label="Earlier">${PF.icon('chevron-left')}</button><button class="icon-btn" style="width:30px;height:30px" id="aNext" aria-label="Later">${PF.icon('chevron-right')}</button></span></div><div class="chart" id="cAttendance"></div></article>
      <article class="card card-pad s4"><div class="card-head"><div><h2>Membership distribution</h2><p>By plan</p></div></div><div id="cDist"></div></article>
      <article class="card card-pad s3"><div class="card-head"><h2>Quick actions</h2></div><div class="qa-grid">
        <a class="qa tone-gold" href="members.html#new">${PF.icon('user-plus')}Add member</a>
        <a class="qa tone-green" href="attendance.html#checkin">${PF.icon('calendar-check')}Record attendance</a>
        ${PF.can(['Owner', 'Cashier']) ? `<a class="qa tone-blue" href="payments.html">${PF.icon('credit-card')}Process payment</a>` : ''}
        ${PF.can(['Owner']) ? `<a class="qa tone-purple" href="reports.html">${PF.icon('chart')}View reports</a>` : `<a class="qa tone-purple" href="members.html">${PF.icon('users')}Browse members</a>`}</div></article>`;

    PF.charts.donut($('#cOverview'), { label: 'Membership status', center: { big: members.length, small: 'Members' }, items: [
      { label: 'Active', value: by.active, color: PF.COLORS.teal }, { label: 'Expiring', value: by.expiring, color: PF.COLORS.gold }, { label: 'Expired', value: by.expired, color: PF.COLORS.red }, { label: 'Frozen / cancelled', value: by.frozen + by.cancelled, color: '#94a3b8', optional: true }] });
    const plans = db.plans().map((p, i) => ({ label: p.name, value: members.filter(m => m.plan === p.id).length, color: [PF.COLORS.orange, PF.COLORS.blue, PF.COLORS.purple, PF.COLORS.teal][i % 4] }));
    PF.charts.donut($('#cDist'), { label: 'Membership by plan', center: { big: members.length, small: 'Members' }, items: plans });
    $('#cActivity').innerHTML = db.notifications().slice(0, 4).map(n => `<a class="act" href="${esc(n.href || 'notifications.html')}"><span class="ai tone-${n.tone}">${PF.icon(n.icon)}</span><span><b>${esc(n.title)}</b><small>${esc(n.text)} · ${PF.timeAgo(n.at)}</small></span></a>`).join('') || '<div class="empty compact"><span>No activity yet</span></div>';
    PF.$$('#attMode button').forEach(b => b.classList.toggle('active', b.dataset.m === mode));
    drawRevenue(); drawAttendance();
  }

  let year = new Date().getFullYear();
  function drawRevenue() {
    const vals = db.revenueByMonth(year), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const nowY = new Date().getFullYear(), last = year === nowY ? new Date().getMonth() : 11;
    const total = vals.reduce((a, b) => a + b, 0);
    $('#yLbl').textContent = year; $('#yNext').disabled = year >= nowY;
    $('#revSub').textContent = `Jan to ${M[last]} ${year} · ${peso(total)}`;
    PF.charts.bars($('#cRevenue'), { labels: M, values: vals.map((v, i) => (year === nowY && i > last ? 0 : v)), highlight: year === nowY ? last : -1, height: 230, label: 'Monthly revenue' });
  }
  let mode = 'days', anchor = new Date();
  function attSeries() {
    const labels = [], present = [], absent = [], tally = (d0, d1) => { let p = 0, a = 0; for (let d = new Date(d0); d <= d1; d = PF.addDays(d, 1)) { const r = db.attendanceFor(d); p += r.filter(x => x.status !== 'absent').length; a += r.filter(x => x.status === 'absent').length; } return [p, a]; };
    const end = PF.startOfDay(anchor);
    if (mode === 'days') for (let i = 13; i >= 0; i--) { const d = PF.addDays(end, -i), r = db.attendanceFor(d); labels.push(d.getDate() === 1 || i === 13 ? PF.fmtShort(d) : String(d.getDate())); present.push(r.filter(x => x.status !== 'absent').length); absent.push(r.filter(x => x.status === 'absent').length); }
    else if (mode === 'week') for (let i = 7; i >= 0; i--) { const e = PF.addDays(end, -i * 7), [p, a] = tally(PF.addDays(e, -6), e); labels.push(PF.fmtShort(PF.addDays(e, -6))); present.push(p); absent.push(a); }
    else { const n = mode === 'month' ? 6 : 12; for (let i = n - 1; i >= 0; i--) { const s = new Date(end.getFullYear(), end.getMonth() - i, 1), e = new Date(end.getFullYear(), end.getMonth() - i + 1, 0), [p, a] = tally(s, e > new Date() ? new Date() : e); labels.push(s.toLocaleDateString('en-US', { month: 'short' })); present.push(p); absent.push(a); } }
    return { labels, present, absent };
  }
  function drawAttendance() {
    const s = attSeries();
    $('#attSub').textContent = { days: 'Last 14 days', week: 'Last 8 weeks', month: 'Last 6 months', year: 'Last 12 months' }[mode] + ' · ending ' + PF.fmtDate(anchor);
    $('#aNext').disabled = PF.startOfDay(anchor) >= PF.startOfDay(new Date());
    PF.charts.line($('#cAttendance'), { labels: s.labels, series: [{ name: 'Present', color: PF.COLORS.teal, values: s.present }, { name: 'Absent', color: PF.COLORS.red, values: s.absent, area: false }], height: 230, label: 'Attendance over time' });
  }
  const step = { days: 14, week: 56, month: 180, year: 365 };
  document.addEventListener('click', e => {
    const t = e.target.closest('#attMode button,#aPrev,#aNext,#yPrev,#yNext'); if (!t) return;
    if (t.dataset.m) { mode = t.dataset.m; PF.$$('#attMode button').forEach(b => b.classList.toggle('active', b === t)); }
    else if (t.id === 'aPrev') anchor = PF.addDays(anchor, -step[mode]);
    else if (t.id === 'aNext') { anchor = PF.addDays(anchor, step[mode]); if (anchor > new Date()) anchor = new Date(); }
    else if (t.id === 'yPrev') { year--; drawRevenue(); return; } else if (t.id === 'yNext') { year++; drawRevenue(); return; }
    drawAttendance();
  });
  render();
  document.addEventListener('pf:data', render);
});
