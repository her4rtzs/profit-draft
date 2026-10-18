/* Change password, for every role (owner, cashier, trainer, member).
   Self-contained: it adds a "Change password" item next to every Log out
   button/menu item it finds, and opens its own dialog. Needs api.js. */
(() => {
  "use strict";
  const MIN = 8;
  let dialog;

  const css = `
  .pf-cp{margin:auto;inset:0;max-height:92dvh;overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:0;width:min(420px,92vw);background:#161b24;color:#eef0f4;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  .pf-cp::backdrop{background:rgba(2,6,14,.62);backdrop-filter:blur(3px)}
  .pf-cp form{padding:22px;display:grid;gap:14px}
  .pf-cp h3{margin:0;font-size:18px}.pf-cp p{margin:0;font-size:13px;opacity:.7}
  .pf-cp label{display:grid;gap:6px;font-size:13px;font-weight:600}
  .pf-cp .pf-cp-field{position:relative}
  .pf-cp input{width:100%;box-sizing:border-box;padding:11px 44px 11px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;font:inherit}
  .pf-cp input:focus{outline:2px solid #e0b13f;outline-offset:1px}
  .pf-cp .pf-cp-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;color:inherit;opacity:.65;cursor:pointer;padding:6px 8px;font-size:12px;font-weight:700}
  .pf-cp .pf-cp-msg{min-height:18px;font-size:13px;font-weight:600}.pf-cp .pf-cp-msg.err{color:#ff7b7b}.pf-cp .pf-cp-msg.ok{color:#5fe39a}
  .pf-cp .pf-cp-row{display:flex;gap:10px;justify-content:flex-end}
  .pf-cp button.pf-cp-btn{border-radius:12px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}
  .pf-cp button.pf-cp-primary{background:linear-gradient(110deg,#e0b13f,#c99a2e);color:#1a1405;border-color:transparent}
  .pf-cp button:disabled{opacity:.6;cursor:progress}
  .pf-cp-item{cursor:pointer}`;

  function build() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    dialog = document.createElement("dialog");
    dialog.className = "pf-cp";
    dialog.setAttribute("aria-labelledby", "pfCpTitle");
    dialog.innerHTML = `<form method="dialog" novalidate>
      <div><h3 id="pfCpTitle">Change password</h3><p>Use at least ${MIN} characters. Avoid common passwords.</p></div>
      <label>Current password<span class="pf-cp-field"><input type="password" name="current" autocomplete="current-password" required><button type="button" class="pf-cp-eye" tabindex="-1">Show</button></span></label>
      <label>New password<span class="pf-cp-field"><input type="password" name="next" autocomplete="new-password" required minlength="${MIN}"><button type="button" class="pf-cp-eye" tabindex="-1">Show</button></span></label>
      <label>Confirm new password<span class="pf-cp-field"><input type="password" name="confirm" autocomplete="new-password" required><button type="button" class="pf-cp-eye" tabindex="-1">Show</button></span></label>
      <div class="pf-cp-msg" role="alert" aria-live="polite"></div>
      <div class="pf-cp-row"><button type="button" class="pf-cp-btn" data-cancel>Cancel</button><button type="submit" class="pf-cp-btn pf-cp-primary">Save password</button></div>
    </form>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector("form");
    const msg = dialog.querySelector(".pf-cp-msg");
    const submit = form.querySelector("[type=submit]");
    const say = (text, kind) => { msg.textContent = text || ""; msg.className = "pf-cp-msg" + (kind ? " " + kind : ""); };

    dialog.querySelectorAll(".pf-cp-eye").forEach(btn => btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
    }));
    dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const current = form.current.value, next = form.next.value, confirm = form.confirm.value;
      if (!current || !next) return say("Fill in every field.", "err");
      if (next.length < MIN) return say(`The new password needs at least ${MIN} characters.`, "err");
      if (next !== confirm) return say("The new passwords do not match.", "err");
      if (next === current) return say("Choose a password that is different from the current one.", "err");
      submit.disabled = true; say("Saving…");
      try {
        await window.ProFitAPI.post("/auth/change-password", { current_password: current, new_password: next });
        form.reset();
        say("Password changed. Use it the next time you sign in.", "ok");
        setTimeout(() => { if (dialog.open) dialog.close(); }, 1400);
      } catch (err) {
        say(err.message || "The password could not be changed.", "err");
      } finally {
        submit.disabled = false;
      }
    });
  }

  function open() {
    if (!window.ProFitAPI) return alert("Change password is not available on this page.");
    if (!dialog) build();
    const form = dialog.querySelector("form");
    form.reset();
    dialog.querySelector(".pf-cp-msg").textContent = "";
    dialog.querySelectorAll("input").forEach(i => { i.type = "password"; });
    dialog.querySelectorAll(".pf-cp-eye").forEach(b => { b.textContent = "Show"; });
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    form.current.focus();
  }

  // Put a "Change password" entry next to every Log out control.
  function decorate() {
    document.querySelectorAll("[data-logout], #logoutBtn").forEach(logout => {
      if (logout.dataset.cpDone || logout.dataset.cpItem) return;
      logout.dataset.cpDone = "1";
      const item = document.createElement("button");
      item.type = "button";
      item.className = logout.className.replace(/\bis-danger\b/g, "").trim() + " pf-cp-item";
      if (logout.getAttribute("role")) item.setAttribute("role", logout.getAttribute("role"));
      item.dataset.cpItem = "1";
      const icon = logout.querySelector("i");
      const keep = icon && icon.className.indexOf("fa-arrow") === -1;
      item.innerHTML = (keep ? icon.outerHTML : `<i class="fa-solid fa-key" aria-hidden="true"></i>`) + " Change password";
      item.addEventListener("click", open);
      logout.parentNode.insertBefore(item, logout);
    });
  }

  window.PFChangePassword = { open };
  const start = () => { decorate(); new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
