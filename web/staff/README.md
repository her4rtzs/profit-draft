# ProFit — Staff front end

Plain HTML, CSS and vanilla JavaScript. No framework, no build step — same stack as `web/` in your repo.
Open `index.html` through any static server (`python -m http.server` inside this folder). Everything runs on demo data kept in the browser (localStorage), so all screens are clickable.

## Pages
| File | What it is | Source |
|---|---|---|
| `index.html` | Dashboard: stats, membership overview, monthly revenue, activity, attendance, distribution, quick actions | your design |
| `announcements.html` | List, filter, create / edit / publish / archive / delete, empty state | your design |
| `members.html` | Tabs: Browse members (table/cards), Member detail (`#detail=ID`), New enrollment (`#new`) | your design |
| `attendance.html` | Stats, filters, date picker, records, trend chart, by-plan donut, Record check-in, CSV export | your design |
| `trainers.html` | Trainer cards, assign a trainer, member requests, add trainer | your design |
| `payments.html` | Record a payment, today's collection, recent payments | your design |
| `subscriptions.html` | Subscription Monitor (+ Overview tab), filters, bulk select, export | your design |
| `transactions.html` | **Payment / transaction history** with filters, receipt, void, CSV | added (was "Transaction history pa") |
| `notifications.html` | **Notifications** page + bell dropdown | added |
| `profile.html` | **My profile**: edit details, photo, change password | added ("Add profile") |
| `settings.html` | **Settings**: theme/accent, gym details, plans & pricing, notification prefs, role preview, data | added |
| `reports.html` | Financial Reports (owner only): revenue chart, by method/plan, top members, print/CSV | added |

Sidebar is the original seven-item menu (Dashboard, Announcements, Member List, Attendance, Trainers, Payments & Billing, Financial Reports). Subscription Monitor and Payment History sit under Payments & Billing as tabs; Notifications is the bell; Profile and Settings are in the account menu at the bottom of the sidebar.

Also included: dark mode, collapsible sidebar, mobile drawer + bottom nav, global search (Ctrl K), toasts/modals, role-based menu (Owner / Cashier / Trainer, per `AGENTS.md`).

## Putting it in your zip
Copy this whole folder to `web/staff/`. It uses only relative paths and its own CSS/JS, so it does not collide with existing files. Then:
1. Link your sidebar/login redirect to `staff/index.html`.
2. Set `PF.config.loginUrl` in `assets/js/staff.js` (e.g. `'../login.html'`).
3. Replace the data layer (below).

## Wiring to the API
All reads/writes go through `PF.db` in `assets/js/staff-data.js`. Each mutation has an `// API:` comment with the matching endpoint. Existing endpoints seen in your `web/*.js`: `/staff/members/`, `/staff/payments/`, `/staff/attendance/check-in/`, `/staff/announcements/…`, `/notifications/…`, `/auth/change-password`.
Not in your API yet (front end assumes they will exist): staff profile/settings, plans CRUD, trainer assignment/requests, payment status change.
`ProFitAPI` (`web/api.js`) can be loaded before these scripts; then make the `PF.db` methods `async` and `await ProFitAPI.get/post/patch`.

## Demo semantics to replace with real rules
- Attendance "Late" / "Absent" are generated per day; define the real rule server-side.
- Statuses: expiring = 7 days or less left; overdue = expired.
- Payments recorded at the desk extend the membership from today or the old expiry, whichever is later.
- Role preview is a UI convenience only. Permissions must be enforced on the server.
- Fonts load from Google Fonts (Plus Jakarta Sans, Caveat). Icons are inline SVG, no CDN.
