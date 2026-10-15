"""Multi-bot Kanban store and HTTP helpers."""

from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import threading
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, cast

from aiohttp import web
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.runtime_context import RuntimeContextBlock
from nanobot.webui.http_utils import (
    http_error,
    http_json_response,
    issue_route_secret_matches,
    parse_request_path,
    query_first,
)

PREFIX = "/api/ext/kanban"
MAX_JSON_BODY_BYTES = 1024 * 1024

STATUSES = frozenset(
    {"triage", "todo", "ready", "running", "blocked", "review", "done", "archived"}
)
PRIORITIES = frozenset({"low", "medium", "high", "urgent"})
WORKSPACE_MODES = frozenset({"scratch", "worktree", "dir"})

MAX_BOTS = 20
MAX_BOARDS = 20
MAX_TASKS_PER_BOARD = 200
MAX_ARTIFACTS = 20
MAX_ARTIFACT_LEN = 500
MAX_TITLE = 200
MAX_DESCRIPTION = 8000
MAX_ROLE_PROMPT = 8000
MAX_MESSAGE = 4000
MAX_ICON = 8
MAX_NAME = 40

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")
MENTION_RE = re.compile(r"@([a-z0-9][a-z0-9_-]{0,40})")

_lock = threading.Lock()


class KanbanError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


MAX_MENTIONS_PER_MESSAGE = 3
MAX_PENDING_WAKES = 50


def kanban_db_path() -> Path:
    raw = os.environ.get("NANOBOT_KANBAN_DB", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".nanobot" / "ext_kanban.db"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _validate_no_control(text: str, *, max_len: int, code: str = "invalid_text") -> str:
    if not isinstance(text, str):
        raise KanbanError(400, code)
    if len(text) > max_len:
        raise KanbanError(400, code)
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in text):
        raise KanbanError(400, code)
    return text


def _validate_prose(text: str, *, max_len: int, code: str) -> str:
    """Like titles, but descriptions and chat may contain newlines and tabs."""
    if not isinstance(text, str) or len(text) > max_len:
        raise KanbanError(400, code)
    if any((ord(ch) < 32 and ch not in "\n\r\t") or ord(ch) == 127 for ch in text):
        raise KanbanError(400, code)
    return text


def _optional_bot(raw: Any) -> str | None:
    if raw is None or raw == "":
        return None
    if not isinstance(raw, str) or not ID_RE.fullmatch(raw.strip()):
        raise KanbanError(400, "invalid_id")
    return raw.strip()


def _recurrence(raw: Any) -> str:
    if raw is None or raw == "":
        return ""
    if not isinstance(raw, str):
        raise KanbanError(400, "invalid_recurrence")
    text = raw.strip()
    if not text:
        return ""
    match = re.fullmatch(r"every:(\d+)s", text)
    if not match or not 60 <= int(match.group(1)) <= 2_592_000:
        raise KanbanError(400, "invalid_recurrence")
    return text


def _bounded_int(raw: Any, *, default: int, low: int, high: int, code: str) -> int:
    if raw is None or raw == "":
        return default
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < low or raw > high:
        raise KanbanError(400, code)
    return raw


def _harden_db(path: Path) -> None:
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    try:
        if path.exists():
            os.chmod(path, 0o600)
    except OSError:
        pass


def _validate_optional_id(raw: Any) -> str | None:
    if raw is None or raw == "":
        return None
    if not isinstance(raw, str):
        raise KanbanError(400, "invalid_id")
    candidate = raw.strip()
    if not ID_RE.fullmatch(candidate):
        raise KanbanError(400, "invalid_id")
    return candidate


def _new_id(raw: Any) -> str:
    explicit = _validate_optional_id(raw)
    if explicit:
        return explicit
    for _ in range(8):
        candidate = secrets.token_urlsafe(9).replace("-", "_").replace(".", "_").lower()
        if ID_RE.fullmatch(candidate):
            return candidate
    return secrets.token_urlsafe(9).replace("-", "a").replace(".", "b").lower()[:12]


def _parse_artifacts(raw: Any) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise KanbanError(400, "invalid_artifacts")
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str) or "\x00" in item:
            raise KanbanError(400, "invalid_artifacts")
        if len(item) > MAX_ARTIFACT_LEN:
            raise KanbanError(400, "invalid_artifacts")
        out.append(item)
    if len(out) > MAX_ARTIFACTS:
        raise KanbanError(400, "invalid_artifacts")
    return out


def _artifacts_json(artifacts: list[str]) -> str:
    return json.dumps(artifacts, separators=(",", ":"))


