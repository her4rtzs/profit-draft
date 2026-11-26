/* ProFit Trainer Portal - Client API and Page Logic
   Connects the Trainer frontend directly to the Django backend with no fake demo fallbacks.
*/
(function () {
  'use strict';
  const PF = window.PF || {};
  const api = window.ProFitAPI;

  const requireApi = () => {
    if (!api) throw new Error('Backend API client is unavailable.');
    return api;
  };

  const broadcastCheckin = (memberId) => {
    try {
      localStorage.setItem('profit-last-checkin-ts', String(Date.now()));
      if (window.BroadcastChannel) {
        const bc = new BroadcastChannel('profit-attendance-sync');
        bc.postMessage({ type: 'checkin', memberId: Number(memberId || 0), ts: Date.now() });
        bc.close();
      }
      if (window.PF && PF.syncNotifications) PF.syncNotifications();
    } catch (_) {}
  };

  const normalizeNotifList = (raw, syncShell) => {
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
    const items = list.map(n => ({
      ...n,
      created_at: n.created_at || n.time || new Date().toISOString(),
      time: n.time || n.created_at || new Date().toISOString(),
      read_at: n.read_at !== undefined ? n.read_at : (n.read ? (n.time || n.created_at || new Date().toISOString()) : null),
      read: Boolean(n.read || n.read_at)
    }));
    if (syncShell && window.PF && PF.db && PF.db.setNotifications && PF.mapServerNotification) {
      PF.db.setNotifications(items.map(PF.mapServerNotification));
    }
    return items;
  };

  const Trainer = {
    // Live API client (always talks to Django; throws real errors on failure)
    api: {
      async getProfile() {
        return await requireApi().get('/trainer/profile/');
      },
      async updateProfile(data) {
        return await requireApi().patch('/trainer/profile/', data);
      },
      async getDashboard() {
        return await requireApi().get('/trainer/dashboard/');
      },
      async getMembers() {
        return await requireApi().get('/trainer/members/');
      },
      async getMemberDetail(id) {
        return await requireApi().get(`/trainer/members/${encodeURIComponent(id)}/`);
      },
      async getAttendance(dateStr, filter) {
        const q = new URLSearchParams();
        if (dateStr) q.set('date', dateStr);
        if (filter) q.set('filter', filter);
        return await requireApi().get(`/trainer/attendance/?${q.toString()}`);
      },
      async getAttendanceSeries({ granularity = 'day', period = '', from = '', to = '', memberId = 'all' } = {}) {
        const granMap = { days: 'day', day: 'day', weeks: 'week', week: 'week', months: 'month', month: 'month', years: 'year', year: 'year' };
        const gran = granMap[String(granularity || period || 'day').toLowerCase()] || 'day';
        const rawMid = String(memberId ?? 'all').trim().replace(/\/+$/, '');
        const cleanMemberId = (!rawMid || rawMid.toLowerCase() === 'all')
          ? 'all'
          : String(Number.isFinite(Number(rawMid)) && Number(rawMid) > 0 ? Math.trunc(Number(rawMid)) : rawMid);
        const q = new URLSearchParams();
        q.set('granularity', gran);
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        q.set('member_id', cleanMemberId);
        return await requireApi().get(`/trainer/attendance/?${q.toString()}`);
      },
      async checkIn(memberId) {
        const res = await requireApi().post('/trainer/attendance/check-in/', { member_id: Number(memberId) });
        broadcastCheckin(memberId);
        return res;
      },
      async checkInByQr(qrCode) {
        const res = await requireApi().post('/trainer/attendance/check-in/', { qr_code: String(qrCode || '').trim() });
        broadcastCheckin(res && res.member_id);
        return res;
      },
      async getSchedule() {
        return await requireApi().get('/trainer/schedule/');
      },
      async createSession(data) {
        return await requireApi().post('/trainer/schedule/sessions/', data);
      },
      async updateSession(id, data) {
        return await requireApi().patch(`/trainer/schedule/sessions/${encodeURIComponent(id)}/`, data);
      },
      async deleteSession(id) {
        const client = requireApi();
        if (typeof client.delete === 'function') {
          return await client.delete(`/trainer/schedule/sessions/${encodeURIComponent(id)}/`);
        }
        return await client.request('DELETE', `/trainer/schedule/sessions/${encodeURIComponent(id)}/`);
      },
      async sendScheduleNote(sessionName, note, memberId = 'all') {
        const payload = { session_name: sessionName, note: note };
        if (memberId && memberId !== 'all') payload.member_id = Number(memberId);
        const res = await requireApi().post('/trainer/schedule/note/', payload);
        if (window.PF && PF.syncNotifications) PF.syncNotifications();
        return res;
      },
      async getAnnouncements() {
        const data = await requireApi().get('/trainer/announcements/');
        if (data && Array.isArray(data.items)) return data.items;
        if (Array.isArray(data)) return data;
        return [];
      },
      async getNotifications({ syncShell = true } = {}) {
        const res = await requireApi().get('/trainer/notifications/?limit=40');
        return normalizeNotifList(res, syncShell);
      },
      async markNotifRead(id, { syncShell = true } = {}) {
        const res = await requireApi().post(`/trainer/notifications/${encodeURIComponent(id)}/read/`, {});
        if (syncShell && window.PF && PF.db && PF.db.markRead) PF.db.markRead(id);
        return res;
      },
      async markAllNotifsRead({ syncShell = true } = {}) {
        const res = await requireApi().post('/trainer/notifications/read-all/', {});
        if (syncShell && window.PF && PF.db && PF.db.markAllRead) PF.db.markAllRead();
        return res;
      },
      async deleteNotif(id, { syncShell = true } = {}) {
        const client = requireApi();
        const path = `/trainer/notifications/${encodeURIComponent(id)}/`;
        const res = typeof client.delete === 'function'
          ? await client.delete(path)
          : await client.request('DELETE', path);
        if (syncShell && window.PF && PF.db && PF.db.removeNotification) PF.db.removeNotification(id);
        return res;
      },
      async clearNotifs(readOnly = false, { syncShell = true } = {}) {
        const res = await requireApi().post('/trainer/notifications/clear/', { read_only: Boolean(readOnly) });
        if (syncShell && window.PF && PF.db) {
          if (readOnly) {
            const unreadItems = PF.db.notifications().filter(n => !n.read);
            PF.db.setNotifications(unreadItems);
          } else if (PF.db.clearNotifications) {
            PF.db.clearNotifications();
          }
        }
        return res;
      },
      async changePassword(currentPassword, newPassword) {
        return await requireApi().post('/auth/change-password/', {
          current_password: currentPassword,
          new_password: newPassword
        });
      }
    },

    // Formatters
    format: {
      localIsoDate(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      },
      date(d) {
        if (!d) return '—';
        const raw = String(d).trim();
        const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        const date = isoDateOnly
          ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
          : new Date(raw);
        if (isNaN(date.getTime())) return raw;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      },
      time(d) {
        if (!d) return '—';
        const raw = String(d).trim();
        const hhmm = /^(\d{2}):(\d{2})$/.exec(raw);
        if (hhmm) {
          const dt = new Date(2000, 0, 1, Number(hhmm[1]), Number(hhmm[2]));
          return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
        const date = new Date(raw);
        if (isNaN(date.getTime())) return raw;
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      },
      timeAgo(d) {
        if (!d) return '';
        const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
        return Trainer.format.date(d);
      },
      statusPill(status, isActive) {
        const s = String(status || '').toUpperCase();
        if (s === 'ACTIVE' || isActive) return '<span class="pill green">Active</span>';
        if (s === 'TRIAL') return '<span class="pill blue">Trial</span>';
        if (s === 'PENDING') return '<span class="pill amber">Pending</span>';
        if (s === 'EXPIRED') return '<span class="pill red">Expired</span>';
        return `<span class="pill gray">${PF.esc ? PF.esc(status) : status}</span>`;
      }
    },

    _cachedMembers: null,
    async syncShell() {
      try {
        const [profRes, membersRes] = await Promise.allSettled([
          Trainer.api.getProfile(),
          Trainer.api.getMembers(),
          window.PF && PF.syncNotifications ? PF.syncNotifications() : Promise.resolve()
        ]);
        if (membersRes.status === 'fulfilled' && Array.isArray(membersRes.value)) {
          Trainer._cachedMembers = membersRes.value;
        }
        if (profRes.status === 'fulfilled' && profRes.value && window.PF && PF.syncShellProfile) {
          const prof = profRes.value;
          PF.syncShellProfile({
            name: prof.name || 'Coach',
            email: prof.email || '',
            role: 'Personal Trainer',
            photo: prof.photo || '',
            unread: prof.unread_notifications
          });
        }
      } catch (_) {
        // non-blocking shell sync
      }
    }
  };

  window.Trainer = Trainer;

  const hydrateStaticIcons = () => {
    if (!window.PF || !PF.icon) return;
    document.querySelectorAll('[data-icon]:not(body)').forEach(el => {
      if (!el.innerHTML.trim()) el.innerHTML = PF.icon(el.dataset.icon);
    });
    document.querySelectorAll('[data-ico]:not(body)').forEach(el => {
      if (!el.innerHTML.trim()) el.innerHTML = PF.icon(el.dataset.ico);
    });
    if (!PF.openModal) {
      PF.openModal = id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('open');
      };
      PF.closeModal = id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('open');
      };
      document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => PF.closeModal(btn.dataset.closeModal));
      });
    }
  };

  if (window.PF && PF.ready) {
    PF.ready(() => {
      hydrateStaticIcons();
      Trainer.syncShell();
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      hydrateStaticIcons();
      Trainer.syncShell();
    });
  }
})();
