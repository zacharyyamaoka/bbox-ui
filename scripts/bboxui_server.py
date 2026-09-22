#!/usr/bin/env python3
"""Serve one Stable release for a bbox-ui product, with a same-origin
/api/promote that rebuilds the current checkout and pins it as the new
Stable snapshot.

Only the Stable channel runs this. Preview is a real dev server with HMR
(`next dev` for the website, `storybook dev` for the workbench) — see the
module docstring in bbox_release.py. `--product` (docs|storybook) selects
which `ProductConfig` this instance serves; the HTTP surface (`/api/health`,
`/api/promote`, `/api/start-preview`, static file serving) is identical
either way.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

from bbox_release import (  # noqa: E402
    PRODUCTS,
    ProductConfig,
    ReleaseError,
    commits_ahead_of_stable,
    default_state_home,
    ensure_preview_server,
    live_matches,
    promote,
    read_manifest,
    release_site_dir,
    source_provenance,
)


BADGE_SCRIPT_PATH = SCRIPTS_DIR / "bboxui_badge.js"


class BboxUiServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, handler_class, *, release_home, state_home, channel, build, config: ProductConfig):
        super().__init__(address, handler_class)
        self.release_home = release_home
        self.state_home = state_home
        self.channel = channel
        self.config = config
        self.promote_lock = threading.Lock()
        self.set_current(build)

    def set_current(self, build: str) -> None:
        manifest = read_manifest(self.release_home, build, self.config)
        self.build = build
        self.manifest = manifest
        self.site_dir = release_site_dir(self.release_home, build).resolve()

    def status_payload(self) -> dict:
        live = source_provenance(PROJECT_ROOT)
        return {
            "product": self.config.product,
            "displayName": self.config.display_name,
            "channel": self.channel,
            "build": self.build,
            # WHY here too, not just on the dev-server status plugins: the
            # whiteboard's row prober (apps/systemsketch/src/chrome/
            # siteStatus.ts) compares `projectRoot` on whatever it probes,
            # Stable included, so this server needs to answer the same
            # field the same way (see statusEndpoint.ts's own WHY on the
            # trailing-slash spelling this has to match).
            "projectRoot": str(PROJECT_ROOT),
            "commit": self.manifest.get("commit"),
            "branch": self.manifest.get("branch"),
            "dirty": self.manifest.get("dirty"),
            "dirtyPaths": self.manifest.get("dirtyPaths"),
            "builtAt": self.manifest.get("builtAt"),
            "live": {
                "commit": live.commit,
                "branch": live.branch,
                "dirty": live.dirty,
                "dirtyPaths": list(live.dirty_paths),
            },
            "liveMatchesStable": live_matches(self.manifest, PROJECT_ROOT),
            # WHY here and not just a boolean: "matches" collapses "one
            # commit behind" and "fifty commits behind" into the same
            # answer, which is exactly the ambiguity Zach's original
            # complaint was about ("I am not sure I am on the latest").
            # None (not 0) when it can't be computed — see
            # commits_ahead_of_stable's own docstring for why that
            # distinction matters to the badge.
            "commitsAheadOfStable": commits_ahead_of_stable(self.manifest, PROJECT_ROOT),
        }


class Handler(BaseHTTPRequestHandler):
    server_version = "bboxui/3.0"
    server: BboxUiServer

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        sys.stderr.write(f"{self.address_string()} - {format % args}\n")

    def _preview_origin(self) -> str:
        return f"http://127.0.0.1:{self.server.config.preview_port}"

    def _send_cors_headers(self) -> None:
        # WHY Preview's own origin specifically, not "*": Preview's badge
        # (the docs React component, or Storybook's manager-head.html) makes
        # cross-origin fetch/POST calls to this server, and a wildcard would
        # also open the promote endpoint to any page in the browser, not
        # just the one localhost dev server this is meant for.
        self.send_header("Access-Control-Allow-Origin", self._preview_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        # Preflight for Preview's cross-origin POST /api/promote and
        # /api/start-preview.
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(200, self.server.status_payload())
            return
        if path == "/__bboxui/badge.js":
            try:
                body = BADGE_SCRIPT_PATH.read_bytes()
            except OSError:
                self._send_json(404, {"error": "badge script missing"})
                return
            self._send_bytes(200, body, "application/javascript")
            return
        self._serve_site(path)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/promote":
            with self.server.promote_lock:
                try:
                    build, _manifest = promote(self.server.release_home, PROJECT_ROOT, self.server.config)
                    self.server.set_current(build)
                    self._send_json(200, self.server.status_payload())
                except ReleaseError as cause:
                    self._send_json(502, {"error": str(cause)})
            return
        if path == "/api/start-preview":
            try:
                url = ensure_preview_server(self.server.state_home, self.server.config)
                self._send_json(200, {"url": url})
            except ReleaseError as cause:
                self._send_json(502, {"error": str(cause)})
            return
        self._send_json(404, {"error": "not found"})

    def _resolve(self, path: str) -> Path | None:
        site_dir = self.server.site_dir
        clean = path.lstrip("/")
        candidates = (
            [site_dir / "index.html"]
            if clean == ""
            else [site_dir / clean, site_dir / f"{clean}.html", site_dir / clean / "index.html"]
        )
        for candidate in candidates:
            try:
                resolved = candidate.resolve()
            except OSError:
                continue
            if resolved.is_file() and (resolved == site_dir or site_dir in resolved.parents):
                return resolved
        return None

    def _serve_site(self, path: str) -> None:
        resolved = self._resolve(path)
        if resolved is None:
            self._send_json(404, {"error": "not found"})
            return
        content_type = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
        body = resolved.read_bytes()
        if content_type == "text/html" and self.server.config.inject_badge:
            body = self._inject_badge(body)
        self._send_bytes(200, body, content_type)

    def _inject_badge(self, body: bytes) -> bytes:
        marker = b"</body>"
        if marker not in body:
            return body
        status = json.dumps(self.server.status_payload()).encode("utf-8")
        injected = (
            b"<script>window.__BBOXUI_STABLE__=" + status + b";</script>"
            b'<script defer src="/__bboxui/badge.js"></script>'
        )
        return body.replace(marker, injected + marker, 1)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--release-home", type=Path, required=True)
    parser.add_argument("--state-home", type=Path, default=None)
    parser.add_argument("--build", required=True)
    parser.add_argument("--channel", default="stable")
    parser.add_argument("--product", default="docs", choices=sorted(PRODUCTS))
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    config = PRODUCTS[arguments.product]
    state_home = (arguments.state_home or default_state_home(config)).expanduser().resolve()
    server = BboxUiServer(
        ("127.0.0.1", arguments.port),
        Handler,
        release_home=arguments.release_home.resolve(),
        state_home=state_home,
        channel=arguments.channel,
        build=arguments.build,
        config=config,
    )
    print(f"{config.display_name} {arguments.channel} serving build {arguments.build} on {arguments.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
