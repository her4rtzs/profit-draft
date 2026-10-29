// =====================================================
// data.js — demo data + helpers shared by every page.
// Replace DB with real calls to your backend later.
// =====================================================

const DAY_MS = 86400000;
const emailFor = name => name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.+|\.+$/g, "") + "@example.com";

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const TODAY = startOfDay(new Date());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return startOfDay(x); };
const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromISO = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = d => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const fmtShort = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
const peso = n => "₱" + Number(n).toLocaleString("en-US");
const initials = name => name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const nowTime = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

const PLANS = {
    monthly:   { label: "Monthly",   days: 30,  price: 800 },
    quarterly: { label: "Quarterly", days: 90,  price: 2100 },
    annual:    { label: "Annual",    days: 365, price: 7500 }
};

const METHODS = ["Cash", "GCash", "Bank transfer"];

// Small deterministic PRNG (mulberry32). The seed history generator must
// reproduce the same records on every re-seed — a Math.random() based seed
// would move every bar in the charts between reloads, which reads as a bug.
function seeded(a) {
    return function () {
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// membership status comes from days left before expiry
const daysLeft = m => daysBetween(TODAY, m.end);

function statusOf(m) {
    const d = daysLeft(m);
    if (d < 0) return { key: "expired", label: "Expired", cls: "expired" };
    if (d <= 7) return { key: "expiring", label: "Expiring", cls: "warning" };
    return { key: "active", label: "Active", cls: "active" };
}

const DB = {
    members: [],
    payments: [],
    checkins: [],
    applications: [],
    KEY: "profit-db-v1",
    // Bump when the seed shape changes so an older stored copy re-seeds once
    // instead of silently keeping the thin data set.
    REV: 3,

    seed() {
        // Lifetime visit count is derived from the generated history below, not
        // passed in — it used to be a literal here that disagreed with the rows
        // you could actually browse.
        const mk = (id, name, phone, plan, left) => {
            const end = addDays(TODAY, left);
            return { id, name, email: emailFor(name), phone, plan, start: addDays(end, -PLANS[plan].days), end, checkins: 0 };
        };

        this.members = [
            mk("M202601", "Kim Namjoon",   "0917 100 0001", "monthly",   18),
            mk("M202602", "Kim Seokjin",   "0917 100 0002", "monthly",  -12),
            mk("M202603", "Min Yoongi",    "0917 100 0003", "quarterly", 64),
            mk("M202604", "Jung Hoseok",   "0917 100 0004", "monthly",    4),
            mk("M202605", "Maria Santos",  "0917 100 0005", "monthly",   12),
            mk("M202606", "Jose Reyes",    "0917 100 0006", "quarterly", 40),
            mk("M202607", "Ana Cruz",      "0917 100 0007", "monthly",   -3),
            mk("M202608", "Paolo Garcia",  "0917 100 0008", "monthly",    6),
            mk("M202609", "Liza Mendoza",  "0917 100 0009", "quarterly", 75),
            mk("M202610", "Carlo Ramos",   "0917 100 0010", "monthly",   25)
        ];

        // [days ago (negative), member id, plan, method] — hand-written recent rows.
        const pays = [
            [0, "M202601", "monthly", "GCash"], [0, "M202604", "monthly", "Cash"], [0, "M202605", "monthly", "Cash"],
            [-1, "M202603", "quarterly", "GCash"], [-1, "M202608", "monthly", "Cash"],
            [-2, "M202606", "quarterly", "Bank transfer"], [-3, "M202610", "monthly", "GCash"],
            [-5, "M202602", "monthly", "Cash"], [-6, "M202607", "monthly", "Cash"],
            [-8, "M202609", "quarterly", "GCash"], [-10, "M202605", "monthly", "Cash"],
            [-13, "M202601", "monthly", "GCash"], [-16, "M202604", "monthly", "Cash"],
            [-21, "M202608", "monthly", "Bank transfer"]
        ];

        // Renewal history. The hand-written rows above only reach back 21 days,
        // so the revenue chart's default month view drew 2 bars out of 12 and
        // "year" drew a single one. Walk each member backwards one period at a
        // time — anchored on the start of their current period, which is where
        // renew() leaves off — so the ladder fills and the newest renewal still
        // lines up with the hand-written rows.
        //
        // Payments before `m.start` are correct, not a contradiction: renew()
        // resets `start` to the previous end on every renewal, so those rows are
        // exactly the earlier periods the member already paid for.
        const payRand = seeded(918273);
        const PAY_HISTORY_DAYS = 450; // ~15 months — covers the 12-month ladder
        const payFloor = addDays(TODAY, -PAY_HISTORY_DAYS);
        const hist = [];
        this.members.forEach(m => {
            const step = PLANS[m.plan].days;
            for (let t = addDays(m.start, -step); t >= payFloor; t = addDays(t, -step)) {
                hist.push({ date: t, memberId: m.id, plan: m.plan, method: METHODS[Math.floor(payRand() * METHODS.length)] });
            }
        });

        // Merge then number refs by date so references stay chronological; refs
        // also drive the "newest first" tie-break on the payments table.
        const all = hist.concat(pays.map(p => ({
            date: addDays(TODAY, p[0]), memberId: p[1], plan: p[2], method: p[3]
        }))).sort((a, b) => a.date - b.date);

        this.payments = all.map((p, i) => ({
            ref: "P-" + String(i + 1).padStart(4, "0"),
            date: p.date,
            memberId: p.memberId,
            plan: p.plan,
            method: p.method,
            amount: PLANS[p.plan].price
        }));

        const times = [["M202601", "06:05 AM"], ["M202604", "06:40 AM"], ["M202605", "07:15 AM"],
                       ["M202603", "08:30 AM"], ["M202606", "09:10 AM"]];

        // ---- Check-in history ------------------------------------------
        // The whole dataset used to be five records all stamped today, so every
        // chart period except "days" drew blank — and "month"/"year" were empty
        // outright. Generate a deterministic 12-week trail instead.
        //
        // Deterministic on purpose: a seeded PRNG means re-seeding reproduces
        // the identical chart. Math.random() would reshuffle every bar on each
        // reload, which reads as a bug rather than as demo data.
        //
        // `m.start` marks the *current* billing period (renew() resets it), so
        // attendance before it is simply the member's previous period — the one
        // hard limit is `m.end`: nobody is recorded after their membership
        // lapses, which is also what makes the two expired members visibly go
        // quiet instead of visiting right up to today.
        const rand = seeded(20261011);
        const SLOTS = ["06:05 AM", "06:40 AM", "07:15 AM", "05:40 PM", "06:20 PM", "07:05 PM", "08:10 PM"];
        // Per-member weekly tendency, aligned to the order above. Spread across
        // the roster so no two members produce an identical streak pattern.
        const RATE = [0.55, 0.34, 0.60, 0.70, 0.50, 0.65, 0.38, 0.58, 0.72, 0.45];
        const HISTORY_DAYS = 84;

        const rows = [];
        // back = 1..83 only: today is owned by the authored `times` slate below,
        // so the live attendance panel keeps the exact five records the rest of
        // the demo already references.
        for (let back = HISTORY_DAYS - 1; back >= 1; back--) {
            const day = addDays(TODAY, -back);
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            this.members.forEach((m, i) => {
                if (day > m.end) return; // expired — no visits after lapse
                const p = RATE[i % RATE.length] * (weekend ? 0.55 : 1);
                if (rand() > p) return;
                rows.push({ date: day, time: SLOTS[Math.floor(rand() * SLOTS.length)], memberId: m.id });
            });
        }
        times.forEach(t => rows.push({ date: TODAY, time: t[1], memberId: t[0] }));
        this.checkins = rows;

        // Keep the card's lifetime counter in step with the history you can
        // actually browse, otherwise the member page promises 24 visits and
        // lists a different number.
        this.members.forEach(m => {
            m.checkins = rows.filter(c => c.memberId === m.id).length;
        });

        // Sample applications
        this.applications = [
            {
                id: "APP-001",
                name: "Alex Thompson",
                email: "alex@example.com",
                phone: "0921 555 0001",
                plan: "monthly",
                payment: "GCash",
                status: "pending",
                createdAt: new Date().toISOString(),
                notes: ""
            },
            {
                id: "APP-002",
                name: "Maria Rodriguez",
                email: "maria@example.com",
                phone: "0921 555 0002",
                plan: "quarterly",
                payment: "Bank transfer",
                status: "pending",
                createdAt: new Date().toISOString(),
                notes: ""
            }
        ];
    },

    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) {
                const s = JSON.parse(raw);
                // REV was declared (and bumped) but never actually read, so an
                // older stored copy kept its thin data set forever and the seed
                // below never ran. Compare it before adopting the stored rows.
                if (Number(s.rev) === this.REV) {
                    this.members = s.members.map(m => ({ ...m, email: m.email || emailFor(m.name), start: fromISO(m.start), end: fromISO(m.end) }));
                    this.payments = s.payments.map(p => ({ ...p, date: fromISO(p.date) }));
                    this.checkins = s.checkins.map(c => ({ ...c, date: fromISO(c.date) }));
                    this.applications = s.applications || [];
                    return;
                }
            }
        } catch { /* fall through to seed */ }
        this.seed();
        this.save();
    },

    save() {
        try {
            localStorage.setItem(this.KEY, JSON.stringify({
                rev: this.REV,
                members: this.members.map(m => ({ ...m, start: toISO(m.start), end: toISO(m.end) })),
                payments: this.payments.map(p => ({ ...p, date: toISO(p.date) })),
                checkins: this.checkins.map(c => ({ ...c, date: toISO(c.date) })),
                applications: this.applications
            }));
        } catch { /* storage blocked — data lasts until refresh */ }
    },

    reset() {
        try { localStorage.removeItem(this.KEY); } catch { /* ignore */ }
        this.seed();
    },

    nextMemberId() { const n = Math.max(202600, ...this.members.map(m => parseInt(String(m.id).replace(/\D/g, ""), 10) || 0)) + 1; return "M" + n; },
    nextRef() { const n = Math.max(0, ...this.payments.map(p => parseInt(String(p.ref).replace(/\D/g, ""), 10) || 0)) + 1; return "P-" + String(n).padStart(4, "0"); },
    member(id) { return this.members.find(m => m.id === id); }
};

