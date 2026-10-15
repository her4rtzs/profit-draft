/* Local demonstration mode. Set DEMO_MODE=false and configure API_BASE_URL only when a real API is deployed. */
window.PROFIT_CONFIG = window.PROFIT_CONFIG || { API_BASE_URL: "/api", DEMO_MODE: false };

/* Shared browser stores.
   They live in config.js because every page — the staff workspace and both
   member/trainer portals — loads this file before anything else, so both sides
   always agree on what a gym announcement or a staff profile is. */
(() => {
  const KEYS = { announce: "profit-announcements-v1", profile: "profit-account-v1" };
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const timeAgo = iso => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.round(hrs / 24);
    return days === 1 ? "Yesterday" : `${days} days ago`;
  };

  window.ProFitAnnouncements = {
    KEY: KEYS.announce,
    esc,
    timeAgo,
    all() { return read(KEYS.announce) || []; },
    forAudience(who) {
      const wanted = String(who || "").toLowerCase();
      return this.all().filter(item => {
        const audience = String(item.audience || "Everyone").toLowerCase();
        return audience === "everyone" || audience === wanted;
      });
    },
    publish(input) {
      const item = {
        id: "a" + Date.now().toString(36),
        title: String(input.title || "").trim().slice(0, 120),
        message: String(input.message || "").trim().slice(0, 600),
        audience: input.audience || "Everyone",
        at: new Date().toISOString()
      };
      if (!item.title || !item.message) return null;
      write(KEYS.announce, [item, ...this.all()].slice(0, 50));
      return item;
    },
    remove(id) { write(KEYS.announce, this.all().filter(item => item.id !== id)); }
  };

  /* Staff profile — name, contact and avatar shown in the rail, the top bar and
     on the dedicated My profile page. */
  window.ProFitProfile = {
    KEY: KEYS.profile,
    get() {
      const base = { name: "", email: "", phone: "", role: "Gym administrator", photo: "", bio: "", joined: "" };
      return { ...base, ...(read(KEYS.profile) || {}) };
    },
    save(patch) {
      const next = { ...this.get(), ...patch };
      if (!write(KEYS.profile, next)) return null;
      return next;
    },
    initials() {
      const name = this.get().name || (window.ProFitAuth && window.ProFitAuth.user && window.ProFitAuth.user.name) || "Administrator";
      const parts = String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
      return parts || "PF";
    }
  };

  /* Weekly class timetable, shared by the member schedule, the overview
     calendar and the trainer portal so all three show the same week. */
  window.ProFitTimetable = [
    { dow: 0, time: "09:00", name: "Recovery & Stretch", coach: "Coach Bea", mins: 45, cap: 18, emoji: "🧘" },
    { dow: 1, time: "06:00", name: "Sunrise HIIT", coach: "Coach Mika", mins: 45, cap: 12, emoji: "🔥" },
    { dow: 1, time: "18:30", name: "Strength Basics", coach: "Coach Jun", mins: 60, cap: 10, emoji: "💪" },
    { dow: 2, time: "07:00", name: "Cardio Club", coach: "Coach Rei", mins: 40, cap: 16, emoji: "🏃" },
    { dow: 2, time: "19:00", name: "Boxing Fitness", coach: "Coach Dan", mins: 50, cap: 12, emoji: "🥊" },
    { dow: 3, time: "06:00", name: "Sunrise HIIT", coach: "Coach Mika", mins: 45, cap: 12, emoji: "🔥" },
    { dow: 3, time: "19:00", name: "Mobility Flow", coach: "Coach Bea", mins: 50, cap: 14, emoji: "🧘" },
    { dow: 4, time: "18:00", name: "Barbell Club", coach: "Coach Jun", mins: 60, cap: 8, emoji: "🏋️" },
    { dow: 5, time: "07:00", name: "Cardio Club", coach: "Coach Rei", mins: 40, cap: 16, emoji: "🏃" },
    { dow: 5, time: "17:30", name: "Friday Finisher", coach: "Coach Mika", mins: 45, cap: 12, emoji: "⚡" },
    { dow: 6, time: "08:00", name: "Team Sweat", coach: "Coaches", mins: 75, cap: 20, emoji: "⚽" }
  ];
  window.ProFitCoaches = [...new Set(window.ProFitTimetable.map(s => s.coach))].sort();

  /* Gym contact block. The public portal shows this so a visitor can reach the
     front desk without first creating an account — it is the single source the
     portal, the trainer portal and the footer all read from. */
  window.ProFitGym = {
    name: "ProFit",
    tag: "FUNCTIONAL FITNESS",
    phone: "+63 917 555 0142",
    email: "hello@profitgym.ph",
    address: "Unit 4, Brgy. Poblacion, Makati City, Metro Manila",
    hours: [
      { days: "Mon – Fri", time: "6:00 AM – 10:00 PM" },
      { days: "Saturday", time: "7:00 AM – 9:00 PM" },
      { days: "Sunday", time: "8:00 AM – 6:00 PM" }
    ],
    /* Where members actually send money. Shown on the enrollment form so a
       payer never has to ask the front desk for the account number. */
    payIn: [
      {
        id: "gcash",
        label: "GCash",
        icon: "fa-mobile-screen-button",
        accountName: "PROFIT FUNCTIONAL FITNESS",
        number: "0917 555 0142",
        note: "Send the exact amount, then paste the reference number below."
      },
      {
        id: "bank",
        label: "Bank transfer",
        icon: "fa-building-columns",
        accountName: "BDO · PROFIT FUNCTIONAL FITNESS",
        number: "0012 345 678 901",
        note: "Transfers post within one banking day. Use your name as the remark."
      },
      /* Cash is a real option on the form but has no account to send to. Without
         this entry the panel fell through to rows[0] and told a walk-in to send
         GCash, which is the wrong instruction for someone standing at the desk. */
      {
        id: "cash",
        label: "Cash",
        icon: "fa-money-bill-wave",
        lead: "Pay at the front desk",
        accountName: "",
        number: "",
        note: "Bring the exact amount. Ask for the official receipt and keep it for your records."
      }
    ],
    esc() {
      return String(arguments[0] ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
  };

  /* Activity feed. Staff pages get the richer API from sidebar.js; every other
     page (the portals, the member home, enrollment) writes straight into the
     same key so the front desk's bell tells the truth about what happened. */
  const NOTIF_KEY = "profit-notifications-v1";
  window.ProFitNotify = {
    KEY: NOTIF_KEY,
    push(input) {
      if (window.ProFitNotifications && typeof window.ProFitNotifications.push === "function") {
        return window.ProFitNotifications.push(input);
      }
      const item = {
        id: input.tag || input.type + ":" + Date.now(),
        type: input.type || "general",
        icon: input.icon || "fa-bell",
        title: input.title || "Update",
        message: input.message || "",
        time: input.time || "Just now",
        href: input.href || "",
        read: false
      };
      let list = [];
      try { list = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]"); } catch { /* storage blocked */ }
      if (!Array.isArray(list)) list = [];
      if (input.tag) list = list.filter(n => n.id !== input.tag);
      list = [item, ...list].slice(0, 40);
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
      try { document.dispatchEvent(new CustomEvent("profit-notifications")); } catch { /* no document */ }
      return item;
    }
  };
})();
