---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Database-backed trainer schedule and real API errors
- Decision: Replace the hardcoded `TIMETABLE_SESSIONS` list with a real `trainers.TrainerSession` model (`apps/trainers/migrations/0004_trainersession.py`) and CRUD API (`/api/trainer/schedule/sessions/`), enforce `is_active` across trainer DRF permissions, and remove all silent `Trainer.demo` fallbacks from `web/trainer/trainer.js`.
- Reason: Hardcoded fake classes ("Coach Bea", "Coach Mika", etc.) and silent demo fallbacks masked real API failures and made the Trainer Portal look populated even when a trainer had no real classes or failed auth. Storing sessions in PostgreSQL lets each trainer add, edit, and remove their own weekly classes persistently, with ownership enforced server-side.
- Trade-offs: Requires applying migration `0004_trainersession` and enabling Row Level Security (RLS, no policies) on the new `public.trainers_trainersession` table in Supabase Dev and Prod. Trainers with no classes yet now see a real empty state instead of fake demo sessions.
- Evidence: `apps/trainers/models.py`, `apps/trainers/migrations/0004_trainersession.py`, `api/trainers.py`, `api/urls.py`, `apps/trainers/services.py`, `web/trainer/trainer.js`, `web/assets/js/staff.js`, `web/trainer/*.html`, `apps/trainers/tests/test_trainers.py` (`python manage.py check` 0 errors; `makemigrations --check --dry-run` no changes; `python manage.py test apps.trainers api.tests_trainer_qr profit.tests` — 51/51 OK).

## Related
- [[2026-11-15 Trainer subpages get shared design]]
- [[2026-11-26 Enforce strict portal RBAC and unified dashboard URL]]