DB.load();

// ---------- Server sync (Part 1) ----------
// Reads members, desk payments, and today's check-ins from the Django API.
// Signed-out visitors and non-staff roles get 401/403 and keep the local copy.
// When the server data differs from what this browser last saw, the page
// reloads once so every screen renders the server data.
const METHOD_CODE = { "Cash": "CASH", "GCash": "GCASH", "Bank transfer": "BANK" };
// sync(true) reloads the page once when the server data changed (page load).
// sync(false) just refreshes DB in place; used right after a write so the screen can redraw.
DB.sync = async function (reload = false) {
    const METHOD_LABEL = { CASH: "Cash", GCASH: "GCash", BANK: "Bank transfer", ONLINE: "Online (PayMongo)" };
    const idFor = pk => "M" + (202600 + pk);
    const SIG_KEY = "profit-server-sig";
    let responses;
    try {
        responses = await Promise.all([
            fetch("/api/staff/members/", { credentials: "same-origin" }),
            fetch("/api/staff/payments/", { credentials: "same-origin" }),
            fetch("/api/staff/attendance/", { credentials: "same-origin" })
        ]);
    } catch { window.pfSyncSettled = true; document.dispatchEvent(new CustomEvent("profit:synced", { detail: { ok: false } })); return false; }
    if (responses.some(r => !r.ok)) { window.pfSyncSettled = true; document.dispatchEvent(new CustomEvent("profit:synced", { detail: { ok: false } })); return false; }

    const [rows, pays, atts] = await Promise.all(responses.map(r => r.json()));

    // The API lists payments newest first, so the first row seen is each member's current plan.
    const planOf = {};
    pays.forEach(p => { if (!(p.member_id in planOf)) planOf[p.member_id] = p.plan; });

    this.members = rows.map(r => {
        const plan = planOf[r.id] || "monthly";
        const end = r.expiry_date ? fromISO(r.expiry_date) : TODAY;
        return {
            id: idFor(r.id), serverId: r.id, name: r.name, email: r.email || "",
            phone: r.phone || "", address: r.address || "",
            emergencyName: "", emergencyPhone: "", photoId: null,
            plan, start: addDays(end, -(PLANS[plan]?.days || 30)), end, checkins: 0,
            joined: r.date_joined ? fromISO(r.date_joined) : null
        };
    });
    this.payments = pays.map(p => ({
        ref: p.ref, id: p.id, desk: typeof p.id === "number", methodCode: p.method,
        date: fromISO(p.paid_on), memberId: idFor(p.member_id),
        plan: p.plan, method: METHOD_LABEL[p.method] || p.method, amount: p.amount_centavos / 100
    }));
    this.checkins = atts.map(a => ({
        date: fromISO(a.check_in_date), memberId: idFor(a.member_id),
        time: new Date(a.check_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    }));

    const sig = JSON.stringify([this.members, this.payments, this.checkins]);
    const changed = localStorage.getItem(SIG_KEY) !== sig;
    this.save();
    this.synced = true;
    if (changed) {
        try { localStorage.setItem(SIG_KEY, sig); } catch { /* storage blocked */ }
        if (reload) { location.reload(); return true; }
    }
    window.pfSyncSettled = true;
    document.dispatchEvent(new CustomEvent("profit:synced", { detail: { ok: true, changed } }));
    return true;
};
{
    const rawSync = DB.sync;
    DB.sync = async function (...args) {
        window.ProFitAPI?.busy(1);
        try { return await rawSync.apply(this, args); } finally { window.ProFitAPI?.busy(-1); }
    };
}
DB.sync(false);

// Skeleton gate: holds the shimmer placeholders for one short beat and no
// longer than the first server sync, then runs the page's first render. Without
// it the local demo rows paint first and get replaced, which reads as a flicker.
window.pfAfterSync = (() => {
    const MIN = 400;                     // shortest time the placeholder stays up
    const started = performance.now();
    const queue = [];
    let settled = false, done = false;
    const run = () => { if (done) return; done = true; queue.splice(0).forEach(fn => fn()); };
    // A request that hangs must not leave the page shimmering forever.
    const settle = () => {
        if (settled) return;
        settled = true;
        setTimeout(run, Math.max(0, MIN - (performance.now() - started)));
    };
    if (window.pfSyncSettled) settle();
    else {
        document.addEventListener("profit:synced", settle, { once: true });
        setTimeout(settle, 4000);
    }
    return fn => (done ? fn() : queue.push(fn));
})();

// Class and trainer catalogue used by the member portal schedules.
const TRAINERS = [
    { id: "t-mia", name: "Coach Mia Ramos", specialty: "Boxing and conditioning", days: "Mon, Wed, Fri" },
    { id: "t-paolo", name: "Coach Paolo Dizon", specialty: "Circuit and HIIT", days: "Tue, Thu, Sat" },
    { id: "t-ria", name: "Coach Ria Santos", specialty: "Functional training and mobility", days: "Mon, Wed, Sat" }
];
const CLASSES = [
    { id: "boxing", name: "Boxing", trainer: "t-mia", days: ["Mon", "Wed", "Fri"], time: "6:00 PM", minutes: 60, level: "All levels", blurb: "Footwork, pad work and conditioning rounds." },
    { id: "circuit", name: "Circuit", trainer: "t-paolo", days: ["Tue", "Thu"], time: "7:00 AM", minutes: 45, level: "Beginner friendly", blurb: "Rotate through stations to build endurance." },
    { id: "functional", name: "Functional Training", trainer: "t-ria", days: ["Mon", "Wed", "Sat"], time: "5:30 PM", minutes: 60, level: "Intermediate", blurb: "Full-body moves for strength you use every day." }
];
