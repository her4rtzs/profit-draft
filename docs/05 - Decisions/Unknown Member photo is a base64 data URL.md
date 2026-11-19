---
date: Unknown
status: accepted
tags: [decision]
---
# Member photo is a base64 data URL in `MemberProfile.photo_data`, not Supabase Storage
- Decision: Member photo is a base64 data URL in `MemberProfile.photo_data`, not Supabase Storage
- Reason: Supabase Storage wiring was deferred
- Trade-offs: Not stated in log
- Evidence: `apps/membership/models.py` (`photo_data`), `ROADMAP.md` phase 2

## Related
- None
