---
date: Unknown
status: accepted
tags: [decision]
---
# Theme and layout state applied before first paint
- Decision: Put theme and layout state on the `<html>` element in a script at the top of the head, before first paint, and keep transitions off until the first frame.
- Reason: Setting them after load is what makes every page flicker.
- Trade-offs: Not stated in log
- Evidence: Source: PROJECT-LOG.md, Session: sidebar per drawing, forgot password, flicker and layout pass (undated).

## Related
- None
