/* Settings Activity Log drawer (Facebook/Instagram style timeline, shared across all roles). */
(() => {
  "use strict";

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  function relTime(isoStr) {
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return "";
    const diffSec = Math.round((Date.now() - dt.getTime()) / 1000);
    const timePart = dt.toLocaleTimeString("en-US", {
      timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit"
    });
    const datePart = dt.toLocaleDateString("en-US", {
      timeZone: "Asia/Manila", month: "short", day: "numeric"
    });
    if (diffSec >= 0 && diffSec < 60) return `Just now · ${timePart}`;
    if (diffSec >= 60 && diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago · ${timePart}`;
    if (diffSec >= 3600 && diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago · ${timePart}`;
    return `${datePart} · ${timePart}`;
  }

  function shiftIsoDate(ymd, deltaDays) {
    const [y, m, d] = String(ymd || "").split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
    return dt.toISOString().slice(0, 10);
  }

  function dayHeading(day, today) {
    if (!day) return "Earlier";
    if (day === today) return "Today";
    if (today && day === shiftIsoDate(today, -1)) return "Yesterday";
    const dt = new Date(`${day}T00:00:00+08:00`);
    return isNaN(dt.getTime())
      ? day
      : dt.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  }

  function mount() {
    const toggle = document.getElementById("pfActivityToggle");
    const drawer = document.getElementById("pfActivityDrawer");
    if (!toggle || !drawer || toggle.dataset.pfActWired === "1") return;
    toggle.dataset.pfActWired = "1";

    const state = {
      loaded: false,
      loading: false,
      error: "",
      cat: "all",
      query: "",
      today: "",
      counts: { all: 0, security: 0, actions: 0, updates: 0 },
      items: [],
    };

    const sub = toggle.querySelector("[data-act-sub]");

    function render() {
      const counts = state.counts || {};
      const q = state.query.trim().toLowerCase();
      const filtered = (state.items || []).filter(it => {
        if (state.cat !== "all" && it.category !== state.cat) return false;
        if (!q) return true;
        return `${it.title || ""} ${it.detail || ""}`.toLowerCase().includes(q);
      });

      const pills = [
        ["all", "All", counts.all || 0],
        ["security", "Security", counts.security || 0],
        ["actions", "Actions", counts.actions || 0],
        ["updates", "Updates", counts.updates || 0],
      ];

      let bodyHtml = "";
      if (state.loading && !state.loaded) {
        bodyHtml = `<div class="pf-act-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading your activity...</div>`;
      } else if (state.error) {
        bodyHtml = `<div class="pf-act-empty">
          <i class="fa-solid fa-wifi" aria-hidden="true"></i>
          <p>${esc(state.error)}</p>
          <button type="button" class="pf-act-retry" data-act-retry>Try again</button>
        </div>`;
      } else if (!filtered.length) {
        bodyHtml = `<div class="pf-act-empty">
          <i class="fa-regular fa-clock" aria-hidden="true"></i>
          <p>${q || state.cat !== "all" ? "No matching activity found." : "No recent activity recorded yet."}</p>
        </div>`;
      } else {
        const groups = [];
        let lastKey = null;
        filtered.forEach(item => {
          const gKey = item.day || "earlier";
          if (gKey !== lastKey) {
            groups.push({ label: dayHeading(item.day, state.today), rows: [] });
            lastKey = gKey;
          }
          groups[groups.length - 1].rows.push(item);
        });
        bodyHtml = groups.map(g => `
          <div class="pf-act-group">
            <div class="pf-act-date">${esc(g.label)}</div>
            <div class="pf-act-list">
              ${g.rows.map(it => {
                const icoClass = String(it.icon || "fa-clock-rotate-left").startsWith("fa-brands ")
                  ? it.icon
                  : `fa-solid ${it.icon || "fa-clock-rotate-left"}`;
                const safeHref = (it.link && typeof it.link === "string" && it.link.startsWith("/") && !it.link.startsWith("//"))
                  ? it.link
                  : "";
                return `<div class="pf-act-row">
                  <span class="pf-act-ico tone-${esc(it.tone || "slate")}" aria-hidden="true"><i class="${esc(icoClass)}"></i></span>
                  <div class="pf-act-copy">
                    <strong>${esc(it.title)}</strong>
                    ${it.detail ? `<small>${esc(it.detail)}</small>` : ""}
                    <span class="pf-act-time">${esc(relTime(it.at))}</span>
                  </div>
                  ${safeHref ? `<a class="pf-act-go" href="${esc(safeHref)}" aria-label="Open page"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>` : ""}
                </div>`;
              }).join("")}
            </div>
          </div>
        `).join("");
      }

      drawer.innerHTML = `
        <div class="pf-act-head">
          <div class="pf-act-pills" role="tablist" aria-label="Filter activity log">
            ${pills.map(([key, lbl, num]) => `
              <button type="button" role="tab" aria-selected="${state.cat === key}" class="pf-act-pill${state.cat === key ? " is-active" : ""}" data-act-cat="${key}">
                ${esc(lbl)} <span>${num}</span>
              </button>
            `).join("")}
          </div>
          <div class="pf-act-tools">
            <label class="pf-act-search">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <input type="search" placeholder="Search activity..." value="${esc(state.query)}" aria-label="Search activity log" data-act-search>
            </label>
            <button type="button" class="pf-act-refresh" data-act-refresh title="Refresh activity" aria-label="Refresh activity"${state.loading ? " disabled" : ""}>
              <i class="fa-solid fa-rotate${state.loading ? " fa-spin" : ""}" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="pf-act-scroll">${bodyHtml}</div>
      `;

      if (q) {
        const inp = drawer.querySelector("[data-act-search]");
        if (inp) {
          inp.focus();
          inp.setSelectionRange(inp.value.length, inp.value.length);
        }
      }
    }

    async function load(force = false) {
      if (state.loading || (state.loaded && !force)) return;
      state.loading = true;
      state.error = "";
      render();
      try {
        const res = await window.ProFitAPI.get("/auth/activity");
        state.items = Array.isArray(res?.items) ? res.items : [];
        state.counts = res?.counts || { all: state.items.length, security: 0, actions: 0, updates: 0 };
        state.today = res?.today || "";
        state.loaded = true;
        if (sub) {
          const total = state.counts.all || 0;
          sub.textContent = total
            ? `${total} recent event${total === 1 ? "" : "s"} · Sign-ins, actions & updates`
            : "Sign-ins, actions & account updates";
        }
      } catch (err) {
        state.error = err?.message || "Could not load your activity log.";
      } finally {
        state.loading = false;
        render();
      }
    }

    drawer.addEventListener("click", e => {
      const catBtn = e.target.closest("[data-act-cat]");
      if (catBtn) {
        state.cat = catBtn.dataset.actCat || "all";
        render();
        return;
      }
      if (e.target.closest("[data-act-refresh]") || e.target.closest("[data-act-retry]")) {
        load(true);
      }
    });

    drawer.addEventListener("input", e => {
      if (e.target.matches("[data-act-search]")) {
        state.query = e.target.value || "";
        render();
      }
    });

    toggle.addEventListener("click", () => {
      const open = drawer.hidden;
      drawer.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) load(false);
    });
  }

  window.PFActivityLog = { mount };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
