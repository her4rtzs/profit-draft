"""
WSGI config for the ProFit project.

Exposes the WSGI callable as a module-level variable named ``application``.
Vercel's @vercel/python runtime imports this via ``api/index.py``.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "profit.settings")

application = get_wsgi_application()
