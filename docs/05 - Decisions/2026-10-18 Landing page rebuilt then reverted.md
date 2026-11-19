---
date: 2026-10-18
status: accepted
tags: [decision]
---
# Rebuild the landing page around one token set, then revert
- Decision: Rebuild `welcome.html` as one document with one token set instead of patching, remove the intro overlay, blurred header and gold call-to-action band, add a no-JavaScript checkbox menu, then revert the whole page to the last accepted build when the owner rejected the effects.
- Reason: Patching had left mismatched sections and oversized spacing; after rejection, returning to a known state was faster than another unrequested rebuild.
- Trade-offs: The rebuild's work was discarded; real gym details were kept and invented statistics or testimonials were refused.
- Evidence: `welcome.html`; Source: PROJECT-LOG.md, 2026-10-18 03:13 and 03:18.

## Related
- None
