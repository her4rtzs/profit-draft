// Shared ProFit navigation, top bar and the live status chips.
(() => {
  const groups = [
    { label: 'WORKSPACE', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-house', href: 'index.html' },
      { id: 'announcements', label: 'Announcements', icon: 'fa-bullhorn', href: 'announcements.html' },
    ]},
    { label: 'MEMBERSHIP', items: [
      { id: 'members', label: 'Member List', icon: 'fa-users', href: 'members.html' },
      { id: 'attendance', label: 'Attendance', icon: 'fa-calendar-check', href: 'attendance.html' },
      { id: 'trainers', label: 'Trainers', icon: 'fa-dumbbell', href: 'trainers.html' },
    ]},
    { label: 'FINANCE', items: [
      { id: 'payments', label: 'Payments & Billing', icon: 'fa-wallet', href: 'payments.html' },
      { id: 'reports', label: 'Financial Reports', icon: 'fa-chart-column', href: 'reports.html' },
    ]},
  ];
  const body = document.body, current = body.dataset.page;

  // Gym branding lives in Settings so the owner can rebrand without touching code.
  let GYM = { name: 'ProFit', tagline: 'FUNCTIONAL FITNESS', logo: '' };
  try { GYM = { ...GYM, ...(JSON.parse(localStorage.getItem('profit-gym-profile') || 'null') || {}) }; } catch { /* storage blocked */ }

  const nav = document.getElementById('sidebar');
  if (nav) {
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = `
      <div class="sidebar-brand-row">
        <a class="imgbrand" href="index.html" aria-label="${GYM.name} dashboard">
          <span class="image"><img id="gymLogoImg" src="${GYM.logo || 'logo.jpg'}" alt="${GYM.name}" onerror="this.style.display='none'"></span>
          <span class="headertxt"><strong id="gymNameTxt">${GYM.name}</strong><small id="gymTagTxt">${GYM.tagline}</small></span>
        </a>
        <button type="button" class="sidebar-toggle-btn" id="sidebarToggle" aria-label="Collapse sidebar" title="Collapse sidebar">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
      </div>
      <div class="sidebar-scroll">
        ${groups.map(g => `<section class="nav-group"><p class="nav-group-label">${g.label}</p><ul class="menulist">${g.items.map(item => `<li><a href="${item.href}" data-tip="${item.label}" class="${item.id===current?'active':''}" ${item.id===current?'aria-current="page"':''}><i class="fa-solid ${item.icon} icon" aria-hidden="true"></i><span class="text nav-text">${item.label}</span></a></li>`).join('')}</ul></section>`).join('')}
      </div>
      <div class="sidebar-foot">
        <div class="sidebar-account">
          <div class="sidebar-user">
            <span class="sidebar-avatar" data-user-initials id="railAvatar">AD</span>
            <div class="sidebar-user-copy"><strong data-user-name>Administrator</strong><small data-user-role>Gym administrator</small></div>
            <button type="button" class="account-menu-toggle" id="accountMenuToggle" aria-haspopup="menu" aria-expanded="false" aria-controls="accountMenu" aria-label="Account actions" title="Account"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>
            <div class="account-menu" id="accountMenu" role="menu" aria-label="Account actions">
              <a href="profile.html" role="menuitem" class="${current==='profile'?'active':''}"><i class="fa-regular fa-user" aria-hidden="true"></i> My profile</a>
              <a href="settings.html#appearance" role="menuitem" class="${current==='settings'?'active':''}"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Settings</a>
              <button type="button" role="menuitem" data-logout><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Log out</button>
            </div>
          </div>
        </div>
      </div>
      `;
  }

  const top = document.getElementById('topbar');
  if (top) {
    const title = body.dataset.title || 'Dashboard', welcome = body.dataset.welcome || 'Welcome back';
    top.innerHTML = `
      <div class="topbar-heading">
        <div class="topbar-nav">
          <button type="button" id="navBack" aria-label="Go back" title="Back"><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" id="navFwd" aria-label="Go forward" title="Forward"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <button class="mobile-nav-toggle" id="mobileNavToggle" type="button" aria-label="Open navigation" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
        <div class="topbar-title">
          <p class="welcome">${welcome}</p>
          <h1>${title}</h1>
        </div>
      </div>
      <div class="topbar-right">
        <label class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Search members..." aria-label="Search members"><kbd>Ctrl K</kbd></label>
        <button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle dark mode" title="Toggle theme"><i class="fa-solid fa-moon"></i></button>
        <div class="notification-wrap"><button class="notification" id="notificationToggle" type="button" aria-label="Notifications" aria-haspopup="true" aria-expanded="false"><i class="fa-regular fa-bell"></i><span class="notification-badge" id="notificationBadge" hidden>0</span></button>
          <section class="notification-panel" id="notificationPanel" aria-label="Notifications" hidden><div class="notification-head"><div><strong>Notifications</strong><small id="notificationSummary">You're all caught up</small></div><button type="button" id="markAllRead">Mark all read</button></div><div class="notification-list" id="notificationList"></div><div class="notification-foot"><span>Gym updates</span><button type="button" id="clearNotifications">Clear all</button></div></section>
        </div>
        <a class="topbar-avatar" id="topbarAvatar" href="profile.html" title="My profile" aria-label="My profile"><span data-user-initials>AD</span></a>
      </div>`;

    // Staff profile: photo or initials, shared with the rail below.
    const paintAccount = () => {
      const profile = (window.ProFitProfile && window.ProFitProfile.get()) || {};
      const authName = (window.ProFitAuth && window.ProFitAuth.user && window.ProFitAuth.user.name) || 'Administrator';
      const name = profile.name || authName;
      document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = name; });
      document.querySelectorAll('[data-user-role]').forEach(el => { el.textContent = profile.role || (window.ProFitAuth && window.ProFitAuth.user && window.ProFitAuth.user.role === 'MEMBER' ? 'Gym member' : 'Gym administrator'); });
      const initials = (window.ProFitProfile && window.ProFitProfile.initials()) || 'PF';
      document.querySelectorAll('[data-user-initials]').forEach(el => { el.textContent = initials; });
      document.querySelectorAll('.sidebar-avatar, .topbar-avatar, .pp-avatar-photo').forEach(box => {
        if (!box) return;
        const existing = box.querySelector('img');
        if (profile.photo) {
          if (!existing) { const img = document.createElement('img'); img.alt = ''; box.prepend(img); }
          const img = box.querySelector('img');
          img.src = profile.photo;
          box.classList.add('has-photo');
        } else if (existing) {
          existing.remove();
          box.classList.remove('has-photo');
        }
      });
    };
    paintAccount();
    window.addEventListener('profit-account-changed', paintAccount);

    // Back / forward mirror the browser history stack.
    const back = top.querySelector('#navBack'), fwd = top.querySelector('#navFwd');
    let canForward = false;
    const syncNav = () => {
      if (back) back.disabled = history.length <= 1;
      if (fwd) fwd.disabled = !canForward;
    };
    back?.addEventListener('click', () => { canForward = true; history.back(); syncNav(); });
    fwd?.addEventListener('click', () => { if (canForward) history.forward(); });
    window.addEventListener('popstate', syncNav);
    syncNav();

    const q = top.querySelector('.search input');
    q?.addEventListener('keydown', e => { if (e.key==='Enter' && q.value.trim()) location.href='members.html?q='+encodeURIComponent(q.value.trim()); });
  }

  // ---- Status strip -----------------------------------------------------
  // The old bottom bar's numbers, moved up into a full-width ribbon under the
  // header. The sidebar keeps owning navigation, so nothing is duplicated.
  if (top && document.querySelector('.main-content') && !document.getElementById('statusStrip')) {
    const strip = document.createElement('div');
    strip.className = 'status-strip';
    strip.id = 'statusStrip';
    strip.setAttribute('aria-label', 'Gym status');
    strip.innerHTML = `
      <span class="strip-label"><span class="strip-dot" aria-hidden="true"></span><span id="stripGymName">${GYM.name}</span></span>
      <a class="topbar-stat" href="attendance.html" title="Members checked in today"><i class="fa-solid fa-door-open" aria-hidden="true"></i><b id="tsChecked">–</b><span class="ts-label">in today</span></a>
      <a class="topbar-stat" href="members.html" title="Total members"><i class="fa-solid fa-users" aria-hidden="true"></i><b id="tsMembers">–</b><span class="ts-label">members</span></a>
      <a class="topbar-stat" href="reports.html" title="Revenue collected this month"><i class="fa-solid fa-peso-sign" aria-hidden="true"></i><b id="tsRevenue">–</b><span class="ts-label">this month</span></a>
      <span class="strip-clock" id="stripClock">--:--</span>
      <a class="strip-cta" href="members.html#enroll" title="Add a new gym member"><i class="fa-solid fa-user-plus" aria-hidden="true"></i><span>Enroll member</span></a>`;
    top.insertAdjacentElement('afterend', strip);
  }

  // ---- Live status -----------------------------------------------------
  // Same numbers the old bottom bar showed, now rendered as header chips.
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-US');
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  function readDB() {
    try {
      const raw = localStorage.getItem('profit-db-v1');
      if (raw) return JSON.parse(raw);
    } catch { /* storage blocked */ }
    try {
      if (window.DB && Array.isArray(window.DB.members) && window.DB.members.length) {
        return { members: window.DB.members, payments: window.DB.payments || [], checkins: window.DB.checkins || [] };
      }
    } catch { /* DB not loaded on this page */ }
    return null;
  }

  const textOf = sel => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim() : null;
  };

  // Finds a stat card by its caption, so the header reports the right number
  // even on pages that lay the cards out in a different order.
  const statByLabel = needle => {
    const cards = Array.from(document.querySelectorAll('.stat-card'));
    const card = cards.find(c => {
      const caption = c.querySelector('.stat-content p, .stat-content h2 + small');
      return caption && caption.textContent.toLowerCase().includes(needle);
    }) || cards.find(c => {
      const heading = c.querySelector('.stat-content p');
      return heading && heading.textContent.toLowerCase().includes(needle);
    });
    const value = card && card.querySelector('.stat-content h2');
    return value ? value.textContent.trim() : null;
  };

  function resolveStats() {
    const now = new Date();
    const monthISO = isoOf(now).slice(0, 7);
    const todayISO = isoOf(now);

    const db = readDB();
    if (db && db.members && db.members.length) {
      return {
        members: db.members.length,
        checkedIn: (db.checkins || []).filter(c => isoOf(new Date(c.date)) === todayISO).length,
        revenue: (db.payments || [])
          .filter(p => isoOf(new Date(p.date)).slice(0, 7) === monthISO)
          .reduce((sum, p) => sum + Number(p.amount || 0), 0)
      };
    }

    // Fall back to the numbers the page itself is displaying.
    return {
      members: statByLabel('total member') || statByLabel('member') || '100',
      checkedIn: statByLabel('checked in') || '12',
      revenue: statByLabel('revenue') || textOf('.revenue-card h2') || peso(10000)
    };
  }

  const paintStats = () => {
    const s = resolveStats();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('tsMembers', String(s.members));
    set('tsChecked', String(s.checkedIn));
    set('tsRevenue', typeof s.revenue === 'number' ? peso(s.revenue) : String(s.revenue));
  };

  const tickClock = () => {
    const el = document.getElementById('stripClock');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (document.getElementById('statusStrip')) {
    paintStats();
    tickClock();
    setInterval(tickClock, 1000);
    // Repaint once page scripts have hydrated their own numbers.
    setTimeout(paintStats, 600);
    window.addEventListener('storage', paintStats);
  }

  // ---- Gym branding -----------------------------------------------------
  // Settings saves to localStorage and fires this, so the rail rebrands live.
  window.addEventListener('profit-gym-changed', () => {
    let g = GYM;
    try { g = { ...GYM, ...(JSON.parse(localStorage.getItem('profit-gym-profile') || 'null') || {}) }; } catch { /* ignore */ }
    const img = document.getElementById('gymLogoImg');
    if (img) { img.style.display = ''; img.src = g.logo || 'logo.jpg'; }
    const n = document.getElementById('gymNameTxt');
    if (n) n.textContent = g.name;
    const t = document.getElementById('gymTagTxt');
    if (t) t.textContent = g.tagline;
    const s = document.getElementById('stripGymName');
    if (s) s.textContent = g.name;
  });
})();
