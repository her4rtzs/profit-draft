---
date: 2026-10-07
status: accepted
tags: [decision]
---
# Membership API isolates each member without weakening the shared permission policy
- Decision: Keep `CanViewAttendance` as an object-level permission only; scope the attendance list by `member__user=request.user` with `IsAuthenticated`; return `404` (not `403`) for `/api/membership/me/` when the caller has no profile; register components through `COMPONENTS["libraries"]`; add the `membership.E001` system check that renders a component during `manage.py check`.
- Reason: A blanket `has_permission` would return `False` for a member with no target object and 403 their own list; "no profile" is "no such resource for you"; the explicit library list keeps startup deterministic; the check turns "the component renders" into an enforced gate.
- Trade-offs: The shared permission helper stays strict at the collection boundary and the list is isolated by queryset instead. Components need explicit registration.
- Evidence: `/api/membership/me/`, `/api/attendance/`, `membership.E001`; Source: PROJECT-LOG.md, 2026-10-07 21:15.

## Related
- None
