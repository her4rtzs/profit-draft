# Project Home

## Current status

- **Repository:** `https://github.com/her4rtzs/profit-draft.git` (remote `origin`), repo root `C:/Users/Sipag/Desktop/PROFITTJASHFASH/profit-draft`, branch `master` at `00072d4`, working tree clean when this was written. 102 commits. (`git remote -v`, `git log`, `git status`)
- **Last reviewed:** 2026-10-30
- **Open questions:**
  1. Which plans does the gym actually sell, and at what prices? The code uses `monthly` (₱800), `quarterly` (₱2,100), `annual` (₱7,500) in `apps/finance/services.py`. (`Architecture.md` §14)
  2. Is there a one-time enrollment fee on top of the subscription? (`Architecture.md` §14)
  3. Who may deactivate members — Owner only, or Cashiers too? (`Architecture.md` §14)
  4. Is staff front-desk check-in enough, or should members check in themselves (e.g. QR code)? (`Architecture.md` §14)
  5. Is browser print-to-PDF enough for reports, or is a downloadable PDF/Excel required? (`Architecture.md` §14)
  6. How will members install the mobile app (Expo Go, an APK, or the stores), and is it Android-only first? (`Architecture.md` §14)
  7. Keep both web surfaces — static `web/` pages and Django `templates/` pages — or converge onto one? (`ROADMAP.md` phase 6)
  8. Has the `pg_cron` membership-expiry job been applied to Supabase? The SQL is commented out and no application record exists. (`supabase/cron/membership_expiry.sql`, `ROADMAP.md` phase 3)
  9. Login rate limiting is still missing. (`ROADMAP.md` phase 1 gap, phase 6 item)

## Notes

- [[Project Overview]]
- [[System Architecture]]
- [[Development Workflow]]
- [[Testing Strategy]]
- [[Decision Log]]
