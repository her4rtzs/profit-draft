// ProFit shared helpers: formatting, toasts, dialogs, photo storage and image compression.
// Loaded before page scripts. Everything sits under the PF namespace so it never clashes with data.js.
const PF = (() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const todayISO = () => iso(new Date());
  const parseISO = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (v, opts = { month: "short", day: "numeric", year: "numeric" }) => (v instanceof Date ? v : parseISO(v)).toLocaleDateString("en-US", opts);
  const fmtDateTime = v => new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const money = n => "₱" + Number(n || 0).toLocaleString("en-US");
  const initialsOf = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  const dayDiff = (a, b) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);

  let toastEl, toastTimer;
  function toast(msg, isError = false) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "pp-toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  // Dialog: body is trusted HTML built by the page. onConfirm may return false to keep the dialog open,
  // or throw an Error whose message is shown inside the dialog.
  let backdrop;
  function modal({ title, body, confirmText = "Confirm", cancelText = "Cancel", danger = false, onConfirm }) {
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "pp-modal-backdrop";
      backdrop.hidden = true;
      backdrop.innerHTML = '<div class="pp-modal" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(backdrop);
    }
    const box = backdrop.firstElementChild;
    box.innerHTML = `<header class="pp-modal-head"><h3>${esc(title)}</h3><button class="pp-icon-btn" type="button" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="pp-modal-body">${body}<p class="pp-form-error" role="alert" hidden></p></div>
      <footer class="pp-modal-foot"><button class="pp-btn" type="button" data-close>${esc(cancelText)}</button><button class="pp-btn ${danger ? "pp-btn-danger-solid" : "pp-btn-primary"}" type="button" data-confirm>${esc(confirmText)}</button></footer>`;
    const err = box.querySelector(".pp-form-error");
    const close = () => {
      backdrop.hidden = true;
      document.body.classList.remove("pp-modal-open");
      document.removeEventListener("keydown", onKey);
    };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    box.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    backdrop.onclick = e => { if (e.target === backdrop) close(); };
    box.querySelector("[data-confirm]").addEventListener("click", async () => {
      err.hidden = true;
      try {
        const ok = onConfirm ? await onConfirm(box) : true;
        if (ok !== false) close();
      } catch (e) {
        err.textContent = e.message || "Something went wrong. Please try again.";
        err.hidden = false;
      }
    });
    backdrop.hidden = false;
    document.body.classList.add("pp-modal-open");
    setTimeout(() => (box.querySelector("input:not([type=checkbox]),textarea,select") || box.querySelector("[data-confirm]"))?.focus(), 30);
    return { close, box };
  }

  // Photos: resized to a sensible size before storing, so diary and profile images stay light.
  function compressImage(file, maxSide = 1600, quality = 0.84) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error("Please choose an image file (JPG, PNG or WebP)."));
      if (file.size > 25 * 1024 * 1024) return reject(new Error("That photo is larger than 25 MB. Choose a smaller one."));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error("This photo could not be processed. Try a JPG or PNG."));
        }, "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This photo could not be read. Try a JPG or PNG.")); };
      img.src = url;
    });
  }

  // Photo storage in IndexedDB (localStorage is too small for photos). Object URLs are cached per id.
  const media = (() => {
    const DB_NAME = "profit-media", STORE = "images";
    const urls = new Map();
    let dbPromise = null;
    function open() {
      if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) return reject(new Error("Photo storage is not supported in this browser."));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { dbPromise = null; reject(req.error || new Error("Could not open photo storage.")); };
      });
      return dbPromise;
    }
    async function run(mode, action) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error || new Error("Photo storage error."));
        tx.onabort = () => reject(tx.error || new Error("Photo storage was interrupted."));
      });
    }
    const api = {
      async save(blob) {
        const id = "ph-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        await run("readwrite", s => s.put(blob, id));
        return id;
      },
      get: id => run("readonly", s => s.get(id)),
      async remove(id) {
        if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
        return run("readwrite", s => s.delete(id));
      },
      async url(id) {
        if (!id) return null;
        if (urls.has(id)) return urls.get(id);
        const blob = await api.get(id);
        if (!blob) return null;
        const u = URL.createObjectURL(blob);
        urls.set(id, u);
        return u;
      }
    };
    return api;
  })();

  return { esc, pad, iso, today, todayISO, parseISO, fmt, fmtDateTime, money, initialsOf, dayDiff, toast, modal, compressImage, media };
})();

/* Mobile portal navigation.
   Below 760px the three section links no longer fit beside the brand, so they
   fold into a drawer opened by the burger. Both portals use the same IDs
   (#portalNav / #portalBurger / #portalNavLinks), so this lives here once and
   runs for either page rather than being duplicated per portal script. */
(() => {
  const boot = () => {
    const nav = document.getElementById("portalNav");
    const burger = document.getElementById("portalBurger");
    const links = document.getElementById("portalNavLinks");
    if (!nav || !burger || !links || burger.dataset.wired === "1") return;
    burger.dataset.wired = "1";

    const setOpen = open => {
      nav.classList.toggle("nav-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      const icon = burger.querySelector("i");
      if (icon) icon.className = open ? "fa-solid fa-xmark" : "fa-solid fa-bars";
    };

    burger.addEventListener("click", e => {
      e.stopPropagation();
      setOpen(!nav.classList.contains("nav-open"));
    });
    // Picking a section should always dismiss the drawer.
    links.addEventListener("click", e => { if (e.target.closest("[data-goto]")) setOpen(false); });
    document.addEventListener("click", e => { if (!nav.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });

    // Widening the window must not leave a stale drawer state behind.
    const mq = window.matchMedia("(min-width: 761px)");
    const reset = () => { if (mq.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener("change", reset); else if (mq.addListener) mq.addListener(reset);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
