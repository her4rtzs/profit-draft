/* Settings (Owner only) */
PF.ready(() => {
  const { esc, peso } = PF, db = PF.db, $ = PF.$, root = $('#content');
  const SECS = [['appearance', 'Appearance', 'sliders'], ['gym', 'Gym details', 'building'], ['plans', 'Plans & pricing', 'tag'], ['notifications', 'Notifications', 'bell'], ['access', 'Roles & demo', 'shield'], ['data', 'Data', 'database']];
  let sec = SECS.some(s => s[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'appearance';
  root.insertAdjacentHTML('beforeend', `<div class="grid settings-layout" style="grid-template-columns:230px minmax(0,1fr);align-items:start"><nav class="settings-nav card card-pad" style="padding:10px" id="snav" aria-label="Settings sections">${SECS.map(s => `<a href="#${s[0]}" data-s="${s[0]}">${PF.icon(s[2])}${s[1]}</a>`).join('')}</nav><div id="panel"></div></div>`);
  const row = (t, d, ctl) => `<div class="set-row"><div class="txt"><b>${t}</b><span>${d}</span></div>${ctl}</div>`;
  const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label>`;
  const card = (t, d, body) => `<article class="card card-pad"><div class="card-head"><div><h2>${t}</h2><p>${d}</p></div></div>${body}</article>`;

  const panels = {
    appearance() {
      const th = (() => { try { return localStorage.getItem('pf-theme') || 'light'; } catch (e) { return 'light'; } })(), ac = (() => { try { return localStorage.getItem('pf-accent') || 'gold'; } catch (e) { return 'gold'; } })();
      return card('Appearance', 'Saved on this device.', `${row('Theme', 'Light, dark, or follow your device.', `<div class="seg" id="theme">${['light', 'dark', 'system'].map(t => `<button data-t="${t}" class="${t === th ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>`)}
        ${row('Accent colour', 'Used for buttons, highlights and the active menu item.', `<div class="swatches" id="accent">${[['gold', '#e3ae2b'], ['ocean', '#2f8fe0'], ['emerald', '#12a57f'], ['indigo', '#6a5be2']].map(a => `<button class="swatch ${a[0] === ac ? 'active' : ''}" data-a="${a[0]}" style="background:${a[1]}" aria-label="${a[0]}" title="${a[0]}"></button>`).join('')}</div>`)}
        ${row('Compact sidebar', 'Show icons only to give pages more room.', sw('mini', document.body.classList.contains('mini')))}`);
    },
    gym() {
      const g = db.gym();
      return `<form id="gymForm" class="card card-pad" novalidate><div class="card-head"><div><h2>Gym details</h2><p>Shown in the sidebar, on receipts and to members.</p></div></div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap"><img id="logoPrev" class="brand-logo" style="width:64px;height:64px" src="${esc(g.logo || PF.assetBase + 'img/logo.jpg')}" alt=""><div><label class="btn btn-sm" for="logoFile" style="cursor:pointer">${PF.icon('upload')}Change logo</label> <button type="button" class="btn btn-sm btn-ghost" id="logoRm">Use default</button><input id="logoFile" type="file" accept="image/jpeg,image/png,image/webp" class="sr"></div></div>
        <div class="form-grid"><div class="field"><label>Gym name</label><input class="input" id="gName" value="${esc(g.name)}"></div><div class="field"><label>Tagline</label><input class="input" id="gTag" value="${esc(g.tagline)}"></div><div class="field"><label>Phone</label><input class="input" id="gPhone" value="${esc(g.phone)}"></div><div class="field"><label>Email</label><input class="input" id="gEmail" type="email" value="${esc(g.email)}"></div><div class="field full"><label>Address</label><input class="input" id="gAddr" value="${esc(g.address)}"></div>
        ${g.hours.map((h, i) => `<div class="field"><label>${esc(h[0])}</label><input class="input" data-h="${i}" value="${esc(h[1])}"></div>`).join('')}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-gold" type="submit">${PF.icon('check')}Save gym details</button></div></form>`;
    },
    plans() {
      return `<form id="planForm" class="card card-pad" novalidate><div class="card-head"><div><h2>Plans & pricing</h2><p>Used by enrollment, renewals and the payment form. Prices are in pesos.</p></div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Plan</th><th>Price (₱)</th><th>Duration (days)</th><th>Offered</th></tr></thead><tbody>${db.plans().map((p, i) => `<tr><td class="cell-first"><b>${esc(p.name)}</b></td><td data-label="Price"><input class="input" style="width:130px" type="number" min="0" step="1" data-i="${i}" data-k="price" value="${p.price}"></td><td data-label="Days"><input class="input" style="width:110px" type="number" min="1" data-i="${i}" data-k="days" value="${p.days}"></td><td data-label="Offered">${sw('pa' + i, p.active)}</td></tr>`).join('')}</tbody></table></div><p class="hint muted" style="margin-top:6px">Changing a price does not change past payments.</p><div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-gold" type="submit">${PF.icon('check')}Save plans</button></div></form>`;
    },
    notifications() {
      const p = db.prefs(), items = [['newMember', 'New members', 'When someone is enrolled'], ['payment', 'Payments received', 'Desk and online payments'], ['failed', 'Failed payments', 'Declined or failed online payments'], ['expiring', 'Memberships expiring', 'A heads-up 7 days before expiry'], ['trainer', 'Trainer requests', 'When a member asks for a trainer'], ['system', 'System updates', 'Maintenance and release notes'], ['daily', 'Daily summary email', 'Collections and check-ins each evening']];
      return card('Notifications', 'Choose what shows up in your bell.', items.map(i => row(i[1], i[2], sw('n_' + i[0], p[i[0]]))).join(''));
    },
    access() {
      const r = db.profile().role;
      return card('Roles & demo mode', 'Real permissions are enforced by the server; this only previews what each role sees in the menu.', `${row('Preview the portal as', 'Owner sees everything. Cashier loses reports and settings. Trainer sees members and attendance.', `<select class="select" id="role" style="width:160px">${PF.opts(['Owner', 'Cashier', 'Trainer'], r)}</select>`)}<div class="notice" style="margin-top:12px">${PF.icon('info')}<span>Switching to Cashier or Trainer will hide Settings from the menu. Come back via the URL <b>settings.html#access</b>, or reset demo data.</span></div>`);
    },
    data() {
      return card('Data', 'This build runs on demo data stored in your browser.', `${row('Reset demo data', 'Restore the sample members, payments and announcements.', `<button class="btn btn-danger" id="reset">${PF.icon('refresh')}Reset</button>`)}${row('Export members', 'Download every member as a CSV file.', `<button class="btn" id="expM">${PF.icon('download')}Export CSV</button>`)}`);
    }
  };
  function bind() {
    if (sec === 'appearance') {
      PF.$$('#theme button').forEach(b => b.onclick = () => { PF.setTheme(b.dataset.t); show(); });
      PF.$$('#accent .swatch').forEach(b => b.onclick = () => { PF.setAccent(b.dataset.a); show(); });
      $('#mini').onchange = e => { document.body.classList.toggle('mini', e.target.checked); try { localStorage.setItem('pf-mini', e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } };
    }
    if (sec === 'gym') {
      let logo = db.gym().logo;
      $('#logoFile').onchange = async e => { try { logo = await PF.readImage(e.target.files[0], 256); $('#logoPrev').src = logo; } catch (err) { PF.toast(err.message, 'err'); } e.target.value = ''; };
      $('#logoRm').onclick = () => { logo = ''; $('#logoPrev').src = PF.assetBase + 'img/logo.jpg'; };
      $('#gymForm').onsubmit = e => { e.preventDefault(); if (!$('#gName').value.trim()) { $('#gName').classList.add('is-invalid'); return; } const hours = db.gym().hours.map((h, i) => [h[0], $(`[data-h="${i}"]`).value.trim()]); db.saveGym({ name: $('#gName').value.trim(), tagline: $('#gTag').value.trim(), phone: $('#gPhone').value.trim(), email: $('#gEmail').value.trim(), address: $('#gAddr').value.trim(), hours, logo }); PF.toast('Gym details saved'); setTimeout(() => location.reload(), 500); };
    }
    if (sec === 'plans') $('#planForm').onsubmit = e => {
      e.preventDefault(); const plans = db.plans().map(p => ({ ...p })); let ok = true;
      PF.$$('#planForm input[data-k]').forEach(i => { const v = +i.value; if (!(v >= (i.dataset.k === 'days' ? 1 : 0))) { i.classList.add('is-invalid'); ok = false; } else { i.classList.remove('is-invalid'); plans[+i.dataset.i][i.dataset.k] = v; } });
      plans.forEach((p, i) => p.active = $('#pa' + i).checked);
      if (!ok) { PF.toast('Check the highlighted values.', 'err'); return; }
      if (!plans.some(p => p.active)) { PF.toast('Keep at least one plan offered.', 'err'); return; }
      db.savePlans(plans); PF.toast('Plans saved');
    };
    if (sec === 'notifications') PF.$$('[id^="n_"]').forEach(c => c.onchange = () => { db.savePrefs({ [c.id.slice(2)]: c.checked }); PF.toast('Preference saved'); });
    if (sec === 'access') $('#role').onchange = e => { db.saveProfile({ role: e.target.value }); PF.toast('Previewing as ' + e.target.value); setTimeout(() => { if (e.target.value === 'Owner') location.reload(); else location.href = 'index.html'; }, 500); };
    if (sec === 'data') {
      $('#reset').onclick = async () => { if (await PF.confirm({ title: 'Reset demo data?', message: 'All changes you made in this browser will be replaced with fresh sample data.', confirm: 'Reset', danger: true })) { db.reset(); PF.toast('Demo data restored'); setTimeout(() => location.reload(), 500); } };
      $('#expM').onclick = () => { PF.csv('members.csv', [['ID', 'Name', 'Email', 'Phone', 'Plan', 'Status', 'Start', 'Expires'], ...db.members().map(m => [m.id, m.name, m.email, m.phone, db.planOf(m.plan).name, PF.statusLabel(db.statusOf(m)), PF.fmtDate(m.start), PF.fmtDate(m.end)])]); };
    }
  }
  function show() { PF.$$('#snav a').forEach(a => a.classList.toggle('active', a.dataset.s === sec)); $('#panel').innerHTML = panels[sec](); bind(); }
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (panels[h]) { sec = h; show(); } });
  show();
});
