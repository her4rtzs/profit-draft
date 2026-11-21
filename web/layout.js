// Shared ProFit navigation, top bar and the live status chips.
(() => {
  const ownerGroups = [
    { label: 'WORKSPACE', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-house', href: '/index' },
      { id: 'announcements', label: 'Announcements', icon: 'fa-bullhorn', href: '/announcements' },
    ]},
    { label: 'MEMBERSHIP', items: [
      { id: 'members', label: 'Member List', icon: 'fa-users', href: '/members' },
      { id: 'attendance', label: 'Attendance', icon: 'fa-calendar-check', href: '/attendance' },
    ]},
    { label: 'STAFF', items: [
      { id: 'trainers', label: 'Trainers', icon: 'fa-dumbbell', href: '/trainers' },
      { id: 'cashiers', label: 'Cashiers', icon: 'fa-cash-register', href: '/cashiers' },
    ]},
    { label: 'FINANCE', items: [
      { id: 'payments', label: 'Payments & Billing', icon: 'fa-wallet', href: '/payments' },
      { id: 'reports', label: 'Financial Reports', icon: 'fa-chart-column', href: '/reports' },
    ]},
  ];
  const cashierGroups = [
    { label: 'CASHIER DESK', items: [
      { id: 'cashier', label: 'Cashier Portal', icon: 'fa-cash-register', href: '/cashier' },
      { id: 'payments', label: 'Payments & Billing', icon: 'fa-wallet', href: '/payments' },
    ]},
    { label: 'FRONT DESK', items: [
      { id: 'members', label: 'Member List', icon: 'fa-users', href: '/members' },
      { id: 'attendance', label: 'Attendance', icon: 'fa-calendar-check', href: '/attendance' },
    ]},
  ];
  const body = document.body, current = body.dataset.page;

  const detectWebRole = () => {
    const authRole = window.ProFitAuth?.role || window.ProFitAuth?.user?.role;
    if (authRole) return String(authRole).toUpperCase();
    try {
      const raw = sessionStorage.getItem('profit-verified-session') || localStorage.getItem('profit-demo-session') || sessionStorage.getItem('profit-demo-session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.role) return String(parsed.role).toUpperCase();
      }
    } catch { /* storage blocked */ }
    return current === 'cashier' ? 'CASHIER' : '';
  };

  // Gym branding lives in Settings so the owner can rebrand without touching code.
  let GYM = { name: 'ProFit', tagline: 'FUNCTIONAL FITNESS', logo: '' };
  try { GYM = { ...GYM, ...(JSON.parse(localStorage.getItem('profit-gym-profile') || 'null') || {}) }; } catch { /* storage blocked */ }

  const renderSidebarGroups = groups => groups.map(g =>
    `<section class="nav-group"><p class="nav-group-label">${g.label}</p><ul class="menulist">${g.items.map(item => `<li><a href="${item.href}" data-tip="${item.label}" class="${item.id===current?'active':''}" ${item.id===current?'aria-current="page"':''}><i class="fa-solid ${item.icon} icon" aria-hidden="true"></i><span class="text nav-text">${item.label}</span></a></li>`).join('')}</ul></section>`
  ).join('');

  let renderedRole = detectWebRole();
  const nav = document.getElementById('sidebar');
  if (nav) {
    const isCashier = renderedRole === 'CASHIER';
    const groups = isCashier ? cashierGroups : ownerGroups;
    const homeHref = isCashier ? '/cashier' : '/index';
    const defaultName = isCashier ? 'Cashier' : 'Administrator';
    const defaultRoleLabel = isCashier ? 'Cashier' : 'Gym administrator';
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = `
      <div class="sidebar-brand-row">
        <a class="imgbrand" href="${homeHref}" aria-label="${GYM.name} dashboard">
          <span class="image"><img id="gymLogoImg" src="${GYM.logo || 'logo.jpg'}" alt="${GYM.name}" onerror="this.style.display='none'"></span>
          <span class="headertxt"><strong id="gymNameTxt">${GYM.name}</strong><small id="gymTagTxt">${GYM.tagline}</small></span>
        </a>
      </div>
      <div class="sidebar-scroll">
        ${renderSidebarGroups(groups)}
      </div>
      <div class="sidebar-foot">
        <div class="sidebar-account">
          <div class="sidebar-user">
            <span class="sidebar-avatar" data-user-initials id="railAvatar">AD</span>
            <div class="sidebar-user-copy"><strong data-user-name>${defaultName}</strong><small data-user-role>${defaultRoleLabel}</small></div>
            <button type="button" class="account-menu-toggle" id="accountMenuToggle" aria-haspopup="menu" aria-expanded="false" aria-controls="accountMenu" aria-label="Account actions" title="Account"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>
            <div class="account-menu" id="accountMenu" role="menu" aria-label="Account actions">
              <a href="/profile" role="menuitem" class="${current==='profile'?'active':''}"><i class="fa-regular fa-user" aria-hidden="true"></i> My profile</a>
              <a href="/settings#appearance" role="menuitem" class="${current==='settings'?'active':''}"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Settings</a>
              <button type="button" role="menuitem" data-logout><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Log out</button>
            </div>
          </div>
        </div>
      </div>
      `;
  }

  const top = document.getElementById('topbar');
  // Apply saved Font Size preference site-wide (Small / Medium / Large)
  try {
    const savedFs = localStorage.getItem('pf-font-size');
    if (savedFs === 'sm' || savedFs === 'md' || savedFs === 'lg') {
      document.documentElement.dataset.fontSize = savedFs;
    }
  } catch { /* ignore */ }
  if (top) {
    const title = body.dataset.title || 'Dashboard';
    const rawWelcome = String(body.dataset.welcome || '').trim();
    const welcome = /^welcome\s+back\b/i.test(rawWelcome) ? '' : rawWelcome;
    const allNotifHref = '/notifications';
    top.innerHTML = `
      <div class="topbar-heading">
        <div class="topbar-nav">
          <button type="button" id="navBack" aria-label="Go back" title="Back"><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" id="navFwd" aria-label="Go forward" title="Forward"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <button class="mobile-nav-toggle" id="mobileNavToggle" type="button" aria-label="Open navigation" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
        <div class="topbar-title">
          ${welcome ? `<p class="welcome">${welcome}</p>` : ''}
          <h1>${title}</h1>
        </div>
      </div>
      <div class="topbar-right">
        <div class="topbar-actions">
          <button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle dark mode" title="Toggle theme"><i class="fa-solid fa-moon"></i></button>
          <div class="notification-wrap"><button class="notification" id="notificationToggle" type="button" aria-label="Notifications" aria-haspopup="dialog" aria-expanded="false"><i class="fa-regular fa-bell"></i><span class="notification-badge" id="notificationBadge" hidden>0</span></button>
            <section class="notification-panel np" id="notificationPanel" role="dialog" aria-label="Notifications" hidden>
              <div class="notification-head nph">
                <div class="nph-title"><strong>Notifications</strong><em id="notificationSummary"></em></div>
                <button type="button" id="markAllRead">Mark all read</button>
              </div>
              <div class="notification-list npl" id="notificationList"></div>
              <a class="notification-foot npf" id="allNotificationsLink" href="${allNotifHref}">All notifications &rarr;</a>
            </section>
          </div>
          <a class="topbar-avatar" id="topbarAvatar" href="/profile" title="My profile" aria-label="My profile"><span data-user-initials>AD</span></a>
        </div>
      </div>`;

    // Single source of truth for sidebar + topbar account name, role and avatar.
    const paintAccount = () => {
      const profile = (window.ProFitProfile && window.ProFitProfile.get()) || {};
      const authUser = window.ProFitAuth && window.ProFitAuth.user;
      const roleCode = String((authUser && authUser.role) || detectWebRole() || '').toUpperCase();
      const isCashier = roleCode === 'CASHIER';
      const rawName = String((authUser && typeof authUser.name === 'string' ? authUser.name : profile.name) || '').trim();
      const hasName = Boolean(rawName) && !rawName.includes('@');
      document.querySelectorAll('[data-user-name]').forEach(el => {
        if (hasName) {
          el.textContent = rawName;
        } else {
          el.innerHTML = '<a href="/profile" style="color:inherit;text-decoration:underline">Name not set</a>';
        }
      });
      const fallbackRoleLabel = roleCode === 'MEMBER' ? 'Gym member' : isCashier ? 'Cashier' : 'Gym administrator';
      document.querySelectorAll('[data-user-role]').forEach(el => { el.textContent = profile.role || fallbackRoleLabel; });
      const initials = hasName
        ? rawName.split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase()
        : 'PF';
      document.querySelectorAll('[data-user-initials]').forEach(el => { el.textContent = initials; });

      const photo = (authUser && authUser.photo) || profile.photo || '';
      const seed = (authUser && (authUser.email || authUser.id || authUser.name)) || profile.email || rawName || roleCode || 'profit-staff';
      document.querySelectorAll('.sidebar-avatar, .topbar-avatar, .pp-avatar-photo').forEach(box => {
        if (!box) return;
        if (window.ProFitAvatar) {
          window.ProFitAvatar.paint(box, { photo, seed, alt: rawName || 'Profile avatar' });
        } else if (photo) {
          let img = box.querySelector('img');
          if (!img) { img = document.createElement('img'); img.alt = ''; box.prepend(img); }
          img.src = photo;
          box.classList.add('has-photo');
        }
      });
    };
    window.ProFitPaintAccount = paintAccount;
    paintAccount();
    window.addEventListener('profit-account-changed', paintAccount);
    window.addEventListener('profit-auth-ready', e => {
      const nextRole = String(e.detail?.role || detectWebRole() || '').toUpperCase();
      if (nav && nextRole && nextRole !== renderedRole) {
        renderedRole = nextRole;
        const isCashier = nextRole === 'CASHIER';
        const scrollEl = nav.querySelector('.sidebar-scroll');
        if (scrollEl) scrollEl.innerHTML = renderSidebarGroups(isCashier ? cashierGroups : ownerGroups);
        const brandLink = nav.querySelector('.imgbrand');
        if (brandLink) brandLink.setAttribute('href', isCashier ? '/cashier' : '/index');
        const allNotif = document.getElementById('allNotificationsLink');
        if (allNotif) allNotif.setAttribute('href', '/notifications');
        renderMobileBar(isCashier);
      }
      paintAccount();
    });

    // ---- Mobile bottom tab bar + "More" sheet (<= 980px) ----
    const renderMobileBar = isCashier => {
      if (!nav) return;
      const primary = isCashier
        ? [
            { id: 'cashier', label: 'Cashier', icon: 'fa-cash-register', href: '/cashier' },
            { id: 'payments', label: 'Payments', icon: 'fa-wallet', href: '/payments' },
            { id: 'members', label: 'Members', icon: 'fa-users', href: '/members' },
            { id: 'attendance', label: 'Check-ins', icon: 'fa-calendar-check', href: '/attendance' },
          ]
        : [
            { id: 'dashboard', label: 'Home', icon: 'fa-house', href: '/index' },
            { id: 'members', label: 'Members', icon: 'fa-users', href: '/members' },
            { id: 'payments', label: 'Payments', icon: 'fa-wallet', href: '/payments' },
            { id: 'reports', label: 'Reports', icon: 'fa-chart-column', href: '/reports' },
          ];
      const moreItems = isCashier
        ? [
            { id: 'profile', label: 'My profile', icon: 'fa-regular fa-user', href: '/profile' },
            { id: 'settings', label: 'Settings', icon: 'fa-solid fa-sliders', href: '/settings#appearance' },
          ]
        : [
            { id: 'attendance', label: 'Attendance', icon: 'fa-solid fa-calendar-check', href: '/attendance' },
            { id: 'announcements', label: 'Announcements', icon: 'fa-solid fa-bullhorn', href: '/announcements' },
            { id: 'trainers', label: 'Trainers', icon: 'fa-solid fa-dumbbell', href: '/trainers' },
            { id: 'cashiers', label: 'Cashiers', icon: 'fa-solid fa-cash-register', href: '/cashiers' },
            { id: 'profile', label: 'My profile', icon: 'fa-regular fa-user', href: '/profile' },
            { id: 'settings', label: 'Settings', icon: 'fa-solid fa-sliders', href: '/settings#appearance' },
          ];
      const inMore = moreItems.some(x => x.id === current);

      let tabs = document.getElementById('pfMobTabs');
      if (!tabs) {
        tabs = document.createElement('nav');
        tabs.id = 'pfMobTabs';
        tabs.className = 'pf-mob-tabs';
        tabs.setAttribute('aria-label', 'Mobile navigation');
        document.body.appendChild(tabs);
      }
      tabs.innerHTML = primary.map(item =>
        `<a class="pf-mob-tab${item.id === current ? ' on' : ''}" href="${item.href}"${item.id === current ? ' aria-current="page"' : ''}><i class="fa-solid ${item.icon}" aria-hidden="true"></i><span>${item.label}</span></a>`
      ).join('') +
        `<button type="button" class="pf-mob-tab${inMore ? ' on' : ''}" id="pfMobMoreBtn" aria-expanded="false" aria-controls="pfMobSheet"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i><span>More</span></button>`;

      let backdrop = document.getElementById('pfMobBackdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'pfMobBackdrop';
        backdrop.className = 'pf-mob-backdrop';
        backdrop.hidden = true;
        document.body.appendChild(backdrop);
      }

      let sheet = document.getElementById('pfMobSheet');
      if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'pfMobSheet';
        sheet.className = 'pf-mob-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-label', 'More pages');
        document.body.appendChild(sheet);
      }
      sheet.innerHTML = `<div class="pf-mob-sheet-bar" aria-hidden="true"></div><div class="pf-mob-sheet-chips">${moreItems.map(item =>
        `<a class="pf-mob-chip${item.id === current ? ' sel' : ''}" href="${item.href}"><i class="${item.icon}" aria-hidden="true"></i><span>${item.label}</span></a>`
      ).join('')}<button type="button" class="pf-mob-chip is-danger" data-logout><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Log out</span></button></div>`;

      const moreBtn = document.getElementById('pfMobMoreBtn');
      const setSheet = open => {
        sheet.classList.toggle('on', open);
        backdrop.hidden = !open;
        backdrop.classList.toggle('on', open);
        moreBtn?.setAttribute('aria-expanded', String(open));
      };
      moreBtn?.addEventListener('click', e => {
        e.stopPropagation();
        setSheet(!sheet.classList.contains('on'));
      });
      backdrop.onclick = () => setSheet(false);
      if (!window.__pfMobEscBound) {
        window.__pfMobEscBound = true;
        document.addEventListener('keydown', ev => {
          if (ev.key === 'Escape') {
            const s = document.getElementById('pfMobSheet');
            const b = document.getElementById('pfMobBackdrop');
            const m = document.getElementById('pfMobMoreBtn');
            if (s?.classList.contains('on')) {
              s.classList.remove('on');
              if (b) { b.hidden = true; b.classList.remove('on'); }
              m?.setAttribute('aria-expanded', 'false');
            }
          }
        });
      }
    };
    renderMobileBar(renderedRole === 'CASHIER');

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

  // When navigating from another page back to Home / Dashboard, mark the intent for a smooth transition
  if (current !== 'dashboard') {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href*="/index"]');
      if (a) {
        try { sessionStorage.setItem('pf-nav-returning-home', '1'); } catch (_) {}
      }
    }, { capture: true });
  }

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
