---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Use noindex instead of robots.txt Disallow
- Decision: Keep `robots.txt` permissive (`Allow: /`, only `Disallow: /api/`) and mark private portal pages with `X-Robots-Tag: noindex, nofollow`; only the five public pages are indexable.
- Reason: A `Disallow` rule stops crawlers from fetching the page, so they never see the `noindex` header. For private pages we want crawlers to fetch the response and honor the noindex signal.
- Trade-offs: Crawlers still spend a small amount of budget fetching private pages that return 200 with noindex. The allowlist must be maintained if a new public page is added.
- Evidence: `web/robots.txt`, `profit/views.py` (`INDEXABLE_PAGES` and `_serve_web_page`), `profit/tests/test_seo.py`; targeted SEO tests passed. Raw `.html` URLs already pass through Django via `profit.middleware.ProtectedWhiteNoiseMiddleware`, so no WhiteNoise header hook was needed.

## Related
- [[2026-11-22 Payments for review replaces GCash claims]]
