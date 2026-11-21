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

  function openModal() {
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
    const rows = Array.isArray(data?.cashiers) ? data.cashiers : [];
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
      const canResend = c.status_key !== "active";
      const canDeactivate = c.status_key !== "deactivated";
      return `<tr>
        <td><strong>${esc(displayName)}</strong></td>
        <td>${esc(c.email)}</td>
        <td><span class="csh-badge ${badgeClass(c.status_key)}">${esc(c.status)}</span></td>
        <td>
          <div class="csh-actions">
            ${canResend ? `<button type="button" class="csh-btn csh-btn-secondary csh-btn-sm" data-action="resend" data-id="${c.id}">Resend invite</button>` : ""}
            ${canDeactivate ? `<button type="button" class="csh-btn csh-btn-danger csh-btn-sm" data-action="deactivate" data-id="${c.id}" data-name="${esc(displayName)}">Deactivate</button>` : ""}
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
    if (e.key === "Escape" && !backdrop.hidden) closeModal();
  });

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

  tbody?.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "deactivate") {
      const who = btn.dataset.name || "this cashier";
      if (!window.confirm(`Deactivate ${who}? They will no longer be able to sign in. Their past records will stay intact.`)) {
        return;
      }
      btn.disabled = true;
      try {
        await window.ProFitAPI.post(`/staff/cashiers/${id}/deactivate`, {});
        setStatus("Cashier account deactivated.");
        await loadCashiers();
      } catch (err) {
        setStatus(err.message || "Could not deactivate cashier.", true);
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === "resend") {
      btn.disabled = true;
      try {
        const res = await window.ProFitAPI.post(`/staff/cashiers/${id}/resend-invite`, {});
        showInviteResult(res);
        setStatus(res.email_sent ? `Invitation resent to ${res.email}.` : (res.email_status_note || "New invitation link created."));
        await loadCashiers();
      } catch (err) {
        setStatus(err.message || "Could not resend invite.", true);
      } finally {
        btn.disabled = false;
      }
    }
  });

  loadCashiers();
})();
