/* ProFit staff front end — data layer.
   Everything the pages read or change goes through PF.db. Today it is backed by
   seeded demo data kept in localStorage, so every screen is clickable end to end.
   Each mutation has an "API:" comment naming the Django endpoint it should call
   when you wire this to the real backend (see README.md → "Wiring to the API"). */
(function () {
  const PF = (window.PF = window.PF || {});
  const KEY = 'pf-staff-v2';
  const SEED_VERSION = 4;

  /* ---------- formatting helpers ---------- */
  const MS_DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const startOfDay = d => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
  const at = (offsetDays, h = 9, m = 0) => { const d = addDays(startOfDay(new Date()), offsetDays); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = (n, dec) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
  const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtShort = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtTime = d => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmtDateTime = d => fmtDate(d) + ' · ' + fmtTime(d);
  const timeAgo = iso => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.round(hrs / 24);
    return days === 1 ? 'Yesterday' : days + 'd ago';
  };
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  const AV = [['#f6dfa4', '#6b4500'], ['#e4d4fb', '#5b2fb0'], ['#c9efe3', '#0b6b50'], ['#fcd5d3', '#a02a2f'], ['#cfe3fb', '#1c58ac'], ['#fde0bd', '#9a5200']];
  const hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const avatarColors = n => AV[hash(n) % AV.length];
  const rng = seed => { let a = typeof seed === 'number' ? seed : hash(seed); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  Object.assign(PF, { esc, peso, fmtDate, fmtShort, fmtTime, fmtDateTime, timeAgo, initials, avatarColors, dayKey, startOfDay, addDays, rng, hash, MS_DAY });

  /* ---------- seed ---------- */
  const PLANS = [
    { id: 'daily', name: 'Daily', price: 100, days: 1, active: true },
    { id: 'monthly', name: 'Monthly', price: 1500, days: 30, active: true },
    { id: 'quarterly', name: 'Quarterly', price: 3750, days: 90, active: true },
    { id: 'annual', name: 'Annual', price: 15000, days: 365, active: true }
  ];
  const METHODS = [
    { id: 'Cash', icon: 'banknote', source: 'desk' },
    { id: 'GCash', icon: 'smartphone', source: 'desk' },
    { id: 'Maya', icon: 'smartphone', source: 'desk' },
    { id: 'Bank Transfer', icon: 'landmark', source: 'desk' },
    { id: 'Credit Card', icon: 'credit-card', source: 'online' },
    { id: 'QR Ph', icon: 'smartphone', source: 'online' }
  ];
  PF.PLANS_DEFAULT = PLANS; PF.METHODS = METHODS;

  function seed() {
    // [name, plan, daysLeft, trainerId, phone]
    const spec = [
      ['Alex Thompson', 'monthly', 27, 't1', '0917 301 2201'], ['Angela Melillo', 'monthly', 29, 't2', '0918 442 1180'],
      ['James Lim', 'monthly', 5, 't3', '0927 118 7745'], ['Sophia Ramirez', 'annual', 54, 't1', '0915 660 0912'],
      ['Daniel Wong', 'quarterly', 78, null, '0998 204 3351'], ['Liza Cortez', 'monthly', 18, 't4', '0917 884 5502'],
      ['Matthew Cruz', 'annual', 201, 't3', '0922 771 6490'], ['Isabella Santos', 'quarterly', 44, 't4', '0906 335 1827'],
      ['Ryan Garcia', 'monthly', 3, null, '0935 502 9981'], ['Chloe Rivera', 'monthly', -4, 't2', '0917 220 6613'],
      ['Mara Villanueva', 'monthly', 22, 't2', '0919 417 3068'], ['Paolo Reyes', 'monthly', 9, 't1', '0945 880 2274']
    ];
    const members = spec.map((s, i) => {
      const plan = PLANS.find(p => p.id === s[1]);
      const end = s[2];
      const first = s[0].split(' ')[0].toLowerCase(), last = s[0].split(' ')[1].toLowerCase();
      return {
        id: 'M2026' + pad(i + 4), name: s[0], email: first + '.' + last + (i % 3 === 0 ? '@example.com' : i % 3 === 1 ? '@gmail.com' : '@yahoo.com'),
        phone: s[4], plan: plan.id, start: at(end - plan.days, 9), end: at(end, 23, 59), hold: null, trainerId: s[3],
        joined: at(end - plan.days - (i * 9 + 20), 10), gender: i % 2 ? 'Female' : 'Male', birthdate: '199' + (i % 10) + '-0' + ((i % 9) + 1) + '-1' + (i % 9),
        emergency: 'Family contact · 09' + (170000000 + hash(s[0]) % 99999999), photo: '', notes: ''
      };
    });
    const mid = n => members.find(m => m.name === n).id;

    const trainers = [
      { id: 't1', name: 'Marcus Tan', role: 'Trainer / Coach', tags: ['Strength', 'HIIT'], rating: 4.9, reviews: 34, cap: 15, status: 'active', phone: '0917 555 0191', email: 'marcus@profitgym.ph' },
      { id: 't2', name: 'Sophia Reyes', role: 'Trainer / Coach', tags: ['Weight Loss', 'Functional'], rating: 4.8, reviews: 28, cap: 12, status: 'active', phone: '0917 555 0192', email: 'sophia@profitgym.ph' },
      { id: 't3', name: 'Daniel Cruz', role: 'Trainer / Coach', tags: ['Mobility', 'Conditioning'], rating: 4.7, reviews: 21, cap: 15, status: 'active', phone: '0917 555 0193', email: 'daniel@profitgym.ph' },
      { id: 't4', name: 'Isabel Navarro', role: 'Trainer / Coach', tags: ['Yoga', 'Flexibility'], rating: 4.8, reviews: 19, cap: 10, status: 'active', phone: '0917 555 0194', email: 'isabel@profitgym.ph' },
      { id: 't5', name: 'Jameson Cole', role: 'Trainer / Coach', tags: ['Strength', 'CrossFit'], rating: 4.6, reviews: 16, cap: 12, status: 'active', phone: '0917 555 0195', email: 'jameson@profitgym.ph' },
      { id: 't6', name: 'Angela Morales', role: 'Trainer / Coach', tags: ['Weight Loss', 'HIIT'], rating: 4.5, reviews: 12, cap: 10, status: 'leave', phone: '0917 555 0196', email: 'angela@profitgym.ph' }
    ];
    const requests = [
      { id: 'r1', memberId: mid('Liza Cortez'), spec: 'Flexibility', at: at(-1, 14), status: 'pending' },
      { id: 'r2', memberId: mid('Ryan Garcia'), spec: 'Strength Training', at: at(-2, 11), status: 'pending' },
      { id: 'r3', memberId: mid('Chloe Rivera'), spec: 'HIIT', at: at(-3, 16), status: 'pending' },
      { id: 'r4', memberId: mid('Mara Villanueva'), spec: 'Weight Loss', at: at(-6, 10), status: 'approved' },
      { id: 'r5', memberId: mid('Paolo Reyes'), spec: 'Strength Training', at: at(-9, 15), status: 'approved' },
      { id: 'r6', memberId: mid('Daniel Wong'), spec: 'Yoga', at: at(-11, 9), status: 'declined' }
    ];

    // hand-written recent payments (offset days, hh, mm, member, plan, method, status)
    const manual = [
      [0, 9, 42, 'Alex Thompson', 'monthly', 'Cash', 'completed'],
      [0, 10, 5, 'Mara Villanueva', 'monthly', 'GCash', 'completed'],
      [0, 11, 20, 'Paolo Reyes', 'daily', 'Cash', 'completed'],
      [-1, 9, 17, 'Angela Melillo', 'quarterly', 'GCash', 'completed'],
      [-1, 14, 8, 'Liza Cortez', 'monthly', 'Maya', 'completed'],
      [-2, 16, 32, 'James Lim', 'monthly', 'Bank Transfer', 'completed'],
      [-2, 11, 3, 'Sophia Ramirez', 'monthly', 'Cash', 'pending'],
      [-3, 15, 12, 'Daniel Wong', 'quarterly', 'Credit Card', 'completed'],
      [-3, 10, 40, 'Isabella Santos', 'quarterly', 'QR Ph', 'completed'],
      [-4, 13, 25, 'Chloe Rivera', 'monthly', 'GCash', 'failed'],
      [-5, 17, 50, 'Ryan Garcia', 'monthly', 'Cash', 'completed'],
      [-6, 9, 30, 'Matthew Cruz', 'annual', 'Credit Card', 'completed'],
      [-8, 18, 10, 'Isabella Santos', 'monthly', 'Cash', 'completed'],
      [-9, 12, 45, 'Mara Villanueva', 'monthly', 'QR Ph', 'completed'],
      [-7, 10, 15, 'Paolo Reyes', 'monthly', 'Cash', 'completed'],
      [-10, 15, 30, 'Alex Thompson', 'monthly', 'GCash', 'completed'],
      [-11, 9, 5, 'Liza Cortez', 'monthly', 'Cash', 'completed'],
      [-12, 17, 20, 'Daniel Wong', 'quarterly', 'Bank Transfer', 'completed'],
      [-13, 11, 45, 'Ryan Garcia', 'monthly', 'Maya', 'completed']
    ];
    const pays = manual.map(m => ({ memberId: mid(m[3]), plan: m[4], method: m[5], status: m[6], at: at(m[0], m[1], m[2]) }));

    // history: previous months of this year, deterministic
    const r = rng('profit-history');
    const now = new Date();
    for (let mo = 0; mo < now.getMonth(); mo++) {
      const n = 7 + Math.round(mo * 0.9 + r() * 3);
      for (let k = 0; k < n; k++) {
        const roll = r();
        const plan = roll < 0.12 ? 'daily' : roll < 0.62 ? 'monthly' : roll < 0.9 ? 'quarterly' : 'annual';
        const method = METHODS[Math.floor(r() * METHODS.length)].id;
        const d = new Date(now.getFullYear(), mo, 1 + Math.floor(r() * 27), 8 + Math.floor(r() * 11), Math.floor(r() * 60));
        pays.push({ memberId: members[Math.floor(r() * members.length)].id, plan, method, status: r() < 0.05 ? 'failed' : 'completed', at: d.toISOString() });
      }
    }
    pays.sort((a, b) => new Date(a.at) - new Date(b.at));
    const payments = pays.map((p, i) => {
      const pl = PLANS.find(x => x.id === p.plan);
      const meth = METHODS.find(x => x.id === p.method);
      return { id: 'P-' + String(i + 1).padStart(5, '0'), memberId: p.memberId, plan: p.plan, method: p.method, source: meth.source, amount: pl.price, status: p.status, at: p.at, note: '', by: meth.source === 'online' ? 'PayMongo' : 'Joyce Alvarez' };
    });

    const announcements = [
      { id: 'n1', title: 'Holiday schedule: Undas weekend', message: 'We open 8:00 AM – 2:00 PM on Nov 1 and close early on Nov 2. All classes resume on Nov 3.', audience: 'Everyone', status: 'published', at: at(-2, 9), author: 'Joyce Alvarez' },
      { id: 'n2', title: 'New Sunrise HIIT class — Mon & Thu 6:00 AM', message: 'Coach Marcus is opening a limited 12-slot HIIT class. Sign up at the front desk.', audience: 'Members', status: 'published', at: at(-5, 15), author: 'Joyce Alvarez' },
      { id: 'n3', title: 'Trainer meeting this Friday', message: 'Quarterly review of member progress and trainer assignments at 5:30 PM in the studio.', audience: 'Trainers', status: 'published', at: at(-6, 10), author: 'Joyce Alvarez' },
      { id: 'n4', title: 'Equipment maintenance — cable station', message: 'The cable station will be unavailable on Saturday morning while we service it.', audience: 'Everyone', status: 'draft', at: at(-1, 17), author: 'Joyce Alvarez' },
      { id: 'n5', title: 'September promo ended', message: 'Thanks for joining! Annual plan promo has ended.', audience: 'Members', status: 'archived', at: at(-30, 9), author: 'Joyce Alvarez' }
    ];

    const notifications = [
      { id: 'x2', type: 'payments', icon: 'wallet', tone: 'gold', title: 'Payment received', text: '₱3,750 from Angela Melillo (GCash)', at: at(-1, 9, 17), read: false, href: 'transactions.html' },
      { id: 'x3', type: 'payments', icon: 'alert-circle', tone: 'red', title: 'Payment failed', text: 'Chloe Rivera — GCash ₱1,500 was declined', at: at(-4, 13, 25), read: false, href: 'transactions.html' },
      { id: 'x4', type: 'members', icon: 'clock', tone: 'amber', title: 'Memberships expiring soon', text: 'Ryan Garcia and James Lim expire within 7 days', at: at(-1, 8), read: true, href: 'subscriptions.html' },
      { id: 'x5', type: 'members', icon: 'refresh', tone: 'purple', title: 'Membership renewed', text: 'Mara Villanueva renewed Monthly', at: at(-9, 12, 45), read: true, href: 'members.html' },
      { id: 'x6', type: 'system', icon: 'settings', tone: 'blue', title: 'System update', text: 'Maintenance scheduled Sunday 2:00 AM', at: at(-2, 6), read: true, href: 'settings.html' },
      { id: 'x7', type: 'members', icon: 'dumbbell', tone: 'blue', title: 'Trainer request', text: 'Liza Cortez requested a Flexibility trainer', at: at(-1, 14), read: true, href: 'trainers.html' }
    ];

    return {
      v: SEED_VERSION, plans: PLANS, members, payments, trainers, requests, announcements, notifications, attendanceManual: [],
      profile: { name: 'Joyce Alvarez', email: 'joycealvarez104@gmail.com', phone: '0917 555 0100', role: 'Owner', bio: 'Gym owner and front-desk lead.', photo: '', joined: at(-400) },
      gym: { name: 'ProFit', tagline: 'FUNCTIONAL FITNESS', phone: '+63 917 555 0142', email: 'hello@profitgym.ph', address: 'Unit 4, Brgy. Poblacion, Makati City, Metro Manila', logo: '', hours: [['Mon – Fri', '6:00 AM – 10:00 PM'], ['Saturday', '7:00 AM – 9:00 PM'], ['Sunday', '8:00 AM – 6:00 PM']] },
      prefs: { newMember: true, payment: true, expiring: true, failed: true, trainer: true, system: false, daily: true }
    };
  }

  /* ---------- store ---------- */
  let S = null;
  const load = () => {
    try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && raw.v >= SEED_VERSION) return raw; } catch (e) { /* storage blocked */ }
    return null;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } };
  const stored = load();
  S = stored || seed();
  if (!stored) save();            // only write on first run, so opening a page never touches other tabs

  const planOf = id => S.plans.find(p => p.id === id) || PLANS.find(p => p.id === id) || PLANS[1];
  const memberById = id => S.members.find(m => m.id === id);
  const trainerById = id => S.trainers.find(t => t.id === id);
  const daysLeft = m => Math.ceil((new Date(m.end) - new Date()) / MS_DAY);
  const statusOf = m => {
    if (m.hold === 'cancelled') return 'cancelled';
    if (m.hold === 'frozen') return 'frozen';
    const d = daysLeft(m);
    return d < 0 ? 'expired' : d <= 7 ? 'expiring' : 'active';
  };
  const nextMemberId = () => 'M2026' + pad(Math.max(3, ...S.members.map(m => parseInt(m.id.slice(5), 10) || 0)) + 1);
  const nextPayId = () => 'P-' + String(Math.max(0, ...S.payments.map(p => parseInt(p.id.slice(2), 10) || 0)) + 1).padStart(5, '0');
  const uid = p => p + Date.now().toString(36) + Math.floor(Math.random() * 99);

  function notify(n) {
    S.notifications.unshift({ id: uid('x'), read: false, at: new Date().toISOString(), tone: 'gold', ...n });
    S.notifications = S.notifications.slice(0, 60);
  }
  const emit = () => { save(); try { document.dispatchEvent(new CustomEvent('pf:data')); } catch (e) { /* no document */ } };

  /* ---------- attendance (deterministic per day + manual overrides) ---------- */
  function attendanceFor(date) {
    const key = dayKey(date), day = startOfDay(date), today = startOfDay(new Date());
    if (day > today) return [];
    const out = [];
    S.members.forEach(m => {
      if (new Date(m.start) > addDays(day, 1) || m.hold === 'cancelled') return;
      const end = new Date(m.end); if (end < day && daysBefore(end, day) > 3) return;
      const r = rng(key + m.id);
      const roll = r();
      if (roll < 0.74) {
        const mins = 6 * 60 + Math.floor(r() * 14 * 60);
        const late = r() < 0.18;
        const when = new Date(day); when.setHours(0, mins, 0, 0);
        if (day.getTime() === today.getTime() && when > new Date()) return;      // not yet arrived today
        out.push({ memberId: m.id, at: when.toISOString(), status: late ? 'late' : 'in', manual: false });
      } else if (roll < 0.9 && (day < today || new Date().getHours() >= 18)) {
        out.push({ memberId: m.id, at: null, status: 'absent', manual: false });
      }
    });
    S.attendanceManual.filter(a => dayKey(a.at) === key).forEach(a => {
      const i = out.findIndex(o => o.memberId === a.memberId);
      if (i >= 0) out[i] = { ...a, manual: true }; else out.push({ ...a, manual: true });
    });
    return out.sort((a, b) => (a.at ? new Date(a.at).getTime() : 9e15) - (b.at ? new Date(b.at).getTime() : 9e15));
  }
  const daysBefore = (a, b) => Math.round((b - a) / MS_DAY);

  /* ---------- public API ---------- */
  PF.db = {
    get state() { return S; },
    plans: () => S.plans, planOf, methods: () => METHODS,
    members: () => S.members, member: memberById, statusOf, daysLeft,
    payments: () => [...S.payments].sort((a, b) => new Date(b.at) - new Date(a.at)),
    trainers: () => S.trainers, trainer: trainerById, requests: () => S.requests,
    announcements: () => [...S.announcements].sort((a, b) => new Date(b.at) - new Date(a.at)),
    notifications: () => [...S.notifications].sort((a, b) => new Date(b.at) - new Date(a.at)),
    unread: () => S.notifications.filter(n => !n.read).length,
    profile: () => S.profile, gym: () => S.gym, prefs: () => S.prefs,
    attendanceFor,
    trainerLoad: id => S.members.filter(m => m.trainerId === id && m.hold !== 'cancelled').length,
    memberPayments: id => PF.db.payments().filter(p => p.memberId === id),
    memberAttendance(id, days = 30) {
      const out = [];
      for (let i = 0; i < days && out.length < 8; i++) {
        const rec = attendanceFor(addDays(new Date(), -i)).find(a => a.memberId === id && a.status !== 'absent');
        if (rec) out.push(rec);
      }
      return out;
    },
    revenueByMonth(year) {
      const arr = Array(12).fill(0);
      S.payments.forEach(p => { const d = new Date(p.at); if (p.status === 'completed' && d.getFullYear() === year) arr[d.getMonth()] += p.amount; });
      return arr;
    },
    sumPayments(from, to, filter) {
      return S.payments.filter(p => { const t = new Date(p.at); return t >= from && t <= to && p.status === 'completed' && (!filter || filter(p)); }).reduce((s, p) => s + p.amount, 0);
    },

    /* API: POST /staff/members/ (+ POST /staff/payments/ when paid at the desk) */
    addMember(d) {
      const plan = planOf(d.plan);
      const start = d.start ? new Date(d.start + 'T09:00:00') : new Date();
      const end = addDays(start, plan.days);
      const m = { id: nextMemberId(), name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(), plan: plan.id, start: start.toISOString(), end: new Date(end.setHours(23, 59, 0, 0)).toISOString(), hold: null, trainerId: d.trainerId || null, joined: new Date().toISOString(), gender: d.gender || '', birthdate: d.birthdate || '', emergency: d.emergency || '', photo: d.photo || '', notes: d.notes || '' };
      S.members.unshift(m);
      let pay = null;
      if (d.method) pay = PF.db._pay({ memberId: m.id, plan: plan.id, method: d.method, amount: d.amount ?? plan.price, status: 'completed', note: 'Enrollment' }, true);
      notify({ type: 'members', icon: 'user-plus', tone: 'green', title: 'New member enrolled', text: m.name + ' · ' + plan.name, href: 'members.html#detail=' + m.id });
      emit(); return { member: m, payment: pay };
    },
    /* API: PATCH /staff/members/:id/ */
    updateMember(id, patch) { const m = memberById(id); if (!m) return null; Object.assign(m, patch); emit(); return m; },
    /* API: PATCH /staff/members/:id/ {hold:'frozen'|'cancelled'|null} */
    setHold(id, hold) {
      const m = memberById(id); if (!m) return;
      m.hold = hold;
      notify({ type: 'members', icon: hold === 'frozen' ? 'snowflake' : hold === 'cancelled' ? 'ban' : 'refresh', tone: hold ? 'amber' : 'green', title: hold ? 'Membership ' + hold : 'Membership reactivated', text: m.name, href: 'members.html#detail=' + id });
      emit();
    },
    /* API: POST /staff/payments/ — also the renewal path (extends expiry from today or the old expiry, whichever is later) */
    recordPayment(d) { const p = PF.db._pay({ ...d, status: d.status || 'completed' }, true); emit(); return p; },
    _pay(d, extend) {
      const plan = planOf(d.plan), meth = METHODS.find(x => x.id === d.method) || METHODS[0], m = memberById(d.memberId);
      const p = { id: nextPayId(), memberId: d.memberId, plan: plan.id, method: meth.id, source: meth.source, amount: Number(d.amount) || plan.price, status: d.status, at: new Date().toISOString(), note: d.note || '', ref: d.ref || '', by: S.profile.name };
      S.payments.push(p);
      if (extend && m && p.status === 'completed' && d.note !== 'Enrollment') {
        const base = new Date(m.end) > new Date() ? new Date(m.end) : new Date();
        const end = addDays(base, plan.days); end.setHours(23, 59, 0, 0);
        m.end = end.toISOString(); m.plan = plan.id;
        if (m.hold === 'cancelled') m.hold = null;
      }
      if (p.status === 'completed') notify({ type: 'payments', icon: 'wallet', tone: 'gold', title: 'Payment recorded', text: peso(p.amount) + ' from ' + (m ? m.name : 'member') + ' (' + p.method + ')', href: 'transactions.html' });
      return p;
    },
    /* API: PATCH /staff/payments/:id/ {status} */
    setPaymentStatus(id, status) {
      const p = S.payments.find(x => x.id === id); if (!p) return;
      const was = p.status; p.status = status;
      const m = memberById(p.memberId);
      if (status === 'completed' && was !== 'completed' && m) {
        const plan = planOf(p.plan), base = new Date(m.end) > new Date() ? new Date(m.end) : new Date();
        const end = addDays(base, plan.days); end.setHours(23, 59, 0, 0); m.end = end.toISOString();
      }
      emit();
    },
    /* API: POST /staff/attendance/check-in/ */
    checkIn(memberId, status) {
      const m = memberById(memberId); if (!m) return;
      S.attendanceManual = S.attendanceManual.filter(a => !(a.memberId === memberId && dayKey(a.at) === dayKey(new Date())));
      S.attendanceManual.push({ memberId, at: new Date().toISOString(), status: status || 'in' });
      notify({ type: 'members', icon: 'calendar-check', tone: 'green', title: 'Attendance logged', text: m.name + ' checked in', href: 'attendance.html' });
      emit();
    },
    /* API: PATCH /staff/members/:id/ {trainer} */
    assignTrainer(memberId, trainerId) {
      const m = memberById(memberId), t = trainerById(trainerId); if (!m) return;
      m.trainerId = trainerId || null;
      if (t) notify({ type: 'members', icon: 'dumbbell', tone: 'blue', title: 'Trainer assigned', text: t.name + ' → ' + m.name, href: 'trainers.html' });
      emit();
    },
    /* API: POST /trainer-requests/:id/approve|decline/ */
    resolveRequest(id, status) {
      const r = S.requests.find(x => x.id === id); if (!r) return; r.status = status;
      if (status === 'approved') {
        const m = memberById(r.memberId);
        const t = S.trainers.filter(t => t.status === 'active' && t.tags.some(g => r.spec.toLowerCase().includes(g.toLowerCase().split(' ')[0]))).sort((a, b) => PF.db.trainerLoad(a.id) - PF.db.trainerLoad(b.id))[0];
        if (m && t) m.trainerId = t.id;
      }
      emit();
    },
    addTrainer(d) { const t = { id: uid('t'), role: 'Trainer / Coach', rating: 0, reviews: 0, status: 'active', ...d }; S.trainers.push(t); emit(); return t; },
    setTrainerStatus(id, status) { const t = trainerById(id); if (t) { t.status = status; emit(); } },

    /* API: POST /staff/announcements/, PATCH …/:id/, POST …/:id/publish|archive/ */
    saveAnnouncement(d) {
      if (d.id) { Object.assign(S.announcements.find(a => a.id === d.id) || {}, d); }
      else S.announcements.push({ id: uid('n'), at: new Date().toISOString(), author: S.profile.name, status: 'draft', ...d });
      if (d.status === 'published') notify({ type: 'system', icon: 'megaphone', tone: 'purple', title: 'Announcement published', text: d.title, href: 'announcements.html' });
      emit();
    },
    setAnnouncementStatus(id, status) { const a = S.announcements.find(x => x.id === id); if (a) { a.status = status; if (status === 'published') a.at = new Date().toISOString(); emit(); } },
    removeAnnouncement(id) { S.announcements = S.announcements.filter(a => a.id !== id); emit(); },

    /* API: POST /notifications/:id/read/, POST /notifications/read-all/ */
    markRead(id) { const n = S.notifications.find(x => x.id === id); if (n) { n.read = true; emit(); } },
    markAllRead() { S.notifications.forEach(n => (n.read = true)); emit(); },
    clearNotifications() { S.notifications = []; emit(); },

    /* API: PATCH /member/me/ equivalent for staff (profile), settings endpoints to be added */
    saveProfile(p) { Object.assign(S.profile, p); emit(); },
    saveGym(g) { Object.assign(S.gym, g); emit(); },
    savePrefs(p) { Object.assign(S.prefs, p); emit(); },
    savePlans(plans) { S.plans = plans; emit(); },
    syncFromStorage() { const fresh = load(); if (!fresh || JSON.stringify(fresh) === JSON.stringify(S)) return false; S = fresh; return true; },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } S = seed(); emit(); }
  };
})();
