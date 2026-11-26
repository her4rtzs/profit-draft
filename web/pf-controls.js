/* ==========================================================================
   ProFit — Unified Custom Controls (Select Dropdowns, Date Calendar, Time Picker)
   Progressive enhancement matching the ProFit pill-icon dropdown design across
   Owner, Cashier, Trainer, Member, and Claim portals.
   ========================================================================== */
(function () {
  if (typeof window === "undefined" || window.__pfControlsInit) return;
  window.__pfControlsInit = true;

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  let activePop = null;
  let activeAnchor = null;
  let activeField = null;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fireChange(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function closePopover() {
    if (activePop) {
      activePop.remove();
      activePop = null;
    }
    if (activeAnchor) {
      activeAnchor.setAttribute("aria-expanded", "false");
      activeAnchor = null;
    }
    activeField = null;
  }

  function positionPopover(pop, anchor, minWidth) {
    if (!pop || !anchor || !anchor.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (minWidth) {
      pop.style.minWidth = Math.max(r.width, minWidth) + "px";
      pop.style.maxWidth = Math.min(vw - 24, Math.max(r.width + 48, 340)) + "px";
    }
    pop.style.left = "0px";
    pop.style.top = "0px";
    const pr = pop.getBoundingClientRect();
    let left = r.left;
    if (left + pr.width > vw - 12) left = Math.max(12, vw - pr.width - 12);
    if (left < 12) left = 12;
    let top = r.bottom + 6;
    if (top + pr.height > vh - 12 && r.top - pr.height - 6 >= 12) {
      top = r.top - pr.height - 6;
    } else if (top + pr.height > vh - 12) {
      top = Math.max(12, vh - pr.height - 12);
    }
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
  }

  function createPopover(anchor, field, minWidth) {
    closePopover();
    const pop = document.createElement("div");
    pop.className = "pfc-popover";
    pop.setAttribute("role", "dialog");
    const openDialog = anchor.closest("dialog[open]");
    (openDialog || document.body).appendChild(pop);
    anchor.setAttribute("aria-expanded", "true");
    activePop = pop;
    activeAnchor = anchor;
    activeField = field;
    if (minWidth) positionPopover(pop, anchor, minWidth);
    return pop;
  }

  /* ---------- SEMANTIC ICON RESOLVER ---------- */
  function resolveSelectIcon(select, optText, optVal) {
    const id = String(select.id || select.name || "").toLowerCase();
    const cls = String(select.className || "").toLowerCase();
    const t = String(optText || "").trim().toLowerCase();
    const v = String(optVal || "").trim().toLowerCase();
    const combined = t + " " + v;

    // 1. Weight & body measurement units
    if (id.includes("weight") || id.includes("height") || cls.includes("pp-unit-select") || /^(kg|lb|lbs|cm|ft|in)\b/.test(t)) {
      if (/\b(kg|lb|lbs)\b/.test(t) || id.includes("weight")) return ["fa-weight-scale", "is-gold"];
      return ["fa-ruler-vertical", "is-cyan"];
    }

    // 2. Payment methods
    if (id.includes("method") || /\b(cash|gcash|all methods?)\b/.test(combined)) {
      if (combined.includes("cash") && !combined.includes("gcash")) return ["fa-money-bill-wave", "is-green"];
      if (combined.includes("gcash")) return ["fa-mobile-screen-button", "is-cyan"];
      return ["fa-wallet", "is-gold"];
    }

    // 3. Statuses & filters
    if (id.includes("status") || /\b(active|expired|expiring|inactive|published|drafts?|scheduled|archived|pending|approved|rejected|voided|on leave)\b/.test(t)) {
      if (/\b(active|published|approved|paid)\b/.test(t) && !t.includes("inactive")) return ["fa-circle-check", "is-green"];
      if (/\b(expired|rejected|voided|archived|failed)\b/.test(t)) return ["fa-circle-xmark", "is-red"];
      if (/\bdrafts?\b/.test(t)) return ["fa-pen-to-square", "is-gold"];
      if (/\b(expiring|pending|scheduled|leave)\b/.test(t)) return ["fa-clock", "is-gold"];
      if (/\b(inactive|paused|closed)\b/.test(t)) return ["fa-circle-pause", "is-slate"];
      if (t.startsWith("all")) return ["fa-layer-group", "is-gold"];
    }

    // 4. Audience pickers (announcements / broadcast)
    if (id.includes("audience") || id.includes("recipient")) {
      if (t.includes("everyone") || t.startsWith("all")) return ["fa-globe", "is-gold"];
      if (t.includes("member") && !t.includes("specific")) return ["fa-users", "is-cyan"];
      if (t.includes("trainer") || t.includes("coach")) return ["fa-dumbbell", "is-violet"];
      if (t.includes("staff") || t.includes("cashier")) return ["fa-user-tie", "is-cyan"];
    }

    // 5. Membership plans & freeze duration
    if (id.includes("plan") || id === "fdays" || /\b(daily|monthly|quarterly|annual|days)\b/.test(t)) {
      if (id === "fdays" || /\b\d+\s*days?\b/.test(t)) return ["fa-snowflake", "is-cyan"];
      if (t.includes("daily")) return ["fa-sun", "is-gold"];
      if (t.includes("monthly")) return ["fa-calendar-days", "is-gold"];
      if (t.includes("quarterly")) return ["fa-calendar-week", "is-cyan"];
      if (t.includes("annual") || t.includes("year")) return ["fa-crown", "is-violet"];
      if (!v) return ["fa-tags", "is-gold"];
      return ["fa-id-card", "is-gold"];
    }

    // 6. Members, athletes, trainers, recipients
    if (id.includes("member") || id.includes("athlete") || id.includes("checkin") || id.includes("trainer") || id.startsWith("rq")) {
      if (t.startsWith("all")) return ["fa-users", "is-gold"];
      if (t.includes("any available") || t.includes("trainer")) return ["fa-dumbbell", "is-gold"];
      if (!v) return ["fa-user-group", "is-gold"];
      return ["fa-user", "is-cyan"];
    }

    // 7. View / sort
    if (t.includes("table")) return ["fa-table-list", "is-cyan"];
    if (t.includes("card") || t.includes("grid")) return ["fa-grip", "is-cyan"];
    if (t.includes("list")) return ["fa-list", "is-cyan"];
    if (t.includes("sort")) return ["fa-arrow-up-a-z", "is-cyan"];

    return ["fa-sliders", "is-gold"];
  }

  function makeIconBadge(iconCls, toneCls, isTrigger) {
    if (!isTrigger) {
      const i = document.createElement("i");
      i.className = "fa-solid " + iconCls + " pfc-opt-ico " + toneCls;
      i.setAttribute("aria-hidden", "true");
      return i;
    }
    const span = document.createElement("span");
    span.className = "pfc-trig-ico " + toneCls;
    span.setAttribute("aria-hidden", "true");
    const i = document.createElement("i");
    i.className = "fa-solid " + iconCls;
    span.appendChild(i);
    return span;
  }

  /* ---------- 1. ENHANCE NATIVE <SELECT> INTO ICON-PILL DROPDOWN ---------- */
  function syncSelectTrigger(select, trigger) {
    if (!select || !trigger) return;
    const opt = select.options[select.selectedIndex] || select.options[0];
    const labelText = opt ? opt.textContent : "Select";
    const [icoCls, toneCls] = resolveSelectIcon(select, labelText, opt ? opt.value : "");

    const icoBox = trigger.querySelector(".pfc-trig-ico");
    if (icoBox) {
      icoBox.className = "pfc-trig-ico " + toneCls;
      const i = icoBox.querySelector("i");
      if (i) i.className = "fa-solid " + icoCls;
    }
    const lblEl = trigger.querySelector(".pfc-trig-lbl");
    if (lblEl) lblEl.textContent = labelText;

    trigger.disabled = !!select.disabled;
    trigger.dataset.lastVal = String(select.value ?? "");
    trigger.dataset.lastText = String(labelText ?? "");
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.pfcBound === "1") return;
    if (select.matches("[data-native='1'], [multiple], .pfc-sr-native")) return;
    if (select.size && select.size > 1) return;
    if (select.closest(".pfc-popover")) return;

    select.dataset.pfcBound = "1";
    const parent = select.parentNode;
    if (!parent) return;

    const wrap = document.createElement("span");
    const idLower = String(select.id || "").toLowerCase();
    const clsLower = String(select.className || "").toLowerCase();
    const isCompact = clsLower.includes("pp-unit-select") || idLower === "weightunit";
    const isInline = clsLower.includes("fn-toolbar-select") || idLower === "annstatusselect" || idLower === "txmethod";
    wrap.className = "pfc-wrap" + (isCompact ? " pfc-wrap--compact" : "") + (isInline ? " pfc-wrap--inline" : "");

    parent.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("pfc-sr-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "pfc-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const ariaLbl = select.getAttribute("aria-label");
    if (ariaLbl) trigger.setAttribute("aria-label", ariaLbl);

    const lblSpan = document.createElement("span");
    lblSpan.className = "pfc-trig-lbl";
    const caret = document.createElement("i");
    caret.className = "fa-solid fa-chevron-down pfc-trig-caret";
    caret.setAttribute("aria-hidden", "true");

    trigger.append(makeIconBadge("fa-sliders", "is-gold", true), lblSpan, caret);
    wrap.appendChild(trigger);
    syncSelectTrigger(select, trigger);

    if (select.id) {
      document.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`).forEach(lbl => {
        if (lbl.dataset.pfcLblBound) return;
        lbl.dataset.pfcLblBound = "1";
        lbl.addEventListener("click", (e) => {
          e.preventDefault();
          trigger.focus();
          if (!trigger.disabled) openSelect(select, trigger);
        });
      });
    }

    select.addEventListener("change", () => syncSelectTrigger(select, trigger));
    select.addEventListener("input", () => syncSelectTrigger(select, trigger));
    select.addEventListener("invalid", () => trigger.focus({ preventScroll: false }));

    const obs = new MutationObserver(() => syncSelectTrigger(select, trigger));
    obs.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (trigger.disabled) return;
      if (activeField === select) { closePopover(); return; }
      openSelect(select, trigger);
    });

    trigger.addEventListener("keydown", (e) => {
      if (trigger.disabled) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSelect(select, trigger);
      }
    });
  }

  function openSelect(select, trigger) {
    if (select.disabled) return;
    const anchor = trigger || select;
    const pop = createPopover(anchor, select, 200);
    const opts = Array.from(select.options);

    let searchInput = null;
    if (opts.length >= 8) {
      const searchWrap = document.createElement("div");
      searchWrap.className = "pfc-search-wrap";
      const sIco = document.createElement("i");
      sIco.className = "fa-solid fa-magnifying-glass";
      sIco.setAttribute("aria-hidden", "true");
      searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.className = "pfc-search";
      searchInput.placeholder = "Filter options...";
      searchInput.setAttribute("aria-label", "Filter options");
      searchWrap.append(sIco, searchInput);
      pop.appendChild(searchWrap);
    }

    const list = document.createElement("div");
    list.className = "pfc-select-list";
    list.setAttribute("role", "listbox");

    const buildRows = (filterText) => {
      list.innerHTML = "";
      const q = String(filterText || "").trim().toLowerCase();
      const filtered = opts
        .map((opt, idx) => ({ opt, idx }))
        .filter(({ opt }) => !q || opt.textContent.toLowerCase().includes(q));

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "pfc-select-empty";
        empty.textContent = "No matching options";
        list.appendChild(empty);
        return;
      }

      filtered.forEach(({ opt, idx }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pfc-select-opt" + (opt.selected ? " is-selected" : "");
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", opt.selected ? "true" : "false");
        btn.disabled = opt.disabled;

        const [icoCls, toneCls] = resolveSelectIcon(select, opt.textContent, opt.value);
        btn.appendChild(makeIconBadge(icoCls, toneCls, false));

        const lbl = document.createElement("span");
        lbl.className = "pfc-opt-lbl";
        lbl.textContent = opt.textContent;
        btn.appendChild(lbl);

        btn.addEventListener("click", () => {
          if (opt.disabled) return;
          const changed = select.selectedIndex !== idx;
          select.selectedIndex = idx;
          if (changed) fireChange(select);
          if (trigger) syncSelectTrigger(select, trigger);
          closePopover();
          anchor.focus({ preventScroll: true });
        });
        list.appendChild(btn);
      });
    };

    buildRows("");
    pop.appendChild(list);
    positionPopover(pop, anchor, 200);

    if (searchInput) {
      searchInput.addEventListener("input", () => buildRows(searchInput.value));
      requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
    } else {
      const selBtn = list.querySelector(".is-selected") || list.querySelector(".pfc-select-opt:not(:disabled)");
      if (selBtn) {
        selBtn.scrollIntoView({ block: "nearest" });
        requestAnimationFrame(() => selBtn.focus({ preventScroll: true }));
      }
    }

    pop.addEventListener("keydown", (e) => {
      const buttons = Array.from(list.querySelectorAll(".pfc-select-opt:not(:disabled)"));
      if (!buttons.length) return;
      const curIdx = buttons.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        buttons[curIdx < 0 ? 0 : (curIdx + 1) % buttons.length].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        buttons[curIdx < 0 ? buttons.length - 1 : (curIdx - 1 + buttons.length) % buttons.length].focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        buttons[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        buttons[buttons.length - 1].focus();
      }
    });
  }

  /* ---------- 2. ENHANCE <INPUT TYPE="DATE"> & <INPUT TYPE="TIME"> ---------- */
  function parseDateVal(val) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val || "");
    if (!m) return null;
    return { y: +m[1], m: +m[2] - 1, d: +m[3] };
  }

  function formatDateDisplay(val) {
    const p = parseDateVal(val);
    if (!p) return "Select date";
    return `${SHORT_MONTHS[p.m]} ${p.d}, ${p.y}`;
  }

  function formatTimeDisplay(val) {
    const m = /^(\d{2}):(\d{2})/.exec(val || "");
    if (!m) return "Select time";
    const h24 = +m[1], min = +m[2];
    const per = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 || 12;
    return `${pad2(h12)}:${pad2(min)} ${per}`;
  }

  function syncDateOrTimeTrigger(input, trigger) {
    if (!input || !trigger) return;
    const isDate = input.type === "date";
    const lblEl = trigger.querySelector(".pfc-trig-lbl");
    const hasVal = !!String(input.value || "").trim();
    if (lblEl) {
      lblEl.textContent = isDate ? formatDateDisplay(input.value) : formatTimeDisplay(input.value);
      lblEl.classList.toggle("is-placeholder", !hasVal);
    }
    trigger.disabled = !!(input.disabled || input.readOnly);
    trigger.dataset.lastVal = String(input.value ?? "");
  }

  function enhanceDateTimeInput(input) {
    if (!input || input.dataset.pfcBound === "1") return;
    if (input.matches("[data-native='1'], .tw-date-picker, .pfc-sr-native")) return;
    if (input.closest(".tw-date-stepper") || input.closest(".pfc-popover")) return;

    input.dataset.pfcBound = "1";
    const parent = input.parentNode;
    if (!parent) return;

    const wrap = document.createElement("span");
    wrap.className = "pfc-wrap pfc-wrap--dt";
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("pfc-sr-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "pfc-trigger pfc-trigger--dt";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    const ariaLbl = input.getAttribute("aria-label");
    if (ariaLbl) trigger.setAttribute("aria-label", ariaLbl);

    const isDate = input.type === "date";
    const icoSpan = document.createElement("span");
    icoSpan.className = "pfc-trig-ico " + (isDate ? "is-gold" : "is-cyan");
    icoSpan.setAttribute("aria-hidden", "true");
    icoSpan.innerHTML = isDate ? '<i class="fa-regular fa-calendar"></i>' : '<i class="fa-regular fa-clock"></i>';

    const lblSpan = document.createElement("span");
    lblSpan.className = "pfc-trig-lbl";

    const caret = document.createElement("i");
    caret.className = "fa-solid fa-chevron-down pfc-trig-caret";
    caret.setAttribute("aria-hidden", "true");

    trigger.append(icoSpan, lblSpan, caret);
    wrap.appendChild(trigger);
    syncDateOrTimeTrigger(input, trigger);

    if (input.id) {
      document.querySelectorAll(`label[for="${CSS.escape(input.id)}"]`).forEach(lbl => {
        if (lbl.dataset.pfcLblBound) return;
        lbl.dataset.pfcLblBound = "1";
        lbl.addEventListener("click", (e) => {
          e.preventDefault();
          trigger.focus();
          if (!trigger.disabled) isDate ? openDate(input, trigger) : openTime(input, trigger);
        });
      });
    }

    input.addEventListener("change", () => syncDateOrTimeTrigger(input, trigger));
    input.addEventListener("input", () => syncDateOrTimeTrigger(input, trigger));

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (trigger.disabled) return;
      if (activeField === input) { closePopover(); return; }
      isDate ? openDate(input, trigger) : openTime(input, trigger);
    });
  }

  /* ---------- 3. BRANDED GOLD CALENDAR POPOVER ---------- */
  function openDate(input, anchor) {
    if (input.disabled || input.readOnly) return;
    const anchorEl = anchor || input;
    const pop = createPopover(anchorEl, input, 296);
    const wrap = document.createElement("div");
    wrap.className = "pfc-cal";
    pop.appendChild(wrap);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const parsed = parseDateVal(input.value);
    let viewY = parsed ? parsed.y : now.getFullYear();
    let viewM = parsed ? parsed.m : now.getMonth();

    function render() {
      wrap.innerHTML = "";
      const head = document.createElement("div");
      head.className = "pfc-cal-head";

      const title = document.createElement("div");
      title.className = "pfc-cal-title";
      title.textContent = `${MONTHS[viewM]} ${viewY}`;
      head.appendChild(title);

      const nav = document.createElement("div");
      nav.className = "pfc-cal-nav";

      const prev = document.createElement("button");
      prev.type = "button";
      prev.className = "pfc-icon-btn";
      prev.setAttribute("aria-label", "Previous month");
      prev.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prev.addEventListener("click", () => {
        viewM -= 1;
        if (viewM < 0) { viewM = 11; viewY -= 1; }
        render();
      });

      const next = document.createElement("button");
      next.type = "button";
      next.className = "pfc-icon-btn";
      next.setAttribute("aria-label", "Next month");
      next.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      next.addEventListener("click", () => {
        viewM += 1;
        if (viewM > 11) { viewM = 0; viewY += 1; }
        render();
      });

      nav.append(prev, next);
      head.appendChild(nav);
      wrap.appendChild(head);

      const dowRow = document.createElement("div");
      dowRow.className = "pfc-cal-dow";
      DOW.forEach(d => {
        const s = document.createElement("span");
        s.textContent = d;
        dowRow.appendChild(s);
      });
      wrap.appendChild(dowRow);

      const grid = document.createElement("div");
      grid.className = "pfc-cal-grid";

      const firstDow = new Date(viewY, viewM, 1).getDay();
      const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
      const prevDays = new Date(viewY, viewM, 0).getDate();

      const cells = [];
      for (let i = firstDow - 1; i >= 0; i--) {
        const d = prevDays - i;
        const py = viewM === 0 ? viewY - 1 : viewY;
        const pm = viewM === 0 ? 11 : viewM - 1;
        cells.push({ y: py, m: pm, d, out: true });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ y: viewY, m: viewM, d, out: false });
      }
      let nextD = 1;
      while (cells.length < 42) {
        const ny = viewM === 11 ? viewY + 1 : viewY;
        const nm = viewM === 11 ? 0 : viewM + 1;
        cells.push({ y: ny, m: nm, d: nextD++, out: true });
      }

      const minVal = input.min || "";
      const maxVal = input.max || "";

      cells.forEach(c => {
        const iso = `${c.y}-${pad2(c.m + 1)}-${pad2(c.d)}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pfc-day"
          + (c.out ? " is-out" : "")
          + (iso === todayStr ? " is-today" : "")
          + (iso === input.value ? " is-selected" : "");
        btn.textContent = String(c.d);
        if ((minVal && iso < minVal) || (maxVal && iso > maxVal)) btn.disabled = true;
        btn.addEventListener("click", () => {
          input.value = iso;
          fireChange(input);
          if (anchor && anchor.classList.contains("pfc-trigger")) syncDateOrTimeTrigger(input, anchor);
          closePopover();
          anchorEl.focus({ preventScroll: true });
        });
        grid.appendChild(btn);
      });
      wrap.appendChild(grid);

      const foot = document.createElement("div");
      foot.className = "pfc-foot";

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "pfc-foot-btn";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", () => {
        input.value = "";
        fireChange(input);
        if (anchor && anchor.classList.contains("pfc-trigger")) syncDateOrTimeTrigger(input, anchor);
        closePopover();
        anchorEl.focus({ preventScroll: true });
      });

      const todayBtn = document.createElement("button");
      todayBtn.type = "button";
      todayBtn.className = "pfc-foot-btn is-primary";
      todayBtn.textContent = "Today";
      todayBtn.addEventListener("click", () => {
        input.value = todayStr;
        fireChange(input);
        if (anchor && anchor.classList.contains("pfc-trigger")) syncDateOrTimeTrigger(input, anchor);
        closePopover();
        anchorEl.focus({ preventScroll: true });
      });

      foot.append(clearBtn, todayBtn);
      wrap.appendChild(foot);
      positionPopover(pop, anchorEl, 296);
    }

    render();
  }

  /* ---------- 4. BRANDED GOLD TIME PICKER POPOVER ---------- */
  function openTime(input, anchor) {
    if (input.disabled || input.readOnly) return;
    const anchorEl = anchor || input;
    const pop = createPopover(anchorEl, input, 256);
    const wrap = document.createElement("div");
    wrap.className = "pfc-time";
    pop.appendChild(wrap);

    const m = /^(\d{2}):(\d{2})/.exec(input.value || "");
    const now = new Date();
    let h24 = m ? +m[1] : now.getHours();
    let min = m ? +m[2] : Math.floor(now.getMinutes() / 5) * 5;
    let period = h24 >= 12 ? "PM" : "AM";
    let h12 = h24 % 12 || 12;

    function commit() {
      let outH = h12 % 12;
      if (period === "PM") outH += 12;
      input.value = `${pad2(outH)}:${pad2(min)}`;
      fireChange(input);
      if (anchor && anchor.classList.contains("pfc-trigger")) syncDateOrTimeTrigger(input, anchor);
    }

    function render() {
      wrap.innerHTML = "";
      const head = document.createElement("div");
      head.className = "pfc-time-head";
      head.innerHTML = "<span>Hour</span><span>Min</span><span>AM/PM</span>";
      wrap.appendChild(head);

      const cols = document.createElement("div");
      cols.className = "pfc-time-cols";

      const hCol = document.createElement("div");
      hCol.className = "pfc-time-col";
      for (let h = 1; h <= 12; h++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pfc-time-opt" + (h === h12 ? " is-selected" : "");
        b.textContent = pad2(h);
        b.addEventListener("click", () => { h12 = h; commit(); render(); });
        hCol.appendChild(b);
      }

      const mCol = document.createElement("div");
      mCol.className = "pfc-time-col";
      const mins = [];
      for (let i = 0; i < 60; i += 5) mins.push(i);
      if (!mins.includes(min)) { mins.push(min); mins.sort((a, b) => a - b); }
      mins.forEach(mm => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pfc-time-opt" + (mm === min ? " is-selected" : "");
        b.textContent = pad2(mm);
        b.addEventListener("click", () => { min = mm; commit(); render(); });
        mCol.appendChild(b);
      });

      const pCol = document.createElement("div");
      pCol.className = "pfc-time-col";
      ["AM", "PM"].forEach(p => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pfc-time-opt" + (p === period ? " is-selected" : "");
        b.textContent = p;
        b.addEventListener("click", () => { period = p; commit(); render(); });
        pCol.appendChild(b);
      });

      cols.append(hCol, mCol, pCol);
      wrap.appendChild(cols);

      const foot = document.createElement("div");
      foot.className = "pfc-foot";

      const nowBtn = document.createElement("button");
      nowBtn.type = "button";
      nowBtn.className = "pfc-foot-btn";
      nowBtn.textContent = "Now";
      nowBtn.addEventListener("click", () => {
        const d = new Date();
        h24 = d.getHours();
        min = d.getMinutes();
        period = h24 >= 12 ? "PM" : "AM";
        h12 = h24 % 12 || 12;
        commit();
        closePopover();
        anchorEl.focus({ preventScroll: true });
      });

      const doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.className = "pfc-foot-btn is-primary";
      doneBtn.textContent = "Done";
      doneBtn.addEventListener("click", () => {
        commit();
        closePopover();
        anchorEl.focus({ preventScroll: true });
      });

      foot.append(nowBtn, doneBtn);
      wrap.appendChild(foot);
      positionPopover(pop, anchorEl, 256);

      [hCol, mCol].forEach(col => {
        const sel = col.querySelector(".is-selected");
        if (sel) sel.scrollIntoView({ block: "center" });
      });
    }

    render();
  }

  /* ---------- 5. SCANNER + TRAINER PICKER HOOKS ---------- */
  function scanAndEnhance() {
    document.querySelectorAll("select:not([data-pfc-bound='1'])").forEach(enhanceSelect);
    document.querySelectorAll("input[type='date']:not([data-pfc-bound='1']), input[type='time']:not([data-pfc-bound='1'])").forEach(enhanceDateTimeInput);
  }

  function syncAllBound() {
    if (document.hidden) return;
    document.querySelectorAll(".pfc-wrap > select[data-pfc-bound='1']").forEach(sel => {
      const trig = sel.parentElement && sel.parentElement.querySelector(":scope > .pfc-trigger");
      if (!trig) return;
      const opt = sel.options[sel.selectedIndex] || sel.options[0];
      const txt = opt ? opt.textContent : "Select";
      if (trig.dataset.lastVal !== String(sel.value ?? "") || trig.dataset.lastText !== txt || trig.disabled !== !!sel.disabled) {
        syncSelectTrigger(sel, trig);
      }
    });
    document.querySelectorAll(".pfc-wrap > input[data-pfc-bound='1']").forEach(inp => {
      const trig = inp.parentElement && inp.parentElement.querySelector(":scope > .pfc-trigger");
      if (!trig) return;
      if (trig.dataset.lastVal !== String(inp.value ?? "") || trig.disabled !== !!(inp.disabled || inp.readOnly)) {
        syncDateOrTimeTrigger(inp, trig);
      }
    });
  }

  // Capture-phase interception for special Trainer date pickers & outside clicks
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (activePop && activePop.contains(t)) return;

    const twBtn = t.closest(".tw-date-btn[data-picker]");
    if (twBtn) {
      const hiddenDate = document.getElementById(twBtn.dataset.picker);
      if (hiddenDate) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (activeField === hiddenDate) { closePopover(); return; }
        openDate(hiddenDate, twBtn.closest(".tw-date-wrap") || twBtn);
        return;
      }
    }

    const stepperDate = t.closest(".tw-date-stepper input[type='date']");
    if (stepperDate && !stepperDate.disabled && !stepperDate.readOnly) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (activeField === stepperDate) { closePopover(); return; }
      openDate(stepperDate, stepperDate.closest(".tw-date-stepper") || stepperDate);
      return;
    }

    if (activePop && (!activeAnchor || !activeAnchor.contains(t))) {
      closePopover();
    }
  }, true);

  document.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (activePop && activePop.contains(t)) return;
    const stepperDate = t.closest(".tw-date-stepper input[type='date']");
    if (stepperDate) e.preventDefault();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!activePop) return;
    if (e.key === "Escape") {
      const a = activeAnchor;
      closePopover();
      if (a) a.focus({ preventScroll: true });
    }
  });

  window.addEventListener("resize", () => {
    if (activePop && activeAnchor) positionPopover(activePop, activeAnchor, 200);
  });
  window.addEventListener("scroll", () => {
    if (activePop && activeAnchor) positionPopover(activePop, activeAnchor, 200);
  }, true);

  function boot() {
    scanAndEnhance();
    syncAllBound();
    let scanQueued = false;
    const bodyObs = new MutationObserver(() => {
      if (scanQueued) return;
      scanQueued = true;
      requestAnimationFrame(() => {
        scanQueued = false;
        scanAndEnhance();
      });
    });
    if (document.body) {
      bodyObs.observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener("profit:synced", () => setTimeout(syncAllBound, 40));
    document.addEventListener("pf:data", () => setTimeout(syncAllBound, 40));
    setInterval(syncAllBound, 450);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
