/* Notifications */
PF.ready(() => {
  const db = PF.db, $ = PF.$, root = $('#content');
  let filter = 'all';
  root.insertAdjacentHTML('beforeend', `<div class="card"><div class="toolbar"><div class="chips" id="chips">${[['all', 'All'], ['system', 'System'], ['payments', 'Payments'], ['members', 'Members']].map(c => `<button class="chip ${c[0] === 'all' ? 'active' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}</div><span class="grow"></span><button class="btn" id="read">${PF.icon('check')}Mark all read</button><button class="btn btn-danger" id="clear">${PF.icon('trash')}Clear all</button></div></div><article class="card" id="box" style="overflow:hidden"></article>`);
  function draw() {
    const all = db.notifications(), rows = all.filter(n => filter === 'all' || n.type === filter);
    PF.$$('#chips .chip').forEach(c => { const f = c.dataset.f, n = f === 'all' ? all.filter(x => !x.read).length : all.filter(x => x.type === f && !x.read).length; c.textContent = { all: 'All', system: 'System', payments: 'Payments', members: 'Members' }[f] + (n ? ` (${n})` : ''); });
    $('#box').innerHTML = rows.length ? `<div class="nlist" style="max-height:none">${rows.map(PF.notifItem).join('')}</div>` : `<div class="empty">${PF.icon('bell')}<h3>You're all caught up</h3><span>New activity will appear here.</span></div>`;
    PF.$$('#box .nitem').forEach(b => b.onclick = () => { db.markRead(b.dataset.id); if (b.dataset.href) location.href = b.dataset.href; });
  }
  PF.$$('#chips .chip').forEach(b => b.onclick = () => { filter = b.dataset.f; PF.$$('#chips .chip').forEach(x => x.classList.toggle('active', x === b)); draw(); });
  $('#read').onclick = () => { db.markAllRead(); PF.toast('All marked as read'); };
  $('#clear').onclick = async () => { if (await PF.confirm({ title: 'Clear all notifications?', message: 'They will be removed from this list.', confirm: 'Clear all', danger: true })) db.clearNotifications(); };
  document.addEventListener('pf:data', draw);
  draw();
});
