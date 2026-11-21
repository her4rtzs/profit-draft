---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Staff cashiers, full names, and phone duplicate warning
- Decision: Group Trainers and Cashiers under one `STAFF` sidebar section for the Owner; add an Owner-only `/cashiers` page and `/api/staff/cashiers/` endpoints reusing `create_staff_invite` (`role=CASHIER`) with Active / Invite pending / Deactivated statuses and Resend invite / Deactivate actions (never Delete); require first and last name on public signup, staff walk-in, and `/api/auth/profile/`, displaying "Name not set" linked to `/profile` instead of email when blank; normalize Philippine mobile numbers to 10 digits to block duplicates on public signup with a generic message while warning staff on walk-in with existing member name/status and a confirm override.
- Reason: Cashiers and trainers share the same Owner-driven email invitation flow, so placing both under `STAFF` makes staff management easier to find while respecting the no-delete audit rule. Requiring real full names first ensures the staff phone-duplicate warning displays a meaningful existing member name instead of an email, while keeping public signup generic prevents account enumeration.
- Trade-offs: Existing single-word or blank accounts are not retroactively mutated; they see "Name not set" with a direct link to `/profile` so they can set their own full name. Phone matching normalizes in Python over non-empty `MemberProfile.phone` rows without adding a new DB column/migration; if the member list grows very large later, an indexed normalized phone column can be added in a future migration.
- Evidence: `api/cashiers.py`, `api/urls.py`, `api/auth.py`, `api/serializers.py`, `api/staff.py`, `apps/membership/services.py`, `profit/views.py`, `web/cashiers.html`, `web/cashiers.js`, `web/layout.js`, `web/auth.js`, `web/sidebar.js`, `web/profile.js`, `web/join.html`, `web/members.js`, `ROADMAP.md`, `apps/membership/tests/test_name_phone_and_cashiers.py`.

## Related
- [[2026-11-20 Cashier portal reusing staff shell and RBAC]]
- [[2026-11-21 Sign-up creates a trial member without a checkout]]
