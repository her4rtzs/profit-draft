/* My profile — view/edit own details, photo, password */
PF.ready(() => {
  const { esc } = PF, db = PF.db, $ = PF.$, root = $('#content');
  let photo = db.profile().photo;
  const me = db.profile();
  root.insertAdjacentHTML('beforeend', `<section class="grid g-prof">
    <form class="card card-pad" id="pf" novalidate><div class="card-head"><div><h2>Profile details</h2><p>Shown in the sidebar, top bar and on records you create.</p></div></div>
      <div style="display:flex;gap:18px;align-items:center;margin-bottom:18px;flex-wrap:wrap"><span id="av"></span><div><label class="btn btn-sm" for="file" style="cursor:pointer">${PF.icon('camera')}Upload photo</label> <button type="button" class="btn btn-sm btn-ghost" id="rm" ${photo ? '' : 'hidden'}>Remove</button><input id="file" type="file" accept="image/jpeg,image/png,image/webp" class="sr"><div class="hint muted" style="margin-top:6px">JPEG, PNG or WebP, up to 2 MB</div></div></div>
      <div class="form-grid"><div class="field"><label>Full name <span class="req">*</span></label><input class="input" id="name" value="${esc(me.name)}"><span class="err" hidden></span></div>
      <div class="field"><label>Role</label><input class="input" value="${esc(me.role)}" disabled><span class="hint">Roles are assigned by the owner.</span></div>
      <div class="field"><label>Email <span class="req">*</span></label><input class="input" id="email" type="email" value="${esc(me.email)}"><span class="err" hidden></span></div>
      <div class="field"><label>Phone</label><input class="input" id="phone" value="${esc(me.phone)}"></div>
      <div class="field full"><label>Short bio</label><textarea class="textarea" id="bio" maxlength="240">${esc(me.bio)}</textarea></div></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button type="button" class="btn" id="reset">Discard changes</button><button class="btn btn-gold" type="submit">${PF.icon('check')}Save profile</button></div></form>
    <div class="grid" style="align-content:start"><article class="card card-pad"><div class="card-head"><h3>Account</h3></div><div class="kv"><div><span>Role</span><b>${esc(me.role)}</b></div><div><span>Staff since</span><b>${PF.fmtDate(me.joined)}</b></div><div><span>Email</span><b>${esc(me.email)}</b></div></div></article>
    <form class="card card-pad" id="pw" novalidate><div class="card-head"><div><h3>Change password</h3><p>Use at least 8 characters with a number.</p></div></div><div class="grid" style="gap:12px"><div class="field"><label>Current password</label><input class="input" id="cur" type="password" autocomplete="current-password"></div><div class="field"><label>New password</label><input class="input" id="nw" type="password" autocomplete="new-password"><span class="err" hidden></span></div><div class="field"><label>Confirm new password</label><input class="input" id="cf" type="password" autocomplete="new-password"><span class="err" hidden></span></div></div><button class="btn btn-block" style="margin-top:14px" type="submit">${PF.icon('lock')}Update password</button></form></div></section>`);
  const av = () => $('#av').innerHTML = photo ? `<span class="avatar lg"><img src="${photo}" alt=""></span>` : PF.avatar($('#name').value || me.name, 'lg');
  av();
  const bad = (el, msg) => { el.classList.add('is-invalid'); const e = el.parentElement.querySelector('.err'); if (e) { e.textContent = msg; e.hidden = false; } return false; };
  root.addEventListener('input', e => { e.target.classList.remove('is-invalid'); const er = e.target.parentElement.querySelector('.err'); if (er) er.hidden = true; });
  $('#name').addEventListener('input', () => { if (!photo) av(); });
  $('#file').onchange = async e => { try { photo = await PF.readImage(e.target.files[0], 320); av(); $('#rm').hidden = false; } catch (err) { PF.toast(err.message, 'err'); } e.target.value = ''; };
  $('#rm').onclick = () => { photo = ''; av(); $('#rm').hidden = true; };
  $('#reset').onclick = () => location.reload();
  $('#pf').onsubmit = e => {
    e.preventDefault(); let ok = true;
    if ($('#name').value.trim().length < 2) ok = bad($('#name'), 'Enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($('#email').value.trim())) ok = bad($('#email'), 'Enter a valid email.');
    if (!ok) return;
    // API: PATCH /staff/me/ (to add) — currently saved in the browser only
    db.saveProfile({ name: $('#name').value.trim(), email: $('#email').value.trim(), phone: $('#phone').value.trim(), bio: $('#bio').value.trim(), photo });
    PF.toast('Profile saved'); setTimeout(() => location.reload(), 500);
  };
  $('#pw').onsubmit = e => {
    e.preventDefault(); let ok = true; const nw = $('#nw').value;
    if (!$('#cur').value) ok = bad($('#cur'), '');
    if (nw.length < 8 || !/\d/.test(nw)) ok = bad($('#nw'), 'At least 8 characters including a number.');
    if ($('#cf').value !== nw) ok = bad($('#cf'), 'Passwords do not match.');
    if (!ok) return;
    // API: POST /auth/change-password/ {current_password, new_password}
    PF.toast('Password updated (demo — wire to /auth/change-password)'); $('#pw').reset();
  };
});
