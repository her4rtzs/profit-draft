---
date: 2026-10-10
status: accepted
tags: [decision]
---
# Approved custom auth keeps privileged roles out of public signup
- Decision: Approve the design: public self-signup can create only Members; Cashier and Trainer accounts come from a single-use emailed Owner invite; all invite authority flows through `permissions.can_manage_staff_invites`; role and account email are read from the stored invite, never from the accept request.
- Reason: One policy layer prevents the signup funnel from minting privileged roles and keeps the rule identical in views, service and management command.
- Trade-offs: Staff onboarding requires an Owner invite instead of public self-registration.
- Evidence: `permissions.can_manage_staff_invites`, `invite.email`; Source: PROJECT-LOG.md, 2026-10-10 21:05.

## Related
- None
