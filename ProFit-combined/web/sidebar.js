// Shared navigation behavior, theme switching, search shortcuts and functional demo notifications.
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const store = {
    get(k){ try{return localStorage.getItem(k)}catch{return null} },
    set(k,v){try{localStorage.setItem(k,v)}catch{}}
  };
  const sidebar = $(".sidebar"), toggle = document.getElementById("sidebarToggle"), themeToggle=$("#themeToggle");
  const mobileToggle = $("#mobileNavToggle");
  let drawerShade = $("#sidebarShade");
  if (!drawerShade) { drawerShade = document.createElement("button"); drawerShade.type="button"; drawerShade.id="sidebarShade"; drawerShade.className="sidebar-shade"; drawerShade.setAttribute("aria-label","Close navigation"); document.body.appendChild(drawerShade); }
  const setDrawer = open => { if(!sidebar) return; sidebar.classList.toggle("mobile-open",open); drawerShade.classList.toggle("visible",open); if(mobileToggle){mobileToggle.setAttribute("aria-expanded",String(open));mobileToggle.setAttribute("aria-label",open?"Close navigation":"Open navigation");mobileToggle.innerHTML=`<i class="fa-solid ${open?'fa-xmark':'fa-bars'}"></i>`;} document.body.classList.toggle("drawer-open",open); };
  mobileToggle?.addEventListener("click",()=>setDrawer(!sidebar?.classList.contains("mobile-open")));
  drawerShade.addEventListener("click",()=>setDrawer(false));
  sidebar?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{if(window.matchMedia("(max-width: 760px)").matches)setDrawer(false)}));
  window.addEventListener("resize",()=>{if(!window.matchMedia("(max-width: 760px)").matches)setDrawer(false)});
  if (sidebar && store.get("sidebar")==="closed") sidebar.classList.add("close");
  if(toggle) toggle.dataset.profitBound="1";
  toggle?.addEventListener("click", () => {
    sidebar.classList.toggle("close");
    store.set("sidebar", sidebar.classList.contains("close") ? "closed" : "open");
    toggle.setAttribute("aria-label", sidebar.classList.contains("close") ? "Expand sidebar" : "Collapse sidebar");
    toggle.setAttribute("aria-expanded",String(!sidebar.classList.contains("close")));
  });
  const applyTheme = dark => {
    document.body.classList.toggle("dark", !!dark);
    if (themeToggle) {
      themeToggle.innerHTML = dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
      themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      themeToggle.title = dark ? "Light mode" : "Dark mode";
    }
  };
  applyTheme(store.get("theme")!=="light");
  themeToggle?.addEventListener("click",()=>{const dark=!document.body.classList.contains("dark");applyTheme(dark);store.set("theme",dark?"dark":"light")});
  const searchInput=$(".search input");
  document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"&&searchInput){e.preventDefault();searchInput.focus()}});
  const moreBtn=$("#moreBtn"), morePopover=$("#morePopover");
  function setMore(open){if(!morePopover||!moreBtn)return;morePopover.hidden=!open;moreBtn.setAttribute("aria-expanded",String(open))}
  moreBtn?.addEventListener("click",e=>{e.stopPropagation();setMore(morePopover.hidden)});
  document.addEventListener("click",e=>{if(morePopover&&moreBtn&&!morePopover.contains(e.target)&&!moreBtn.contains(e.target))setMore(false)});
  $("#adminHelpBtn")?.addEventListener("click",()=>alert("For support, contact your Functional Fitness Gym administrator."));
  // Notifications are a real, shared feed: any page can push to it, and the
  // panel re-renders the moment something arrives.
  const key="profit-notifications-v1";
  const seedKey="profit-notifications-seeded-v1";
  const defaults=[
    {type:"request",icon:"fa-file-signature",title:"3 membership requests need review",message:"Juan Dela Cruz, Maria Santos and Kyle Ramos submitted enrollment forms.",time:"2 min ago",tag:"request:jc",href:"payments.html"},
    {type:"member",icon:"fa-user-check",title:"New member enrolled",message:"Paolo Reyes joined the Annual Plan. Send him his access details.",time:"18 min ago",tag:"member:pr",href:"members.html"},
    {type:"attendance",icon:"fa-calendar-check",title:"12 members checked in today",message:"Morning rush is the busiest slot so far this week.",time:"1 hr ago",tag:"att:today",href:"attendance.html"},
    {type:"trainer",icon:"fa-dumbbell",title:"Trainer schedule updated",message:"Coach Mika is on the 6:00 AM HIIT block today.",time:"3 hr ago",tag:"trainer:mika",href:"index.html"},
    {type:"payment",icon:"fa-wallet",title:"Payment received",message:"GCash payment of ₱1,200 recorded for Maria Santos.",time:"Yesterday",tag:"pay:maria",href:"payments.html"}
  ];
  const readNotifs=()=>{try{const val=JSON.parse(localStorage.getItem(key));return Array.isArray(val)?val:defaults.map(n=>({...n,id:n.tag,read:false}))}catch{return defaults.map(n=>({...n,id:n.tag,read:false}))}};
  let notifications=readNotifs();
  // One-time seed so the bell is never a dead end on first visit. Anything the
  // member portal already logged is kept rather than overwritten.
  if(!store.get(seedKey)){
    const existing = readNotifs();
    const seen = new Set(existing.map(n=>n.id));
    notifications = [...defaults.map(n=>({...n,id:n.tag,read:false})).filter(n=>!seen.has(n.id)), ...existing].slice(0,40);
    save(); store.set(seedKey,"1");
  }
  const panel=$("#notificationPanel"), button=$("#notificationToggle"), list=$("#notificationList"), badge=$("#notificationBadge");
  function save(){try{localStorage.setItem(key,JSON.stringify(notifications))}catch{}}
  function renderNotifications(){
    if(!list||!badge)return;
    const unread=notifications.filter(n=>!n.read).length;
    // The badge is a dot; the count belongs in the label and the panel header.
    badge.hidden=unread===0;badge.textContent="";
    badge.setAttribute("aria-hidden","true");
    if(button)button.setAttribute("aria-label",unread?`Notifications, ${unread} unread update${unread===1?"":"s"}`:"Notifications, you're all caught up");
    const summary=$("#notificationSummary");if(summary)summary.textContent=unread?`${unread} unread update${unread===1?"":"s"}`:"You're all caught up";
    // A notification that knows where it came from becomes a real link, so the
    // bell actually takes you to the record instead of being a dead end.
    list.innerHTML=notifications.length?notifications.map(n=>{
      const tag=n.href?"a":"article";
      const hrefAttr=n.href?` href="${escapeHTML(n.href)}"`:"";
      const goAttr=n.href?` data-go="${escapeHTML(n.id)}"`:"";
      return `<${tag} class="notification-item ${n.read?"is-read":"is-unread"}${n.href?" is-link":""}"${hrefAttr}${goAttr}><span class="notif-icon ${n.type}"><i class="fa-solid ${n.icon}"></i></span><div class="notif-copy"><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.message)}</p><small>${escapeHTML(n.time)}${n.href?'<i class="fa-solid fa-arrow-right notif-go" aria-hidden="true"></i>':""}</small></div><button type="button" class="notif-read" data-read="${escapeHTML(n.id)}" aria-label="${n.read?"Mark unread":"Mark as read"}" title="${n.read?"Mark unread":"Mark as read"}"><i class="fa-solid ${n.read?"fa-envelope-open":"fa-envelope"}"></i></button></${tag}>`;
    }).join(""):'<div class="notification-empty"><i class="fa-regular fa-bell-slash"></i><strong>No notifications</strong><p>Membership requests, check-ins and trainer updates land here.</p></div>';
  }
  function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function setPanel(open){if(!panel||!button)return;panel.hidden=!open;button.setAttribute("aria-expanded",String(open));if(open)renderNotifications()}
  button?.addEventListener("click",e=>{e.stopPropagation();setPanel(panel.hidden)});
  panel?.addEventListener("click",e=>{
    e.stopPropagation();
    const read=e.target.closest("[data-read]");
    if(read){const item=notifications.find(n=>n.id===read.dataset.read);if(item){item.read=!item.read;save();renderNotifications()}return}
    // Clicking the body of a linked notification marks it read and follows it.
    const row=e.target.closest("[data-go]");
    if(row){const item=notifications.find(n=>n.id===row.dataset.go);if(item&&!item.read){item.read=true;save()}}
  });
  $("#markAllRead")?.addEventListener("click",e=>{e.stopPropagation();notifications=notifications.map(n=>({...n,read:true}));save();renderNotifications()});
  $("#clearNotifications")?.addEventListener("click",e=>{e.stopPropagation();notifications=[];save();renderNotifications()});
  document.addEventListener("click",e=>{if(panel&&button&&!panel.contains(e.target)&&!button.contains(e.target))setPanel(false)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){setPanel(false);setMore(false);setDrawer(false)}});
  // Same-page pushes come in as an event; other tabs come in through storage.
  document.addEventListener("profit-notifications",()=>{notifications=readNotifs();renderNotifications()});
  window.addEventListener("storage",e=>{if(e.key===key){notifications=readNotifs();renderNotifications()}});
  renderNotifications();

  // Public feed so every page (enrollment, attendance, settings, portals) can
  // report what just happened without duplicating this storage logic.
  window.ProFitNotifications = {
    list: () => notifications.map(n=>({...n})),
    unread: () => notifications.filter(n=>!n.read).length,
    push(input) {
      const item = {
        id: input.tag || (input.type+":"+Date.now()),
        type: input.type || "general",
        icon: input.icon || "fa-bell",
        title: input.title || "Update",
        message: input.message || "",
        time: input.time || "Just now",
        href: input.href || "",
        read: false
      };
      // Same event twice (e.g. re-saving a form) should not stack up.
      const dupe = input.tag ? notifications.findIndex(n=>n.id===input.tag) : -1;
      if (dupe > -1) notifications.splice(dupe, 1);
      notifications.unshift(item);
      notifications = notifications.slice(0, 40);
      save();
      document.dispatchEvent(new CustomEvent("profit-notifications"));
      renderNotifications();
      return item;
    },
    markAllRead() { notifications = notifications.map(n=>({...n,read:true})); save(); renderNotifications(); },
    clear() { notifications = []; save(); renderNotifications(); }
  };
})();

