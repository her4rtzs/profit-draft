/* Online payment: "Explore plans" opens a plan picker, then sends the member to PayMongo checkout. */
(() => {
  const PLANS = [["monthly", "Monthly", "₱800", "30 days"], ["quarterly", "Quarterly", "₱2,100", "90 days"], ["annual", "Annual", "₱7,500", "365 days"]];
  const css = document.createElement("style");
  css.textContent = `.pfpay{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;background:#000a;padding:16px}
.pfpay-box{background:var(--card,#fff);color:var(--text,#111);border-radius:20px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px #0006}
.pfpay-box h3{margin:0 0 4px}.pfpay-box p{margin:0 0 16px;color:var(--muted,#666);font-size:14px}
.pfpay-plan{display:flex;justify-content:space-between;align-items:center;width:100%;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border,#ddd);border-radius:14px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}
.pfpay-plan:hover{border-color:#e8b93a}.pfpay-plan b{font-size:18px}.pfpay-err{color:#d33;font-size:13px;min-height:18px}
.pfpay-x{background:none;border:0;color:var(--muted,#666);cursor:pointer;width:100%;padding:8px}`;
  document.head.appendChild(css);
  function open() {
    const m = document.createElement("div"); m.className = "pfpay";
    m.innerHTML = `<div class="pfpay-box" role="dialog" aria-modal="true"><h3>Choose a plan</h3><p>Pay with GCash, Maya, card or QR. Your membership starts as soon as the payment is confirmed.</p>${PLANS.map(p => `<button type="button" class="pfpay-plan" data-plan="${p[0]}"><span><strong>${p[1]}</strong><br><small>${p[3]}</small></span><b>${p[2]}</b></button>`).join("")}<div class="pfpay-err" role="alert"></div><button type="button" class="pfpay-x">Cancel</button></div>`;
    document.body.appendChild(m);
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest(".pfpay-x")) return m.remove();
      const b = e.target.closest("[data-plan]"); if (!b) return;
      const err = m.querySelector(".pfpay-err"); err.textContent = "Opening secure checkout...";
      m.querySelectorAll("button").forEach(x => x.disabled = true);
      try { const r = await window.ProFitAPI.post("/member/checkout", { plan: b.dataset.plan }); location.href = r.checkout_url; }
      catch (ex) { err.textContent = ex.message || "Could not start the payment."; m.querySelectorAll("button").forEach(x => x.disabled = false); }
    });
  }
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href="member-portal.html"],a[href="join.html"]');
    if (a && /explore plans/i.test(a.textContent)) { e.preventDefault(); open(); }
  }, true);
  if (/[?&]paid=1/.test(location.search)) {
    const n = document.createElement("div");
    n.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9500;background:#1f7a3d;color:#fff;padding:12px 20px;border-radius:999px;font-weight:600;box-shadow:0 8px 24px #0004";
    n.textContent = "Payment received. Your membership is updating..."; document.body.appendChild(n);
    setTimeout(() => { n.remove(); history.replaceState(null, "", "member-home.html"); location.reload(); }, 4000);
  }
})();
