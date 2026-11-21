/* Owner/Cashier GCash claim review on the Payments page. */
(function () {
  const $ = (id) => document.getElementById(id);
  const tbody = $("claimsRows");
  if (!tbody) return;

  const modal = $("claimRejectModal");
  const reason = $("claimRejectReason");
  let rejectId = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function closeModal() {
    modal.hidden = true;
    rejectId = null;
    reason.value = "";
  }

  async function load() {
    try {
      const data = await window.ProFitAPI.get("/staff/claims");
      const items = Array.isArray(data.items) ? data.items : [];
      $("claimsCount").textContent = items.length + (items.length === 1 ? " claim" : " claims");
      tbody.innerHTML = items.length
        ? items.map((c) => {
            const id = esc(c.id);
            const link = esc(c.proof_link);
            return '<tr>'
              + '<td><strong>' + esc(c.member_name) + '</strong></td>'
              + '<td class="num">\u20b1' + esc((c.amount_centavos / 100).toFixed(2)) + '</td>'
              + '<td>' + esc(c.reference_number) + '</td>'
              + '<td><a href="' + link + '" target="_blank" rel="noopener noreferrer">Open proof <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a></td>'
              + '<td>' + esc(String(c.created_at).slice(0, 10)) + '</td>'
              + '<td class="fn-right">'
              + '<button type="button" class="fn-btn-gold" data-approve="' + id + '">Approve</button> '
              + '<button type="button" class="fn-btn-dark" data-reject="' + id + '">Reject</button>'
              + '</td></tr>';
          }).join("")
        : '<tr><td colspan="6">No claims are waiting for review.</td></tr>';
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6">' + esc(e.message || "Could not load claims.") + '</td></tr>';
    }
  }

  tbody.addEventListener("click", async (event) => {
    const approve = event.target.closest("[data-approve]");
    const reject = event.target.closest("[data-reject]");
    if (approve) {
      approve.disabled = true;
      try {
        await window.ProFitAPI.post("/staff/claims/" + approve.dataset.approve + "/approve/", {});
        await load();
      } catch (e) {
        window.alert(e.message || "Could not approve this claim.");
      } finally {
        approve.disabled = false;
      }
    } else if (reject) {
      rejectId = reject.dataset.reject;
      modal.hidden = false;
      reason.focus();
    }
  });

  $("claimRejectCancel").addEventListener("click", closeModal);
  $("claimRejectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = reason.value.trim();
    if (!text) return;
    const button = event.submitter || event.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await window.ProFitAPI.post("/staff/claims/" + rejectId + "/reject/", { reason: text });
      closeModal();
      await load();
    } catch (e) {
      window.alert(e.message || "Could not reject this claim.");
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  load();
})();
