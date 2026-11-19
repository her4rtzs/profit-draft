"""Deploy gate: the Tailwind build must emit app.css before collectstatic."""

import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import SimpleTestCase

from profit.checks import app_css_built_check

COLLECTSTATIC_ARGV = ["manage.py", "collectstatic", "--noinput"]


class AppCssBuiltCheckTests(SimpleTestCase):
    def test_no_gate_outside_collectstatic(self):
        # Local check/test/runserver must stay green without a build artifact.
        with patch.object(sys, "argv", ["manage.py", "check"]):
            self.assertEqual(app_css_built_check(None), [])

    def test_missing_app_css_fails_loudly(self):
        with (
            patch.object(sys, "argv", COLLECTSTATIC_ARGV),
            patch("profit.checks.finders.find", return_value=None),
        ):
            errors = app_css_built_check(None)
        self.assertEqual([error.id for error in errors], ["profit.E001"])
        self.assertIn("app.css", errors[0].msg)

    def test_empty_app_css_fails_loudly(self):
        with TemporaryDirectory() as tmp:
            empty = Path(tmp) / "app.css"
            empty.write_text("", encoding="utf-8")
            with (
                patch.object(sys, "argv", COLLECTSTATIC_ARGV),
                patch("profit.checks.finders.find", return_value=str(empty)),
            ):
                errors = app_css_built_check(None)
        self.assertEqual([error.id for error in errors], ["profit.E001"])

    def test_present_nonempty_app_css_passes(self):
        with TemporaryDirectory() as tmp:
            css = Path(tmp) / "app.css"
            css.write_text("body{}", encoding="utf-8")
            with (
                patch.object(sys, "argv", COLLECTSTATIC_ARGV),
                patch("profit.checks.finders.find", return_value=str(css)),
            ):
                self.assertEqual(app_css_built_check(None), [])
