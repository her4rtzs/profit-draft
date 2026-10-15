"""Vercel serverless entry point.

@vercel/python imports the WSGI callable named ``app`` from this module and
invokes it directly (there is no gunicorn / long-lived process).

NIT-3: serving static files with WhiteNoise from inside this function is a
deliberate first-build choice; CDN optimization is deferred to a later pass.
"""

from profit.wsgi import application as app  # noqa: F401  (Vercel imports `app`)
