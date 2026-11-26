---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Target local search terms with Google Business Profile plus on-page clarity
- Decision: Focus search work on local terms ("functional fitness gym", "gym in Alfonso", "functional gym") using a complete Google Business Profile plus clear on-page wording, rather than chasing the broad term "fitness gym". Keep the existing hero headline and one H1; add one natural keyword line and short FAQ answers.
- Reason: Local gym searches are won mainly by Google Business Profile and consistent name/address/phone signals. The website already has the address, phone and Facebook page, so structured data can repeat those facts without inventing new ones.
- Trade-offs: No "ProFit Gym" wording was added because the owner has not confirmed that public name. Contact details differ between the homepage and FAQ; the homepage values were used in structured data and the conflict remains unresolved. No opening hours, rating, price or FAQPage markup was added.
- Evidence: `web/welcome.html` (title, meta description, eyebrow, About sentence, HealthClub JSON-LD, lightbox alt), `web/faq.html` (three local questions), `profit/tests/test_seo.py`; `manage.py check`, `ruff check .` and targeted tests were run before commit.

## Related
- [[Use noindex instead of robots.txt Disallow]]
