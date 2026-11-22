/* Owner/Cashier review of member-submitted GCash payments on the Payments page. */
(function () {
  const $ = (id) => document.getElementById(id);
  const tbody = $("reviewRows");
  if (!tbody) return;

  const modal = $("rejectPaymentModal");
  const reason = $("rejectPaymentReason");
  const previewModal = $("proofPreviewModal");
  const previewFrame = $("proofPreviewFrame");
  const previewOpen = $("proofPreviewOpen");
  let rejectId = null;

  function previewUrl(raw) {
    try {
      const url = new URL(raw);
      const search = url.search || "";
      if (url.hostname === "drive.google.com") {
        const file = url.pathname.match(/\/file\/d\/([^/]+)/);
        const id = file ? file[1] : url.searchParams.get("id");
        if (id) {
          return "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/preview" + search;
        }
      }
      const doc = url.pathname.match(/\/document\/d\/([^/]+)/);
      if (url.hostname === "docs.google.com" && doc) {
        return "https://docs.google.com/document/d/" + doc[1] + "/preview" + search;
      }
    } catch (e) {
      /* keep the submitted link as-is */
    }
    return raw;
  }

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
      $("reviewCount").textContent = items.length + (items.length === 1 ? " payment" : " payments");
      tbody.innerHTML = items.length
        ? items.map((c) => {
            const id = esc(c.id);
            const link = esc(c.proof_link);
            const member = esc(c.member_name);
            const reference = esc(c.reference_number);
            const plan = esc(c.plan ? c.plan.charAt(0).toUpperCase() + c.plan.slice(1) : "Membership");
            const amount = "\u20b1" + esc((c.amount_centavos / 100).toFixed(2));
            const submitted = esc(String(c.created_at).slice(0, 10));
            const waiting = Math.max(1, Math.min(7, Math.floor((Date.now() - new Date(submitted).getTime()) / 86400000) + 1));
            const dayWord = waiting === 1 ? "day" : "days";
            const initials = String(c.member_name || "").trim().split(/\s+/)
              .slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
            return '<tr>'
              + '<td><strong>' + member + '</strong></td>'
              + '<td>' + plan + '</td>'
              + '<td class="num">' + amount + '</td>'
              + '<td>' + reference + '</td>'
              + '<td><button type="button" class="fn-btn-dark fn-btn-sm" data-preview="' + link + '">Open proof</button></td>'
              + '<td>' + submitted + '</td>'
              + '<td class="fn-right">'
              + '<button type="button" class="fn-btn-gold" data-confirm="' + id + '">Confirm</button> '
              + '<button type="button" class="fn-btn-dark" data-reject="' + id + '" data-member="' + member + '">Reject</button>'
              + '</td>'
              + '<td class="review-card-cell" colspan="7">'
              + '<article class="pp-member review-card">'
              + '<header>'
              + '<span class="pp-avatar" aria-hidden="true">' + esc(initials) + '</span>'
              + '<div class="pp-member-title"><h3>' + member + '</h3><span>' + submitted + '</span></div>'
              + '</header>'
              + '<dl class="pp-kv">'
              + '<div><dt>Plan</dt><dd>' + plan + '</dd></div>'
              + '<div><dt>Amount</dt><dd>' + amount + '</dd></div>'
              + '<div><dt>Reference</dt><dd>' + reference + '</dd></div>'
              + '<div><dt>Waiting</dt><dd>' + waiting + ' ' + dayWord + '</dd></div>'
              + '</dl>'
              + '<div class="review-proof-actions">'
              + '<button type="button" class="fn-btn-dark" data-preview="' + link + '">Open proof</button>'
              + '</div>'
              + '<div class="review-decision-actions">'
              + '<button type="button" class="fn-btn-gold" data-confirm="' + id + '">Confirm</button> '
              + '<button type="button" class="fn-btn-dark" data-reject="' + id + '" data-member="' + member + '">Reject</button>'
              + '</div>'
              + '</article></td></tr>';
          }).join("")
        : '<tr class="fn-review-empty"><td colspan="7">No payments are waiting for review.</td></tr>';
    } catch (e) {
      tbody.innerHTML = '<tr class="fn-review-empty"><td colspan="7">' + esc(e.message || "Could not load payments.") + '</td></tr>';
    }
  }

  tbody.addEventListener("click", async (event) => {
    const preview = event.target.closest("[data-preview]");
    const confirm = event.target.closest("[data-confirm]");
    const reject = event.target.closest("[data-reject]");
    if (preview) {
      const link = preview.dataset.preview;
      previewFrame.src = previewUrl(link);
      previewOpen.href = link;
      previewModal.hidden = false;
    } else if (confirm) {
      confirm.disabled = true;
      try {
        await window.ProFitAPI.post("/staff/claims/" + confirm.dataset.confirm + "/approve/", {});
        await load();
      } catch (e) {
        window.alert(e.message || "Could not confirm this payment.");
      } finally {
        confirm.disabled = false;
      }
    } else if (reject) {
      rejectId = reject.dataset.reject;
      $("rejectPaymentInfo").textContent =
        "Rejecting the payment from " + (reject.dataset.member || "this member") +
        ". The member will see the reason you enter below.";
      modal.hidden = false;
      reason.focus();
    }
  });

  function closePreview() {
    previewModal.hidden = true;
    previewFrame.src = "about:blank";
  }

  $("proofPreviewClose").addEventListener("click", closePreview);
  $("rejectPaymentCancel").addEventListener("click", closeModal);
  $("rejectPaymentForm").addEventListener("submit", async (event) => {
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
      window.alert(e.message || "Could not reject this payment.");
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!previewModal.hidden) closePreview();
    else if (!modal.hidden) closeModal();
  });

  load();
})();