// Account menu: opens on hover or focus (CSS), and on click for touch screens and keyboard users.
(() => {
  const toggle = document.getElementById('accountMenuToggle');
  const menu = document.getElementById('accountMenu');
  const setOpen = open => {
    if (!menu || !toggle) return;
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setOpen(!menu.classList.contains('is-open')); });
  // NOTE: this menu used to call stopPropagation on every click inside it, which
  // kept the document-level dismiss handler happy but also swallowed the click
  // before it could bubble to auth.js's [data-logout] listener — so "Log out"
  // did nothing. Close the menu explicitly instead of blocking the event.
  menu?.addEventListener('click', e => {
    if (e.target.closest('[role="menuitem"]')) setOpen(false);
  });
  document.addEventListener('click', e => { if (menu && toggle && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

  // Generic "..." dropdowns used by other pages.
  // A menu anchored to a row action at the far right of a wide table used to
  // open off-screen, so every dropdown is nudged back inside the viewport the
  // moment it appears. `--dd-shift` keeps the base anchoring (right-aligned,
  // or centred for .dropdown-row) intact instead of replacing it.
  const clampDropdown = dropdown => {
    if (!dropdown || dropdown.hidden) return;
    dropdown.style.setProperty('--dd-shift', '0px');
    const r = dropdown.getBoundingClientRect();
    const pad = 12;
    let shift = 0;
    if (r.right > window.innerWidth - pad) shift = window.innerWidth - pad - r.right;
    if (r.left + shift < pad) shift += pad - (r.left + shift);
    if (shift) dropdown.style.setProperty('--dd-shift', Math.round(shift) + 'px');
  };
  document.querySelectorAll('[data-menu], [data-row-menu]').forEach(button => {
    const wrap = button.closest('.menu-wrap, .row-menu-wrap');
    const dropdown = wrap?.querySelector('.dropdown');
    if (!wrap || !dropdown) return;
    const setDropdown = open => {
      dropdown.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      // Measured synchronously: `getBoundingClientRect` forces layout, and a
      // requestAnimationFrame here would not fire in a backgrounded tab.
      if (open) clampDropdown(dropdown);
    };
    button.addEventListener('click', e => { e.stopPropagation(); setDropdown(dropdown.hidden); });
    dropdown.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) setDropdown(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setDropdown(false); });
  });

  const user = window.ProFitAuth?.user;
  // The staff profile page owns this record; fall back to the signed-in user.
  const profile = window.ProFitProfile?.get?.() || {};
  const name = profile.name || user?.name || user?.email || 'Administrator';
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = name);
  const parts = name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const initials = window.ProFitProfile?.initials?.() || parts || 'PF';
  document.querySelectorAll('[data-user-initials]').forEach(el => el.textContent = initials);
  document.querySelectorAll('[data-user-role]').forEach(el => { el.textContent = profile.role || (user?.role === 'MEMBER' ? 'Gym member' : 'Gym administrator'); });
  if (!user) document.querySelectorAll('[data-logout]').forEach(el => el.hidden = true);
})();

// Top bar condenses once the page scrolls — Spotify's header solidifies on scroll.
(() => {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  let ticking = false;
  const update = () => {
    topbar.classList.toggle('is-scrolled', window.scrollY > 8);
    ticking = false;
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

(()=>{try{if(localStorage.getItem("pref-badge")==="off")document.body.classList.add("hide-notif-badge")}catch{}})();
