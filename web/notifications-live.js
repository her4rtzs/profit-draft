// Live notification centre. Reads and writes through /api/notifications/, so the list, the unread
// count and the read state come from the database. It replaces the older bell wiring on the page.
(() => {
  if (!document.getElementById("notificationToggle") || !document.getElementById("notificationPanel")) return;

  // Tell the older local engine (sidebar.js) to stand down: the server feed owns the bell now.
  window.PF_LIVE_NOTIFICATIONS = true;
  // Clones carry no listeners, so the old demo wiring is dropped by swapping the nodes.
  const swap = id => {
    const old = document.getElementById(id);
    if (!old) return null;
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    return fresh;
  };
  const toggle = swap("notificationToggle");
  const panel = swap("notificationPanel");
  const list = swap("notificationList");
  const badge = swap("notificationBadge");
  const summary = swap("notificationSummary");
  const markAll = swap("markAllRead");
  swap("clearNotifications")?.remove();

  const META = {
    ANNOUNCEMENT: { icon: "fa-bullhorn", label: "Announcement", cls: "k1" },
    PAYMENT: { icon: "fa-wallet", label: "Payment", cls: "k2" },
    ATTENDANCE: { icon: "fa-calendar-check", label: "Attendance", cls: "k3" },
    MEMBERSHIP: { icon: "fa-id-card", label: "Membership", cls: "k4" },
    TRAINER: { icon: "fa-dumbbell", label: "Trainer", cls: "k5" },
    GENERAL: { icon: "fa-bell", label: "Update", cls: "k3" }
  };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ago = iso => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };

  const style = document.createElement("style");
  style.textContent = `
    #notificationList .notification-item{display:flex;align-items:center;gap:12px;width:100%;padding:14px 18px;border:0;border-top:1px solid var(--border,rgba(255,255,255,.08));background:transparent;color:inherit;text-align:left;cursor:pointer;border-radius:0;transition:background-color .16s ease}
    #notificationList .notification-item:first-child{border-top:0}
    #notificationList .notification-item.is-unread{background:rgba(224,185,74,.06)}
    body:not(.dark) #notificationList .notification-item.is-unread{background:rgba(240,185,42,.12)}
    #notificationList .notification-item:hover{background:var(--hover,rgba(255,255,255,.06))}
    #notificationList .notification-item:focus-visible{outline:2px solid #e8b93a;outline-offset:-2px}
    #notificationList .notification-item.is-read{opacity:.78}
    #notificationList .notif-icon{flex:0 0 38px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(224,185,74,.16);color:#f0cf68;font-size:15px}
    body:not(.dark) #notificationList .notif-icon{background:#fbefd0;color:#8a6212}
    #notificationList .notif-copy{display:grid;gap:2px;min-width:0;flex:1}
    #notificationList .notif-meta{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
    #notificationList .notif-meta .cl{font-size:12px;font-weight:700;letter-spacing:.01em}
    #notificationList .notif-meta .cl.k1{color:#ff7b8a}
    #notificationList .notif-meta .cl.k2{color:#3ddc84}
    #notificationList .notif-meta .cl.k3{color:#58b6ff}
    #notificationList .notif-meta .cl.k4{color:#ffc061}
    #notificationList .notif-meta .cl.k5{color:#b79cff}
    body:not(.dark) #notificationList .notif-meta .cl.k1{color:#d6455a}
    body:not(.dark) #notificationList .notif-meta .cl.k2{color:#1f9d5c}
    body:not(.dark) #notificationList .notif-meta .cl.k3{color:#2b8fd6}
    body:not(.dark) #notificationList .notif-meta .cl.k4{color:#c47a0a}
    body:not(.dark) #notificationList .notif-meta .cl.k5{color:#7c3aed}
    #notificationList .notif-meta small{font-size:12px;color:var(--muted,#8f9bae)}
    #notificationList .notif-copy strong{font-size:14.5px;font-weight:600;line-height:1.3;color:var(--text,#f3f4f6)}
    #notificationList .notification-item.is-unread .notif-copy strong{font-weight:700}
    body:not(.dark) #notificationList .notif-copy strong{color:#2a2418}
    #notificationList .notif-copy p{margin:2px 0 0;font-size:13px;line-height:1.4;color:var(--muted,#9aa4b6);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    body:not(.dark) #notificationList .notif-copy p{color:#6f6450}
    #notificationList .notif-chev{flex:none;font-size:12px;color:var(--faint,#758399);margin-left:4px}
    #notificationList .notification-empty{display:grid;justify-items:center;gap:8px;padding:28px 18px;text-align:center;color:var(--muted,#9aa4b6)}
    #notificationList .notification-empty i{font-size:22px;color:#e8b93a}`;
  document.head.appendChild(style);

  const CACHE_KEY = "pf-notif-cache-v1";
  let items = [];
  let unread = 0;
  let lastFetchTs = 0;
  let inFlightLoad = null;
  let hasLoadedOnce = false;

  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (cached && Array.isArray(cached.items)) {
      items = cached.items;
      unread = Number(cached.unread || 0);
      lastFetchTs = Number(cached.ts || 0);
      hasLoadedOnce = true;
    }
  } catch {}

  function paint() {
    if (badge) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = unread === 0;
    }
    if (summary) {
      summary.innerHTML = inFlightLoad && !hasLoadedOnce
        ? '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true" style="margin-right:5px;color:#e8b93a"></i>Checking...'
        : (unread ? `${unread} unread` : "");
      summary.hidden = !inFlightLoad && unread === 0;
    }
    if (markAll) {
      markAll.disabled = unread === 0;
      markAll.hidden = unread === 0;
    }
    if (!list) return;
    if (inFlightLoad && !hasLoadedOnce && !items.length) {
      list.innerHTML = `<div class="notification-empty"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><strong>Loading notifications...</strong></div>`;
      return;
    }
    list.innerHTML = items.length
      ? items.map(n => {
          const meta = META[String(n.kind || "GENERAL").toUpperCase()] || META.GENERAL;
          return `<button type="button" class="notification-item nr ${n.read ? "is-read" : "is-unread u"}" data-id="${esc(n.id)}">
            <span class="notif-icon ei ${meta.cls}" aria-hidden="true"><i class="fa-solid ${meta.icon}"></i></span>
            <span class="notif-copy at">
              <span class="notif-meta"><span class="cl ${meta.cls}">${meta.label}</span><small>${ago(n.time)}</small></span>
              <strong>${esc(n.title)}</strong>
              ${n.body ? `<p>${esc(n.body)}</p>` : ""}
            </span>
            <i class="fa-solid fa-chevron-right notif-chev" aria-hidden="true"></i>
          </button>`;
        }).join("")
      : `<div class="notification-empty"><i class="fa-regular fa-bell-slash" aria-hidden="true"></i><strong>No notifications</strong><p>New announcements, GCash claims, and membership updates show up here.</p></div>`;
  }

  async function load(force = false) {
    if (inFlightLoad) return inFlightLoad;
    if (!force && hasLoadedOnce && (Date.now() - lastFetchTs) < 15000) {
      paint();
      return;
    }
    inFlightLoad = (async () => {
      if (!hasLoadedOnce && panel && !panel.hidden) paint();
      try {
        const res = await window.ProFitAPI.get("/notifications/?limit=30", { silent: true });
        items = res.items || [];
        unread = res.unread || 0;
        lastFetchTs = Date.now();
        hasLoadedOnce = true;
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items, unread, ts: lastFetchTs })); } catch {}
      } catch {
        hasLoadedOnce = true;
      } finally {
        inFlightLoad = null;
        paint();
      }
    })();
    return inFlightLoad;
  }

  function setOpen(open) {
    if (!panel || !toggle) return;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      paint();
      load(false);
    }
  }

  toggle?.addEventListener("click", e => { e.stopPropagation(); setOpen(panel.hidden); });
  panel?.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });

  list?.addEventListener("click", async e => {
    const row = e.target.closest(".notification-item");
    if (!row) return;
    const item = items.find(n => String(n.id) === row.dataset.id);
    if (!item) return;
    try {
      if (!item.read) {
        const res = await window.ProFitAPI.post(`/notifications/${item.id}/read/`, {}, { silent: true });
        item.read = true;
        unread = res.unread ?? Math.max(0, unread - 1);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items, unread, ts: lastFetchTs })); } catch {}
        paint();
      }
    } catch { /* still follow the link */ }
    if (item.link) window.location.href = item.link;
  });

  markAll?.addEventListener("click", async e => {
    e.stopPropagation();
    try {
      await window.ProFitAPI.post("/notifications/read-all/", {}, { silent: true });
      items = items.map(n => ({ ...n, read: true }));
      unread = 0;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items, unread, ts: lastFetchTs })); } catch {}
      paint();
    } catch { /* keep the list as it was */ }
  });

  if (hasLoadedOnce) paint();
  document.addEventListener("profit:synced", () => load(true));
  setInterval(() => { if (!document.hidden) load(true); }, 60000);
  load(false);
})();
