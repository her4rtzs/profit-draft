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

  function randomTempPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    let out = "Pf!";
    for (let i = 0; i < 9; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  async function copyText(text, btn) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> Copied`;
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    }
  }

  function syncAccessModeUI() {
    const mode = document.querySelector('input[name="cshAccessMode"]:checked')?.value || "invite";
    document.querySelectorAll(".csh-access-card").forEach(card => {
      const r = card.querySelector('input[type="radio"]');
      card.classList.toggle("is-selected", !!r?.checked);
    });
    const pwWrap = $("cshTempPwWrap");
    if (pwWrap) pwWrap.hidden = mode !== "temp_password";
    const pwInput = $("cshTempPw");
    if (mode === "temp_password" && pwInput && !pwInput.value) {
      pwInput.value = randomTempPassword();
    }
  }

  function openModal() {
    closeRowMenu();
    modalErr.textContent = "";
    form.reset();
    const head = $("cshModalHead");
    const sv = $("cshSuccessView");
    if (head) head.hidden = false;
    form.hidden = false;
    if (sv) sv.hidden = true;
    const inviteRadio = document.querySelector('input[name="cshAccessMode"][value="invite"]');
    if (inviteRadio) inviteRadio.checked = true;
    const pwInput = $("cshTempPw");
    if (pwInput) pwInput.value = "";
    syncAccessModeUI();
    backdrop.hidden = false;
    backdrop.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    backdrop.querySelector(".csh-modal")?.scrollTo({ top: 0 });
    nameInput.focus();
  }

  function closeModal() {
    backdrop.hidden = true;
    backdrop.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function showSuccessScreen(res) {
    const head = $("cshModalHead");
    const sv = $("cshSuccessView");
    if (head) head.hidden = true;
    form.hidden = true;
    if (sv) sv.hidden = false;
    backdrop.querySelector(".csh-modal")?.scrollTo({ top: 0 });

    $("cshSuccName").textContent = (res?.name || nameInput.value || "").trim() || "—";
    $("cshSuccEmail").textContent = res?.email || emailInput.value.trim() || "—";

    const stEl = $("cshSuccStatus");
    const invBox = $("cshSuccInviteBox");
    const tmpBox = $("cshSuccTempBox");
    if (res?.access_mode === "temp_password") {
      stEl.textContent = "Active · Temp Password";
      stEl.className = "csh-badge is-active";
      invBox.hidden = true;
      tmpBox.hidden = false;
      $("cshSuccCreds").value = `Email: ${res.email} | Password: ${res.temp_password}`;
      $("cshSuccSub").textContent = "Cashier profile and active login account have been created.";
    } else {
      stEl.textContent = "Invite Pending";
      stEl.className = "csh-badge is-pending";
      tmpBox.hidden = true;
      invBox.hidden = false;
      $("cshSuccLink").value = res?.invite_url || "";
      $("cshSuccEmailNote").textContent = res?.email_status_note || "";
      $("cshSuccSub").textContent = res?.email_sent
        ? "Cashier profile created and invitation email sent."
        : "Cashier profile created. Share the invitation link below.";
    }
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
  $("cshAddAnother")?.addEventListener("click", openModal);
  $("cshSuccessDone")?.addEventListener("click", async () => {
    closeModal();
    await loadCashiers();
  });
  document.querySelectorAll('input[name="cshAccessMode"]').forEach(r => r.addEventListener("change", syncAccessModeUI));
  $("cshGenPwBtn")?.addEventListener("click", () => {
    const inp = $("cshTempPw");
    if (inp) inp.value = randomTempPassword();
  });
  $("cshCopyTempBtn")?.addEventListener("click", e => copyText($("cshTempPw")?.value, e.currentTarget));
  $("cshCopyLinkBtn")?.addEventListener("click", e => copyText($("cshSuccLink")?.value, e.currentTarget));
  $("cshCopyCredsBtn")?.addEventListener("click", e => copyText($("cshSuccCreds")?.value, e.currentTarget));
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
    const accessMode = document.querySelector('input[name="cshAccessMode"]:checked')?.value || "invite";

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

    const payload = { full_name: fullName, email, access_mode: accessMode };
    if (accessMode === "temp_password") {
      const tempPw = ($("cshTempPw")?.value || "").trim();
      if (tempPw.length < 8) {
        modalErr.textContent = "Temporary password must be at least 8 characters.";
        $("cshTempPw")?.focus();
        return;
      }
      payload.temp_password = tempPw;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";
    try {
      const res = await window.ProFitAPI.post("/staff/cashiers", payload);
      showInviteResult(res);
      showSuccessScreen(res);
      setStatus(
        res.access_mode === "temp_password"
          ? `Cashier ${res.name || res.email} created with temporary password.`
          : (res.email_sent ? `Invitation sent to ${res.email}.` : (res.email_status_note || "Cashier added."))
      );
      await loadCashiers();
    } catch (err) {
      modalErr.textContent = err.message || "Could not add cashier.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add Cashier";
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
