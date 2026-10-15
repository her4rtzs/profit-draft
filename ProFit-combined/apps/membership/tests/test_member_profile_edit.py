"""Members can save their own photo, phone and address through /api/member/me/."""

import base64

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.membership.models import MemberProfile

User = get_user_model()
URL = "/api/member/me/"
JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 64).decode()


class MemberProfileEditTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        user = User.objects.create_user(username="m@gym.test", email="m@gym.test", password="Sup3r-secret-pass", role="MEMBER")
        self.profile = MemberProfile.objects.create(user=user)
        self.api.force_authenticate(user)

    def test_photo_is_saved_and_returned(self):
        res = self.api.patch(URL, {"photo": JPEG}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.api.get(URL).json()["user"]["photo"], JPEG)

    def test_photo_can_be_removed(self):
        self.api.patch(URL, {"photo": JPEG}, format="json")
        self.assertEqual(self.api.patch(URL, {"photo": ""}, format="json").status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.photo_data, "")

    def test_rejects_non_jpeg_and_oversized(self):
        png = "data:image/png;base64," + base64.b64encode(b"abc").decode()
        self.assertEqual(self.api.patch(URL, {"photo": png}, format="json").status_code, 400)
        fake = "data:image/jpeg;base64," + base64.b64encode(b"not a jpeg").decode()
        self.assertEqual(self.api.patch(URL, {"photo": fake}, format="json").status_code, 400)
        big = "data:image/jpeg;base64," + "A" * 300_000
        self.assertEqual(self.api.patch(URL, {"photo": big}, format="json").status_code, 400)

    def test_phone_and_address_saved(self):
        res = self.api.patch(URL, {"phone": "09171234567", "address": "Alfonso"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.phone, self.profile.address), ("09171234567", "Alfonso"))

    def test_empty_patch_is_400(self):
        self.assertEqual(self.api.patch(URL, {}, format="json").status_code, 400)
