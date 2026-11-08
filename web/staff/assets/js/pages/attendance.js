/* Attendance */
PF.ready(() => {
  const { esc, fmtDate, fmtTime } = PF, db = PF.db, $ = PF.$, root = $('#content');
  let filter = 'all', date = PF.dayKey(new Date()), page = 1, mode = 'days';
  const SIZE = 10;
  root.insertAdjacentHTML('beforeend', `<section class="grid g4" id="stats"></section>
    <div class="card"><div class="toolbar"><div class="chips" id="chips">${[['all', 'All'], ['in', 'Checked in'], ['absent', 'Absent'], ['late', 'Late']].map(c => `<button class="chip ${c[0] === 'all' ? 'active' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}</div>
      <label class="input-ico" style="width:190px">${PF.icon('calendar')}<input class="input" type="date" id="date" value="${date}" max="${PF.dayKey(new Date())}" aria-label="Attendance date"></label>
      <span class="grow"></span><button class="btn" id="exp">${PF.icon('download')}Export report</button><button class="btn btn-gold" id="chk">${PF.icon('user-check')}Record check-in</button></div></div>
    <section class="grid g-split"><article class="card card-pad"><div class="card-head"><div><h2>Recent attendance</h2><p id="sub"></p></div></div><div id="list"></div><div class="pager" id="pager"></div></article>
      <div class="grid" style="align-content:start"><article class="card card-pad"><div class="card-head"><h2>Attendance trend</h2><div class="right"><div class="seg" id="mode"><button data-m="days" class="active">Days</button><button data-m="week">Week</button><button data-m="month">Month</button></div></div></div><div class="legend" style="margin-bottom:6px"><span><i style="background:${PF.COLORS.orange}"></i>Check-ins</span><span><i style="background:${PF.COLORS.purple}"></i>Late</span><span><i style="background:${PF.COLORS.red}"></i>Absent</span></div><div class="chart" id="trend"></div></article>
      <article class="card card-pad"><div class="card-head"><div><h2>Attendance by plan</h2><p>Check-ins in the last 30 days</p></div></div><div id="byPlan"></div></article></div></section>`);

  const day = d => new Date(d + 'T00:00:00');
  const tally = (d0, d1) => { let p = 0, l = 0, a = 0; for (let d = new Date(d0); d <= d1; d = PF.addDays(d, 1)) { const r = db.attendanceFor(d); r.forEach(x => { if (x.status === 'absent') a++; else { p++; if (x.status === 'late') l++; } }); } return { p, l, a }; };

  function stats() {
    const now = new Date(), t30 = tally(PF.addDays(now, -29), now), today = db.attendanceFor(now).filter(r => r.status !== 'absent').length;
    const covered = db.members().filter(m => ['active', 'expiring'].includes(db.statusOf(m))).length;
    const avg = covered ? Math.round(t30.p / 30 / covered * 100) : 0;
    $('#stats').innerHTML = [
      { label: 'Check-ins (30 days)', value: t30.p, icon: 'users', tone: 'gold', sub: 'all members', spark: Array.from({ length: 8 }, (_, i) => tally(PF.addDays(now, -(7 - i) * 3), PF.addDays(now, -(7 - i) * 3)).p), sparkColor: PF.COLORS.gold },
      { label: "Today's check-ins", value: today, icon: 'calendar-check', tone: 'blue', sub: 'so far today', spark: [3, 5, 4, 7, 6, 8, today], sparkColor: PF.COLORS.blue },
      { label: 'Active members', value: covered, icon: 'user-check', tone: 'purple', sub: 'with a valid plan' },
      { label: 'Avg. daily attendance', value: avg + '%', icon: 'activity', tone: 'amber', sub: 'of active members' }
    ].map(PF.statTile).join('');
  }

  function rows() { return db.attendanceFor(day(date)).filter(r => filter === 'all' || r.status === filter); }
  function list() {
    const all = rows(), total = all.length, slice = all.slice((page - 1) * SIZE, page * SIZE);
    $('#sub').textContent = `${fmtDate(day(date))} · ${total} record${total === 1 ? '' : 's'}`;
    if (!total) { $('#list').innerHTML = `<div class="empty compact">${PF.icon('calendar')}<h3>No records</h3><span>Nothing to show for this date and filter.</span></div>`; $('#pager').innerHTML = ''; return; }
    $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Member</th><th>Time in</th><th>Status</th><th style="width:56px"></th></tr></thead><tbody>${slice.map(r => { const m = db.member(r.memberId); return `<tr><td class="cell-first"><div class="cell-user">${PF.avatar(m.name, '', m.photo)}<div><div class="nm">${esc(m.name)}</div><small>${m.id}</small></div></div></td><td data-label="Time in">${r.at ? fmtTime(r.at) : '—'}</td><td data-label="Status">${PF.pill(r.status)}</td><td class="cell-act"><button class="row-menu" data-id="${m.id}" aria-label="Actions for ${esc(m.name)}">${PF.icon('more-h')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
    PF.$$('#list .row-menu').forEach(b => b.onclick = () => {
      const isToday = date === PF.dayKey(new Date());
      PF.menu(b, [{ label: 'View profile', icon: 'eye', href: 'members.html#detail=' + b.dataset.id }, ...(isToday ? ['hr', { label: 'Mark checked in', icon: 'check-circle', onClick: () => { db.checkIn(b.dataset.id, 'in'); PF.toast('Checked in'); } }, { label: 'Mark late', icon: 'clock', onClick: () => { db.checkIn(b.dataset.id, 'late'); PF.toast('Marked late'); } }] : [])]);
    });
    PF.pager($('#pager'), { total, page, size: SIZE, noun: 'records', onPage: p => { page = p; list(); } });
  }

  function trend() {
    const end = PF.startOfDay(new Date()), labels = [], ci = [], late = [], ab = [];
    if (mode === 'days') for (let i = 13; i >= 0; i--) { const d = PF.addDays(end, -i), t = tally(d, d); labels.push(PF.fmtShort(d)); ci.push(t.p); late.push(t.l); ab.push(t.a); }
    else if (mode === 'week') for (let i = 7; i >= 0; i--) { const e = PF.addDays(end, -i * 7), t = tally(PF.addDays(e, -6), e); labels.push(PF.fmtShort(PF.addDays(e, -6))); ci.push(t.p); late.push(t.l); ab.push(t.a); }
    else for (let i = 5; i >= 0; i--) { const s = new Date(end.getFullYear(), end.getMonth() - i, 1), e = new Date(end.getFullYear(), end.getMonth() - i + 1, 0), t = tally(s, e > end ? end : e); labels.push(s.toLocaleDateString('en-US', { month: 'short' })); ci.push(t.p); late.push(t.l); ab.push(t.a); }
    PF.charts.line($('#trend'), { labels, series: [{ name: 'Check-ins', color: PF.COLORS.orange, values: ci }, { name: 'Late', color: PF.COLORS.purple, values: late, area: false }, { name: 'Absent', color: PF.COLORS.red, values: ab, area: false }], height: 230, label: 'Attendance trend' });
    const counts = {}; for (let i = 0; i < 30; i++) db.attendanceFor(PF.addDays(end, -i)).forEach(r => { if (r.status !== 'absent') { const p = db.member(r.memberId).plan; counts[p] = (counts[p] || 0) + 1; } });
    const tot = Object.values(counts).reduce((a, b) => a + b, 0);
    PF.charts.donut($('#byPlan'), { label: 'Check-ins by plan', center: { big: tot, small: 'Total check-ins' }, items: db.plans().map((p, i) => ({ label: p.name, value: counts[p.id] || 0, color: [PF.COLORS.orange, PF.COLORS.blue, PF.COLORS.purple, PF.COLORS.teal][i % 4] })) });
  }

  function checkInModal() {
    const done = new Set(db.attendanceFor(new Date()).filter(r => r.status !== 'absent').map(r => r.memberId));
    const elig = db.members().filter(m => ['active', 'expiring'].includes(db.statusOf(m)) && !done.has(m.id));
    PF.modal({
      title: 'Record check-in', html: elig.length ? `<div class="field"><label>Member</label><select class="select" id="cm">${PF.opts(elig.map(m => ({ value: m.id, label: `${m.name} · ${m.id}` })))}</select><span class="hint">Only members with a valid plan who haven't checked in today are listed.</span></div>` : `<div class="empty compact"><span>Everyone with a valid plan has already checked in today.</span></div>`,
      foot: elig.length ? [{ label: 'Cancel' }, { label: 'Check in', cls: 'btn-gold', icon: 'check', onClick: (c, el) => { const id = $('#cm', el).value; db.checkIn(id, 'in'); PF.toast(db.member(id).name + ' checked in'); } }] : [{ label: 'Close' }]
    });
  }

  const redraw = () => { stats(); list(); trend(); };
  PF.$$('#chips .chip').forEach(b => b.onclick = () => { filter = b.dataset.f; page = 1; PF.$$('#chips .chip').forEach(x => x.classList.toggle('active', x === b)); list(); });
  $('#date').onchange = e => { if (e.target.value) { date = e.target.value; page = 1; list(); } };
  PF.$$('#mode button').forEach(b => b.onclick = () => { mode = b.dataset.m; PF.$$('#mode button').forEach(x => x.classList.toggle('active', x === b)); trend(); });
  $('#chk').onclick = checkInModal;
  $('#exp').onclick = () => { const r = db.attendanceFor(day(date)); PF.csv(`attendance-${date}.csv`, [['Member ID', 'Name', 'Time in', 'Status', 'Date'], ...r.map(x => { const m = db.member(x.memberId); return [m.id, m.name, x.at ? fmtTime(x.at) : '', PF.statusLabel(x.status), date]; })]); PF.toast('Report exported'); };
  document.addEventListener('pf:data', () => { if (!document.querySelector('.modal-back')) redraw(); });
  redraw();
  if (location.hash === '#checkin') checkInModal();
});
