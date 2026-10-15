"""Validation-only forms for the member-auth pages (no persistence).

Field-level validation only; the services own business rules and persistence.
"""

from django import forms


class SignupForm(forms.Form):
    """Public member signup: email + password."""

    email = forms.EmailField(max_length=254)
    password = forms.CharField(widget=forms.PasswordInput)


class LoginForm(forms.Form):
    """Member login: email + password."""

    email = forms.EmailField(max_length=254)
    password = forms.CharField(widget=forms.PasswordInput)


class VerifyForm(forms.Form):
    """OTP entry: exactly 6 ASCII digits.

    A non-digit or wrong-length value is treated as a failed attempt (no format
    oracle); ``000000`` is a valid code with no special-casing.
    """

    code = forms.CharField(max_length=6)

    def clean_code(self):
        code = self.cleaned_data["code"].strip()
        if len(code) != 6 or not code.isascii() or not code.isdigit():
            raise forms.ValidationError("Enter the 6-digit code.")
        return code


class AcceptInviteForm(forms.Form):
    """Staff invite acceptance: password + confirm (NO email/role field)."""

    password = forms.CharField(widget=forms.PasswordInput)
    confirm_password = forms.CharField(widget=forms.PasswordInput)

    def clean(self):
        cleaned = super().clean()
        password = cleaned.get("password")
        confirm = cleaned.get("confirm_password")
        if password and confirm and password != confirm:
            raise forms.ValidationError("Passwords do not match.")
        return cleaned
