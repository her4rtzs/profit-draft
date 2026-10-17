# ProFit: Phase 1 audit

**Scope:** source in `ProFit-combined/` as uploaded.
**Method:** code reading and searches.
**Not done:** runtime tests (Django is not available in this environment), browser and visual review, and the screenshot list from earlier, which is not in this conversation.

## Status against the spec

| Area | Status | Evidence |
|---|---|---|
| Login | Code present. Failing on Vercel per your report | `web/login.html`, `api/auth.py` |
| Registration | Present, but no Confirm Password field | `templates/accounts/signup.html` has only `password` |
| Forgot / reset password | Missing. The link pointed to a route that does not exist. Interim message added | `web/login.html` |
| Rate limiting on login and reset | Missing. Only `api/join.py` uses it | search of `api/`, `apps/`, `profit/` |
| Footer (logo, copyright, AusFITious) | Missing | no matches in `web/` or `templates/` |
| Terms, Privacy, FAQ pages | Missing | no such pages |
| Announcements | Present | `web/announcements.html`, `/api/staff/announcements/` |
| Trainer assignment and requests | Present | `web/trainers.html`, `/api/trainer-requests/` |
| Notifications | Present. Bell and read state not verified | `/api/notifications/`, `web/notifications-live.js` |
| Membership reminders | Missing. No reminder code in Python or SQL | none found |
| Dashboard, members, attendance, payments, reports | Present. Numbers and exports not verified | `web/*.html`, `/api/staff/...` |
| Table/card toggle, responsive layout, dark/light, animations | Not verified | needs a browser pass |

## Bugs found

1. **`DEBUG` defaults to on.** `profit/settings.py` used `default=True`, but `.env.example` says it defaults off. With DEBUG on, the HTTPS proxy header and secure cookies are skipped. The login POST from the HTTPS domain is then most likely rejected by Django's CSRF origin check with a 403, and the page shows "Request failed (403)." **Fixed:** default is now off.
2. **Forgot password is a dead link.** It pointed to `/member/password-reset/`, which returns 404. **Interim fix:** the link now shows a message asking for a reset from the gym front desk. A real reset flow is still needed.
3. **Footer and legal pages are missing** (see table).
4. **Possible dead files.** `ProFit-phase1/` is an old 192-file copy of the project. `notifications.py` at the project root is not imported anywhere. Confirm both are unused, then delete them. Not done in this pass.

## Recommended order

1. On Vercel, confirm `DEBUG` is exactly `False`, `ALLOWED_HOSTS` includes your domain, and `RESEND_API_KEY` is set. Redeploy and try login. A 403 means the CSRF problem above. "Invalid credentials" means no owner account exists yet.
2. Create the owner account in Supabase.
3. Add the footer, Terms, Privacy, and FAQ pages. The legal text needs review by the gym before publishing.
4. Build real password reset: single-use tokens, expiry, and no account enumeration. Reuse the existing email backend.
5. Add rate limiting to login and reset.
6. Add Confirm Password to registration.
7. Add membership reminders as a scheduled job.
8. Run a browser pass on desktop, tablet, and phone, in both themes.
