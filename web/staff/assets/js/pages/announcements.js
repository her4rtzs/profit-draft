/* Announcements */
PF.ready(() => {
  const { esc } = PF, db = PF.db, $ = PF.$, root = $('#content');
  let filter = 'all';
  root.insertAdjacentHTML('beforeend', `<section class="grid g4" id="stats"></section>
    <div class="card"><div class="toolbar"><div class="chips" id="chips">${[['all', 'All'], ['draft', 'Drafts'], ['published', 'Published'], ['archived', 'Archived']].map(c => `<button class="chip ${c[0] === 'all' ? 'active' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}</div><span class="grow"></span><button class="btn btn-gold" id="new">${PF.icon('plus')}New announcement</button></div></div>
    <div id="list" class="grid" style="gap:14px"></div>`);
  const AUD = { Everyone: 'blue', Members: 'green', Trainers: 'purple' };
  function stats() {
    const all = db.announcements(), now = new Date(), ms = new Date(now.getFullYear(), now.getMonth(), 1), pub = all.filter(a => a.status === 'published');
    const reach = db.members().length + db.trainers().length;
    $('#stats').innerHTML = [
      { label: 'Total announcements', value: all.length, icon: 'megaphone', tone: 'blue', sub: 'all statuses' },
      { label: 'Published this month', value: pub.filter(a => new Date(a.at) >= ms).length, icon: 'calendar-check', tone: 'green', sub: `${pub.length} live now` },
      { label: 'People who can see them', value: reach, icon: 'users', tone: 'purple', sub: 'members + trainers' },
      { label: 'Drafts', value: all.filter(a => a.status === 'draft').length, icon: 'file-text', tone: 'gold', sub: 'need your attention' }].map(PF.statTile).join('');
  }
  function list() {
    const rows = db.announcements().filter(a => filter === 'all' || a.status === filter);
    if (!rows.length) { $('#list').innerHTML = `<div class="card"><div class="empty">${PF.art.megaphone()}<h3>No announcements yet</h3><span>Stay connected with your members and trainers. Create your first announcement to get started.</span><button class="btn btn-gold" id="first" style="margin-top:8px">${PF.icon('plus')}Create your first announcement</button></div></div>`; $('#first').onclick = () => edit(); return; }
    $('#list').innerHTML = rows.map(a => `<article class="ann"><span class="stat-ico tone-${AUD[a.audience] === 'green' ? 'green' : AUD[a.audience] === 'purple' ? 'purple' : 'blue'}">${PF.icon('megaphone')}</span><div style="flex:1;min-width:0"><div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap"><h3 style="flex:1;min-width:180px">${esc(a.title)}</h3>${PF.pill(a.status)}</div><p>${esc(a.message)}</p><div class="meta"><span class="pill plain ${AUD[a.audience] || 'blue'}">For ${esc(a.audience)}</span><span>${esc(a.author)} · ${PF.fmtDate(a.at)}</span></div></div><button class="row-menu" data-id="${a.id}" aria-label="Actions for ${esc(a.title)}">${PF.icon('more-v')}</button></article>`).join('');
    PF.$$('#list .row-menu').forEach(b => b.onclick = () => { const a = db.announcements().find(x => x.id === b.dataset.id); PF.menu(b, [{ label: 'Edit', icon: 'pencil', onClick: () => edit(a) }, ...(a.status !== 'published' ? [{ label: 'Publish', icon: 'send', onClick: () => { db.setAnnouncementStatus(a.id, 'published'); PF.toast('Published'); } }] : []), ...(a.status !== 'archived' ? [{ label: 'Archive', icon: 'archive', onClick: () => { db.setAnnouncementStatus(a.id, 'archived'); PF.toast('Archived'); } }] : []), 'hr', { label: 'Delete', icon: 'trash', danger: true, onClick: async () => { if (await PF.confirm({ title: 'Delete announcement?', message: 'This cannot be undone.', confirm: 'Delete', danger: true })) { db.removeAnnouncement(a.id); PF.toast('Deleted'); } } }]); });
  }
  function edit(a) {
    a = a || {};
    PF.modal({ title: a.id ? 'Edit announcement' : 'New announcement', html: `<div class="form-grid"><div class="field full"><label>Title <span class="req">*</span></label><input class="input" id="aT" maxlength="120" value="${esc(a.title || '')}"></div><div class="field full"><label>Message <span class="req">*</span></label><textarea class="textarea" id="aM" maxlength="600">${esc(a.message || '')}</textarea><span class="hint"><span id="cnt">0</span>/600</span></div><div class="field"><label>Audience</label><select class="select" id="aA">${PF.opts(['Everyone', 'Members', 'Trainers'], a.audience || 'Everyone')}</select></div></div>`,
      onOpen: el => { const c = () => $('#cnt', el).textContent = $('#aM', el).value.length; $('#aM', el).oninput = c; c(); },
      foot: [{ label: 'Cancel' }, { label: 'Save draft', onClick: (c, el) => save(el, 'draft', a) }, { label: 'Publish', cls: 'btn-gold', icon: 'send', onClick: (c, el) => save(el, 'published', a) }] });
  }
  function save(el, status, a) {
    const t = $('#aT', el), m = $('#aM', el); let ok = true;
    if (!t.value.trim()) { t.classList.add('is-invalid'); ok = false; } if (!m.value.trim()) { m.classList.add('is-invalid'); ok = false; }
    if (!ok) { PF.toast('Add a title and a message.', 'err'); return false; }
    db.saveAnnouncement({ id: a.id, title: t.value.trim(), message: m.value.trim(), audience: $('#aA', el).value, status, ...(status === 'published' ? { at: new Date().toISOString() } : {}) });
    PF.toast(status === 'published' ? 'Announcement published' : 'Draft saved');
  }
  PF.$$('#chips .chip').forEach(b => b.onclick = () => { filter = b.dataset.f; PF.$$('#chips .chip').forEach(x => x.classList.toggle('active', x === b)); list(); });
  $('#new').onclick = () => edit();
  document.addEventListener('pf:data', () => { stats(); list(); });
  stats(); list();
});