def _loads_artifacts(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        return []
    if not isinstance(data, list):
        return []
    return [str(x) for x in data if isinstance(x, str)]


def _row_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def _task_public(row: sqlite3.Row) -> dict[str, Any]:
    data = _row_dict(row)
    data["artifacts"] = _loads_artifacts(cast(str | None, data.pop("artifacts_json", None)))
    return data


class KanbanStore:
    def __init__(self, path: Path | None = None, *, seed: bool = True) -> None:
        self._path = path or kanban_db_path()
        self._seed = seed
        self._lock = _lock
        self._ensure_schema()

    @property
    def path(self) -> Path:
        return self._path

    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._path), timeout=30.0)
        _harden_db(self._path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _ensure_schema(self) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS bots (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        icon TEXT NOT NULL DEFAULT '',
                        role_prompt TEXT NOT NULL DEFAULT '',
                        model_preset TEXT NOT NULL DEFAULT '',
                        allowed_tools_json TEXT NOT NULL DEFAULT '[]',
                        allowed_skills_json TEXT NOT NULL DEFAULT '[]',
                        max_concurrent INTEGER NOT NULL DEFAULT 1,
                        created_at_ms INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS boards (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL DEFAULT '',
                        max_concurrent INTEGER NOT NULL DEFAULT 2,
                        created_at_ms INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS tasks (
                        id TEXT PRIMARY KEY,
                        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL,
                        priority TEXT NOT NULL DEFAULT 'medium',
                        assignee_bot_id TEXT,
                        reviewer_bot_id TEXT,
                        workspace_mode TEXT NOT NULL DEFAULT 'scratch',
                        workspace_path TEXT NOT NULL DEFAULT '',
                        recurrence_expr TEXT NOT NULL DEFAULT '',
                        scheduled_at_ms INTEGER,
                        retries INTEGER NOT NULL DEFAULT 0,
                        max_retries INTEGER NOT NULL DEFAULT 2,
                        summary TEXT NOT NULL DEFAULT '',
                        artifacts_json TEXT NOT NULL DEFAULT '[]',
                        review_feedback TEXT NOT NULL DEFAULT '',
                        blocked_reason TEXT NOT NULL DEFAULT '',
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS task_links (
                        parent_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                        child_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                        PRIMARY KEY (parent_id, child_id)
                    );
                    CREATE TABLE IF NOT EXISTS task_runs (
                        id TEXT PRIMARY KEY,
                        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                        bot_id TEXT NOT NULL,
                        session_key TEXT NOT NULL,
                        status TEXT NOT NULL,
                        summary TEXT NOT NULL DEFAULT '',
                        artifacts_json TEXT NOT NULL DEFAULT '[]',
                        started_at_ms INTEGER NOT NULL,
                        finished_at_ms INTEGER,
                        error TEXT NOT NULL DEFAULT ''
                    );
                    CREATE TABLE IF NOT EXISTS board_messages (
                        id TEXT PRIMARY KEY,
                        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                        task_id TEXT,
                        author_type TEXT NOT NULL,
                        author_id TEXT NOT NULL,
                        author_name TEXT NOT NULL,
                        content TEXT NOT NULL,
                        hop_count INTEGER NOT NULL DEFAULT 0,
                        created_at_ms INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS wakes (
                        id TEXT PRIMARY KEY,
                        bot_id TEXT NOT NULL,
                        board_id TEXT NOT NULL,
                        message_id TEXT NOT NULL,
                        content TEXT NOT NULL,
                        hop_count INTEGER NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        created_at_ms INTEGER NOT NULL
                    );
                    """
                )
                if self._seed:
                    self._seed_defaults(conn)

    def _seed_defaults(self, conn: sqlite3.Connection) -> None:
        board_count = conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0]
        if board_count:
            return
        now = _now_ms()
        conn.execute(
            "INSERT INTO boards (id, title, description, max_concurrent, created_at_ms) VALUES (?, ?, ?, ?, ?)",
            ("main", "Main Board", "", 2, now),
        )
        defaults = [
            ("coder", "Coder", "💻", "Implement features with clear, tested code."),
            ("reviewer", "Reviewer", "🔍", "Review work for correctness, edge cases, and clarity."),
            ("researcher", "Researcher", "📚", "Gather context and summarize findings concisely."),
        ]
        for bot_id, name, icon, prompt in defaults:
            conn.execute(
                """
                INSERT INTO bots (id, name, icon, role_prompt, max_concurrent, created_at_ms)
                VALUES (?, ?, ?, ?, 1, ?)
                """,
                (bot_id, name, icon, prompt, now),
            )

    def list_bots(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM bots ORDER BY created_at_ms").fetchall()
        return [_row_dict(r) for r in rows]

    def create_bot(
        self,
        *,
        bot_id: Any = None,
        name: str,
        icon: str = "",
        role_prompt: str = "",
        model_preset: str = "",
        max_concurrent: int = 1,
    ) -> dict[str, Any]:
        name = _validate_no_control(name.strip(), max_len=MAX_NAME, code="invalid_name")
        icon = _validate_no_control(icon, max_len=MAX_ICON, code="invalid_icon")
        role_prompt = _validate_prose(role_prompt, max_len=MAX_ROLE_PROMPT, code="invalid_role_prompt")
        max_concurrent = _bounded_int(max_concurrent, default=1, low=1, high=20, code="invalid_max_concurrent")
        model_preset = _validate_no_control(model_preset or "", max_len=80, code="invalid_preset")
        with self._lock, self._connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM bots").fetchone()[0]
            if count >= MAX_BOTS:
                raise KanbanError(409, "bot_limit")
            new_id = _new_id(bot_id)
            if conn.execute("SELECT 1 FROM bots WHERE id = ?", (new_id,)).fetchone():
                raise KanbanError(409, "duplicate_id")
            now = _now_ms()
            conn.execute(
                """
                INSERT INTO bots (id, name, icon, role_prompt, model_preset, max_concurrent, created_at_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (new_id, name, icon, role_prompt, model_preset, max_concurrent, now),
            )
            row = conn.execute("SELECT * FROM bots WHERE id = ?", (new_id,)).fetchone()
        return _row_dict(row)

    def update_bot(
        self,
        bot_id: str,
        *,
        name: str | None = None,
        icon: str | None = None,
        role_prompt: str | None = None,
        model_preset: str | None = None,
        max_concurrent: int | None = None,
    ) -> dict[str, Any]:
        if not _validate_optional_id(bot_id):
            raise KanbanError(400, "invalid_id")
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM bots WHERE id = ?", (bot_id,)).fetchone()
            if row is None:
                raise KanbanError(404, "not_found")
            fields: dict[str, Any] = {}
            if name is not None:
                fields["name"] = _validate_no_control(name.strip(), max_len=MAX_NAME, code="invalid_name")
            if icon is not None:
                fields["icon"] = _validate_no_control(icon, max_len=MAX_ICON, code="invalid_icon")
            if role_prompt is not None:
                fields["role_prompt"] = _validate_prose(
                    role_prompt, max_len=MAX_ROLE_PROMPT, code="invalid_role_prompt"
                )
            if model_preset is not None:
                fields["model_preset"] = _validate_no_control(
                    model_preset, max_len=80, code="invalid_preset"
                )
            if max_concurrent is not None:
                fields["max_concurrent"] = _bounded_int(
                    max_concurrent, default=1, low=1, high=20, code="invalid_max_concurrent"
                )
            if fields:
                sets = ", ".join(f"{k} = ?" for k in fields)
                conn.execute(
                    f"UPDATE bots SET {sets} WHERE id = ?",
                    (*fields.values(), bot_id),
                )
            row = conn.execute("SELECT * FROM bots WHERE id = ?", (bot_id,)).fetchone()
        return _row_dict(row)

    def save_bot(self, body: dict[str, Any]) -> dict[str, Any]:
        bot_id = body.get("id")
        if isinstance(bot_id, str) and bot_id.strip():
            bid = bot_id.strip()
            with self._lock, self._connect() as conn:
                exists = conn.execute("SELECT 1 FROM bots WHERE id = ?", (bid,)).fetchone()
            if exists:
                return self.update_bot(
                    bid,
                    name=body.get("name") if "name" in body else None,
                    icon=body.get("icon") if "icon" in body else None,
                    role_prompt=body.get("role_prompt") if "role_prompt" in body else None,
                    model_preset=body.get("model_preset") if "model_preset" in body else None,
                    max_concurrent=body.get("max_concurrent") if "max_concurrent" in body else None,
                )
        name = body.get("name", "")
        if not isinstance(name, str):
            raise KanbanError(400, "invalid_name")
        return self.create_bot(
            bot_id=body.get("id"),
            name=name,
            icon=str(body.get("icon") or ""),
            role_prompt=str(body.get("role_prompt") or ""),
            model_preset=str(body.get("model_preset") or ""),
            max_concurrent=_bounded_int(
                body.get("max_concurrent"), default=1, low=1, high=20, code="invalid_max_concurrent"
            ),
        )

    def delete_bot(self, bot_id: str) -> None:
        if not _validate_optional_id(bot_id):
            raise KanbanError(400, "invalid_id")
        with self._lock, self._connect() as conn:
            if conn.execute("SELECT 1 FROM bots WHERE id = ?", (bot_id,)).fetchone() is None:
                raise KanbanError(404, "not_found")
            assigned = conn.execute(
                """
                SELECT 1 FROM tasks
                WHERE assignee_bot_id = ? OR reviewer_bot_id = ?
                LIMIT 1
                """,
                (bot_id, bot_id),
            ).fetchone()
            if assigned:
                raise KanbanError(409, "bot_in_use")
            conn.execute("DELETE FROM bots WHERE id = ?", (bot_id,))

    def list_boards(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM boards ORDER BY created_at_ms").fetchall()
        return [_row_dict(r) for r in rows]

    def create_board(
        self,
        *,
        board_id: Any = None,
        title: str,
        description: str = "",
        max_concurrent: int = 2,
    ) -> dict[str, Any]:
        title = _validate_no_control(title.strip(), max_len=MAX_TITLE, code="invalid_title")
        description = _validate_prose(description, max_len=MAX_DESCRIPTION, code="invalid_description")
        max_concurrent = _bounded_int(max_concurrent, default=2, low=1, high=20, code="invalid_max_concurrent")
        with self._lock, self._connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0]
            if count >= MAX_BOARDS:
                raise KanbanError(409, "board_limit")
            new_id = _new_id(board_id)
            if conn.execute("SELECT 1 FROM boards WHERE id = ?", (new_id,)).fetchone():
                raise KanbanError(409, "duplicate_id")
            now = _now_ms()
            conn.execute(
                """
                INSERT INTO boards (id, title, description, max_concurrent, created_at_ms)
                VALUES (?, ?, ?, ?, ?)
                """,
                (new_id, title, description, max_concurrent, now),
            )
            row = conn.execute("SELECT * FROM boards WHERE id = ?", (new_id,)).fetchone()
        return _row_dict(row)

    def delete_board(self, board_id: str) -> None:
        if not _validate_optional_id(board_id):
            raise KanbanError(400, "invalid_id")
        with self._lock, self._connect() as conn:
            cur = conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
            if cur.rowcount == 0:
                raise KanbanError(404, "not_found")

    def _board_or_404(self, conn: sqlite3.Connection, board_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
        if row is None:
            raise KanbanError(404, "not_found")
        return row

    def _task_or_404(self, conn: sqlite3.Connection, task_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise KanbanError(404, "not_found")
        return row

    def save_task(self, body: dict[str, Any]) -> dict[str, Any]:
        task_id = body.get("id")
        board_id = body.get("board_id")
        title = body.get("title")
        description = body.get("description", "")
        if isinstance(task_id, str) and task_id.strip():
            with self._lock, self._connect() as conn:
                exists = conn.execute(
                    "SELECT 1 FROM tasks WHERE id = ?", (task_id.strip(),)
                ).fetchone()
            if exists:
                return self._update_task(task_id, body)
        if not isinstance(board_id, str) or not _validate_optional_id(board_id):
            raise KanbanError(400, "invalid_board_id")
        if not isinstance(title, str):
            raise KanbanError(400, "invalid_title")
        title = _validate_no_control(title.strip(), max_len=MAX_TITLE, code="invalid_title")
        if not title:
            raise KanbanError(400, "invalid_title")
        if not isinstance(description, str):
            raise KanbanError(400, "invalid_description")
        description = _validate_prose(description, max_len=MAX_DESCRIPTION, code="invalid_description")
        status = str(body.get("status") or "triage")
        if status not in STATUSES:
            raise KanbanError(400, "invalid_status")
        priority = str(body.get("priority") or "medium")
        if priority not in PRIORITIES:
            raise KanbanError(400, "invalid_priority")
        workspace_mode = str(body.get("workspace_mode") or "scratch")
        if workspace_mode not in WORKSPACE_MODES:
            raise KanbanError(400, "invalid_workspace_mode")
        parent_ids = body.get("parent_ids") or []
        if not isinstance(parent_ids, list):
            raise KanbanError(400, "invalid_parent_ids")
        with self._lock, self._connect() as conn:
            self._board_or_404(conn, board_id)
            count = conn.execute(
                "SELECT COUNT(*) FROM tasks WHERE board_id = ?", (board_id,)
            ).fetchone()[0]
            if count >= MAX_TASKS_PER_BOARD:
                raise KanbanError(409, "task_limit")
            new_id = _new_id(body.get("id"))
            now = _now_ms()
            conn.execute(
                """
                INSERT INTO tasks (
                    id, board_id, title, description, status, priority,
                    assignee_bot_id, reviewer_bot_id, workspace_mode, recurrence_expr,
                    created_at_ms, updated_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    board_id,
                    title,
                    description,
                    status,
                    priority,
                    _optional_bot(body.get("assignee_bot_id")),
                    _optional_bot(body.get("reviewer_bot_id")),
                    workspace_mode,
                    _recurrence(body.get("recurrence_expr")),
                    now,
                    now,
                ),
            )
            for parent in parent_ids:
                if not isinstance(parent, str):
                    raise KanbanError(400, "invalid_parent_ids")
                self._add_dependency_locked(conn, parent, new_id)
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (new_id,)).fetchone()
        return _task_public(row)

    def _update_task(self, task_id: Any, body: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(task_id, str) or not _validate_optional_id(task_id):
            raise KanbanError(400, "invalid_id")
        with self._lock, self._connect() as conn:
            self._task_or_404(conn, task_id)
            fields: dict[str, Any] = {}
            if "title" in body:
                title = _validate_no_control(
                    str(body["title"]).strip(), max_len=MAX_TITLE, code="invalid_title"
                )
                if not title:
                    raise KanbanError(400, "invalid_title")
                fields["title"] = title
            if "description" in body:
                if not isinstance(body["description"], str):
                    raise KanbanError(400, "invalid_description")
                fields["description"] = _validate_prose(
                    body["description"], max_len=MAX_DESCRIPTION, code="invalid_description"
                )
            if "status" in body and body["status"] is not None:
                status = str(body["status"])
                if status not in STATUSES:
                    raise KanbanError(400, "invalid_status")
                fields["status"] = status
            if "priority" in body and body["priority"] is not None:
                priority = str(body["priority"])
                if priority not in PRIORITIES:
                    raise KanbanError(400, "invalid_priority")
                fields["priority"] = priority
            for key in ("assignee_bot_id", "reviewer_bot_id"):
                if key in body:
                    fields[key] = _optional_bot(body[key])
            if "recurrence_expr" in body:
                fields["recurrence_expr"] = _recurrence(body["recurrence_expr"])
            if "max_retries" in body:
                fields["max_retries"] = _bounded_int(
                    body["max_retries"], default=2, low=0, high=20, code="invalid_retries"
                )
            if "summary" in body:
                if not isinstance(body["summary"], str):
                    raise KanbanError(400, "invalid_summary")
                fields["summary"] = _validate_prose(
                    body["summary"], max_len=MAX_DESCRIPTION, code="invalid_summary"
                )
            if "workspace_mode" in body and body["workspace_mode"] is not None:
                mode = str(body["workspace_mode"])
                if mode not in WORKSPACE_MODES:
                    raise KanbanError(400, "invalid_workspace_mode")
                fields["workspace_mode"] = mode
            if fields:
                fields["updated_at_ms"] = _now_ms()
                sets = ", ".join(f"{k} = ?" for k in fields)
                conn.execute(
                    f"UPDATE tasks SET {sets} WHERE id = ?",
                    (*fields.values(), task_id),
                )
            if "parent_ids" in body and isinstance(body["parent_ids"], list):
                conn.execute(
                    "DELETE FROM task_links WHERE child_id = ?",
                    (task_id,),
                )
                for parent in body["parent_ids"]:
                    if not isinstance(parent, str):
                        raise KanbanError(400, "invalid_parent_ids")
                    self._add_dependency_locked(conn, parent, task_id)
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_public(row)

    def move_task(self, task_id: str, status: str) -> dict[str, Any]:
        if status not in STATUSES:
            raise KanbanError(400, "invalid_status")
        with self._lock, self._connect() as conn:
            self._task_or_404(conn, task_id)
            conn.execute(
                "UPDATE tasks SET status = ?, updated_at_ms = ? WHERE id = ?",
                (status, _now_ms(), task_id),
            )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_public(row)

    def delete_task(self, task_id: str) -> None:
        if not _validate_optional_id(task_id):
            raise KanbanError(400, "invalid_id")
        with self._lock, self._connect() as conn:
            cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            if cur.rowcount == 0:
                raise KanbanError(404, "not_found")

    def get_task_detail(self, task_id: str) -> dict[str, Any]:
        if not _validate_optional_id(task_id):
            raise KanbanError(404, "not_found")
        with self._lock, self._connect() as conn:
            task_row = self._task_or_404(conn, task_id)
            parents = conn.execute(
                """
                SELECT t.* FROM tasks t
                JOIN task_links l ON l.parent_id = t.id
                WHERE l.child_id = ?
                ORDER BY t.created_at_ms
                """,
                (task_id,),
            ).fetchall()
            children = conn.execute(
                """
                SELECT t.* FROM tasks t
                JOIN task_links l ON l.child_id = t.id
                WHERE l.parent_id = ?
                ORDER BY t.created_at_ms
                """,
                (task_id,),
            ).fetchall()
            runs = list(reversed(conn.execute(
                "SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at_ms DESC LIMIT 20",
                (task_id,),
            ).fetchall()))
            messages = list(reversed(conn.execute(
                "SELECT * FROM board_messages WHERE task_id = ? ORDER BY created_at_ms DESC LIMIT 100",
                (task_id,),
            ).fetchall()))
        return {
            "task": _task_public(task_row),
            "parents": [_task_public(r) for r in parents],
            "children": [_task_public(r) for r in children],
            "runs": [_row_dict(r) for r in runs],
            "messages": [_row_dict(r) for r in messages],
        }

    def _would_cycle(self, conn: sqlite3.Connection, parent_id: str, child_id: str) -> bool:
        if parent_id == child_id:
            return True
        stack = [child_id]
        seen: set[str] = set()
        while stack:
            current = stack.pop()
            if current == parent_id:
                return True
            if current in seen:
                continue
            seen.add(current)
            rows = conn.execute(
                "SELECT child_id FROM task_links WHERE parent_id = ?", (current,)
            ).fetchall()
            stack.extend(str(r[0]) for r in rows)
        return False

    def _add_dependency_locked(
        self, conn: sqlite3.Connection, parent_id: str, child_id: str
    ) -> None:
        if not _validate_optional_id(parent_id) or not _validate_optional_id(child_id):
            raise KanbanError(400, "invalid_id")
        if parent_id == child_id:
            raise KanbanError(409, "cycle")
        self._task_or_404(conn, parent_id)
        self._task_or_404(conn, child_id)
        if self._would_cycle(conn, parent_id, child_id):
            raise KanbanError(409, "cycle")
        conn.execute(
            "INSERT OR IGNORE INTO task_links (parent_id, child_id) VALUES (?, ?)",
            (parent_id, child_id),
        )

    def add_dependency(self, parent_id: str, child_id: str) -> None:
        with self._lock, self._connect() as conn:
            self._add_dependency_locked(conn, parent_id, child_id)

    def remove_dependency(self, parent_id: str, child_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM task_links WHERE parent_id = ? AND child_id = ?",
                (parent_id, child_id),
            )

    def _promote_ready_children(self, conn: sqlite3.Connection, parent_id: str) -> None:
        children = conn.execute(
            "SELECT child_id FROM task_links WHERE parent_id = ?",
            (parent_id,),
        ).fetchall()
        for (child_id,) in children:
            child = conn.execute(
                "SELECT status FROM tasks WHERE id = ?", (child_id,)
            ).fetchone()
            if child is None or child["status"] != "todo":
                continue
            parent_rows = conn.execute(
                """
                SELECT t.status FROM tasks t
                JOIN task_links l ON l.parent_id = t.id
                WHERE l.child_id = ?
                """,
                (child_id,),
            ).fetchall()
            if parent_rows and all(r["status"] == "done" for r in parent_rows):
                conn.execute(
                    "UPDATE tasks SET status = 'ready', updated_at_ms = ? WHERE id = ?",
                    (_now_ms(), child_id),
                )

    def _build_context_content(
        self,
        conn: sqlite3.Connection,
        task: sqlite3.Row,
        bot: sqlite3.Row,
    ) -> str:
        lines = [
            f"Role: {bot['role_prompt']}",
            f"Task: {task['title']}",
            f"Description: {task['description']}",
        ]
        if task["review_feedback"]:
            lines.append(f"Review feedback: {task['review_feedback']}")
        parents = conn.execute(
            """
            SELECT t.title, t.summary, t.artifacts_json FROM tasks t
            JOIN task_links l ON l.parent_id = t.id
            WHERE l.child_id = ?
            ORDER BY t.created_at_ms
            """,
            (task["id"],),
        ).fetchall()
        for parent in parents:
            artifacts = _loads_artifacts(parent["artifacts_json"])
            lines.append(f"Parent: {parent['title']} — {parent['summary']}")
            if artifacts:
                lines.append(f"Parent artifacts: {', '.join(artifacts)}")
        return "\n".join(lines)

    def _claim_one_ready_task_locked(
        self,
        conn: sqlite3.Connection,
        now: int,
        board_running: dict[str, int],
        bot_running: dict[str, int],
    ) -> dict[str, Any] | None:
        boards = conn.execute("SELECT * FROM boards ORDER BY created_at_ms").fetchall()
        for board in boards:
            board_id = board["id"]
            board_max = int(board["max_concurrent"])
            if board_id not in board_running:
                running = conn.execute(
                    "SELECT COUNT(*) FROM tasks WHERE board_id = ? AND status = 'running'",
                    (board_id,),
                ).fetchone()[0]
                board_running[board_id] = int(running)
            ready_rows = conn.execute(
                """
                SELECT * FROM tasks
                WHERE board_id = ? AND status = 'ready'
                  AND assignee_bot_id IS NOT NULL
                  AND (scheduled_at_ms IS NULL OR scheduled_at_ms <= ?)
                ORDER BY created_at_ms
                """,
                (board_id, now),
            ).fetchall()
            for task in ready_rows:
                if board_running[board_id] >= board_max:
                    break
                bot_id = str(task["assignee_bot_id"])
                bot = conn.execute("SELECT * FROM bots WHERE id = ?", (bot_id,)).fetchone()
                if bot is None:
                    continue
                bot_max = int(bot["max_concurrent"])
                if bot_id not in bot_running:
                    bot_running[bot_id] = conn.execute(
                        "SELECT COUNT(*) FROM tasks WHERE assignee_bot_id = ? AND status = 'running'",
                        (bot_id,),
                    ).fetchone()[0]
                if bot_running[bot_id] >= bot_max:
                    continue
                session_key = f"kanban:{task['id']}:{bot_id}"
                open_run = conn.execute(
                    """
                    SELECT id FROM task_runs
                    WHERE task_id = ? AND bot_id = ? AND status = 'running' AND finished_at_ms IS NULL
                    ORDER BY started_at_ms DESC LIMIT 1
                    """,
                    (task["id"], bot_id),
                ).fetchone()
                if open_run is None:
                    run_id = _new_id(None)
                    conn.execute(
                        """
                        INSERT INTO task_runs (
                            id, task_id, bot_id, session_key, status, started_at_ms
                        ) VALUES (?, ?, ?, ?, 'running', ?)
                        """,
                        (run_id, task["id"], bot_id, session_key, now),
                    )
                conn.execute(
                    "UPDATE tasks SET status = 'running', updated_at_ms = ? WHERE id = ?",
                    (now, task["id"]),
                )
                board_running[board_id] += 1
                bot_running[bot_id] += 1
                content = self._build_context_content(conn, task, bot)
                return {
                    "task_id": task["id"],
                    "board_id": task["board_id"],
                    "bot_id": bot_id,
                    "session_key": session_key,
                    "runtime_context": RuntimeContextBlock(source="kanban", content=content),
                }
        return None

    def claim_next_ready_task(self, now_ms: int | None = None) -> dict[str, Any] | None:
        now = now_ms if now_ms is not None else _now_ms()
        with self._lock, self._connect() as conn:
            board_running: dict[str, int] = {}
            bot_running: dict[str, int] = {}
            return self._claim_one_ready_task_locked(conn, now, board_running, bot_running)

    def claim_ready_tasks(self, now_ms: int | None = None) -> list[dict[str, Any]]:
        now = now_ms if now_ms is not None else _now_ms()
        claimed: list[dict[str, Any]] = []
        with self._lock, self._connect() as conn:
            board_running: dict[str, int] = {}
            bot_running: dict[str, int] = {}
            while True:
                one = self._claim_one_ready_task_locked(conn, now, board_running, bot_running)
                if one is None:
                    break
                claimed.append(one)
        return claimed

    def _finish_open_run(
        self,
        conn: sqlite3.Connection,
        task_id: str,
        *,
        summary: str = "",
        artifacts: list[str] | None = None,
        status: str = "done",
        error: str = "",
    ) -> None:
        now = _now_ms()
        art_json = _artifacts_json(artifacts or [])
        conn.execute(
            """
            UPDATE task_runs SET status = ?, summary = ?, artifacts_json = ?,
                finished_at_ms = ?, error = ?
            WHERE task_id = ? AND status = 'running' AND finished_at_ms IS NULL
            """,
            (status, summary, art_json, now, error, task_id),
        )

    def complete_task(
        self, task_id: str, summary: str, artifacts: list[str] | None = None
    ) -> dict[str, Any]:
        summary = _validate_prose(summary, max_len=MAX_DESCRIPTION, code="invalid_summary")
        arts = _parse_artifacts(artifacts or [])
        now = _now_ms()
        with self._lock, self._connect() as conn:
            task = self._task_or_404(conn, task_id)
            self._finish_open_run(conn, task_id, summary=summary, artifacts=arts, status="done")
            recurrence = str(task["recurrence_expr"] or "")
            every_match = re.fullmatch(r"every:(\d+)s", recurrence)
            if every_match:
                seconds = int(every_match.group(1))
                if 60 <= seconds <= 2592000:
                    scheduled = now + seconds * 1000
                    conn.execute(
                        """
                        UPDATE tasks SET status = 'todo', scheduled_at_ms = ?, summary = ?,
                            artifacts_json = ?, updated_at_ms = ?
                        WHERE id = ?
                        """,
                        (scheduled, summary, _artifacts_json(arts), now, task_id),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE tasks SET status = 'done', summary = ?, artifacts_json = ?,
                            updated_at_ms = ?
                        WHERE id = ?
                        """,
                        (summary, _artifacts_json(arts), now, task_id),
                    )
                    self._promote_ready_children(conn, task_id)
            else:
                conn.execute(
                    """
                    UPDATE tasks SET status = 'done', summary = ?, artifacts_json = ?,
                        updated_at_ms = ?
                    WHERE id = ?
                    """,
                    (summary, _artifacts_json(arts), now, task_id),
                )
                self._promote_ready_children(conn, task_id)
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_public(row)

    def request_review(
        self, task_id: str, summary: str, artifacts: list[str] | None = None
    ) -> dict[str, Any]:
        summary = _validate_prose(summary, max_len=MAX_DESCRIPTION, code="invalid_summary")
        arts = _parse_artifacts(artifacts or [])
        now = _now_ms()
        with self._lock, self._connect() as conn:
            self._task_or_404(conn, task_id)
            conn.execute(
                """
                UPDATE tasks SET status = 'review', summary = ?, artifacts_json = ?,
                    updated_at_ms = ?
                WHERE id = ?
                """,
                (summary, _artifacts_json(arts), now, task_id),
            )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_public(row)

    def review_verdict(
        self, task_id: str, approved: bool, feedback: str = ""
    ) -> dict[str, Any]:
        feedback = _validate_prose(feedback, max_len=MAX_MESSAGE, code="invalid_feedback")
        with self._lock, self._connect() as conn:
            task = self._task_or_404(conn, task_id)
            summary = str(task["summary"] or "")
            arts = _loads_artifacts(task["artifacts_json"])
            board_id = str(task["board_id"])
            reviewer_id = str(task["reviewer_bot_id"] or "reviewer")
        if approved:
            return self.complete_task(task_id, summary, arts)
        now = _now_ms()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE tasks SET status = 'ready', review_feedback = ?, updated_at_ms = ?
                WHERE id = ?
                """,
                (feedback, now, task_id),
            )
            msg_id = _new_id(None)
            conn.execute(
                """
                INSERT INTO board_messages (
                    id, board_id, task_id, author_type, author_id, author_name,
                    content, hop_count, created_at_ms
                ) VALUES (?, ?, ?, 'reviewer', ?, 'Reviewer', ?, 0, ?)
                """,
                (msg_id, board_id, task_id, reviewer_id, feedback or "Changes requested.", now),
            )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_public(row)

    def block_task(self, task_id: str, reason: str) -> dict[str, Any]:
        reason = _validate_prose(reason, max_len=MAX_DESCRIPTION, code="invalid_reason")
        now = _now_ms()
        with self._lock, self._connect() as conn:
            self._task_or_404(conn, task_id)
            conn.execute(
                """
                UPDATE tasks SET status = 'blocked', blocked_reason = ?, updated_at_ms = ?
                WHERE id = ?
                """,
                (reason, now, task_id),
            )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_public(row)

    def record_failure(self, task_id: str, error: str, *, transient: bool = False) -> dict[str, Any]:
        error = _validate_prose(error, max_len=MAX_DESCRIPTION, code="invalid_error")
        now = _now_ms()
        with self._lock, self._connect() as conn:
            task = self._task_or_404(conn, task_id)
            if transient:
                conn.execute(
                    "UPDATE tasks SET status = 'ready', updated_at_ms = ? WHERE id = ?",
                    (now, task_id),
                )
            else:
                retries = int(task["retries"]) + 1
                max_retries = int(task["max_retries"])
                if retries >= max_retries:
                    reason = f"Max retries ({max_retries}) exceeded: {error}"
                    conn.execute(
                        """
                        UPDATE tasks SET status = 'blocked', blocked_reason = ?,
                            retries = ?, updated_at_ms = ?
                        WHERE id = ?
                        """,
                        (reason, retries, now, task_id),
                    )
                    self._finish_open_run(conn, task_id, status="failed", error=error)
                else:
                    conn.execute(
                        "UPDATE tasks SET status = 'ready', retries = ?, updated_at_ms = ? WHERE id = ?",
                        (retries, now, task_id),
                    )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_public(row)

    def _resolve_mentions(self, conn: sqlite3.Connection, content: str) -> list[str]:
        bots = conn.execute("SELECT id, name FROM bots").fetchall()
        by_token: dict[str, str] = {}
        for bot in bots:
            by_token[str(bot["id"]).lower()] = str(bot["id"])
            name = str(bot["name"] or "").lower()
            if name:
                by_token[name] = str(bot["id"])
        triggered: list[str] = []
        seen: set[str] = set()
        for match in MENTION_RE.finditer(content):
            token = match.group(1).lower()
            bot_id = by_token.get(token)
            if bot_id and bot_id not in seen:
                seen.add(bot_id)
                triggered.append(bot_id)
        return triggered

    def post_message(
        self,
        board_id: str,
        content: str,
        *,
        author_type: str = "user",
        author_id: str = "user",
        author_name: str = "User",
        task_id: str | None = None,
        parent_hop_count: int = 0,
    ) -> dict[str, Any]:
        content = _validate_prose(content, max_len=MAX_MESSAGE, code="invalid_content")
        author_name = _validate_no_control(author_name, max_len=MAX_NAME, code="invalid_name")
        parent = parent_hop_count if isinstance(parent_hop_count, int) and not isinstance(parent_hop_count, bool) else 0
        parent = min(max(parent, 0), 10)
        hop_count = 0 if author_type == "user" else parent + 1
        with self._lock, self._connect() as conn:
            self._board_or_404(conn, board_id)
            if task_id:
                task = self._task_or_404(conn, task_id)
                if str(task["board_id"]) != board_id:
                    raise KanbanError(400, "invalid_task")
            triggered = self._resolve_mentions(conn, content) if hop_count < 3 else []
            # Bound LLM fan-out: a bot never wakes itself, a message wakes few bots, the queue stays small.
            if author_type == "bot":
                triggered = [b for b in triggered if b != author_id]
            pending = conn.execute("SELECT COUNT(*) FROM wakes").fetchone()[0]
            triggered = triggered[: max(0, min(MAX_MENTIONS_PER_MESSAGE, MAX_PENDING_WAKES - pending))]
            now = _now_ms()
            msg_id = _new_id(None)
            conn.execute(
                """
                INSERT INTO board_messages (
                    id, board_id, task_id, author_type, author_id, author_name,
                    content, hop_count, created_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (msg_id, board_id, task_id, author_type, author_id, author_name, content, hop_count, now),
            )
            if triggered:
                for bot_id in triggered:
                    wake_id = _new_id(None)
                    conn.execute(
                        """
                        INSERT INTO wakes (
                            id, bot_id, board_id, message_id, content, hop_count,
                            attempts, created_at_ms
                        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                        """,
                        (wake_id, bot_id, board_id, msg_id, content, hop_count, now),
                    )
            row = conn.execute("SELECT * FROM board_messages WHERE id = ?", (msg_id,)).fetchone()
        message = _row_dict(row)
        message["triggered_bots"] = triggered
        return message

    def take_wake(self) -> dict[str, Any] | None:
        """Oldest pending wake. It stays queued until finish_wake: a crash mid-turn retries it."""
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM wakes ORDER BY created_at_ms ASC LIMIT 1"
            ).fetchone()
            return _row_dict(row) if row is not None else None

    def finish_wake(self, wake_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM wakes WHERE id = ?", (wake_id,))

    def requeue_wake(self, wake: dict[str, Any], attempts: int) -> bool:
        """Retry a failed wake later (back of the queue). Returns True if dropped instead."""
        with self._lock, self._connect() as conn:
            if attempts > 2:
                conn.execute("DELETE FROM wakes WHERE id = ?", (wake["id"],))
                return True
            conn.execute(
                "UPDATE wakes SET attempts = ?, created_at_ms = ? WHERE id = ?",
                (attempts, _now_ms(), wake["id"]),
            )
        return False

    def recover_interrupted(self) -> list[str]:
        """After a gateway restart, no turn is running: count each 'running' task as a failed attempt."""
        with self._lock, self._connect() as conn:
            ids = [str(r["id"]) for r in conn.execute("SELECT id FROM tasks WHERE status = 'running'").fetchall()]
        for task_id in ids:
            self.record_failure(task_id, "interrupted by a gateway restart")
        return ids

    def board_snapshot(self, board_id: str) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            board = self._board_or_404(conn, board_id)
            tasks = conn.execute(
                "SELECT * FROM tasks WHERE board_id = ? ORDER BY created_at_ms",
                (board_id,),
            ).fetchall()
            links = conn.execute(
                """
                SELECT l.parent_id, l.child_id FROM task_links l
                JOIN tasks t ON t.id = l.child_id
                WHERE t.board_id = ?
                """,
                (board_id,),
            ).fetchall()
            messages = list(reversed(conn.execute(
                """
                SELECT * FROM board_messages WHERE board_id = ?
                ORDER BY created_at_ms DESC LIMIT 100
                """,
                (board_id,),
            ).fetchall()))
            bots = conn.execute("SELECT * FROM bots ORDER BY created_at_ms").fetchall()
            boards = conn.execute("SELECT * FROM boards ORDER BY created_at_ms").fetchall()
        return {
            "boards": [_row_dict(b) for b in boards],
            "active_board": _row_dict(board),
            "bots": [_row_dict(b) for b in bots],
            "tasks": [_task_public(t) for t in tasks],
            "links": [{"parent_id": r[0], "child_id": r[1]} for r in links],
            "messages": [_row_dict(m) for m in messages],
        }


def admin_authorized(secret: str, tokens: Any, request: Any) -> bool:
    if secret and issue_route_secret_matches(request.headers, secret):
        return True
    if hasattr(tokens, "check_api_token"):
        return bool(tokens.check_api_token(request))
    return False


def _router_admin_authorized(secret: str, router: Any, request: WsRequest) -> bool:
    if secret and issue_route_secret_matches(request.headers, secret):
        return True
    return bool(router.check_api_token(request))


def dispatch_kanban_get(router: Any, request: WsRequest, got: str) -> Response | None:
    if got != PREFIX and not got.startswith(PREFIX + "/"):
        return None
    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not _router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")
    _, query = parse_request_path(request.path)
    if got == PREFIX + "/task":
        task_id = query_first(query, "id")
        if not task_id:
            return http_json_response({"error": "invalid_id"}, status=400, extra_headers=[("Cache-Control", "no-store")])
        store = KanbanStore()
        try:
            payload = store.get_task_detail(task_id)
        except KanbanError as exc:
            return http_json_response({"error": exc.code}, status=exc.status, extra_headers=[("Cache-Control", "no-store")])
        return http_json_response(payload, extra_headers=[("Cache-Control", "no-store")])
    if got == PREFIX:
        store = KanbanStore()
        board_id = query_first(query, "board_id") or "main"
        try:
            payload = store.board_snapshot(board_id)
        except KanbanError as exc:
            return http_json_response({"error": exc.code}, status=exc.status, extra_headers=[("Cache-Control", "no-store")])
        return http_json_response(payload, extra_headers=[("Cache-Control", "no-store")])
    return http_json_response({"error": "not_found"}, status=404, extra_headers=[("Cache-Control", "no-store")])


async def _read_json(request: web.BaseRequest) -> dict[str, Any]:
    if request.content_length is not None and request.content_length > MAX_JSON_BODY_BYTES:
        raise KanbanError(413, "body_too_large")
    raw = await request.content.read(MAX_JSON_BODY_BYTES + 1)
    if len(raw) > MAX_JSON_BODY_BYTES:
        raise KanbanError(413, "body_too_large")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        raise KanbanError(400, "invalid_json") from None
    if not isinstance(data, dict):
        raise KanbanError(400, "invalid_json")
    return cast(dict[str, Any], data)


def kanban_post_handler(
    secret: str,
    tokens: Any,
    fallback: Callable[[web.BaseRequest], Awaitable[web.StreamResponse]],
) -> Callable[[web.BaseRequest], Awaitable[web.StreamResponse]]:
    async def handler(request: web.BaseRequest) -> web.StreamResponse:
        path = request.path
        if path != PREFIX and not path.startswith(PREFIX + "/"):
            return await fallback(request)
        response = await _handle_kanban_post(secret, tokens, request)
        response.headers["Cache-Control"] = "no-store"
        response.force_close()
        return response

    return handler


async def _handle_kanban_post(secret: str, tokens: Any, request: web.BaseRequest) -> web.StreamResponse:
    if request.method != "POST":
        return web.json_response({"error": "method_not_allowed"}, status=405)
    if not admin_authorized(secret, tokens, request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if request.headers.get("Content-Encoding") or request.headers.get("Transfer-Encoding"):
        return web.json_response({"error": "unsupported_framing"}, status=400)
    store = KanbanStore()
    path = request.path
    try:
        if path == PREFIX + "/bots/save":
            body = await _read_json(request)
            bot = store.save_bot(body)
            return web.json_response({"bot": bot})
        if path == PREFIX + "/bots/delete":
            body = await _read_json(request)
            bot_id = body.get("id")
            if not isinstance(bot_id, str):
                return web.json_response({"error": "invalid_id"}, status=400)
            store.delete_bot(bot_id.strip())
            return web.json_response({"ok": True})
        if path == PREFIX + "/boards/create":
            body = await _read_json(request)
            board = store.create_board(
                board_id=body.get("id"),
                title=str(body.get("title") or ""),
                description=str(body.get("description") or ""),
                max_concurrent=_bounded_int(
                    body.get("max_concurrent"), default=2, low=1, high=20, code="invalid_max_concurrent"
                ),
            )
            return web.json_response({"board": board}, status=201)
        if path == PREFIX + "/tasks/save":
            body = await _read_json(request)
            task = store.save_task(body)
            status = 201 if not body.get("id") else 200
            return web.json_response({"task": task}, status=status)
        if path == PREFIX + "/tasks/move":
            body = await _read_json(request)
            task_id = body.get("id")
            status_val = body.get("status")
            if not isinstance(task_id, str) or not isinstance(status_val, str):
                return web.json_response({"error": "invalid_request"}, status=400)
            task = store.move_task(task_id.strip(), status_val.strip())
            return web.json_response({"task": task})
        if path == PREFIX + "/tasks/delete":
            body = await _read_json(request)
            task_id = body.get("id")
            if not isinstance(task_id, str):
                return web.json_response({"error": "invalid_id"}, status=400)
            store.delete_task(task_id.strip())
            return web.json_response({"ok": True})
        if path == PREFIX + "/tasks/review":
            body = await _read_json(request)
            task_id = body.get("id")
            if not isinstance(task_id, str):
                return web.json_response({"error": "invalid_id"}, status=400)
            approved = body.get("approved")
            if not isinstance(approved, bool):
                return web.json_response({"error": "invalid_request"}, status=400)
            feedback = body.get("feedback") or ""
            if not isinstance(feedback, str):
                return web.json_response({"error": "invalid_feedback"}, status=400)
            task = store.review_verdict(task_id.strip(), approved, feedback)
            return web.json_response({"task": task})
        if path == PREFIX + "/messages/post":
            body = await _read_json(request)
            board_id = body.get("board_id")
            content = body.get("content")
            if not isinstance(board_id, str) or not isinstance(content, str):
                return web.json_response({"error": "invalid_request"}, status=400)
            task_id = body.get("task_id")
            tid = task_id.strip() if isinstance(task_id, str) and task_id.strip() else None
            message = store.post_message(board_id.strip(), content, task_id=tid)
            return web.json_response(message)
    except KanbanError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    return web.json_response({"error": "not_found"}, status=404)
