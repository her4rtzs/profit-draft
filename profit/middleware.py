"""Custom middleware to ensure static HTML files always pass through Django RBAC views."""

from whitenoise.middleware import WhiteNoiseMiddleware


class ProtectedWhiteNoiseMiddleware(WhiteNoiseMiddleware):
    """Serve static assets via WhiteNoise, except raw .html files in web/."""

    def __call__(self, request):
        path = (request.path_info or "").lower()
        if path.endswith((".html", ".htm")):
            return self.get_response(request)
        response = super().__call__(request)
        if path == "/sw.js":
            response["Cache-Control"] = "no-cache, must-revalidate"
        return response
