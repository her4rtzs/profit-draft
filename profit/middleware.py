"""Custom middleware to ensure static HTML files always pass through Django RBAC views."""

from whitenoise.middleware import WhiteNoiseMiddleware


class ProtectedWhiteNoiseMiddleware(WhiteNoiseMiddleware):
    """Serve static assets via WhiteNoise, except raw .html files in web/."""

    def __call__(self, request):
        path = (request.path_info or "").lower()
        if path.endswith((".html", ".htm")):
            return self.get_response(request)
        return super().__call__(request)
