"""Read-only HTTP API for Dream memory pages (USER, MEMORY, SOUL) and latest dream commit."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from loguru import logger
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.utils.gitstore import GitStore, GitStoreError
from nanobot.webui.http_utils import http_error, http_json_response

PATH = "/api/ext/memory/pages"
_MAX_PAGE_CHARS = 100_000
_MAX_DIFF_CHARS = 20_000
_TRACKED_FILES = ["SOUL.md", "USER.md", "memory/MEMORY.md", "memory/.dream_cursor"]
_PAGE_PATHS = {
    "user": "USER.md",
    "memory": "memory/MEMORY.md",
    "soul": "SOUL.md",
}


def _read_page_text(workspace: Path, rel: str) -> tuple[str, bool]:
    root = workspace.expanduser().resolve(strict=False)
    path = (root / rel).resolve(strict=False)
    if not path.is_relative_to(root):
        return "", False
    try:
        text = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError, UnicodeError):
        return "", False
    if len(text) > _MAX_PAGE_CHARS:
        return text[:_MAX_PAGE_CHARS], True
    return text, False


def _latest_dream(workspace: Path) -> dict[str, Any] | None:
    git = GitStore(workspace, tracked_files=_TRACKED_FILES)
    try:
        entries = git.log(max_entries=1, message_prefix="dream:")
        if not entries:
            return None
        sha = entries[0].sha
        shown = git.show_commit_diff(sha, max_entries=1, message_prefix="dream:")
        if shown is None:
            return None
        commit, diff = shown
        truncated = False
        if len(diff) > _MAX_DIFF_CHARS:
            diff = diff[:_MAX_DIFF_CHARS]
            truncated = True
        return {
            "time": commit.timestamp,
            "subject": commit.subject(),
            "diff": diff,
            "truncated": truncated,
        }
    except GitStoreError as exc:
        logger.debug("memory pages: dream git lookup failed: {}", exc)
        return None


def pages_payload(workspace: Path, *, enabled: bool, schedule: str) -> dict[str, Any]:
    pages: dict[str, dict[str, Any]] = {}
    for key, rel in _PAGE_PATHS.items():
        text, truncated = _read_page_text(workspace, rel)
        pages[key] = {"text": text, "truncated": truncated}
    return {
        "dream": {"enabled": enabled, "schedule": schedule},
        "pages": pages,
        "latest": _latest_dream(workspace),
    }


def dispatch_memory_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PATH:
        return None
    if not router.tokens.check_api_token(request):
        return http_error(401, "Unauthorized")
    from nanobot.config.loader import load_config

    config = load_config()
    workspace = Path(router.skills_workspace_path)
    dream = config.agents.defaults.dream
    payload = pages_payload(
        workspace,
        enabled=dream.enabled,
        schedule=dream.describe_schedule(),
    )
    return http_json_response(payload, extra_headers=[("Cache-Control", "no-store")])
