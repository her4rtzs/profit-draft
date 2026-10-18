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

  const ICON = { ANNOUNCEMENT: "fa-bullhorn", TRAINER: "fa-user-tie", MEMBERSHIP: "fa-id-card", PAYMENT: "fa-wallet", GENERAL: "fa-bell" };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ago = iso => {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };

  const style = document.createElement("style");
  style.textContent = `
    #notificationList .notification-item{display:flex;align-items:flex-start;gap:12px;width:100%;padding:14px 16px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;border-radius:14px;transition:background-color .2s ease}
    #notificationList .notification-item:hover{background:rgba(255,255,255,.05)}
    #notificationList .notification-item:focus-visible{outline:2px solid #e8b93a;outline-offset:-2px}
    #notificationList .notification-item.is-unread strong{font-weight:800}
    #notificationList .notification-item.is-read{opacity:.62}
    #notificationList .notif-icon{flex:0 0 36px;height:36px;border-radius:12px;display:grid;place-items:center;background:rgba(232, 185, 58,.14);color:#e8b93a}
    #notificationList .notif-copy{display:grid;gap:3px;min-width:0}
    #notificationList .notif-copy strong{font-size:14px;font-weight:700}
    #notificationList .notif-copy small{font-size:12.5px;color:#9aa4b6;line-height:1.4}
    #notificationList .notif-copy em{font-style:normal;font-size:11.5px;color:#6f7a8e}
    #notificationList .notification-empty{display:grid;justify-items:center;gap:8px;padding:28px 16px;text-align:center;color:#9aa4b6}
    #notificationList .notification-empty i{font-size:22px;color:#e8b93a}`;
  document.head.appendChild(style);

  let items = [];
  let unread = 0;

  function paint() {
    if (badge) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = unread === 0;
    }
    if (toggle) toggle.setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications, you're all caught up");
    if (summary) summary.textContent = unread ? `${unread} unread` : "You're all caught up";
    if (markAll) markAll.disabled = unread === 0;
    if (!list) return;
    list.innerHTML = items.length
      ? items.map(n => `<button type="button" class="notification-item ${n.read ? "is-read" : "is-unread"}" data-id="${esc(n.id)}" role="menuitem">
          <span class="notif-icon"><i class="fa-solid ${ICON[n.kind] || "fa-bell"}" aria-hidden="true"></i></span>
          <span class="notif-copy"><strong>${esc(n.title)}</strong>${n.body ? `<small>${esc(n.body)}</small>` : ""}<em>${ago(n.time)}</em></span>
        </button>`).join("")
      : `<div class="notification-empty"><i class="fa-regular fa-bell-slash" aria-hidden="true"></i><strong>No notifications</strong><p>New announcements, trainer changes and membership updates show up here.</p></div>`;
  }

  async function load() {
    try {
      const res = await window.ProFitAPI.get("/notifications/?limit=30");
      items = res.items || [];
      unread = res.unread || 0;
      paint();
    } catch { /* keep the last list on a failed request */ }
  }

  function setOpen(open) {
    if (!panel || !toggle) return;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) load();
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
        const res = await window.ProFitAPI.post(`/notifications/${item.id}/read/`, {});
        item.read = true;
        unread = res.unread ?? Math.max(0, unread - 1);
        paint();
      }
    } catch { /* still follow the link */ }
    if (item.link) window.location.href = item.link;
  });

  markAll?.addEventListener("click", async e => {
    e.stopPropagation();
    try {
      await window.ProFitAPI.post("/notifications/read-all/", {});
      items = items.map(n => ({ ...n, read: true }));
      unread = 0;
      paint();
    } catch { /* keep the list as it was */ }
  });

  document.addEventListener("profit:synced", load);
  setInterval(() => { if (!document.hidden) load(); }, 60000);
  load();
})();
