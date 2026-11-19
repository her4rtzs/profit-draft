---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Darken trainer light-mode foregrounds
- Decision: In `web/trainer/trainer.css`, override only the light-theme semantic text foregrounds — `--tw-amber` #92400E, `--green`/`--tw-green` #065F46, `--blue` #1E40AF, `--red` #B91C1C — plus the hardcoded hero eyebrow #92400E; make two chart-tooltip colors in `trainer/index.html` use `var(--green)` / `var(--red)` so they follow the theme. Dark mode keeps the bright values.
- Reason: The detector found 16 real low-contrast sites on trainer pages (amber/green/blue/red text at 1.7–4.3:1 on the cream surfaces). Darkening the foreground clears every pairing without changing the palette or the soft tints.
- Trade-offs: Soft backgrounds (`--gold-soft`, `--red-soft`, etc.) were deliberately left pale — darkening them would lower, not raise, contrast against the now-dark text. Dark mode is untouched, so the bright brand ink stays on navy.
- Evidence: Detector low-contrast findings fell from 18 to 2; browser-computed styles confirm dark ink in light mode and bright ink in dark mode. The 2 remaining `welcome.html` findings are false positives from non-rendered `<title>`/`<style>`/`<script>` nodes (verified in Chromium). See [[2026-11-19 Fix cream-theme muted text contrast]]

## Related
- [[2026-11-19 Fix cream-theme muted text contrast]]
