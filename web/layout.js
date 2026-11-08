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
      <div class="sidebar-brand-row brand">
        <a class="imgbrand" href="index.html" aria-label="${GYM.name} dashboard">
          <span class="image"><img id="gymLogoImg" src="${GYM.logo || 'logo.jpg'}" alt="${GYM.name}" onerror="this.style.display='none'"></span>
          <span class="headertxt brand-txt"><strong id="gymNameTxt">${GYM.name}</strong><small id="gymTagTxt">${GYM.tagline}</small></span>
        </a>
      </div>
      <div class="sidebar-scroll side-scroll">
        ${groups.map(g => `<section class="nav-group"><p class="nav-group-label nav-label">${g.label}</p><ul class="menulist nav-list">${g.items.map(item => `<li><a href="${item.href}" data-tip="${item.label}" class="nav-link ${item.id===current?'active':''}" ${item.id===current?'aria-current="page"':''}><i class="fa-solid ${item.icon} icon" aria-hidden="true"></i><span class="text nav-text">${item.label}</span></a></li>`).join('')}</ul></section>`).join('')}
      </div>
      <div class="sidebar-foot side-foot">
        <div class="sidebar-account">
          <div class="sidebar-user side-user">
            <span class="sidebar-avatar" data-user-initials id="railAvatar">AD</span>
            <div class="sidebar-user-copy who"><strong data-user-name>Administrator</strong><small data-user-role>Gym administrator</small></div>
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
        <div class="topbar-actions">
          <button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle dark mode" title="Toggle theme"><i class="fa-solid fa-moon"></i></button>
          <div class="notification-wrap"><button class="notification" id="notificationToggle" type="button" aria-label="Notifications" aria-haspopup="true" aria-expanded="false"><i class="fa-regular fa-bell"></i><span class="notification-badge" id="notificationBadge" hidden>0</span></button>
            <section class="notification-panel" id="notificationPanel" aria-label="Notifications" hidden><div class="notification-head"><div><strong>Notifications</strong><small id="notificationSummary">You're all caught up</small></div><button type="button" id="markAllRead">Mark all read</button></div><div class="notification-list" id="notificationList"></div><div class="notification-foot"><span>Gym updates</span><button type="button" id="clearNotifications">Clear all</button></div></section>
          </div>
          <a class="topbar-avatar" id="topbarAvatar" href="profile.html" title="My profile" aria-label="My profile"><span data-user-initials>AD</span></a>
        </div>
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


  }

  // Mobile Instagram-style bottom navigation bar
  let bnav = document.getElementById('mobileBottomNav');
  if (!bnav) {
    bnav = document.createElement('nav');
    bnav.id = 'mobileBottomNav';
    bnav.className = 'instagram-bottom-nav pf-bottomnav';
    bnav.setAttribute('aria-label', 'Mobile navigation');
    document.body.appendChild(bnav);
  }
  const curPage = current;
  const staffTabs = [
    { id: 'dashboard', label: 'Home', icon: 'fa-house', href: 'index.html' },
    { id: 'members', label: 'Members', icon: 'fa-users', href: 'members.html' },
    { id: 'attendance', label: 'Attendance', icon: 'fa-clipboard-check', href: 'attendance.html' },
    { id: 'announcements', label: 'Notices', icon: 'fa-bullhorn', href: 'announcements.html' },
    { id: 'profile', label: 'Profile', icon: 'fa-user', href: 'profile.html' }
  ];
  bnav.innerHTML = staffTabs.map(t => `
    <a href="${t.href}" class="${t.id === curPage ? 'active' : ''}" ${t.id === curPage ? 'aria-current="page"' : ''}>
      <i class="fa-solid ${t.icon}" aria-hidden="true"></i>
      <span>${t.label}</span>
    </a>
  `).join('');

  // ---- Status strip removed per request ----

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

  // ---- Phone card lists --------------------------------------------------
  // Under 768px the CSS turns every table row into a card, so each cell has to
  // say which column it came from. Copy the header text onto the cells, and
  // redo it whenever a page redraws its rows (search, filters, pagination).
  const labelTable = table => {
    const headRow = table.tHead && table.tHead.rows[0];
    const heads = headRow ? [...headRow.cells].map(th => th.textContent.trim()) : [];
    if (!heads.length) return;
    [...table.tBodies].forEach(tb => [...tb.rows].forEach(row => [...row.cells].forEach(td => {
      const wanted = td.colSpan > 1 ? '' : (heads[td.cellIndex] || '');
      if (wanted === (td.dataset.label || '')) return;
      if (wanted) td.dataset.label = wanted; else delete td.dataset.label;
    })));
  };
  const labelTables = () => document.querySelectorAll('table').forEach(labelTable);
  let labelQueued = false;
  labelTables();
  new MutationObserver(records => {
    if (labelQueued || !records.some(r => r.target.closest && r.target.closest('table'))) return;
    labelQueued = true;
    requestAnimationFrame(() => { labelQueued = false; labelTables(); });
  }).observe(document.body, { childList: true, subtree: true });
})();
