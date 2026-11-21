/* Owner-only Cashiers management page: list, invite, resend invite, deactivate. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[c]));

  const msgEl = $("cshMsg");
  const kpiActive = $("kpiActiveCashiers");
  const kpiPending = $("kpiPendingInvites");
  const toolbar = $("cshToolbar");
  const emptyEl = $("cshEmpty");
  const tableWrap = $("cshTableWrap");
  const tbody = $("cshTableBody");
  const rowMenu = $("cshRowMenu");
  const inviteBox = $("cshInviteBox");
  const inviteNote = $("cshInviteNote");
  const inviteUrlInput = $("cshInviteUrl");
  const copyInviteBtn = $("copyInviteBtn");

  const backdrop = $("inviteModalBackdrop");
  const form = $("inviteCashierForm");
  const nameInput = $("cName");
  const emailInput = $("cEmail");
  const modalErr = $("inviteModalErr");
  const submitBtn = $("submitInviteBtn");

  let cashiersById = new Map();
  let activeMenuTrigger = null;

  function setStatus(text, isError = false) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.toggle("is-error", !!isError);
  }

  function validFullName(raw) {
    const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
    return parts.length >= 2 && /[A-Za-z]/.test(parts[0]) && /[A-Za-z]/.test(parts[parts.length - 1]);
  }

  function showInviteResult(res) {
    if (res && res.invite_url && !res.email_sent) {
      inviteNote.textContent = res.email_status_note || "Copy and share this invitation link with the cashier:";
      inviteUrlInput.value = res.invite_url;
      inviteBox.hidden = false;
    } else {
      inviteBox.hidden = true;
    }
  }

  function closeRowMenu() {
    if (!rowMenu) return;
    rowMenu.hidden = true;
    rowMenu.innerHTML = "";
    if (activeMenuTrigger) {
      activeMenuTrigger.setAttribute("aria-expanded", "false");
      activeMenuTrigger = null;
    }
  }

  function openRowMenu(trigger, cashier) {
    if (!rowMenu || !cashier) return;
    if (activeMenuTrigger === trigger && !rowMenu.hidden) {
      closeRowMenu();
      return;
    }
    closeRowMenu();
    const displayName = (cashier.name || "").trim() || "Name not set";
    const canResend = cashier.status_key !== "active";
    const canDeactivate = cashier.status_key !== "deactivated";
    const items = [];
    if (canResend) {
      items.push(`<button type="button" role="menuitem" class="csh-menu-item" data-action="resend" data-id="${cashier.id}"><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> Resend invite</button>`);
    }
    if (canDeactivate) {
      items.push(`<button type="button" role="menuitem" class="csh-menu-item is-danger" data-action="deactivate" data-id="${cashier.id}" data-name="${esc(displayName)}"><i class="fa-solid fa-user-slash" aria-hidden="true"></i> Deactivate</button>`);
    }
    if (!items.length) return;

    rowMenu.innerHTML = items.join("");
    rowMenu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    activeMenuTrigger = trigger;

    const r = trigger.getBoundingClientRect();
    const menuRect = rowMenu.getBoundingClientRect();
    let left = r.right - menuRect.width;
    let top = r.bottom + 6;
    if (left < 12) left = 12;
    if (top + menuRect.height > window.innerHeight - 12) {
      top = Math.max(12, r.top - menuRect.height - 6);
    }
    rowMenu.style.left = `${Math.round(left)}px`;
    rowMenu.style.top = `${Math.round(top)}px`;
  }

  function openModal() {
    closeRowMenu();
    modalErr.textContent = "";
    form.reset();
    backdrop.hidden = false;
    nameInput.focus();
  }

  function closeModal() {
    backdrop.hidden = true;
  }

  function badgeClass(key) {
    if (key === "active") return "is-active";
    if (key === "pending") return "is-pending";
    return "is-deactivated";
  }

  function render(data) {
    closeRowMenu();
    const rows = Array.isArray(data?.cashiers) ? data.cashiers : [];
    cashiersById = new Map(rows.map(c => [String(c.id), c]));
    kpiActive.textContent = String(data?.active_count ?? 0);
    kpiPending.textContent = String(data?.pending_invites_count ?? 0);

    if (!rows.length) {
      toolbar.hidden = true;
      tableWrap.hidden = true;
      emptyEl.hidden = false;
      tbody.innerHTML = "";
      return;
    }

    toolbar.hidden = false;
    emptyEl.hidden = true;
    tableWrap.hidden = false;

    tbody.innerHTML = rows.map(c => {
      const displayName = (c.name || "").trim() || "Name not set";
      const avatarSrc = window.ProFitAvatar
        ? window.ProFitAvatar.resolve(c.photo, c.email || displayName || c.id)
        : "";
      return `<tr>
        <td>
          <div class="csh-person">
            <span class="csh-avatar" aria-hidden="true">${avatarSrc ? `<img src="${avatarSrc}" alt="">` : ""}</span>
            <div class="csh-person-copy">
              <strong>${esc(displayName)}</strong>
              <small>Cashier</small>
            </div>
          </div>
        </td>
        <td>${esc(c.email)}</td>
        <td><span class="csh-badge ${badgeClass(c.status_key)}">${esc(c.status)}</span></td>
        <td class="csh-actions-cell">
          <div class="csh-menu-wrap">
            <button type="button" class="csh-menu-trigger" data-row-menu="${c.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(displayName)}" title="Actions">
              <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  async function loadCashiers() {
    try {
      const data = await window.ProFitAPI.get("/staff/cashiers");
      render(data);
    } catch (err) {
      setStatus(err.message || "Could not load cashiers.", true);
    }
  }

  $("openInviteCashierTop")?.addEventListener("click", openModal);
  $("openInviteCashierEmpty")?.addEventListener("click", openModal);
  $("closeInviteModal")?.addEventListener("click", closeModal);
  $("cancelInviteModal")?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", e => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!backdrop.hidden) closeModal();
      closeRowMenu();
    }
  });
  document.addEventListener("click", e => {
    if (rowMenu && !rowMenu.hidden && !rowMenu.contains(e.target) && !e.target.closest("[data-row-menu]")) {
      closeRowMenu();
    }
  });
  window.addEventListener("scroll", closeRowMenu, true);
  window.addEventListener("resize", closeRowMenu);

  copyInviteBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(inviteUrlInput.value);
      setStatus("Invitation link copied.");
    } catch {
      inviteUrlInput.select();
      setStatus("Select and copy the invitation link above.");
    }
  });

  form?.addEventListener("submit", async e => {
    e.preventDefault();
    modalErr.textContent = "";
    const fullName = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!validFullName(fullName)) {
      modalErr.textContent = "Enter your first and last name.";
      nameInput.focus();
      return;
    }
    const emailErr = window.ProFitAPI?.validateRealEmail ? window.ProFitAPI.validateRealEmail(email) : "";
    if (emailErr) {
      modalErr.textContent = emailErr;
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    try {
      const res = await window.ProFitAPI.post("/staff/cashiers", { full_name: fullName, email });
      closeModal();
      showInviteResult(res);
      setStatus(res.email_sent ? `Invitation sent to ${res.email}.` : (res.email_status_note || "Cashier invited."));
      await loadCashiers();
    } catch (err) {
      modalErr.textContent = err.message || "Could not invite cashier.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send invite";
    }
  });

  tbody?.addEventListener("click", e => {
    const trigger = e.target.closest("button[data-row-menu]");
    if (!trigger) return;
    e.stopPropagation();
    const cashier = cashiersById.get(String(trigger.dataset.rowMenu));
    openRowMenu(trigger, cashier);
  });

  rowMenu?.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const who = btn.dataset.name || "this cashier";
    closeRowMenu();

    if (action === "deactivate") {
      if (!window.confirm(`Deactivate ${who}? They will no longer be able to sign in. Their past records will stay intact.`)) {
        return;
      }
      try {
        await window.ProFitAPI.post(`/staff/cashiers/${id}/deactivate`, {});
        setStatus("Cashier account deactivated.");
        await loadCashiers();
      } catch (err) {
        setStatus(err.message || "Could not deactivate cashier.", true);
      }
      return;
    }

    if (action === "resend") {
      try {
        const res = await window.ProFitAPI.post(`/staff/cashiers/${id}/resend-invite`, {});
        showInviteResult(res);
        setStatus(res.email_sent ? `Invitation resent to ${res.email}.` : (res.email_status_note || "New invitation link created."));
        await loadCashiers();
      } catch (err) {
        setStatus(err.message || "Could not resend invite.", true);
      }
    }
  });

  loadCashiers();
})();
