---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Fix cream-theme muted text contrast
- Decision: Set the cream/light theme `--muted` token to `#5c5f6b` in `web/trainer/trainer.css` and route the two hardcoded copies in `.tw-period-tab` and `.tw-table th` through that token.
- Reason: The old value `#727684` measured 3.68-4.26:1 on the cream surfaces, below the 4.5:1 AA floor. The new value measures 5.16-6.09:1 and keeps the same slate hue.
- Trade-offs: The dark theme was left untouched because the affected selectors are light-only. No rendered light-mode confirmation was available, so the fix rests on contrast math and cascade analysis.
- Evidence: `web/trainer/trainer.css:31`, `:755`, `:1305`; contrast 5.16-6.09:1 on `#ede7db` and `#faf8f3`; no `#727684` remains in the repo; `impeccable detect` clean on the changed lines; `python manage.py test` OK.

## Related
- None
