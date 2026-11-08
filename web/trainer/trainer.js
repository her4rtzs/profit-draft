/* ProFit Trainer Portal - Client API and Page Logic
   Connects the Trainer frontend directly to the Django backend.
*/
(function () {
  'use strict';
  const PF = window.PF || {};
  const api = window.ProFitAPI;

  const Trainer = {
    // API client
    api: {
      async getProfile() {
        if (!api) return Trainer.demo.getProfile();
        try {
          return await api.get('/trainer/profile/');
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getProfile();
        }
      },
      async updateProfile(data) {
        if (!api) return Trainer.demo.updateProfile(data);
        return await api.patch('/trainer/profile/', data);
      },
      async getDashboard() {
        if (!api) return Trainer.demo.getDashboard();
        try {
          return await api.get('/trainer/dashboard/');
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getDashboard();
        }
      },
      async getMembers() {
        if (!api) return Trainer.demo.getMembers();
        try {
          return await api.get('/trainer/members/');
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getMembers();
        }
      },
      async getMemberDetail(id) {
        if (!api) return Trainer.demo.getMemberDetail(id);
        try {
          return await api.get(`/trainer/members/${id}/`);
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getMemberDetail(id);
        }
      },
      async getAttendance(dateStr, filter) {
        if (!api) return Trainer.demo.getAttendance(dateStr, filter);
        try {
          const q = new URLSearchParams();
          if (dateStr) q.set('date', dateStr);
          if (filter) q.set('filter', filter);
          return await api.get(`/trainer/attendance/?${q.toString()}`);
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getAttendance(dateStr, filter);
        }
      },
      async checkIn(memberId) {
        if (!api) return Trainer.demo.checkIn(memberId);
        return await api.post('/staff/attendance/check-in/', { member_id: Number(memberId) });
      },
      async getSchedule() {
        if (!api) return Trainer.demo.getSchedule();
        try {
          return await api.get('/trainer/schedule/');
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getSchedule();
        }
      },
      async sendScheduleNote(sessionName, note) {
        if (!api) return Trainer.demo.sendScheduleNote(sessionName, note);
        return await api.post('/trainer/schedule/note/', { session_name: sessionName, note: note });
      },
      async getAnnouncements() {
        if (!api) return Trainer.demo.getAnnouncements();
        try {
          return await api.get('/announcements/');
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getAnnouncements();
        }
      },
      async getNotifications() {
        if (!api) return Trainer.demo.getNotifications();
        try {
          return await api.get('/notifications/');
        } catch (e) {
          console.warn('API error, using demo fallback:', e);
          return Trainer.demo.getNotifications();
        }
      },
      async markNotifRead(id) {
        if (!api) return;
        try {
          return await api.post(`/notifications/${id}/read/`, {});
        } catch (e) {
          console.warn(e);
        }
      },
      async markAllNotifsRead() {
        if (!api) return;
        try {
          return await api.post('/notifications/read-all/', {});
        } catch (e) {
          console.warn(e);
        }
      },
      async changePassword(currentPassword, newPassword) {
        if (!api) throw new Error('API unavailable.');
        return await api.post('/auth/change-password/', {
          current_password: currentPassword,
          new_password: newPassword
        });
      }
    },

    // Demo fallback for offline development
    demo: {
      getProfile() {
        return {
          id: 1,
          name: 'Coach Mika',
          email: 'coach@example.com',
          username: 'coach',
          specialization: 'HIIT & Functional Strength',
          bio: 'Passionate about high-intensity interval training, mobility and helping members achieve peak daily energy.',
          availability: 'Mon - Fri: 6:00 AM - 2:00 PM, Sat: 8:00 AM - 12:00 PM',
          max_members: 20,
          load: 6,
          is_full: false,
          is_active: true
        };
      },
      updateProfile(data) {
        return { detail: 'Profile updated.' };
      },
      getDashboard() {
        return {
          trainer: this.getProfile(),
          stats: {
            assigned_members: 6,
            max_members: 20,
            capacity_pct: 30,
            today_checkins: 4,
            week_checkins: 18,
            is_full: false,
            is_active: true
          },
          recent_attendances: [
            { id: 101, member_id: 1, member_name: 'Ana Santos', check_in_at: new Date().toISOString(), check_in_date: new Date().toISOString().slice(0, 10) },
            { id: 102, member_id: 2, member_name: 'Ben Reyes', check_in_at: new Date(Date.now() - 3600000).toISOString(), check_in_date: new Date().toISOString().slice(0, 10) }
          ],
          announcements: [
            { id: 1, title: 'Gym Equipment Upgrades', message: 'New Olympic barbells and bumper plates have arrived in Studio 1.', publish_on: new Date().toISOString().slice(0, 10), pinned: true }
          ],
          unread_notifications: 2
        };
      },
      getMembers() {
        return [
          { id: 1, name: 'Ana Santos', email: 'ana@example.com', phone: '0917-555-0101', membership_status: 'ACTIVE', is_active: true, expiry_date: '2026-12-15', date_joined: '2026-09-01', assigned_at: '2026-09-05', total_checkins: 24, last_checkin: new Date().toISOString(), today_checked_in: true },
          { id: 2, name: 'Ben Reyes', email: 'ben@example.com', phone: '0917-555-0102', membership_status: 'ACTIVE', is_active: true, expiry_date: '2026-11-28', date_joined: '2026-08-10', assigned_at: '2026-08-12', total_checkins: 19, last_checkin: new Date(Date.now() - 3600000).toISOString(), today_checked_in: true },
          { id: 3, name: 'Carlos Dizon', email: 'carlos@example.com', phone: '0918-555-0203', membership_status: 'ACTIVE', is_active: true, expiry_date: '2026-11-12', date_joined: '2026-07-20', assigned_at: '2026-07-22', total_checkins: 31, last_checkin: new Date(Date.now() - 86400000).toISOString(), today_checked_in: false },
          { id: 4, name: 'Diana Garcia', email: 'diana@example.com', phone: '0919-555-0304', membership_status: 'ACTIVE', is_active: true, expiry_date: '2026-12-30', date_joined: '2026-10-01', assigned_at: '2026-10-02', total_checkins: 8, last_checkin: new Date(Date.now() - 172800000).toISOString(), today_checked_in: false },
          { id: 5, name: 'Elena Cruz', email: 'elena@example.com', phone: '0920-555-0405', membership_status: 'EXPIRED', is_active: false, expiry_date: '2026-10-25', date_joined: '2026-06-15', assigned_at: '2026-06-18', total_checkins: 42, last_checkin: '2026-10-24T10:00:00Z', today_checked_in: false },
          { id: 6, name: 'Francis Lee', email: 'francis@example.com', phone: '0921-555-0506', membership_status: 'ACTIVE', is_active: true, expiry_date: '2026-12-01', date_joined: '2026-10-15', assigned_at: '2026-10-16', total_checkins: 5, last_checkin: new Date(Date.now() - 259200000).toISOString(), today_checked_in: false }
        ];
      },
      getMemberDetail(id) {
        const m = this.getMembers().find(x => x.id === Number(id)) || this.getMembers()[0];
        return {
          ...m,
          attendances: [
            { id: 201, check_in_at: new Date().toISOString(), check_in_date: new Date().toISOString().slice(0, 10), recorded_by: 'Front Desk' },
            { id: 202, check_in_at: new Date(Date.now() - 86400000).toISOString(), check_in_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), recorded_by: 'Coach Mika' },
            { id: 203, check_in_at: new Date(Date.now() - 172800000).toISOString(), check_in_date: new Date(Date.now() - 172800000).toISOString().slice(0, 10), recorded_by: 'Coach Mika' }
          ]
        };
      },
      getAttendance(dateStr, filter) {
        const today = new Date().toISOString().slice(0, 10);
        return {
          date: dateStr || today,
          total: 8,
          my_members_count: 3,
          attendances: [
            { id: 301, member_id: 1, member_name: 'Ana Santos', member_phone: '0917-555-0101', membership_status: 'ACTIVE', is_my_member: true, check_in_at: new Date().toISOString(), recorded_by: 'Coach Mika' },
            { id: 302, member_id: 2, member_name: 'Ben Reyes', member_phone: '0917-555-0102', membership_status: 'ACTIVE', is_my_member: true, check_in_at: new Date(Date.now() - 3600000).toISOString(), recorded_by: 'Front Desk' },
            { id: 303, member_id: 10, member_name: 'Marco Tan', member_phone: '0912-345-6789', membership_status: 'ACTIVE', is_my_member: false, check_in_at: new Date(Date.now() - 5400000).toISOString(), recorded_by: 'Front Desk' },
            { id: 304, member_id: 3, member_name: 'Carlos Dizon', member_phone: '0918-555-0203', membership_status: 'ACTIVE', is_my_member: true, check_in_at: new Date(Date.now() - 7200000).toISOString(), recorded_by: 'Coach Mika' }
          ]
        };
      },
      checkIn(memberId) {
        return { detail: 'Member checked in successfully.' };
      },
      getSchedule() {
        return {
          coach_name: 'Coach Mika',
          sessions: [
            { id: 1, dow: 0, day: 'Sunday', time: '09:00', mins: 45, name: 'Recovery & Stretch', coach: 'Coach Bea', cap: 18, room: 'Studio 1', is_mine: false },
            { id: 2, dow: 1, day: 'Monday', time: '06:00', mins: 45, name: 'Sunrise HIIT', coach: 'Coach Mika', cap: 12, room: 'Main Floor', is_mine: true },
            { id: 3, dow: 1, day: 'Monday', time: '18:30', mins: 60, name: 'Strength Basics', coach: 'Coach Jun', cap: 10, room: 'Weight Area', is_mine: false },
            { id: 4, dow: 2, day: 'Tuesday', time: '07:00', mins: 40, name: 'Cardio Club', coach: 'Coach Rei', cap: 16, room: 'Cardio Deck', is_mine: false },
            { id: 5, dow: 2, day: 'Tuesday', time: '19:00', mins: 50, name: 'Boxing Fitness', coach: 'Coach Dan', cap: 12, room: 'Studio 2', is_mine: false },
            { id: 6, dow: 3, day: 'Wednesday', time: '06:00', mins: 45, name: 'Sunrise HIIT', coach: 'Coach Mika', cap: 12, room: 'Main Floor', is_mine: true },
            { id: 7, dow: 3, day: 'Wednesday', time: '19:00', mins: 50, name: 'Mobility Flow', coach: 'Coach Bea', cap: 14, room: 'Studio 1', is_mine: false },
            { id: 8, dow: 4, day: 'Thursday', time: '18:00', mins: 60, name: 'Barbell Club', coach: 'Coach Jun', cap: 8, room: 'Weight Area', is_mine: false },
            { id: 9, dow: 5, day: 'Friday', time: '07:00', mins: 40, name: 'Cardio Club', coach: 'Coach Rei', cap: 16, room: 'Cardio Deck', is_mine: false },
            { id: 10, dow: 5, day: 'Friday', time: '17:30', mins: 45, name: 'Friday Finisher', coach: 'Coach Mika', cap: 12, room: 'Main Floor', is_mine: true },
            { id: 11, dow: 6, day: 'Saturday', time: '08:00', mins: 75, name: 'Team Sweat', coach: 'Coaches', cap: 20, room: 'Main Floor', is_mine: true }
          ],
          assigned_members: [
            { id: 1, name: 'Ana Santos' },
            { id: 2, name: 'Ben Reyes' },
            { id: 3, name: 'Carlos Dizon' }
          ]
        };
      },
      sendScheduleNote(sessionName, note) {
        return { detail: 'Schedule update sent to assigned members.', recipient_count: 6 };
      },
      getAnnouncements() {
        return [
          { id: 1, title: 'Gym Equipment Upgrades', message: 'New Olympic barbells and bumper plates have arrived in Studio 1. Please re-rack all weights after training.', publish_on: '2026-11-01', pinned: true },
          { id: 2, title: 'Holiday Operating Hours', message: 'Special schedule for the upcoming holidays. Morning sessions will run normally from 6:00 AM - 11:00 AM.', publish_on: '2026-10-28', pinned: false }
        ];
      },
      getNotifications() {
        return [
          { id: 1, kind: 'TRAINER', title: 'New member assigned: Ana Santos', body: 'Ana Santos has been matched to your coaching roster.', read_at: null, created_at: new Date(Date.now() - 3600000).toISOString() },
          { id: 2, kind: 'TRAINER', title: 'Schedule Update Confirmed', body: 'Your note for Sunrise HIIT was broadcast to members.', read_at: new Date().toISOString(), created_at: new Date(Date.now() - 86400000).toISOString() }
        ];
      }
    },

    // Formatters
    format: {
      date(d) {
        if (!d) return '—';
        const date = new Date(d);
        if (isNaN(date.getTime())) return String(d);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      },
      time(d) {
        if (!d) return '—';
        const date = new Date(d);
        if (isNaN(date.getTime())) return String(d);
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
        if (s === 'EXPIRED') return '<span class="pill red">Expired</span>';
        if (s === 'PENDING') return '<span class="pill amber">Pending</span>';
        return `<span class="pill gray">${PF.esc ? PF.esc(status) : status}</span>`;
      }
    },

    _cachedMembers: null,
    async syncShell() {
      try {
        const [prof, members] = await Promise.all([
          Trainer.api.getProfile(),
          Trainer.api.getMembers()
        ]);
        Trainer._cachedMembers = members;
        if (window.PF && PF.syncShellProfile && prof) {
          PF.syncShellProfile({
            name: prof.name || 'Coach',
            email: prof.email || '',
            role: 'Personal Trainer'
          });
        }
      } catch (e) {
        // non-blocking shell sync
      }
    }
  };

  window.Trainer = Trainer;
  if (window.PF && PF.ready) {
    PF.ready(() => Trainer.syncShell());
  } else {
    document.addEventListener('DOMContentLoaded', () => Trainer.syncShell());
  }
})();

