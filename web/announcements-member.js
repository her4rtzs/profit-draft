// Member announcements: the Overview preview, the full Announcements tab, and the bell count.
(() => {
  const list = document.getElementById("announcementList");
  const preview = document.getElementById("annPreview");
  const bell = document.getElementById("homeAnnounceCount");
  if (!list && !preview && !bell) return;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = s => s ? new Date(s).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "";
  const card = n => `<article class="ann-card">
      <div class="ann-meta">${n.pinned ? '<span class="ann-badge pin"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> Pinned</span>' : ""}<span>${fmt(n.published_at || n.publish_on)}</span></div>
      <h3>${esc(n.title)}</h3>
      <p class="ann-body">${esc(n.message)}</p>
    </article>`;
  const empty = text => `<div class="ann-empty"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i><p>${text}</p></div>`;

  async function load() {
    try {
      const rows = await window.ProFitAPI.get("/announcements/");
      if (list) list.innerHTML = rows.length ? rows.map(card).join("") : empty("No announcements yet. New notices from the gym show up here.");
      if (preview) preview.innerHTML = rows.length ? rows.slice(0, 3).map(card).join("") : `<p class="ann-msg">No announcements yet.</p>`;
    } catch { /* keep what is on the page */ }
  }

  async function unread() {
    if (!bell) return;
    try {
      const res = await window.ProFitAPI.get("/notifications/?limit=1");
      bell.textContent = String(res.unread || 0);
    } catch { /* keep the last count */ }
  }

  // The bell and "See all" link to #announcements. Open that tab when the hash says so.
  const openTab = () => {
    if (location.hash === "#announcements") document.querySelector('.pp-tab[data-tab="announcements"]')?.click();
  };
  window.addEventListener("hashchange", openTab);

  load();
  unread();
  setInterval(unread, 60000);
  openTab();
})();
