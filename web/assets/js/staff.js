/* ProFit staff front end — shell (sidebar, top bar, bottom nav) and shared UI helpers. */
(function () {
  const PF = (window.PF = window.PF || {});
  const { esc, peso, initials, avatarColors, timeAgo } = PF;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  PF.$ = $; PF.$$ = $$;

  PF.config = {
    loginUrl: null,            // e.g. '../login.html' once this folder lives inside web/
    logoutEndpoint: null       // e.g. '/auth/logout' (POST) via ProFitAPI when wired
  };

  /* ---------- queue so page scripts can run after the shell exists ---------- */
  const queue = [];
  PF.ready = fn => (PF._built ? fn() : queue.push(fn));

  /* ---------- small UI helpers ---------- */
  PF.debounce = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  PF.avatar = (name, cls, photo) => {
    const [bg, fg] = avatarColors(name);
    return `<span class="avatar ${cls || ''}" style="--av-bg:${bg};--av-fg:${fg}">${photo ? `<img src="${esc(photo)}" alt="">` : esc(initials(name))}</span>`;
  };
  const STATUS = {
    active: ['green', 'Active'], expiring: ['amber', 'Expiring soon'], expired: ['red', 'Expired'], frozen: ['blue', 'Frozen'], cancelled: ['gray', 'Cancelled'], pending: ['amber', 'Pending'],
    completed: ['green', 'Completed'], failed: ['red', 'Failed'], voided: ['gray', 'Voided'], overdue: ['red', 'Overdue'],
    in: ['green', 'Checked in'], late: ['amber', 'Late'], absent: ['red', 'Absent'],
    published: ['green', 'Published'], draft: ['amber', 'Draft'], archived: ['gray', 'Archived'], leave: ['amber', 'On leave'], inactive: ['gray', 'Inactive'], approved: ['green', 'Approved'], declined: ['red', 'Declined']
  };
  PF.pill = s => { const [c, l] = STATUS[s] || ['gray', s]; return `<span class="pill ${c}">${esc(l)}</span>`; };
  PF.statusLabel = s => (STATUS[s] || [0, s])[1];
  PF.planTag = id => { const p = PF.db.planOf(id); return `<span class="plan ${esc(p.name)}">${esc(p.name)}</span>`; };
  PF.methodIcon = m => { const x = PF.db.methods().find(k => k.id === m); return PF.icon(x ? x.icon : 'wallet'); };
  PF.opts = (list, sel, ph) => (ph ? `<option value="">${esc(ph)}</option>` : '') + list.map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  PF.statTile = (o) => `<div class="card stat"><span class="stat-ico tone-${o.tone || 'gold'}">${PF.icon(o.icon)}</span><div class="stat-body"><div class="lbl">${esc(o.label)}</div><div class="val-row"><div class="val">${o.value}</div>${o.spark ? `<div class="spark">${PF.charts.spark(o.spark, o.sparkColor || 'var(--gold)')}</div>` : ''}</div><div class="sub">${o.trend ? `<span class="${o.trend.startsWith('-') || o.trend.startsWith('↓') ? 'down' : 'up'}">${PF.icon(o.trend.startsWith('-') || o.trend.startsWith('↓') ? 'arrow-down' : 'arrow-up', '')}${esc(o.trend.replace(/^[-↓↑+]/, ''))}</span> ` : ''}${esc(o.sub || '')}</div></div></div>`;
  PF.pageTabs = (tabs, active) => `<nav class="tabbar" aria-label="Section">${tabs.map(t => `<a class="tab ${t.id === active ? 'active' : ''}" href="${t.href}">${PF.icon(t.icon)}<span>${esc(t.label)}</span>${t.count != null ? `<span class="count">${t.count}</span>` : ''}</a>`).join('')}</nav>`;

  PF.toast = (msg, type) => {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const norm = (type === 'err' || type === 'error') ? 'err' : 'ok';
    const t = document.createElement('div');
    t.className = 'toast ' + norm;
    t.innerHTML = PF.icon(norm === 'err' ? 'alert-circle' : 'check-circle') + `<span>${esc(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, 3200);
  };

  PF.modal = opts => {
    const footItems = opts.foot || (opts.confirm || opts.onConfirm ? [
      { label: opts.cancel || 'Cancel' },
      { label: opts.confirm || 'Confirm', cls: opts.danger ? 'btn-danger' : 'btn-gold', onClick: (close, back) => opts.onConfirm ? opts.onConfirm(back, close) : true }
    ] : []);
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
      <div class="modal-head"><h3>${esc(opts.title)}</h3><button class="icon-btn x" type="button" aria-label="Close">${PF.icon('x')}</button></div>
      <div class="modal-body">${opts.html || opts.body || ''}</div>
      ${footItems.length ? `<div class="modal-foot">${footItems.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${b.icon ? PF.icon(b.icon) : ''}${esc(b.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    document.body.appendChild(back);
    const prev = opts.trigger || document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); if (opts.onClose) opts.onClose(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        const focusables = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', back).filter(el => !el.hidden && el.offsetParent !== null);
        if (!focusables.length) return;
        const firstEl = focusables[0], lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && (document.activeElement === firstEl || !back.contains(document.activeElement))) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && (document.activeElement === lastEl || !back.contains(document.activeElement))) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    $('.x', back).onclick = close;
    $$('.modal-foot .btn', back).forEach(btn => btn.onclick = async () => {
      const b = footItems[+btn.dataset.i];
      const r = b.onClick ? await b.onClick(close, back) : undefined;
      if (!b.keep && r !== false) close();
    });
    const first = $('input:not([type=hidden]),select,textarea', back) || $('.modal-foot .btn:last-child', back);
    if (first) setTimeout(() => first.focus(), 30);
    if (opts.onOpen) opts.onOpen(back, close);
    return { close, el: back };
  };
  PF.confirm = o => new Promise(res => {
    let done = false;
    PF.modal({
      title: o.title, html: `<p style="color:var(--text-2)">${esc(o.message || '')}</p>`,
      foot: [{ label: o.cancel || 'Cancel', onClick: () => { done = true; res(false); } }, { label: o.confirm || 'Confirm', cls: o.danger ? 'btn-danger' : 'btn-gold', onClick: () => { done = true; res(true); } }],
      onClose: () => { if (!done) res(false); }
    });
  });

  let openMenu = null;
  PF.closeMenu = () => { if (openMenu) { openMenu.remove(); openMenu = null; } };
  PF.menu = (anchor, items) => {
    PF.closeMenu();
    const m = document.createElement('div');
    m.className = 'menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map((it, i) => it === 'hr' ? '<hr>' : it.href ? `<a role="menuitem" href="${it.href}">${PF.icon(it.icon || 'info')}${esc(it.label)}</a>` : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${PF.icon(it.icon || 'info')}${esc(it.label)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    let left = r.right + window.scrollX - mw, top = r.bottom + window.scrollY + 6;
    if (left < 8) left = 8;
    if (r.bottom + mh > window.innerHeight - 8 && r.top - mh - 6 > 8) top = r.top + window.scrollY - mh - 6;
    m.style.left = left + 'px'; m.style.top = top + 'px';
    $$('button', m).forEach(b => b.onclick = e => { e.stopPropagation(); PF.closeMenu(); items[+b.dataset.i].onClick(); });
    openMenu = m;
    setTimeout(() => { const off = e => { if (!m.contains(e.target)) { PF.closeMenu(); document.removeEventListener('click', off, true); } }; document.addEventListener('click', off, true); }, 0);
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') PF.closeMenu(); });

  PF.pager = (el, o) => {
    const pages = Math.max(1, Math.ceil(o.total / o.size));
    const page = Math.min(o.page, pages);
    const from = o.total ? (page - 1) * o.size + 1 : 0, to = Math.min(o.total, page * o.size);
    const nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    el.innerHTML = `<span>Showing ${from}–${to} of ${o.total} ${esc(o.noun || 'records')}</span><div class="pages">
      <button type="button" aria-label="Previous page" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${PF.icon('chevron-left')}</button>
      ${nums.map(n => n === '…' ? '<span style="align-self:center">…</span>' : `<button type="button" data-p="${n}" class="${n === page ? 'active' : ''}">${n}</button>`).join('')}
      <button type="button" aria-label="Next page" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>${PF.icon('chevron-right')}</button></div>`;
    $$('button[data-p]', el).forEach(b => b.onclick = () => o.onPage(+b.dataset.p));
  };

  PF.csv = (name, rows) => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  PF.readImage = (file, max = 360) => new Promise((res, rej) => {
    if (!file) return rej(new Error('No file'));
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error('Use a JPEG, PNG or WebP image.'));
    if (file.size > 2 * 1024 * 1024) return rej(new Error('Image must be 2 MB or smaller.'));
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .85)); }; img.onerror = () => rej(new Error('Could not read that image.')); img.src = fr.result; };
    fr.onerror = () => rej(new Error('Could not read that file.')); fr.readAsDataURL(file);
  });

  /* ---------- illustrations (inline, so there are no image files to ship) ---------- */
  PF.art = {
    megaphone: () => `<svg class="art" viewBox="0 0 220 150" fill="none" aria-hidden="true"><ellipse cx="110" cy="132" rx="78" ry="9" fill="currentColor" opacity=".07"/><rect x="128" y="46" width="62" height="20" rx="10" fill="var(--card)" stroke="var(--line-strong)"/><circle cx="140" cy="56" r="5" fill="var(--green)"/><rect x="150" y="53" width="30" height="3" rx="1.5" fill="var(--line-strong)"/><rect x="128" y="74" width="62" height="20" rx="10" fill="var(--card)" stroke="var(--line-strong)"/><circle cx="140" cy="84" r="5" fill="var(--purple)"/><rect x="150" y="81" width="24" height="3" rx="1.5" fill="var(--line-strong)"/><path d="M42 82 112 50v66L42 100z" fill="var(--gold)"/><path d="M42 82 112 50v14L42 92z" fill="var(--gold-2)"/><rect x="28" y="78" width="20" height="26" rx="6" fill="#16233b"/><path d="M62 104l8 24h14l-6-22z" fill="#16233b"/><circle cx="150" cy="24" r="12" fill="var(--gold-soft)"/><path d="M150 18v7l4 3" stroke="var(--gold-3)" stroke-width="2" stroke-linecap="round"/><path d="M122 30l10-8M118 42l-13-3" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/></svg>`,
    receipt: () => `<svg class="art" viewBox="0 0 120 120" fill="none" aria-hidden="true" style="width:120px"><path d="M30 12h52a4 4 0 0 1 4 4v88l-8-5-8 5-8-5-8 5-8-5-8 5-8-5-4 3V16a4 4 0 0 1 4-4z" fill="var(--card)" stroke="var(--line-strong)" stroke-width="2"/><rect x="40" y="30" width="30" height="4" rx="2" fill="var(--line-strong)"/><rect x="40" y="42" width="38" height="4" rx="2" fill="var(--line-strong)"/><rect x="40" y="54" width="24" height="4" rx="2" fill="var(--line-strong)"/><circle cx="84" cy="84" r="16" fill="var(--gold)"/><path d="m76 84 6 6 10-12" stroke="#1b1300" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 36l4 4M104 22l-4 4M18 96l-4 2" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/></svg>`
  };

  /* ---------- charts (dependency-free SVG) ---------- */
  const nice = (max, ticks = 4) => { if (max <= 0) return ticks; const raw = max / ticks, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p; const step = ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => k >= n - 1e-9) || 10) * p; return step * ticks; };
  const compact = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(n));
  const tipAt = (host, html, x, y) => { let t = $('.chart-tip', host); if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; host.appendChild(t); } t.innerHTML = html; t.style.left = x + 'px'; t.style.top = y + 'px'; t.hidden = false; };
  const tipOff = host => { const t = $('.chart-tip', host); if (t) t.hidden = true; };
  PF.charts = {
    spark(values, color) {
      const w = 120, h = 40, max = Math.max(...values), min = Math.min(...values), rg = max - min || 1;
      const pts = values.map((v, i) => [i * (w / (values.length - 1)), h - 4 - ((v - min) / rg) * (h - 10)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
    },
    line(el, o) {
      const draw = () => {
        const W = Math.max(280, el.clientWidth || 600), H = o.height || 240, m = { l: 36, r: 12, t: 12, b: 28 };
        const all = o.series.flatMap(s => s.values), top = o.yMax || nice(Math.max(...all, 1) * 1.08), n = o.labels.length;
        const x = i => m.l + (n === 1 ? 0 : i * ((W - m.l - m.r) / (n - 1))), y = v => H - m.b - (v / top) * (H - m.t - m.b);
        const ticks = 4; let g = '';
        for (let i = 0; i <= ticks; i++) { const v = top / ticks * i, yy = y(v); g += `<line class="grid-l" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/><text x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${(o.fmtY || compact)(v)}</text>`; }
        const every = Math.ceil(n / Math.max(2, Math.floor((W - m.l) / 52)));
        const lastShown = Math.floor((n - 1) / every) * every, showLast = (n - 1) - lastShown >= Math.ceil(every * 0.7);
        const xl = o.labels.map((l, i) => i % every === 0 && (i !== lastShown || true) || (i === n - 1 && showLast) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>` : '').join('');
        const sm = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        let paths = '', dots = '';
        o.series.forEach((s, si) => {
          const pts = s.values.map((v, i) => [x(i), y(v)]);
          if (s.area !== false) paths += `<defs><linearGradient id="${el.id || 'c'}-g${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs><path d="${sm(pts)} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)}Z" fill="url(#${el.id || 'c'}-g${si})"/>`;
          paths += `<path d="${sm(pts)}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
          if (n <= 16) dots += pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="var(--card)" stroke="${s.color}" stroke-width="2"/>`).join('');
        });
        el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Line chart')}">${g}${xl}${paths}${dots}<line id="hl" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--line-strong)" stroke-dasharray="3 3" opacity="0"/><rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/></svg>`;
        const svg = $('svg', el), hl = $('#hl', svg);
        svg.addEventListener('mousemove', e => {
          const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) * (W / b.width);
          const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / ((W - m.l - m.r) / Math.max(1, n - 1)))));
          hl.setAttribute('x1', x(i)); hl.setAttribute('x2', x(i)); hl.setAttribute('opacity', 1);
          tipAt(el, `<b>${esc(o.labels[i])}</b><br>` + o.series.map(s => `<span style="color:${s.color}">●</span> ${esc(s.name)}: ${(o.fmtTip || (v => v))(s.values[i])}`).join('<br>'), x(i) * (b.width / W), Math.min(...o.series.map(s => y(s.values[i]))) * (b.height / H));
        });
        svg.addEventListener('mouseleave', () => { hl.setAttribute('opacity', 0); tipOff(el); });
      };
      draw(); if (!el._ro) { let w = el.clientWidth; el._ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } }); el._ro.observe(el); }
      el._redraw = draw;
    },
    bars(el, o) {
      const draw = () => {
        const W = Math.max(280, el.clientWidth || 600), H = o.height || 250, m = { l: 44, r: 8, t: 12, b: 28 }, n = o.labels.length;
        const top = nice(Math.max(...o.values, 1) * 1.05), y = v => H - m.b - (v / top) * (H - m.t - m.b);
        const slot = (W - m.l - m.r) / n, bw = Math.min(26, slot * 0.58);
        let g = ''; for (let i = 0; i <= 4; i++) { const v = top / 4 * i, yy = y(v); g += `<line class="grid-l" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/><text x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${(o.fmtY || (v => '₱' + compact(v)))(v)}</text>`; }
        const hi = o.highlight == null ? n - 1 : o.highlight;
        let bars = '', xl = '';
        o.values.forEach((v, i) => {
          const cx = m.l + slot * i + slot / 2, h = Math.max(v ? 3 : 0, (H - m.b) - y(v)), rr = Math.min(7, bw / 2);
          const fill = i === hi ? 'var(--gold)' : '#12a07e';
          if (v > 0) bars += `<path data-i="${i}" d="M${cx - bw / 2} ${H - m.b}V${H - m.b - h + rr}a${rr} ${rr} 0 0 1 ${rr} -${rr}h${bw - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${H - m.b}Z" fill="${fill}"/>`;
          xl += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(o.labels[i])}</text>`;
        });
        el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Bar chart')}"><defs><linearGradient id="bteal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19b894"/><stop offset="1" stop-color="#0d8a6d"/></linearGradient><linearGradient id="bgold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold-2)"/><stop offset="1" stop-color="var(--gold-3)"/></linearGradient></defs>${g}${bars}${xl}</svg>`;
        const svg = $('svg', el);
        $$('path[data-i]', svg).forEach(p => {
          p.style.transition = 'opacity .15s'; p.style.cursor = 'default';
          p.addEventListener('mousemove', () => { const i = +p.dataset.i, b = svg.getBoundingClientRect(), cx = m.l + slot * i + slot / 2; $$('path[data-i]', svg).forEach(q => q.style.opacity = q === p ? 1 : .55); tipAt(el, `<b>${esc(o.labels[i])}</b><br>${(o.fmtTip || peso)(o.values[i])}`, cx * (b.width / W), y(o.values[i]) * (b.height / H)); });
          p.addEventListener('mouseleave', () => { $$('path[data-i]', svg).forEach(q => q.style.opacity = 1); tipOff(el); });
        });
      };
      draw(); if (!el._ro) { let w = el.clientWidth; el._ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } }); el._ro.observe(el); }
    },
    donut(el, o) {
      const total = o.items.reduce((s, i) => s + i.value, 0), R = 62, C = 2 * Math.PI * R, gap = total && o.items.filter(i => i.value).length > 1 ? 3 : 0;
      let off = 0, segs = '';
      o.items.forEach(it => { if (!it.value) return; const len = (it.value / total) * C; segs += `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${it.color}" stroke-width="20" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)" stroke-linecap="butt"><title>${esc(it.label)}: ${it.value}</title></circle>`; off += len; });
      const fmtV = o.fmt || (v => v);
      el.innerHTML = `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(o.label || 'Donut chart')}"><circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--line)" stroke-width="20"/>${segs}</svg><div class="mid"><b style="${String(o.center ? o.center.big : total).length > 6 ? 'font-size:20px' : ''}">${o.center ? o.center.big : total}</b><span>${esc(o.center ? o.center.small : '')}</span></div></div>
        <div class="dl">${o.items.filter(it => it.value || !it.optional).map(it => `<div class="dl-row"><i style="background:${it.color}"></i>${esc(it.label)}<span class="v">${fmtV(it.value)}${total ? ` <span class="muted">(${Math.round(it.value / total * 100)}%)</span>` : ''}</span></div>`).join('')}</div></div>`;
    }
  };
  PF.COLORS = { teal: '#10a37f', gold: '#e3ae2b', red: '#e5484d', blue: '#3b82f6', purple: '#8b5cf6', orange: '#f59e0b' };

  /* ---------- shell ---------- */
  const isTrainerContext = () => {
    if (document.body.dataset.portal === 'trainer') return true;
    if (location.pathname.toLowerCase().includes('/trainer/')) return true;
    return false;
  };

  const STAFF_NAV = [
    { label: 'WORKSPACE', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'home', href: 'index.html' },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone', href: 'announcements.html', roles: ['Owner', 'Cashier'] }] },
    { label: 'MEMBERSHIP', items: [
      { id: 'members', label: 'Member List', icon: 'users', href: 'members.html' },
      { id: 'attendance', label: 'Attendance', icon: 'calendar-check', href: 'attendance.html' },
      { id: 'trainers', label: 'Trainers', icon: 'dumbbell', href: 'trainers.html', roles: ['Owner', 'Cashier'] }] },
    { label: 'FINANCE', items: [
      { id: 'payments', label: 'Payments & Billing', icon: 'wallet', href: 'payments.html', roles: ['Owner', 'Cashier'] },
      { id: 'reports', label: 'Financial Reports', icon: 'chart', href: 'reports.html', roles: ['Owner'] }] }
  ];

  const TRAINER_NAV = [
    { label: 'WORKSPACE', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'home', href: 'index.html' },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone', href: 'announcements.html' }] },
    { label: 'TRAINING', items: [
      { id: 'members', label: 'My Members', icon: 'users', href: 'members.html' },
      { id: 'attendance', label: 'Attendance', icon: 'calendar-check', href: 'attendance.html' },
      { id: 'schedule', label: 'My Schedule', icon: 'calendar', href: 'schedule.html' }] },
    { label: 'ACCOUNT', items: [
      { id: 'notifications', label: 'Notifications', icon: 'bell', href: 'notifications.html' },
      { id: 'profile', label: 'My Profile', icon: 'user', href: 'profile.html' },
      { id: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html' }] }
  ];

  const getNav = () => (isTrainerContext() ? TRAINER_NAV : STAFF_NAV);

  // Pages reached from inside another page (tabs, bell, account menu) highlight their parent in the sidebar.
  const PARENT = { subscriptions: 'payments', transactions: 'payments' };
  // Pages that are not in the sidebar but still need to be searchable / linkable.
  const EXTRA_PAGES = [
    { id: 'subscriptions', label: 'Subscription Monitor', icon: 'refresh', href: 'subscriptions.html', roles: ['Owner', 'Cashier'] },
    { id: 'transactions', label: 'Payment History', icon: 'receipt', href: 'transactions.html', roles: ['Owner'] },
    { id: 'notifications', label: 'Notifications', icon: 'bell', href: 'notifications.html' },
    { id: 'profile', label: 'My Profile', icon: 'user', href: 'profile.html' },
    { id: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html', roles: ['Owner'] }
  ];
  const role = () => {
    if (!isTrainerContext()) {
      const r = (PF.db ? PF.db.profile().role : 'Owner') || 'Owner';
      return (r === 'Personal Trainer' || r === 'TRAINER') ? 'Owner' : r;
    }
    return (PF.db ? PF.db.profile().role : 'Personal Trainer') || 'Personal Trainer';
  };
  const allowed = it => !it.roles || it.roles.includes(role()) || role() === 'Admin' || role() === 'Administrator';
  PF.can = roles => !roles || roles.includes(role()) || role() === 'Admin' || role() === 'Administrator';
  const currentId = () => { const p = document.body.dataset.page; return PARENT[p] || p; };

  function sidebarHTML() {
    const gym = PF.db.gym(), me = PF.db.profile(), cur = currentId();
    const navItems = getNav();
    const isTrainer = isTrainerContext();
    const homeHref = 'index.html';
    const tagline = isTrainer ? 'TRAINER WORKSPACE' : (gym.tagline || 'FUNCTIONAL FITNESS');
    const displayRole = isTrainer ? 'Personal Trainer' : (me.role || 'Staff');
    return `<div class="sidebar-brand-row brand"><a class="imgbrand" href="${homeHref}" style="display:flex;align-items:center;gap:12px;min-width:0" aria-label="${esc(gym.name)} dashboard"><span class="image"><img class="brand-logo" src="${esc(gym.logo || PF.assetBase + 'img/logo.jpg')}" alt=""></span><span class="headertxt brand-txt"><strong>${esc(gym.name)}</strong><small>${esc(tagline)}</small></span></a></div>
      <div class="sidebar-scroll side-scroll" aria-label="Main navigation">${navItems.map(g => { const items = g.items.filter(allowed); return items.length ? `<section class="nav-group"><p class="nav-group-label nav-label">${g.label}</p><ul class="menulist nav-list">${items.map(it => { const b = it.badge ? it.badge() : 0; return `<li><a class="nav-link ${it.id === cur ? 'active' : ''}" href="${it.href}" title="${esc(it.label)}" ${it.id === cur ? 'aria-current="page"' : ''}><span class="icon">${PF.icon(it.icon)}</span><span class="text nav-text">${esc(it.label)}</span>${b ? `<span class="nav-count" data-badge="${it.id}">${b}</span>` : ''}</a></li>`; }).join('')}</ul></section>` : ''; }).join('')}</div>
      <div class="sidebar-foot side-foot"><div class="sidebar-account"><div class="sidebar-user side-user"><span class="sidebar-avatar">${PF.avatar(me.name, 'md', me.photo)}</span><div class="sidebar-user-copy who"><strong>${esc(me.name)}</strong><small>${esc(displayRole)}</small></div><button class="account-menu-toggle icon-btn" id="accountBtn" type="button" aria-haspopup="menu" aria-label="Account menu">${PF.icon('more-v')}</button></div></div></div>`;
  }

  function topbarHTML() {
    const me = PF.db.profile(), n = PF.db.unread();
    const back = document.body.dataset.page === 'dashboard' ? '' : `<button class="icon-btn" id="backBtn" type="button" aria-label="Go back">${PF.icon('chevron-left')}</button>`;
    return `<div class="t-left"><button class="icon-btn t-menu" id="menuBtn" type="button" aria-label="Open navigation">${PF.icon('menu')}</button>${back}</div><div class="t-spacer"></div>
      <button class="icon-btn" id="themeBtn" type="button" aria-label="Toggle dark mode"></button>
      <div style="position:relative"><button class="icon-btn" id="bellBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Notifications">${PF.icon('bell')}<span class="badge-dot" id="bellBadge" ${n ? '' : 'hidden'}>${n}</span></button><section class="npanel" id="npanel" hidden aria-label="Notifications"></section></div>
      <a class="avatar-btn" href="profile.html" aria-label="My profile" title="My profile">${PF.avatar(me.name, 'md', me.photo)}</a>`;
  }

  function bottomHTML() {
    const cur = document.body.dataset.page;
    const isTrainer = isTrainerContext();
    const items = isTrainer ? [
      ['dashboard', 'Home', 'home', 'index.html'],
      ['members', 'Members', 'users', 'members.html'],
      ['attendance', 'Attendance', 'calendar-check', 'attendance.html'],
      ['schedule', 'Schedule', 'calendar', 'schedule.html'],
      ['profile', 'Profile', 'user', 'profile.html']
    ] : [
      ['dashboard', 'Home', 'home', 'index.html'],
      ['members', 'Members', 'users', 'members.html'],
      ['attendance', 'Attendance', 'calendar-check', 'attendance.html'],
      ['announcements', 'Notices', 'megaphone', 'announcements.html'],
      ['profile', 'Profile', 'user', 'profile.html']
    ];
    return items.map(i => `<a href="${i[3]}" class="${i[0] === cur ? 'active' : ''}" ${i[0] === cur ? 'aria-current="page"' : ''}>${PF.icon(i[2])}<span>${i[1]}</span></a>`).join('');
  }

  function pageHead() {
    const b = document.body.dataset;
    if (b.head === 'none') return '';
    const tag = b.tagline === 'off' ? '' : '<div class="tagline" aria-hidden="true">Stronger<br>Healthier<br>Happier</div>';
    return `<div class="page-head"><span class="tile">${PF.icon(b.icon || 'home')}</span><div><div class="eyebrow">${esc(b.eyebrow || '')}</div><h1>${esc(b.title || '')}</h1>${b.sub ? `<p>${esc(b.sub)}</p>` : ''}</div>${tag}</div>`;
  }

  function renderNotifPanel() {
    const p = $('#npanel'); if (!p) return;
    const list = PF.db.notifications().slice(0, 6);
    p.innerHTML = `<div class="npanel-head"><div><strong>Notifications</strong><div class="muted">${PF.db.unread() ? PF.db.unread() + ' unread' : 'You\'re all caught up'}</div></div><button class="link-btn" id="markAll" type="button">Mark all read</button></div>
      <div class="nlist">${list.length ? list.map(PF.notifItem).join('') : '<div class="empty compact">' + PF.icon('bell') + '<span>No notifications yet</span></div>'}</div>
      <div class="npanel-foot"><a class="link-btn" href="notifications.html">View all notifications</a></div>`;
    $('#markAll', p).onclick = () => PF.db.markAllRead();
    $$('.nitem', p).forEach(b => b.onclick = () => { PF.db.markRead(b.dataset.id); if (b.dataset.href) location.href = b.dataset.href; });
  }
  PF.notifItem = n => `<button class="nitem ${n.read ? '' : 'unread'}" type="button" data-id="${esc(n.id)}" data-href="${esc(n.href || '')}"><span class="ni tone-${n.tone || 'gold'}">${PF.icon(n.icon || 'bell')}</span><span><strong>${esc(n.title)}</strong><small>${esc(n.text)} · ${timeAgo(n.at)}</small></span></button>`;

  function syncBadges() {
    const n = PF.db.unread(), b = $('#bellBadge');
    if (b) { b.textContent = n; b.hidden = !n; }
    const set = (id, v) => { const el = $(`[data-badge="${id}"]`); if (el) { el.textContent = v; el.hidden = !v; } };
    
    renderNotifPanel();
  }
  PF.refreshNav = () => { $$('.nav-link').forEach(a => a.classList.remove('active')); const cur = currentId(); const t = $$('.nav-link').find(a => a.getAttribute('href') === (getNav().flatMap(g => g.items).find(i => i.id === cur) || {}).href); if (t) t.classList.add('active'); };

  PF.syncShellProfile = (prof) => {
    if (!prof) return;
    if (PF.db && PF.db.saveProfile) {
      PF.db.saveProfile({ name: prof.name || 'Coach', email: prof.email || '', role: prof.role || 'Personal Trainer' });
    }
    const whoName = $('.side-user .who strong');
    const whoRole = $('.side-user .who small');
    if (whoName && prof.name) whoName.textContent = prof.name;
    if (whoRole && prof.role) whoRole.textContent = prof.role;
    const sideAv = $('.side-user .avatar');
    if (sideAv && prof.name && PF.avatar) sideAv.outerHTML = PF.avatar(prof.name, 'md', prof.photo);
    const topAv = $('.topbar .avatar-btn');
    if (topAv && prof.name && PF.avatar) topAv.innerHTML = PF.avatar(prof.name, 'md', prof.photo);
    if (prof.unread != null) {
      const b = $('#bellBadge');
      if (b) { b.textContent = prof.unread; b.hidden = !prof.unread; }
    }
  };

  function themeIcon() { const b = $('#themeBtn'); if (b) b.innerHTML = PF.icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon'); }
  PF.setTheme = t => { try { localStorage.setItem('pf-theme', t); } catch (e) { /* ignore */ } const eff = t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t; document.documentElement.setAttribute('data-theme', eff); themeIcon(); document.dispatchEvent(new CustomEvent('pf:theme')); };
  PF.setAccent = a => { try { localStorage.setItem('pf-accent', a); } catch (e) { /* ignore */ } if (a === 'gold') document.documentElement.removeAttribute('data-accent'); else document.documentElement.setAttribute('data-accent', a); };

  function globalSearch() {
    const input = $('#gSearch'), box = $('#gResults'); if (!input) return;
    const isTrainer = isTrainerContext();
    if (isTrainer) input.placeholder = 'Search assigned members, schedule, pages…';
    const pages = isTrainer ? getNav().flatMap(g => g.items) : [...getNav().flatMap(g => g.items), ...EXTRA_PAGES].filter(allowed);
    const run = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.hidden = true; return; }
      const rosterSource = (isTrainer && window.Trainer && Array.isArray(window.Trainer._cachedMembers)) ? window.Trainer._cachedMembers : PF.db.members();
      const ms = rosterSource.filter(m => ((m.name || '') + ' ' + (m.id || '') + ' ' + (m.email || '') + ' ' + (m.phone || '')).toLowerCase().includes(q)).slice(0, 5);
      const ps = (!isTrainer && PF.can(['Owner'])) ? PF.db.payments().filter(p => (p.id + ' ' + ((PF.db.member(p.memberId) || {}).name || '')).toLowerCase().includes(q)).slice(0, 3) : [];
      const ts = !isTrainer ? PF.db.trainers().filter(t => t.name.toLowerCase().includes(q)).slice(0, 3) : [];
      const pg = pages.filter(p => p.label.toLowerCase().includes(q)).slice(0, 4);
      let h = '';
      if (ms.length) h += '<div class="grp">MEMBERS</div>' + ms.map(m => `<a href="members.html#detail=${m.id}">${PF.avatar(m.name, 'sm')}<span><b>${esc(m.name)}</b><small>#${m.id} · ${esc(m.email || '')}</small></span></a>`).join('');
      if (ps.length) h += '<div class="grp">PAYMENTS</div>' + ps.map(p => `<a href="transactions.html?q=${encodeURIComponent(p.id)}"><span class="stat-ico tone-gold" style="width:30px;height:30px;border-radius:9px">${PF.icon('receipt')}</span><span><b>${p.id} · ${peso(p.amount)}</b><small>${esc((PF.db.member(p.memberId) || {}).name || '')} · ${esc(p.method)}</small></span></a>`).join('');
      if (ts.length) h += '<div class="grp">TRAINERS</div>' + ts.map(t => `<a href="trainers.html">${PF.avatar(t.name, 'sm')}<span><b>${esc(t.name)}</b><small>${esc(t.tags.join(' · '))}</small></span></a>`).join('');
      if (pg.length) h += '<div class="grp">PAGES</div>' + pg.map(p => `<a href="${p.href}"><span class="stat-ico tone-blue" style="width:30px;height:30px;border-radius:9px">${PF.icon(p.icon)}</span><b>${esc(p.label)}</b></a>`).join('');
      box.innerHTML = h || '<div class="empty compact"><span>No matches for “' + esc(input.value) + '”</span></div>'; box.hidden = false;
    };
    input.addEventListener('input', PF.debounce(run, 120));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); } if (e.key === 'Enter') { const a = $('a', box); if (a) location.href = a.getAttribute('href'); } });
    document.addEventListener('click', e => { if (!box.contains(e.target) && e.target !== input) box.hidden = true; });
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); } });
  }

  function build() {
    const body = document.body;
    if (document.documentElement.classList.contains('pre-mini')) body.classList.add('mini');
    $('#sidebar').innerHTML = sidebarHTML();
    $('#topbar').innerHTML = topbarHTML();
    $('#bottomNav').innerHTML = bottomHTML();
    const content = $('#content');
    if (body.dataset.roles && !PF.can(body.dataset.roles.split(','))) {
      content.innerHTML = pageHead() + `<div class="card"><div class="empty">${PF.icon('lock', '')}<h3>This area is limited to the ${esc(body.dataset.roles.split(',').join(' / '))}</h3><p>You're signed in as ${esc(role())}. Ask the owner if you need access.</p><a class="btn btn-gold" href="index.html">Back to dashboard</a></div></div>`;
      PF._blocked = true;
    } else content.insertAdjacentHTML('afterbegin', pageHead());
    themeIcon();

    const scrim = $('#scrim'), setDrawer = on => { body.classList.toggle('drawer', on); scrim.classList.toggle('on', on); };
    $('#menuBtn').onclick = () => setDrawer(true); $('#moreBtn') && ($('#moreBtn').onclick = () => setDrawer(true)); scrim.onclick = () => setDrawer(false);
    $$('.nav-link').forEach(a => a.addEventListener('click', () => setDrawer(false)));
    $('#collapseBtn').onclick = () => { const on = body.classList.toggle('mini'); try { localStorage.setItem('pf-mini', on ? '1' : '0'); } catch (e) { /* ignore */ } document.dispatchEvent(new CustomEvent('pf:resize')); setTimeout(() => window.dispatchEvent(new Event('resize')), 260); };
    const bb = $('#backBtn'); if (bb) bb.onclick = () => (history.length > 1 ? history.back() : (location.href = 'index.html'));
    $('#themeBtn').onclick = () => PF.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    const bell = $('#bellBtn'), panel = $('#npanel');
    bell.onclick = e => { e.stopPropagation(); const on = panel.hidden; panel.hidden = !on; bell.setAttribute('aria-expanded', on); if (on) renderNotifPanel(); };
    document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && !bell.contains(e.target)) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); } });
    $('#accountBtn').onclick = e => { e.stopPropagation(); PF.menu($('#accountBtn'), [
      { label: 'My profile', icon: 'user', href: 'profile.html' }, { label: 'Settings', icon: 'settings', href: 'settings.html' }, 'hr',
      { label: 'Log out', icon: 'log-out', danger: true, onClick: async () => { if (await PF.confirm({ title: 'Log out?', message: 'You will need to sign in again to use the staff portal.', confirm: 'Log out' })) PF.logout(); } }]); };
    globalSearch(); renderNotifPanel();
    document.addEventListener('pf:data', syncBadges);
    window.addEventListener('hashchange', PF.refreshNav);
    // Another tab changed the data: refresh in place (never reload, never write back).
    window.addEventListener('storage', e => { if (e.key === 'pf-staff-v2' && PF.db.syncFromStorage()) document.dispatchEvent(new CustomEvent('pf:data')); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });
    PF._built = true;
    if (!PF._blocked) queue.splice(0).forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
  }
  PF.logout = async () => {
    try {
      localStorage.removeItem("pp-accent");
      localStorage.removeItem("profit-member-demo-checkins");
      localStorage.removeItem("profit-demo-session");
      sessionStorage.removeItem("profit-demo-session");
      sessionStorage.setItem("profit-logged-out", "1");
      if (window.ProFitAPI) await window.ProFitAPI.post("/auth/logout", {});
    } catch (e) { /* ignore */ }
    const isSub = location.pathname.includes('/staff/') || location.pathname.includes('/trainer/');
    const target = PF.config.loginUrl || (isSub ? '../login.html' : 'login.html');
    location.replace(target);
  };

  // asset base (for logo) — derived from this script's own URL
  const me = document.currentScript; PF.assetBase = me ? me.src.replace(/js\/staff\.js.*$/, '') : 'assets/';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
