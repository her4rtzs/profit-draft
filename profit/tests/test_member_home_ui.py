from django.conf import settings
from django.test import SimpleTestCase


class MemberHomeUITests(SimpleTestCase):
    def test_membership_summary_omits_start_and_duration(self):
        html = (settings.BASE_DIR / "web" / "member-home.html").read_text(
            encoding="utf-8"
        )
        for stale in ("Start Date", "Duration", "Remaining coverage"):
            with self.subTest(stale=stale):
                self.assertNotIn(stale, html)
        for kept in ("Expiration Date", "Remaining Days", "Status &amp; Payment"):
            with self.subTest(kept=kept):
                self.assertIn(kept, html)
