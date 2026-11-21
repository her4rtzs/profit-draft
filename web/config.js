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

  /* Deterministic flat-vector human cartoon avatars used across all portals
     whenever a user has not uploaded a custom profile photo. */
  const AVATAR_PRESETS = [
    // 1. Curly puffs, deep brown skin, warm amber shirt
    { bg: "#2b2113", skin: "#8d5524", shirt: "#f59e0b", hair: "#1a1412", style: "puffs" },
    // 2. Smooth cap hair, warm tan skin, bright gold shirt
    { bg: "#262014", skin: "#e0ac69", shirt: "#fbbf24", hair: "#1f1916", style: "cap" },
    // 3. Smooth cap hair, medium tan skin, orange-amber shirt, slate bg
    { bg: "#1f2636", skin: "#d9a066", shirt: "#f97316", hair: "#1c1816", style: "cap" },
    // 4. Athletic headband, rich brown skin, terracotta shirt
    { bg: "#2a1f14", skin: "#6f4222", shirt: "#b45309", hair: "#2b1d14", style: "headband", band: "#fbbf24" },
    // 5. Short side-part, light peach skin, teal-slate shirt
    { bg: "#17252d", skin: "#f1c27d", shirt: "#0ea5e9", hair: "#29201b", style: "part" },
    // 6. Bob cut, warm olive skin, sage emerald shirt
    { bg: "#17261f", skin: "#c68642", shirt: "#10b981", hair: "#1a1614", style: "bob" },
    // 7. Athletic headband, light tan skin, crimson-rust shirt
    { bg: "#281b1c", skin: "#e0ac69", shirt: "#dc2626", hair: "#241c18", style: "headband", band: "#f59e0b" },
    // 8. Curly puffs, medium brown skin, indigo-slate shirt
    { bg: "#1d2033", skin: "#a96b38", shirt: "#6366f1", hair: "#181412", style: "puffs" }
  ];

  function hashSeed(seed) {
    const str = String(seed || "profit-user").trim().toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function buildAvatarSvg(seed) {
    const p = AVATAR_PRESETS[hashSeed(seed) % AVATAR_PRESETS.length];
    let hairSvg = "";
    if (p.style === "puffs") {
      hairSvg =
        `<circle cx="32" cy="18" r="6.5" fill="${p.hair}"/>` +
        `<circle cx="22.5" cy="21" r="5" fill="${p.hair}"/>` +
        `<circle cx="41.5" cy="21" r="5" fill="${p.hair}"/>`;
    } else if (p.style === "headband") {
      hairSvg =
        `<path d="M20 28c0-7.5 5.2-13 12-13s12 5.5 12 13v1H20v-1z" fill="${p.hair}"/>` +
        `<rect x="19.5" y="22.5" width="25" height="3.6" rx="1.8" fill="${p.band || "#fbbf24"}"/>`;
    } else if (p.style === "bob") {
      hairSvg =
        `<path d="M18.5 32c0-9.5 5.6-16 13.5-16s13.5 6.5 13.5 16v6.5c0 1.4-1.1 2.5-2.5 2.5h-2.5v-8c0-6-3.8-10-8.5-10s-8.5 4-8.5 10v8H21c-1.4 0-2.5-1.1-2.5-2.5V32z" fill="${p.hair}"/>`;
    } else if (p.style === "part") {
      hairSvg =
        `<path d="M20 26.5c0-6.8 5.2-11.8 12.2-11.8 6.4 0 11.8 4.4 11.8 11.2-2.2-3.2-6.2-4.6-12.4-4.2-4.8.3-8.6 1.8-11.6 4.8z" fill="${p.hair}"/>`;
    } else {
      hairSvg =
        `<path d="M21 25.5c1.5-5.8 5.7-9.5 11-9.5s9.5 3.7 11 9.5c-3.1-2.2-6.8-3.2-11-3.2s-7.9 1-11 3.2z" fill="${p.hair}"/>`;
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-hidden="true">` +
      `<circle cx="32" cy="32" r="32" fill="${p.bg}"/>` +
      `<path d="M12 61c1.8-11.8 9.6-18.5 20-18.5S50.2 49.2 52 61v3H12v-3z" fill="${p.shirt}"/>` +
      `<rect x="27.5" y="36.5" width="9" height="8" rx="4.5" fill="${p.skin}"/>` +
      `<ellipse cx="32" cy="29.5" rx="11.2" ry="12.2" fill="${p.skin}"/>` +
      hairSvg +
      `</svg>`
    );
  }

  window.ProFitAvatar = {
    svg(seed) {
      return buildAvatarSvg(seed);
    },
    dataUrl(seed) {
      return "data:image/svg+xml;utf8," + encodeURIComponent(buildAvatarSvg(seed));
    },
    resolve(photo, seed) {
      const clean = String(photo || "").trim();
      return clean || this.dataUrl(seed);
    },
    paint(box, { photo = "", seed = "", alt = "" } = {}) {
      if (!box) return;
      const src = this.resolve(photo, seed);
      let img = box.querySelector("img.pf-avatar-img");
      if (!img) {
        const legacy = box.querySelector("img");
        if (legacy) {
          img = legacy;
          img.classList.add("pf-avatar-img");
        } else {
          img = document.createElement("img");
          img.className = "pf-avatar-img";
          img.alt = alt;
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          img.style.borderRadius = "50%";
          img.style.display = "block";
          box.prepend(img);
        }
      }
      img.src = src;
      box.classList.add("has-photo");
      const textSpan = box.querySelector("[data-user-initials]");
      if (textSpan) textSpan.style.display = "none";
    }
  };

  /* Staff profile — scoped per signed-in user so switching accounts never leaks
     another user's name or avatar, with server-verified auth data taking priority. */
  const readSessionUser = () => {
    if (window.ProFitAuth && window.ProFitAuth.user) return window.ProFitAuth.user;
    try {
      return JSON.parse(sessionStorage.getItem("profit-verified-session") || "null");
    } catch {
      return null;
    }
  };
  const profileKeyForUser = () => {
    const u = readSessionUser();
    const uid = u && (u.id || u.email);
    return uid ? `${KEYS.profile}:${uid}` : KEYS.profile;
  };
  window.ProFitProfile = {
    KEY: KEYS.profile,
    get() {
      const u = readSessionUser();
      const roleCode = String((u && u.role) || "").toUpperCase();
      const defaultRole = roleCode === "MEMBER" ? "Gym member" : roleCode === "CASHIER" ? "Cashier" : roleCode === "TRAINER" ? "Personal trainer" : "Gym administrator";
      const base = { name: "", email: "", phone: "", role: defaultRole, photo: "", bio: "", joined: "" };
      const stored = read(profileKeyForUser()) || {};
      const merged = { ...base, ...stored };
      if (u) {
        if (typeof u.name === "string") merged.name = u.name.trim();
        if (u.email) merged.email = u.email;
        if (typeof u.photo === "string" && u.photo) merged.photo = u.photo;
        else if (typeof u.photo === "string" && u.photo === "" && u.id) merged.photo = "";
      }
      return merged;
    },
    save(patch) {
      const key = profileKeyForUser();
      const next = { ...this.get(), ...patch };
      if (!write(key, next)) return null;
      return next;
    },
    clear() {
      try { localStorage.removeItem(KEYS.profile); } catch { /* ignore */ }
    },
    initials() {
      const p = this.get();
      const name = (p.name || "").trim();
      if (!name || name.includes("@")) return "PF";
      const parts = name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
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
