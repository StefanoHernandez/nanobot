"""Headers for our app's web export when the gateway serves it (fork extension).

The policy leaves scripts, styles and connections alone on purpose: artifact previews run in
``srcdoc`` iframes that inherit the page CSP, and a script/connect policy would break them.
It only blocks plugins, external framing (clickjacking), base-tag hijacking and form posts away.
"""

from __future__ import annotations

from pathlib import Path

from websockets.http11 import Response

APP_CSP = "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"


def harden(response: Response, dist: Path | None) -> Response:
    from nanobot.ext.webui_mode import is_app_dist

    if is_app_dist(dist):
        response.headers["Content-Security-Policy"] = APP_CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
    return response
