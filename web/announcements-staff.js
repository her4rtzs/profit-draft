// ProFit Staff Portal — Announcements Module (`web/announcements-staff.js`)
// Wired to /api/staff/announcements/ (GET, POST, PATCH, DELETE) with server-provided
// stats and filter counts, debounced search, 3-dot row action menu, pagination,
// and accessible create/edit/delete dialogs.
(() => {
  const listEl = document.getElementById("annList");
  if (!listEl) return;

  const esc = v =>
    String(v ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const fmtDate = iso => {
    if (!iso) return "No date";
    const raw = String(iso).slice(0, 10);
    const d = new Date(raw + "T00:00:00");
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const AUDIENCE_LABELS = {
    everyone: "Members and trainers",
    members: "Members only",
    trainers: "Trainers only",
    ALL: "Members and trainers",
    SELECTED: "Selected members"
  };

  const STATUS_META = {
    published: {
      badge: "Active",
      pillCls: "published",
      thumbImg: "img/gal-1.jpg",
      icon: "fa-dumbbell",
      tag: "Active"
    },
    draft: {
      badge: "Upcoming",
      pillCls: "draft",
      thumbImg: "img/gal-2.jpg",
      icon: "fa-calendar-day",
      tag: "Upcoming"
    },
    archived: {
      badge: "Info",
      pillCls: "archived",
      thumbImg: "img/prog-1.jpg",
      icon: "fa-box-archive",
      tag: "Info"
    }
  };

  // DOM Elements
  const statTotal = document.getElementById("statTotal");
  const statPublishedMonth = document.getElementById("statPublishedMonth");
  const statLiveNow = document.getElementById("statLiveNow");
  const statAudienceReach = document.getElementById("statAudienceReach");
  const statDrafts = document.getElementById("statDrafts");

  const countAll = document.getElementById("countAll");
  const countDraft = document.getElementById("countDraft");
  const countPublished = document.getElementById("countPublished");
  const countArchived = document.getElementById("countArchived");

  const tileCreate = document.getElementById("annTileCreate");
  const tileManage = document.getElementById("annTileManage");
  const tileArchive = document.getElementById("annTileArchive");
  const tileManageSub = document.getElementById("annTileManageSub");
  const tileArchiveSub = document.getElementById("annTileArchiveSub");
  const tileReachSub = document.getElementById("annTileReachSub");

  const filterPills = document.getElementById("annFilterPills");
  const searchInput = document.getElementById("annSearchInput");
  const statusSelect = document.getElementById("annStatusSelect");
  const newBtn = document.getElementById("annNewBtn");
  const toastEl = document.getElementById("annMsg");
  const summaryEl = document.getElementById("annSummaryText");
  const pagerEl = document.getElementById("annPager");

  // Modal Elements
  const modalBackdrop = document.getElementById("annModalBackdrop");
  const modalTitle = document.getElementById("annModalTitle");
  const modalEyebrow = document.getElementById("annModalEyebrow");
  const modalCloseBtn = document.getElementById("annModalClose");
  const cancelBtn = document.getElementById("annCancelBtn");
  const form = document.getElementById("annForm");
  const idInput = document.getElementById("annId");
  const titleInput = document.getElementById("annTitleInput");
  const titleCount = document.getElementById("annTitleCount");
  const titleErr = document.getElementById("annTitleErr");
  const bodyInput = document.getElementById("annBodyInput");
  const bodyCount = document.getElementById("annBodyCount");
  const bodyErr = document.getElementById("annBodyErr");
  const audienceInput = document.getElementById("annAudienceInput");
  const eventDateInput = document.getElementById("annEventDateInput");
  const statusInput = document.getElementById("annStatusInput");
  const formGeneralErr = document.getElementById("annFormGeneralErr");
  const submitBtn = document.getElementById("annSubmitBtn");
  const submitLabel = document.getElementById("annSubmitLabel");

  // Delete Modal Elements
  const deleteBackdrop = document.getElementById("annDeleteBackdrop");
  const deleteCloseBtn = document.getElementById("annDeleteClose");
  const deleteCancelBtn = document.getElementById("annDeleteCancel");
  const deleteConfirmBtn = document.getElementById("annDeleteConfirm");

  // State
  let currentStatus = "all";
  let currentSearch = "";
  let items = [];
  let serverStats = {
    total: 0,
    published_this_month: 0,
    drafts: 0,
    live_now: 0,
    audience_reach: 0
  };
  let serverCounts = {
    all: 0,
    draft: 0,
    published: 0,
    archived: 0
  };
  let currentPage = 1;
  const pageSize = 6;
  let editingItem = null;
  let pendingDeleteId = null;
  let lastTriggerEl = null;
  let isSubmitting = false;
  let searchTimer = null;

  let toastTimer = null;
  function showToast(message, isError = false) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    if (!message) {
      toastEl.hidden = true;
      toastEl.textContent = "";
      return;
    }
    toastEl.textContent = message;
    toastEl.classList.toggle("err", !!isError);
    toastEl.hidden = false;
    if (!isError) {
      toastTimer = setTimeout(() => {
        toastEl.hidden = true;
      }, 4000);
    }
  }

  function normalizeItem(raw) {
    const status = String(raw.status || "draft").toLowerCase();
    const audienceRaw = String(raw.audience || "everyone");
    const audience =
      audienceRaw === "ALL"
        ? "everyone"
        : audienceRaw === "SELECTED"
        ? "members"
        : audienceRaw.toLowerCase();
    return {
      id: raw.id,
      title: raw.title || "",
      body: raw.body != null ? raw.body : raw.message || "",
      audience,
      event_date: raw.event_date || raw.publish_on || null,
      status: ["draft", "published", "archived"].includes(status) ? status : "draft",
      created_at: raw.created_at || null,
      updated_at: raw.updated_at || null,
      published_at: raw.published_at || raw.publish_on || raw.created_at || null,
      author: raw.author_name || "Admin"
    };
  }

  function updateStatsAndCountsUI() {
    const reachCount = serverStats.people_count ?? serverStats.audience_reach ?? 0;
    if (statTotal) statTotal.textContent = String(serverStats.total ?? 0);
    if (statPublishedMonth) statPublishedMonth.textContent = String(serverStats.published_this_month ?? 0);
    if (statLiveNow) statLiveNow.textContent = `${serverStats.live_now ?? 0} live now`;
    if (statAudienceReach) statAudienceReach.textContent = String(reachCount);
    if (statDrafts) statDrafts.textContent = String(serverStats.drafts ?? 0);

    if (countAll) countAll.textContent = String(serverCounts.all ?? 0);
    if (countDraft) countDraft.textContent = String(serverCounts.draft ?? 0);
    if (countPublished) countPublished.textContent = String(serverCounts.published ?? 0);
    if (countArchived) countArchived.textContent = String(serverCounts.archived ?? 0);

    if (tileManageSub) {
      tileManageSub.textContent = `${serverCounts.published ?? 0} live · ${serverCounts.draft ?? 0} drafts`;
    }
    if (tileArchiveSub) {
      tileArchiveSub.textContent = `${serverCounts.archived ?? 0} archived notices`;
    }
    if (tileReachSub) {
      tileReachSub.textContent = `${reachCount} members & trainers`;
    }
  }

  function syncFilterControls() {
    if (filterPills) {
      filterPills.querySelectorAll(".ann-pill").forEach(btn => {
        const active = btn.dataset.status === currentStatus;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      });
    }
    if (statusSelect && statusSelect.value !== currentStatus) {
      statusSelect.value = currentStatus;
    }
  }

  function getThumbFor(item, meta) {
    const t = String(item.title || "").toLowerCase();
    if (t.includes("operation") || t.includes("hour")) return "img/gal-1.jpg";
    if (t.includes("maintenance") || t.includes("close")) return "img/gal-2.jpg";
    if (t.includes("program") || t.includes("launch") || t.includes("hiit")) return "img/prog-1.jpg";
    if (t.includes("schedule")) return "img/gal-3.jpg";
    return meta.thumbImg || "img/gal-1.jpg";
  }

  function renderCard(item) {
    const meta = STATUS_META[item.status] || STATUS_META.draft;
    const displayDate = fmtDate(item.event_date || item.published_at || item.created_at);
    const thumbSrc = getThumbFor(item, meta);

    const menuActions = [];
    if (item.status === "draft") {
      menuActions.push(
        `<button type="button" role="menuitem" data-act="publish" data-id="${esc(item.id)}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Publish now</button>`
      );
    }
    menuActions.push(
      `<button type="button" role="menuitem" data-act="edit" data-id="${esc(item.id)}"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> Edit</button>`
    );
    if (item.status !== "archived") {
      menuActions.push(
        `<button type="button" role="menuitem" data-act="archive" data-id="${esc(item.id)}"><i class="fa-solid fa-box-archive" aria-hidden="true"></i> Archive</button>`
      );
    }
    menuActions.push(
      `<button type="button" role="menuitem" class="danger" data-act="delete" data-id="${esc(item.id)}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Delete</button>`
    );

    return `
      <article class="ann-item" data-id="${esc(item.id)}">
        <div class="ann-thumb" aria-hidden="true">
          <img src="${thumbSrc}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid ${meta.icon}\\'></i>'">
        </div>
        <div class="ann-item-content">
          <div class="ann-item-title-row">
            <h3>${esc(item.title)}</h3>
          </div>
          ${item.body ? `<p class="ann-item-body">${esc(item.body)}</p>` : ""}
          <div class="ann-item-meta">
            <span class="ann-meta-chip"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${esc(displayDate)}</span>
            <span class="ann-meta-sep" aria-hidden="true">|</span>
            <span class="ann-meta-chip"><i class="fa-regular fa-user" aria-hidden="true"></i> ${esc(item.author || "Admin")}</span>
          </div>
        </div>
        <div class="ann-item-right">
          <span class="ann-status-pill ${meta.pillCls}">${esc(meta.badge)}</span>
          <div class="ann-menu-wrap">
            <button type="button" class="ann-kebab-btn" data-menu-toggle="${esc(item.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(item.title)}">
              <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
            </button>
            <div class="ann-dropdown-menu" role="menu" hidden>
              ${menuActions.join("")}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderList() {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    if (!total) {
      const hasAnyAtAll = (serverCounts.all ?? 0) > 0;
      const isFiltered = currentStatus !== "all" || currentSearch.trim() !== "";
      if (!hasAnyAtAll && !isFiltered) {
        listEl.innerHTML = `
          <div class="ann-empty-state">
            <div class="ann-empty-art" aria-hidden="true"><i class="fa-solid fa-bullhorn"></i></div>
            <h3>No announcements yet</h3>
            <p>Stay connected with your members and trainers. Create your first announcement to get started.</p>
            <button type="button" class="ann-btn primary" data-empty-create>
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
              <span>Create your first announcement</span>
            </button>
          </div>
        `;
      } else {
        listEl.innerHTML = `
          <div class="ann-empty-state">
            <div class="ann-empty-art" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></div>
            <h3>Nothing matches</h3>
            <p>No announcements match your current status filter or search query.</p>
            <button type="button" class="ann-btn" data-empty-clear>
              <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
              <span>Clear filters</span>
            </button>
          </div>
        `;
      }
      if (summaryEl) summaryEl.textContent = "Showing 0 announcements";
      if (pagerEl) pagerEl.innerHTML = "";
      return;
    }

    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = items.slice(startIdx, startIdx + pageSize);
    listEl.innerHTML = pageItems.map(renderCard).join("");

    const fromNum = startIdx + 1;
    const toNum = Math.min(total, startIdx + pageItems.length);
    if (summaryEl) {
      summaryEl.textContent = `Showing ${fromNum}–${toNum} of ${total} announcement${total === 1 ? "" : "s"}`;
    }

    if (pagerEl) {
      let buttonsHtml = `
        <button type="button" class="ann-page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""} aria-label="Previous page">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
      `;
      for (let p = 1; p <= totalPages; p++) {
        buttonsHtml += `
          <button type="button" class="ann-page-btn ${p === currentPage ? "active" : ""}" data-page="${p}" aria-label="Page ${p}" ${p === currentPage ? 'aria-current="page"' : ""}>
            ${p}
          </button>
        `;
      }
      buttonsHtml += `
        <button type="button" class="ann-page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""} aria-label="Next page">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      `;
      pagerEl.innerHTML = buttonsHtml;
    }
  }

  async function loadAnnouncements({ showSkeleton = false } = {}) {
    syncFilterControls();
    if (showSkeleton) {
      listEl.innerHTML = `
        <div class="ann-skel-row" aria-hidden="true"></div>
        <div class="ann-skel-row" aria-hidden="true"></div>
        <div class="ann-skel-row" aria-hidden="true"></div>
      `;
    }

    const params = new URLSearchParams();
    params.set("status", currentStatus || "all");
    if (currentSearch.trim()) {
      params.set("q", currentSearch.trim());
    }

    try {
      const res = await window.ProFitAPI.get(`/staff/announcements/?${params.toString()}`);
      if (Array.isArray(res)) {
        items = res.map(normalizeItem);
        serverCounts.all = items.length;
      } else if (res && typeof res === "object") {
        items = Array.isArray(res.items) ? res.items.map(normalizeItem) : [];
        if (res.stats) serverStats = { ...serverStats, ...res.stats };
        if (res.counts) serverCounts = { ...serverCounts, ...res.counts };
      }
      updateStatsAndCountsUI();
      renderList();
    } catch (err) {
      if (summaryEl) summaryEl.textContent = "";
      listEl.innerHTML = `
        <div class="ann-empty-state">
          <div class="ann-empty-art" aria-hidden="true" style="color:#f87171;border-color:rgba(248,113,113,0.35);background:rgba(248,113,113,0.12)">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h3>Could not load announcements</h3>
          <p>${esc(err.message || "Please check your connection and try again.")}</p>
          <button type="button" class="ann-btn primary" data-retry-load>
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
            <span>Retry</span>
          </button>
        </div>
      `;
    }
  }

  // ---- Action Menu Helpers ----
  function closeAllMenus() {
    document.querySelectorAll(".ann-dropdown-menu:not([hidden])").forEach(menu => {
      menu.hidden = true;
    });
    document.querySelectorAll('.ann-kebab-btn[aria-expanded="true"]').forEach(btn => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  // ---- Create / Edit Modal Helpers ----
  function updateCharCounts() {
    if (titleCount && titleInput) {
      titleCount.textContent = `${titleInput.value.length} / 80`;
    }
    if (bodyCount && bodyInput) {
      bodyCount.textContent = `${bodyInput.value.length} / 600`;
    }
  }

  function syncSubmitButtonLabel() {
    if (!submitLabel || !statusInput) return;
    if (editingItem) {
      submitLabel.textContent =
        statusInput.value === "published" ? "Save & publish" : "Save changes";
    } else {
      submitLabel.textContent =
        statusInput.value === "published" ? "Publish announcement" : "Save draft";
    }
  }

  function clearFormErrors() {
    if (titleErr) {
      titleErr.hidden = true;
      titleErr.textContent = "Please add a title.";
    }
    if (bodyErr) {
      bodyErr.hidden = true;
      bodyErr.textContent = "";
    }
    if (formGeneralErr) {
      formGeneralErr.hidden = true;
      formGeneralErr.textContent = "";
    }
    titleInput?.removeAttribute("aria-invalid");
    bodyInput?.removeAttribute("aria-invalid");
  }

  function openModal(item = null, triggerEl = null) {
    closeAllMenus();
    editingItem = item;
    lastTriggerEl = triggerEl || document.activeElement;
    clearFormErrors();

    if (idInput) idInput.value = item ? String(item.id) : "";
    if (titleInput) titleInput.value = item ? item.title : "";
    if (bodyInput) bodyInput.value = item ? item.body : "";
    if (audienceInput) {
      audienceInput.value =
        item && ["everyone", "members", "trainers"].includes(item.audience)
          ? item.audience
          : "everyone";
    }
    if (eventDateInput) {
      eventDateInput.value = item && item.event_date ? String(item.event_date).slice(0, 10) : "";
    }
    if (statusInput) {
      statusInput.value = item && item.status === "draft" ? "draft" : "published";
    }

    if (modalEyebrow) {
      modalEyebrow.textContent = item ? "Edit Notice" : "Staff Notice";
    }
    if (modalTitle) {
      modalTitle.textContent = item ? "Edit announcement" : "New announcement";
    }

    updateCharCounts();
    syncSubmitButtonLabel();

    if (modalBackdrop) {
      modalBackdrop.hidden = false;
      modalBackdrop.setAttribute("aria-hidden", "false");
    }
    setTimeout(() => {
      titleInput?.focus();
    }, 20);
  }

  function closeModal() {
    if (!modalBackdrop || modalBackdrop.hidden) return;
    modalBackdrop.hidden = true;
    modalBackdrop.setAttribute("aria-hidden", "true");
    editingItem = null;
    isSubmitting = false;
    if (submitBtn) submitBtn.disabled = false;
    if (lastTriggerEl && typeof lastTriggerEl.focus === "function") {
      lastTriggerEl.focus();
    }
  }

  // ---- Delete Confirmation Modal ----
  function openDeleteModal(id, triggerEl = null) {
    closeAllMenus();
    pendingDeleteId = id;
    lastTriggerEl = triggerEl || document.activeElement;
    if (deleteBackdrop) {
      deleteBackdrop.hidden = false;
      deleteBackdrop.setAttribute("aria-hidden", "false");
    }
    setTimeout(() => {
      deleteConfirmBtn?.focus();
    }, 20);
  }

  function closeDeleteModal() {
    if (!deleteBackdrop || deleteBackdrop.hidden) return;
    deleteBackdrop.hidden = true;
    deleteBackdrop.setAttribute("aria-hidden", "true");
    pendingDeleteId = null;
    if (lastTriggerEl && typeof lastTriggerEl.focus === "function") {
      lastTriggerEl.focus();
    }
  }

  // ---- Form Submit ----
  form?.addEventListener("submit", async e => {
    e.preventDefault();
    if (isSubmitting) return;
    clearFormErrors();

    const title = (titleInput?.value || "").trim();
    const body = (bodyInput?.value || "").trim();
    const audience = audienceInput?.value || "everyone";
    const event_date = eventDateInput?.value ? eventDateInput.value : null;
    const status = statusInput?.value || "published";

    if (!title) {
      if (titleErr) {
        titleErr.textContent = "Please add a title.";
        titleErr.hidden = false;
      }
      titleInput?.setAttribute("aria-invalid", "true");
      titleInput?.focus();
      return;
    }

    if (title.length > 80) {
      if (titleErr) {
        titleErr.textContent = "Title must be 80 characters or fewer.";
        titleErr.hidden = false;
      }
      titleInput?.setAttribute("aria-invalid", "true");
      titleInput?.focus();
      return;
    }

    if (body.length > 600) {
      if (bodyErr) {
        bodyErr.textContent = "Message must be 600 characters or fewer.";
        bodyErr.hidden = false;
      }
      bodyInput?.setAttribute("aria-invalid", "true");
      bodyInput?.focus();
      return;
    }

    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;

    const payload = { title, body, audience, event_date, status };

    try {
      if (editingItem) {
        await window.ProFitAPI.patch(`/staff/announcements/${editingItem.id}/`, payload);
        showToast(
          status === "published" ? "Announcement updated and published." : "Draft saved."
        );
      } else {
        await window.ProFitAPI.post("/staff/announcements/", payload);
        showToast(
          status === "published"
            ? "Announcement published. Members and trainers can now see it."
            : "Saved as draft."
        );
      }
      closeModal();
      await loadAnnouncements();
    } catch (err) {
      const fieldErrors = err?.payload?.errors || err?.payload;
      const pickMsg = v => (Array.isArray(v) ? v[0] : typeof v === "string" ? v : "");
      if (fieldErrors?.title && titleErr) {
        titleErr.textContent = pickMsg(fieldErrors.title) || "Please add a title.";
        titleErr.hidden = false;
        titleInput?.focus();
      } else if ((fieldErrors?.body || fieldErrors?.message) && bodyErr) {
        bodyErr.textContent = pickMsg(fieldErrors.body || fieldErrors.message);
        bodyErr.hidden = false;
        bodyInput?.focus();
      } else if (formGeneralErr) {
        formGeneralErr.textContent = err.message || "Could not save announcement.";
        formGeneralErr.hidden = false;
      }
    } finally {
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // ---- Quick Publish / Archive / Delete Actions ----
  async function handlePublish(item) {
    try {
      await window.ProFitAPI.patch(`/staff/announcements/${item.id}/`, { status: "published" });
      showToast("Announcement published.");
      await loadAnnouncements();
    } catch (err) {
      showToast(err.message || "Could not publish announcement.", true);
    }
  }

  async function handleArchive(item) {
    try {
      await window.ProFitAPI.patch(`/staff/announcements/${item.id}/`, { status: "archived" });
      showToast("Announcement archived.");
      await loadAnnouncements();
    } catch (err) {
      showToast(err.message || "Could not archive announcement.", true);
    }
  }

  deleteConfirmBtn?.addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    const targetId = pendingDeleteId;
    const prevItems = [...items];
    closeDeleteModal();

    // Optimistic removal with rollback on error
    items = items.filter(x => String(x.id) !== String(targetId));
    renderList();

    try {
      await window.ProFitAPI.del(`/staff/announcements/${targetId}/`);
      showToast("Announcement deleted.");
      await loadAnnouncements();
    } catch (err) {
      items = prevItems;
      renderList();
      showToast(err.message || "Could not delete announcement.", true);
    }
  });

  // ---- Event Listeners ----
  titleInput?.addEventListener("input", () => {
    updateCharCounts();
    if (titleInput.value.trim() && titleErr && !titleErr.hidden) {
      titleErr.hidden = true;
      titleInput.removeAttribute("aria-invalid");
    }
  });

  bodyInput?.addEventListener("input", updateCharCounts);
  statusInput?.addEventListener("change", syncSubmitButtonLabel);

  newBtn?.addEventListener("click", e => openModal(null, e.currentTarget));
  tileCreate?.addEventListener("click", e => openModal(null, e.currentTarget));

  tileManage?.addEventListener("click", () => {
    currentStatus = "all";
    currentPage = 1;
    loadAnnouncements();
    document.getElementById("annMainPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  tileArchive?.addEventListener("click", () => {
    currentStatus = "archived";
    currentPage = 1;
    loadAnnouncements();
    document.getElementById("annMainPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  modalCloseBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);
  modalBackdrop?.addEventListener("mousedown", e => {
    if (e.target === modalBackdrop) closeModal();
  });

  deleteCloseBtn?.addEventListener("click", closeDeleteModal);
  deleteCancelBtn?.addEventListener("click", closeDeleteModal);
  deleteBackdrop?.addEventListener("mousedown", e => {
    if (e.target === deleteBackdrop) closeDeleteModal();
  });

  filterPills?.addEventListener("click", e => {
    const pill = e.target.closest(".ann-pill");
    if (!pill) return;
    const nextStatus = pill.dataset.status || "all";
    if (nextStatus === currentStatus) return;
    currentStatus = nextStatus;
    currentPage = 1;
    loadAnnouncements();
  });

  statusSelect?.addEventListener("change", () => {
    currentStatus = statusSelect.value || "all";
    currentPage = 1;
    loadAnnouncements();
  });

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = searchInput.value || "";
      currentPage = 1;
      loadAnnouncements();
    }, 300);
  });

  pagerEl?.addEventListener("click", e => {
    const btn = e.target.closest(".ann-page-btn");
    if (!btn || btn.disabled) return;
    const p = Number(btn.dataset.page);
    if (!Number.isFinite(p) || p === currentPage) return;
    currentPage = p;
    renderList();
  });

  listEl.addEventListener("click", e => {
    const createTrigger = e.target.closest("[data-empty-create]");
    if (createTrigger) {
      openModal(null, createTrigger);
      return;
    }

    const clearTrigger = e.target.closest("[data-empty-clear]");
    if (clearTrigger) {
      currentStatus = "all";
      currentSearch = "";
      if (searchInput) searchInput.value = "";
      currentPage = 1;
      loadAnnouncements();
      return;
    }

    const retryTrigger = e.target.closest("[data-retry-load]");
    if (retryTrigger) {
      loadAnnouncements({ showSkeleton: true });
      return;
    }

    const menuToggle = e.target.closest("[data-menu-toggle]");
    if (menuToggle) {
      e.stopPropagation();
      const wrap = menuToggle.closest(".ann-menu-wrap");
      const dropdown = wrap?.querySelector(".ann-dropdown-menu");
      if (!dropdown) return;
      const wasOpen = !dropdown.hidden;
      closeAllMenus();
      if (!wasOpen) {
        dropdown.hidden = false;
        menuToggle.setAttribute("aria-expanded", "true");
      }
      return;
    }

    const actBtn = e.target.closest("[data-act]");
    if (actBtn) {
      e.stopPropagation();
      const id = actBtn.dataset.id;
      const act = actBtn.dataset.act;
      const item = items.find(x => String(x.id) === String(id));
      closeAllMenus();
      if (!item) return;
      if (act === "edit") openModal(item, actBtn);
      else if (act === "publish") handlePublish(item);
      else if (act === "archive") handleArchive(item);
      else if (act === "delete") openDeleteModal(item.id, actBtn);
    }
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".ann-menu-wrap")) {
      closeAllMenus();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeAllMenus();
      if (modalBackdrop && !modalBackdrop.hidden) {
        e.preventDefault();
        closeModal();
      } else if (deleteBackdrop && !deleteBackdrop.hidden) {
        e.preventDefault();
        closeDeleteModal();
      }
    }
    // Focus trap inside active modal
    if (e.key === "Tab") {
      const activeBackdrop =
        modalBackdrop && !modalBackdrop.hidden
          ? modalBackdrop
          : deleteBackdrop && !deleteBackdrop.hidden
          ? deleteBackdrop
          : null;
      if (!activeBackdrop) return;
      const focusables = [
        ...activeBackdrop.querySelectorAll(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  loadAnnouncements({ showSkeleton: true });
})();
