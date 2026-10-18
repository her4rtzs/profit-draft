// Member: see my trainer, ask for one or change it, and cancel a pending request.
(() => {
  const card = document.getElementById("trainerCard");
  if (!card) return;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function render(d) {
    const t = d.trainer;
    const p = d.pending_request;
    const options = d.options.map(o => `<option value="${o.id}" ${o.is_full ? "disabled" : ""}>${esc(o.name)}${o.specialization ? " · " + esc(o.specialization) : ""}${o.is_full ? " (full)" : ""}</option>`).join("");
    card.innerHTML = `<div class="ann-card">
      <h3>My trainer</h3>
      ${t
        ? `<p style="margin:0;color:var(--text)"><strong>${esc(t.name)}</strong> · ${esc(t.specialization || "General training")}</p>${t.availability ? `<p class="ann-msg">${esc(t.availability)}</p>` : ""}`
        : `<p class="ann-msg">No trainer yet.</p>`}
      ${p
        ? `<p class="ann-badge pin" style="width:fit-content">Request pending${p.trainer_name ? " for " + esc(p.trainer_name) : ""}</p>
           <div class="ann-actions"><button class="ann-btn" type="button" data-cancel="${p.id}">Cancel request</button></div>`
        : `<form class="ann-form" id="trainerReq" novalidate>
             <div class="ann-field"><label for="trainerPick">Trainer</label>
               <select id="trainerPick"><option value="">Any available trainer</option>${options}</select></div>
             <div class="ann-field"><label for="trainerNote">Note (optional)</label><input id="trainerNote" maxlength="500" placeholder="Goals, schedule, anything the trainer should know"></div>
             <div class="ann-actions"><button class="ann-btn primary" type="submit">${t ? "Request a change" : "Request a trainer"}</button></div>
           </form>`}
      <p class="ann-msg" id="trainerMsg" role="status" aria-live="polite"></p>
    </div>`;
  }

  async function load() {
    try {
      render(await window.ProFitAPI.get("/trainer/me/"));
    } catch (err) {
      card.innerHTML = `<div class="ann-card"><p class="ann-msg">${esc(err.message || "Trainer details are not available right now.")}</p></div>`;
    }
  }

  const say = (text, err = false) => {
    const el = document.getElementById("trainerMsg");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("err", err);
  };

  card.addEventListener("submit", async e => {
    if (!e.target.matches("#trainerReq")) return;
    e.preventDefault();
    const pick = document.getElementById("trainerPick").value;
    const body = { note: document.getElementById("trainerNote").value.trim() };
    if (pick) body.trainer_id = Number(pick);
    try {
      await window.ProFitAPI.post("/trainer-requests/", body);
      await load();
      say("Request sent. The gym will confirm your trainer.");
    } catch (err) { say(err.message, true); }
  });

  card.addEventListener("click", async e => {
    const b = e.target.closest("[data-cancel]");
    if (!b) return;
    try {
      await window.ProFitAPI.post(`/trainer-requests/${b.dataset.cancel}/cancel/`, {});
      await load();
      say("Request cancelled.");
    } catch (err) { say(err.message, true); }
  });

  load();
})();
