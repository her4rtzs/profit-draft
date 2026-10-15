/* ProFit chart periods.
   One period model shared by the dashboard's revenue panel and the attendance
   panel, so "Days / Week / Month / Year" means the same window on both charts
   and both re-render from the same profit-db-v1 store. Loaded after layout.js
   and sidebar.js on the pages that draw a chart. */
window.PFChart = (function () {
  "use strict";

  var STORE = "profit-db-v1";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var startOfDay = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  var addDays = function (d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  var peso = function (n) {
    var v = Number(n || 0);
    return "\u20b1" + (v >= 1000 ? (Math.round(v / 100) / 10).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k" : v.toLocaleString("en-US"));
  };
  var pesoFull = function (n) { return "\u20b1" + Number(n || 0).toLocaleString("en-US"); };

  // Dates survive JSON round-tripping as strings, so normalise before comparing.
  function toDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    var s = String(v || "");
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function readDB() {
    try {
      var db = JSON.parse(localStorage.getItem(STORE) || "null");
      return db && typeof db === "object" ? db : {};
    } catch (e) { return {}; }
  }

  /* Years the picker offers: from the earliest record (or four years back) to this year. */
  function yearChoices() {
    var db = readDB();
    var now = new Date().getFullYear();
    var first = now - 4;
    (db.payments || []).concat(db.checkins || []).forEach(function (r) {
      var d = toDate(r && r.date);
      if (d && d.getFullYear() < first) first = d.getFullYear();
    });
    var out = [];
    for (var y = now; y >= first; y--) out.push(y);
    return out;
  }

  /* Every period returns a fixed ladder of buckets, oldest first. The ladder is
     built from the calendar, never from the data, so a quiet month still shows
     up as its own column instead of collapsing the chart. */
  function bucketsFor(period, now, year) {
    var today = startOfDay(now instanceof Date ? now : new Date());
    year = year || today.getFullYear();
    var out = [];
    var i, d, s;
    if (period === "days") {
      for (i = 13; i >= 0; i--) {
        d = addDays(today, -i);
        out.push({
          key: iso(d), from: d, to: addDays(d, 1),
          label: String(d.getDate()),
          title: DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate()
        });
      }
    } else if (period === "week") {
      var monday = addDays(today, -((today.getDay() + 6) % 7));
      for (i = 7; i >= 0; i--) {
        s = addDays(monday, -7 * i);
        out.push({
          key: iso(s), from: s, to: addDays(s, 7),
          label: (s.getMonth() + 1) + "/" + s.getDate(),
          title: "Week of " + MONTHS[s.getMonth()] + " " + s.getDate() + ", " + s.getFullYear()
        });
      }
    } else if (period === "month") {
      for (i = 0; i < 12; i++) {
        d = new Date(year, i, 1);
        out.push({
          key: d.getFullYear() + "-" + pad(d.getMonth() + 1),
          from: d,
          to: new Date(d.getFullYear(), d.getMonth() + 1, 1),
          label: MONTHS[d.getMonth()],
          title: MONTHS[d.getMonth()] + " " + d.getFullYear()
        });
      }
    } else {
      for (i = 4; i >= 0; i--) {
        d = new Date(year - i, 0, 1);
        out.push({
          key: String(d.getFullYear()),
          from: d,
          to: new Date(d.getFullYear() + 1, 0, 1),
          label: String(d.getFullYear()),
          title: String(d.getFullYear())
        });
      }
    }
    return out;
  }

  /* Bucket `rows` into the ladder for `period`.
     kind: "revenue" sums payments, "visits" counts check-ins. */
  function series(kind, period, now, year) {
    var db = readDB();
    var rows = kind === "revenue" ? (db.payments || []) : (db.checkins || []);
    var buckets = bucketsFor(period, now, year);
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

    var total = values.reduce(function (n, v) { return n + v; }, 0);
    var peak = Math.max.apply(null, values.concat([0]));
    return { buckets: buckets, values: values, total: total, peak: peak, empty: total === 0 };
  }

  /* Draw the ladder. Every bucket is emitted even at zero so the axis never
     shrinks when the gym has a quiet stretch. */
  function renderBars(host, s, kind) {
    if (!host) return;
    var scale = s.peak > 0 ? s.peak : 1;
    host.innerHTML = s.buckets.map(function (b, i) {
      var v = s.values[i];
      var pct = v > 0 ? Math.max(5, Math.round((v / scale) * 100)) : 3;
      var tip = kind === "revenue" ? pesoFull(v) : v + (v === 1 ? " check-in" : " check-ins");
      var cls = v > 0 ? "has-data" : "empty";
      return '<div class="bar-column">' +
        '<div class="bar-track">' +
        '<div class="bar ' + cls + '" tabindex="0" role="img" aria-label="' +
        b.title + ": " + tip + '" title="' + b.title + " \u00b7 " + tip + '" style="height:' + pct + '%;">' +
        "<span>" + tip + "</span></div>" +
        "</div><label>" + b.label + "</label></div>";
    }).join("");
  }

  /* The y-axis follows the same ladder instead of being five hard-coded spans. */
  function renderAxis(host, s, kind) {
    if (!host) return;
    var steps = 6;
    var out = [];
    for (var i = steps; i >= 0; i--) {
      var v = (s.peak * i) / steps;
      out.push("<span>" + (kind === "revenue" ? peso(v) : String(Math.round(v))) + "</span>");
    }
    host.innerHTML = out.join("");
  }

  var COPY = {
    revenue: { days: "Daily revenue", week: "Weekly revenue", month: "Monthly revenue", year: "Yearly revenue" },
    visits: { days: "Daily attendance", week: "Weekly attendance", month: "Monthly attendance", year: "Yearly attendance" }
  };
  var SUB = {
    days: "Last 14 days",
    week: "Last 8 weeks",
    month: "Jan to Dec",
    year: "5 years"
  };
  var subFor = function (period, year) {
    return period === "month" ? "Jan to Dec " + year : period === "year" ? "5 years up to " + year : SUB[period];
  };
  var KEY = { days: "Days", week: "Week", month: "Month", year: "Year" };

  /* Mount a chart: chips + title + axis + bars, kept in sync by `onPeriod`.
     Returns the redraw function so callers can refresh after a data change. */
  function mount(opts) {
    var kind = opts.kind;
    var period = opts.default || (kind === "revenue" ? "month" : "days");
    var chips = opts.chips;
    var title = opts.title;
    var sub = opts.sub;
    var year = new Date().getFullYear();
    var picker = null;

    // A year picker lives beside the period chips. It only matters for the
    // Month (Jan to Dec of that year) and Year (five years ending then) views.
    function buildPicker() {
      if (!chips) return;
      /* Year stepper: arrows move one year, and the number can be typed or picked
         from the browser's own list, so any year works (not just years with data). */
      picker = document.createElement("span");
      picker.className = "year-stepper";
      picker.innerHTML = '<button type="button" data-yr="-1" aria-label="Previous year">\u2039</button>' +
        '<input type="number" inputmode="numeric" min="2000" max="2100" aria-label="Year">' +
        '<button type="button" data-yr="1" aria-label="Next year">\u203a</button>';
      chips.appendChild(picker);
      var yin = picker.querySelector("input");
      var setYear = function (v) { v = Math.min(2100, Math.max(2000, Math.round(Number(v)))); if (v && v !== year) { year = v; draw(); } else yin.value = year; };
      picker.addEventListener("click", function (e) { var b = e.target.closest("[data-yr]"); if (b) setYear(year + Number(b.dataset.yr)); });
      yin.addEventListener("change", function () { setYear(yin.value); });
    }
    function fillPicker() {
      if (!picker) return;
      picker.querySelector("input").value = year;
      picker.hidden = !(period === "month" || period === "year");
    }

    function draw() {
      var s = series(kind, period, undefined, year);
      fillPicker();
      renderAxis(opts.axis, s, kind);
      renderBars(opts.bars, s, kind);
      if (title) title.textContent = COPY[kind][period];
      if (sub) sub.textContent = subFor(period, year) + (s.empty ? " \u00b7 no records yet" : "");
      if (chips) {
        chips.querySelectorAll("[data-period]").forEach(function (b) {
          var on = b.dataset.period === period;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
        });
      }
      if (opts.onPeriod) opts.onPeriod(period, s, year);
    }

    if (chips) {
      chips.addEventListener("click", function (e) {
        var b = e.target.closest("[data-period]");
        if (!b) return;
        period = b.dataset.period;
        draw();
      });
    }

    buildPicker();
    draw();
    // Another page (or a payment recorded on this one) can change the store.
    window.addEventListener("storage", draw);
    return draw;
  }

  /* The revenue panel on the dashboard and the attendance panel are the only
     two charts, so rather than duplicating an init block in both pages, mount
     whichever one this document contains. */
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
          // The headline number answers "how much in the window I am looking at",
          // not "how much this month" while the chart shows a year.
          if (statValue) statValue.textContent = pesoFull(s.total);
          if (statNote) statNote.textContent = subFor(period, yr) + (s.empty ? " · no payments yet" : "");
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
          // The three summary numbers describe whatever window is on screen.
          var best = -1, bestIdx = -1;
          s.values.forEach(function (v, i) { if (v > best) { best = v; bestIdx = i; } });
          var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
          set("statToday", String(s.values[s.values.length - 1] || 0));
          set("statWeek", String(s.total));
          set("statBest", bestIdx >= 0 && best > 0 ? s.buckets[bestIdx].title.replace(/,.*/, "") : "—");
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
    series: series,
    yearChoices: yearChoices,
    renderBars: renderBars,
    renderAxis: renderAxis,
    mount: mount,
    peso: peso,
    pesoFull: pesoFull
  };
})();
