---
date: 2026-11-22
status: accepted
tags: [decision]
---
# Add QR check-in using CDN scanner and existing endpoint
- Decision: Add a Member Check-in QR pass (`qrcodejs` CDN) in `web/member-home.html` and a Staff camera QR scanner (`html5-qrcode` CDN) in `web/attendance.html` + `web/pages.js` that calls the existing `POST /api/staff/attendance/check-in/` endpoint.
- Reason: Gives members and front-desk staff an engaging, fast check-in experience on phones with zero new database tables, zero paid services, and full server-side RBAC and active-membership enforcement.
- Trade-offs: Depends on two free CDN scripts (`qrcodejs` and `html5-qrcode`) and requires HTTPS (or `localhost`) for browser camera access; trial/expired members cannot check in even if they present an old code because the server still validates membership status.
- Evidence: `web/member-home.html`, `web/attendance.html`, `web/pages.js`, verified by `python manage.py check` and `python manage.py test profit.tests.test_clean_urls`.

## Related
- [[System Architecture]]
