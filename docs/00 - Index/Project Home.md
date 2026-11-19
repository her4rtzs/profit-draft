# Project Home

## Current status

- **Repository:** `https://github.com/her4rtzs/profit-draft.git` (remote `origin`), repo root `C:/Users/Sipag/Desktop/PROFITTJASHFASH/profit-draft`. As of 2026-11-19 the working branch `feature/installable-app` was at `7f68476`, pushed and tracking `origin/feature/installable-app`; nothing had been merged to `master`. (`git status -sb`, `git log`)
- **Last reviewed:** 2026-11-19
- **Sources for this review:** `PROJECT-LOG.md` (177 entries, 2026-10-07 → 2026-11-19) and the working tree. The log is append-only and was not changed.

## Open questions

1. Which plans does the gym actually sell, and at what prices? The code uses `monthly` (₱800), `quarterly` (₱2,100), `annual` (₱7,500) and, since 2026-11-08, `daily` (₱80). (Earlier note; `PROJECT-LOG.md`, 2026-11-08 12:38.)
2. Is there a one-time enrollment fee on top of the subscription? (Earlier note; no log answer.)
3. Who may deactivate members — Owner only, or Cashiers too? (Earlier note; no log answer.)
4. Is staff front-desk check-in enough, or should members check in themselves? A self-service `POST /api/member/check-in/` exists as of 2026-11-08 12:57; is it enabled for every member? (Earlier note plus the log entry.)
5. Is browser print-to-PDF enough for reports, or is a downloadable PDF/Excel required? (Earlier note; no log answer.)
6. Has the `pg_cron` membership-expiry job been applied to Supabase? The log records only a fully commented SQL stub. (Earlier note; `PROJECT-LOG.md`, 2026-10-07 21:30.)
7. Login rate limiting is still missing. (Earlier note; no log answer in this backfill.)
8. Real-phone install gate for Phase 4.5: delete the old home-screen icon, install from Chrome, confirm no address bar, and check login/logout for each role. (`PROJECT-LOG.md`, 2026-11-16 11:00.)
9. Merge and deploy `feature/installable-app`? Five commits were pushed; nothing was merged. (`PROJECT-LOG.md`, 2026-11-19 status.)
10. Were the exposed credentials rotated? `PROJECT-LOG.md` line 229 shows a real-looking `SECRET_KEY` value that the log says was already on the remote, and the 2026-10-10 / 2026-10-12 entries report real-looking Supabase credentials in `.env.example`. **Values are deliberately not copied into this vault.** (`PROJECT-LOG.md`, 2026-10-10 17:15, 2026-10-12 10:20.)
11. Seven public GCash/Maya/card mentions remain while the PayMongo account supports QR Ph only; which should change? (`PROJECT-LOG.md`, 2026-11-16 12:10.)
12. Which payment-method rule is current? The 2026-10-18 log entry rewrote `Architecture.md` to four methods (`gcash`, `paymaya`, `card`, `qrph`); today's `AGENTS.md` says QR Ph only. (`PROJECT-LOG.md`, 2026-10-18 23:15.)
13. CSS consolidation is still owed: three palettes (light, cream, dark), a large `!important` layer and 15 render-blocking stylesheets. (`PROJECT-LOG.md`, 2026-11-19 09:10.)
14. Was Row Level Security ever enabled on the tables? A 2026-10-18 check found `Architecture.md` claiming it was done while the code had no policies. (`PROJECT-LOG.md`, 2026-10-18 23:15.)

## Resolved questions

- How do members install the app? As an installable web portal on the phone home screen — there is no native mobile app. (`PROJECT-LOG.md`, 2026-11-16 11:00.)
- Keep both web surfaces or converge? Keep both, with static `web/` and Django `templates/` declared separately in `AGENTS.md`. (`PROJECT-LOG.md`, 2026-10-18 17:40.)

## Notes

- [[Project Overview]]
- [[System Architecture]]
- [[Development Workflow]]
- [[Testing Strategy]]
- [[Decision Log]]
