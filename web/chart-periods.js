/* ProFit chart periods.
   Unified, high-performance Revenue Analytics & Attendance Chart component.
   Supports Days, Week, Month, and Year with instant cached switching,
   database aggregation, smooth bar transitions, exact zero-height handling,
   and accessible interactive tooltips. */
window.PFChart = (function () {
  "use strict";

  var STORE = "profit-db-v1";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var startOfDay = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  var addDays = function (d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };

  var peso = function (n) {
    var v = Number(n || 0);
    if (v === 0) return "\u20b10";
    if (v >= 1000) {
      var k = Math.round(v / 100) / 10;
      return "\u20b1" + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + "k";
    }
    return "\u20b1" + Math.round(v).toLocaleString("en-US");
  };

  var pesoFull = function (n) {
    var v = Number(n || 0);
    return "\u20b1" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Convert raw values (string or Date) into clean Date objects
  function toDate(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var s = String(v || "").trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function readDB() {
    if (typeof window !== "undefined" && window.DB && Array.isArray(window.DB.payments)) {
      return window.DB;
    }
    try {
      var raw = localStorage.getItem(STORE);
      var db = raw ? JSON.parse(raw) : null;
      return db && typeof db === "object" ? db : {};
    } catch (e) {
      return {};
    }
  }

  /* Calculate clean, human-readable Y-axis interval steps */
  function calculateNiceScale(peak, kind) {
    if (!peak || peak <= 0) {
      if (kind === "visits") return { max: 10, steps: [10, 8, 6, 4, 2, 0] };
      return { max: 1000, steps: [1000, 800, 600, 400, 200, 0] };
    }
    if (kind === "visits") {
      if (peak <= 5) return { max: 5, steps: [5, 4, 3, 2, 1, 0] };
      if (peak <= 10) return { max: 10, steps: [10, 8, 6, 4, 2, 0] };
    }
    var mag = Math.pow(10, Math.floor(Math.log10(peak)));
    var norm = peak / mag;
    var niceNorm;
    if (norm <= 1.2) niceNorm = 1.2;
    else if (norm <= 1.5) niceNorm = 1.5;
    else if (norm <= 2.0) niceNorm = 2.0;
    else if (norm <= 2.5) niceNorm = 2.5;
    else if (norm <= 3.0) niceNorm = 3.0;
    else if (norm <= 4.0) niceNorm = 4.0;
    else if (norm <= 5.0) niceNorm = 5.0;
    else if (norm <= 6.0) niceNorm = 6.0;
    else if (norm <= 8.0) niceNorm = 8.0;
    else niceNorm = 10.0;

    var niceMax = niceNorm * mag;
    var stepCount = 5;
    if (niceNorm === 1.2 || niceNorm === 6.0) stepCount = 6;
    else if (niceNorm === 4.0 || niceNorm === 8.0) stepCount = 4;

    var stepSize = niceMax / stepCount;
    var steps = [];
    for (var i = stepCount; i >= 0; i--) {
      steps.push(Math.round(i * stepSize));
    }
    return { max: niceMax, steps: steps };
  }

  /* Build calendar buckets for Days, Week, Month, and Year */
  function bucketsFor(period, now, year, offset) {
    var today = startOfDay(now instanceof Date ? now : new Date());
    year = year || today.getFullYear();
    offset = Number(offset || 0);
    var out = [];
    var rangeLabel = "";
    var stepperLabel = "";
    var i, d, s;

    if (period === "days") {
      var endD = addDays(today, offset * 14);
      var startD = addDays(endD, -13);
      for (i = 0; i < 14; i++) {
        d = addDays(startD, i);
        out.push({
          key: iso(d),
          from: d,
          to: addDays(d, 1),
          isToday: d.getTime() === today.getTime(),
          label: i === 0 || d.getDate() === 1 ? MONTHS[d.getMonth()] + " " + d.getDate() : String(d.getDate()),
          title: DAYS_FULL[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear()
        });
      }
      rangeLabel = MONTHS[startD.getMonth()] + " " + startD.getDate() + " \u2013 " + MONTHS[endD.getMonth()] + " " + endD.getDate() + ", " + endD.getFullYear();
      stepperLabel = MONTHS[startD.getMonth()] + " " + startD.getDate() + " \u2013 " + endD.getDate();
    } else if (period === "week") {
      var targetWeek = addDays(today, offset * 7);
      var dayOfWeek = targetWeek.getDay();
      var mondayOffset = (dayOfWeek + 6) % 7;
      var monday = addDays(targetWeek, -mondayOffset);
      var sunday = addDays(monday, 6);
      for (i = 0; i < 7; i++) {
        d = addDays(monday, i);
        out.push({
          key: iso(d),
          from: d,
          to: addDays(d, 1),
          label: DAYS_SHORT[d.getDay()],
          title: DAYS_FULL[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear()
        });
      }
      rangeLabel = "Week of " + MONTHS[monday.getMonth()] + " " + monday.getDate() + " \u2013 " + MONTHS[sunday.getMonth()] + " " + sunday.getDate() + ", " + sunday.getFullYear();
      stepperLabel = "Week of " + MONTHS[monday.getMonth()] + " " + monday.getDate();
    } else if (period === "month") {
      for (i = 0; i < 12; i++) {
        d = new Date(year, i, 1);
        out.push({
          key: d.getFullYear() + "-" + pad(d.getMonth() + 1),
          from: d,
          to: new Date(d.getFullYear(), d.getMonth() + 1, 1),
          label: MONTHS[d.getMonth()],
          title: MONTH_NAMES[d.getMonth()] + " " + d.getFullYear()
        });
      }
      rangeLabel = "Jan to Dec " + year;
      stepperLabel = String(year);
    } else {
      // 5-year block ending at `year`
      var startYear = year - 4;
      for (i = startYear; i <= year; i++) {
        d = new Date(i, 0, 1);
        out.push({
          key: String(i),
          from: d,
          to: new Date(i + 1, 0, 1),
          label: String(i),
          title: "Year " + i
        });
      }
      rangeLabel = startYear + " to " + year;
      stepperLabel = startYear + " \u2013 " + year;
    }

    return { buckets: out, rangeLabel: rangeLabel, stepperLabel: stepperLabel };
  }

  /* Client-side aggregation from in-memory DB (offline or fallback) */
  function seriesFromLocal(kind, period, year, offset) {
    var db = readDB();
    var rows = kind === "revenue" ? (db.payments || []) : (db.checkins || []);
    var bRes = bucketsFor(period, undefined, year, offset);
    var buckets = bRes.buckets;
    var values = buckets.map(function () { return 0; });

    rows.forEach(function (r) {
      var when = toDate(r && r.date);
      if (!when) return;
      for (var i = 0; i < buckets.length; i++) {
        if (when >= buckets[i].from && when < buckets[i].to) {
          values[i] += kind === "revenue" ? Number(r.amount || 0) : 1;
          break;
        }
      }
    });

    var total = values.reduce(function (acc, v) { return acc + v; }, 0);
    var peak = Math.max.apply(null, values.concat([0]));

    return {
      period: period,
      year: year,
      offset: offset,
      range_label: bRes.rangeLabel,
      stepper_label: bRes.stepperLabel,
      buckets: buckets,
      values: values,
      total: total,
      peak: peak,
      empty: total === 0
    };
  }

  /* In-memory cache for ultra-fast filter switching */
  var chartCache = new Map();
  var activeAbortController = null;

  /* Fetch aggregated revenue analytics from the server with fallback */
  function loadSeries(kind, period, year, offset, callback) {
    var cacheKey = kind + ":" + period + ":" + year + ":" + offset;
    if (chartCache.has(cacheKey)) {
      callback(chartCache.get(cacheKey), false);
      return;
    }

    // Only revenue on pages with backend connectivity calls the API
    if (kind !== "revenue" || typeof fetch === "undefined" || location.protocol === "file:") {
      var localData = seriesFromLocal(kind, period, year, offset);
      chartCache.set(cacheKey, localData);
      callback(localData, false);
      return;
    }

    if (activeAbortController) {
      try { activeAbortController.abort(); } catch (e) {}
    }
    activeAbortController = new AbortController();
    var signal = activeAbortController.signal;

    var url = "/api/staff/reports/revenue/?period=" + encodeURIComponent(period) +
      "&year=" + encodeURIComponent(year) +
      "&offset=" + encodeURIComponent(offset);

    fetch(url, { signal: signal, credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var bRes = bucketsFor(period, undefined, year, offset);
        var values = (data.buckets || []).map(function (b) { return Number(b.value || 0); });
        var total = typeof data.total === "number" ? data.total : values.reduce(function (a, b) { return a + b; }, 0);
        var peak = typeof data.peak === "number" ? data.peak : Math.max.apply(null, values.concat([0]));
        var fullData = {
          period: period,
          year: year,
          offset: offset,
          range_label: data.range_label || bRes.rangeLabel,
          stepper_label: bRes.stepperLabel,
          buckets: (data.buckets && data.buckets.length === bRes.buckets.length)
            ? data.buckets.map(function (b, idx) {
                return Object.assign({}, bRes.buckets[idx], b);
              })
            : bRes.buckets,
          values: values,
          total: total,
          peak: peak,
          empty: total === 0
        };
        chartCache.set(cacheKey, fullData);
        callback(fullData, true);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        var fallback = seriesFromLocal(kind, period, year, offset);
        chartCache.set(cacheKey, fallback);
        callback(fallback, false);
      });
  }

  /* Render or update the bars in-place without jarring DOM recreation */
  function renderBars(host, s, kind, tooltipEl, niceMax) {
    if (!host) return;
    var scaleMax = niceMax || (s.peak > 0 ? s.peak : 1);
    var targetCount = s.buckets.length;
    var existingCols = host.querySelectorAll(".bar-column");

    // Adjust column count to match buckets
    if (existingCols.length !== targetCount) {
      var html = s.buckets.map(function (b, i) {
        return '<div class="bar-column">' +
          '<div class="bar-track">' +
          '<div class="bar is-zero" tabindex="0" role="img" style="height:0%;--bi:' + i + ';"></div>' +
          '</div>' +
          '<label>' + b.label + '</label>' +
          '</div>';
      }).join("");
      host.innerHTML = html;
      existingCols = host.querySelectorAll(".bar-column");
    }

    // Interactive tooltip hover helpers
    var showTooltip = function (colEl, bucket, val) {
      if (!tooltipEl) return;
      var tipFormatted = kind === "revenue" ? pesoFull(val) : val + (val === 1 ? " check-in" : " check-ins");
      tooltipEl.innerHTML = '<strong>' + bucket.title + '</strong><span class="tip-val">' + tipFormatted + '</span>';
      tooltipEl.hidden = false;

      var colRect = colEl.getBoundingClientRect();
      var hostRect = host.getBoundingClientRect();
      var leftOffset = (colRect.left - hostRect.left) + (colRect.width / 2);
      tooltipEl.style.left = leftOffset + "px";
    };

    var hideTooltip = function () {
      if (tooltipEl) tooltipEl.hidden = true;
    };

    s.buckets.forEach(function (b, i) {
      var col = existingCols[i];
      if (!col) return;
      var bar = col.querySelector(".bar");
      var lbl = col.querySelector("label");
      var v = s.values[i] || 0;
      var isZero = (v === 0);
      var isTop = (v > 0 && v === s.peak);
      var pct = isZero ? 0 : Math.max(3, Math.round((v / scaleMax) * 100));
      var tipFormatted = kind === "revenue" ? pesoFull(v) : v + (v === 1 ? " check-in" : " check-ins");

      if (lbl && lbl.textContent !== b.label) lbl.textContent = b.label;

      if (bar) {
        bar.style.height = pct + "%";
        bar.style.setProperty("--bi", String(i));
        bar.setAttribute("aria-label", b.title + ": " + tipFormatted);
        bar.setAttribute("title", b.title + " \u00b7 " + tipFormatted);

        bar.classList.toggle("has-data", !isZero);
        bar.classList.toggle("is-zero", isZero);
        bar.classList.toggle("is-top", isTop);
        bar.classList.toggle("is-today", !!b.isToday);
      }

      // Re-attach hover/focus events cleanly
      col.onmouseenter = function () {
        host.classList.add("has-hover");
        showTooltip(col, b, v);
      };
      col.onmouseleave = function () {
        host.classList.remove("has-hover");
        hideTooltip();
      };
      col.onfocus = function () { showTooltip(col, b, v); };
      col.onblur = function () { hideTooltip(); };
    });

    // Toggle chart empty overlay
    var chartWrap = host.closest(".chart");
    if (chartWrap) {
      var emptyEl = chartWrap.querySelector(".chart-empty-state");
      if (!emptyEl && s.empty) {
        emptyEl = document.createElement("div");
        emptyEl.className = "chart-empty-state";
        emptyEl.innerHTML = '<i class="fa-solid fa-chart-simple" aria-hidden="true"></i><span>No records found for this period</span>';
        chartWrap.appendChild(emptyEl);
      }
      if (emptyEl) {
        emptyEl.hidden = !s.empty;
      }
    }
  }

  /* Render Y-axis labels with clean, professional scale intervals */
  function renderAxis(host, niceScale, kind) {
    if (!host) return;
    var steps = niceScale.steps;
    var out = steps.map(function (v) {
      var formatted = (kind === "revenue") ? peso(v) : String(v);
      return "<span>" + formatted + "</span>";
    });
    host.innerHTML = out.join("");
  }

  var COPY = {
    revenue: { days: "Daily revenue", week: "Weekly revenue", month: "Monthly revenue", year: "Yearly revenue" },
    visits: { days: "Daily attendance", week: "Weekly attendance", month: "Monthly attendance", year: "Yearly attendance" }
  };
  var KEY = { days: "Days", week: "Week", month: "Month", year: "Year" };

  /* Mount a chart: chips + stepper + axis + bars + in-memory cache */
  function mount(opts) {
    var kind = opts.kind || "revenue";
    var period = opts.default || (kind === "revenue" ? "month" : "days");
    var chips = opts.chips;
    var title = opts.title;
    var sub = opts.sub;
    var currentYear = new Date().getFullYear();
    var year = currentYear;
    var offset = 0;
    var stepper = null;
    var tooltipEl = null;

    // Ensure floating tooltip exists in chart container
    var chartArea = opts.bars ? opts.bars.closest(".chart") : null;
    if (chartArea) {
      tooltipEl = chartArea.querySelector(".chart-tooltip");
      if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "chart-tooltip";
        tooltipEl.hidden = true;
        chartArea.appendChild(tooltipEl);
      }
    }

    // Build unified period navigator stepper with inline editable year
    function buildStepper() {
      if (!chips) return;
      stepper = chips.querySelector(".chart-stepper") || chips.querySelector(".year-stepper");
      if (!stepper) {
        stepper = document.createElement("div");
        stepper.className = "chart-stepper year-stepper";
        stepper.setAttribute("role", "group");
        stepper.setAttribute("aria-label", "Period navigation");
        chips.appendChild(stepper);
      }
      stepper.innerHTML =
        '<button type="button" class="stepper-btn prev" data-step="-1" aria-label="Previous period">\u2039</button>' +
        '<div class="stepper-slot">' +
        '<span class="stepper-label" aria-live="polite"></span>' +
        '<input type="number" class="stepper-input" min="2000" max="' + currentYear + '" step="1" hidden aria-label="Enter year" placeholder="YYYY">' +
        '</div>' +
        '<button type="button" class="stepper-btn next" data-step="1" aria-label="Next period">\u203a</button>';

      var slot = stepper.querySelector(".stepper-slot");
      var lbl = stepper.querySelector(".stepper-label");
      var input = stepper.querySelector(".stepper-input");
      var isEditing = false;

      function startEditing() {
        if (isEditing) return;
        if (period !== "month" && period !== "year") return;
        isEditing = true;
        // Lock the exact current rendered width of the slot so arrow buttons and toolbar NEVER move
        if (slot) {
          var currentW = Math.max(54, slot.offsetWidth);
          slot.style.width = currentW + "px";
        }
        lbl.hidden = true;
        input.hidden = false;
        input.min = "2000";
        input.max = String(currentYear);
        input.value = String(year);
        stepper.classList.add("is-editing");
        input.focus();
        input.select();
      }

      function cancelEditing() {
        if (!isEditing) return;
        isEditing = false;
        if (slot) slot.style.width = "";
        input.hidden = true;
        lbl.hidden = false;
        stepper.classList.remove("is-editing");
      }

      function commitEditing() {
        if (!isEditing) return;
        var raw = input.value.trim();
        var parsed = parseInt(raw, 10);
        cancelEditing();
        if (!isNaN(parsed) && parsed >= 2000 && parsed <= currentYear) {
          if (parsed !== year) {
            year = parsed;
            draw();
          }
        }
      }

      lbl.addEventListener("click", function () {
        startEditing();
      });

      lbl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEditing();
        }
      });

      input.addEventListener("input", function () {
        this.value = this.value.replace(/[^\d]/g, "");
      });

      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEditing();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEditing();
        }
      });

      input.addEventListener("blur", function () {
        commitEditing();
      });

      stepper.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-step]");
        if (!btn || btn.disabled) return;
        var step = Number(btn.dataset.step || 0);
        navigate(step);
      });
    }

    function updateStepperUI(stepperLabel) {
      if (!stepper) return;
      var lbl = stepper.querySelector(".stepper-label");
      var prevBtn = stepper.querySelector(".stepper-btn.prev");
      var nextBtn = stepper.querySelector(".stepper-btn.next");
      var input = stepper.querySelector(".stepper-input");

      if (lbl) {
        lbl.textContent = stepperLabel || "";
        if (period === "month" || period === "year") {
          lbl.classList.add("is-editable");
          lbl.setAttribute("tabindex", "0");
          lbl.setAttribute("role", "button");
          lbl.setAttribute("title", "Click to edit year");
          lbl.setAttribute("aria-label", "Current year: " + year + ". Click to edit.");
        } else {
          lbl.classList.remove("is-editable");
          lbl.removeAttribute("tabindex");
          lbl.removeAttribute("role");
          lbl.removeAttribute("title");
          lbl.removeAttribute("aria-label");
        }
      }

      if (input) {
        input.max = String(currentYear);
      }

      // Determine whether forward navigation into future is allowed
      var canGoForward = true;
      if (period === "month" && year >= currentYear) canGoForward = false;
      else if (period === "year" && year >= currentYear) canGoForward = false;
      else if (period === "week" && offset >= 0) canGoForward = false;
      else if (period === "days" && offset >= 0) canGoForward = false;

      if (nextBtn) {
        nextBtn.disabled = !canGoForward;
        nextBtn.classList.toggle("is-disabled", !canGoForward);
      }

      // Determine whether backward navigation past year 2000 is allowed
      var canGoBackward = true;
      if ((period === "month" || period === "year") && year <= 2000) canGoBackward = false;

      if (prevBtn) {
        prevBtn.disabled = !canGoBackward;
        prevBtn.classList.toggle("is-disabled", !canGoBackward);
      }
    }

    function navigate(step) {
      if (period === "month") {
        var nextYr = year + step;
        if (nextYr > currentYear || nextYr < 2000) return;
        year = nextYr;
      } else if (period === "year") {
        var nextYr = year + step;
        if (nextYr > currentYear || nextYr < 2000) return;
        year = nextYr;
      } else {
        var nextOffset = offset + step;
        if (nextOffset > 0) return;
        offset = nextOffset;
      }
      draw();
    }

    function draw() {
      var panel = opts.bars ? opts.bars.closest(".panel") : null;

      // Update chip active states immediately
      if (chips) {
        chips.querySelectorAll("[data-period]").forEach(function (b) {
          var on = b.dataset.period === period;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
        });
      }

      // Check if data is already cached
      var cacheKey = kind + ":" + period + ":" + year + ":" + offset;
      var isCached = chartCache.has(cacheKey);

      // Show skeleton only on cold initial load if completely unpopulated
      if (!isCached && (!opts.bars || !opts.bars.children.length)) {
        if (panel) panel.classList.add("is-loading");
      }

      loadSeries(kind, period, year, offset, function (s) {
        if (panel) panel.classList.remove("is-loading");

        var niceScale = calculateNiceScale(s.peak, kind);
        updateStepperUI(s.stepper_label);
        renderAxis(opts.axis, niceScale, kind);
        renderBars(opts.bars, s, kind, tooltipEl, niceScale.max);

        if (title && COPY[kind] && COPY[kind][period]) {
          title.textContent = COPY[kind][period];
        }
        if (sub) {
          sub.textContent = kind === "visits" ? s.range_label : (s.range_label + (s.empty ? " \u00b7 no records yet" : ""));
        }
        if (opts.onPeriod) {
          opts.onPeriod(period, s, year);
        }
      });
    }

    if (chips) {
      chips.addEventListener("click", function (e) {
        var b = e.target.closest("[data-period]");
        if (!b) return;
        var newPeriod = b.dataset.period;
        if (newPeriod === period) return;
        period = newPeriod;
        offset = 0; // reset relative offset when changing period
        draw();
      });
    }

    buildStepper();
    draw();

    window.addEventListener("storage", function () {
      chartCache.clear();
      draw();
    });
    document.addEventListener("profit:synced", function () {
      chartCache.clear();
      draw();
    });

    return draw;
  }

  function boot() {
    var revBars = document.getElementById("revenueBars");
    if (revBars) {
      var revTitle = document.getElementById("revenueTitle");
      var revSub = document.getElementById("revenueSub");
      var statValue = document.querySelector(".revenue-card .stat-content h2");
      var statNote = document.querySelector(".revenue-card .stat-content small");
      mount({
        kind: "revenue",
        default: "month",
        chips: document.getElementById("revenuePeriods"),
        axis: document.getElementById("revenueAxis"),
        bars: revBars,
        title: revTitle,
        sub: revSub,
        onPeriod: function (period, s, yr) {
          if (statValue) statValue.textContent = pesoFull(s.total);
          if (statNote) statNote.textContent = s.range_label + (s.empty ? " \u00b7 no payments yet" : "");
        }
      });
    }

    var attBars = document.getElementById("weekBars");
    if (attBars) {
      mount({
        kind: "visits",
        default: "days",
        chips: document.getElementById("attendancePeriods"),
        axis: document.getElementById("attendanceAxis"),
        bars: attBars,
        title: document.getElementById("attendanceTitle"),
        sub: document.getElementById("attendanceSub"),
        onPeriod: function (period, s) {
          var best = -1, bestIdx = -1;
          s.values.forEach(function (v, i) { if (v > best) { best = v; bestIdx = i; } });
          var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
          set("statToday", String(s.values[s.values.length - 1] || 0));
          set("statWeekLabel", s.range_label || "Selected period");
          set("statWeek", String(s.total));
          set("statBestLabel", period === "month" || period === "year" ? "Busiest period" : "Busiest day");
          set("statBest", bestIdx >= 0 && best > 0 ? s.buckets[bestIdx].title.replace(/,.*/, "") : "—");
          set("statBestSub", best > 0 ? best + " check-ins" : "No check-ins in period");
        }
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  return {
    periods: ["days", "week", "month", "year"],
    labels: KEY,
    bucketsFor: bucketsFor,
    seriesFromLocal: seriesFromLocal,
    calculateNiceScale: calculateNiceScale,
    renderBars: renderBars,
    renderAxis: renderAxis,
    mount: mount,
    peso: peso,
    pesoFull: pesoFull,
    clearCache: function () { chartCache.clear(); }
  };
})();
