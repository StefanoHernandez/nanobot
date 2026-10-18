"""Full-text search over chats, daily journal, and kanban cards."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast
from urllib.parse import parse_qs, urlsplit

from loguru import logger
from websockets.http11 import Request as WsRequest
from websockets.http11 import Response

from nanobot.config.paths import get_data_dir
from nanobot.ext.devices import router_admin_authorized
from nanobot.ext.kanban import kanban_db_path
from nanobot.session.history_visibility import is_hidden_history_message
from nanobot.session.keys import is_internal_session
from nanobot.session.location import SessionLocation
from nanobot.webui.http_utils import http_error, http_json_response

PREFIX = "/api/ext/search"
REFRESH_INTERVAL_SECONDS = 30.0
_DATE_FILE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")

_fts5_supported: bool | None = None


def check_fts5_available() -> bool:
    """Verify sqlite3 FTS5 extension is available."""
    global _fts5_supported
    if _fts5_supported is not None:
        return _fts5_supported
    try:
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE VIRTUAL TABLE _fts_check USING fts5(x)")
        conn.close()
        _fts5_supported = True
    except Exception as exc:
        logger.warning("SQLite FTS5 is not available: {}; full-text search is disabled", exc)
        _fts5_supported = False
    return _fts5_supported


def search_db_path() -> Path:
    """Resolve path to ext_search.db."""
    raw = os.environ.get("NANOBOT_SEARCH_DB", "").strip()
    if raw:
        return Path(raw).expanduser()
    return get_data_dir() / "ext_search.db"


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def escape_fts5_query(query: str) -> str:
    """Escape user input into a safe FTS5 query by quoting each term."""
    tokens = [t.strip('"') for t in query.split() if t.strip('"')]
    if not tokens:
        return ""
    return " ".join('"' + t.replace('"', '""') + '"' for t in tokens)


def _init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute(
        """CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
            source,
            ref UNINDEXED,
            title,
            body,
            ts UNINDEXED,
            tokenize='unicode61 remove_diacritics 2'
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS sync_state (
            source TEXT NOT NULL,
            item_id TEXT NOT NULL,
            version TEXT NOT NULL,
            PRIMARY KEY (source, item_id)
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS sync_meta (
            key TEXT PRIMARY KEY,
            val TEXT NOT NULL
        )"""
    )
    return conn


def _extract_message_text(record: dict[str, Any]) -> str:
    content = record.get("content")
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for raw_block in cast(list[object], content):
        if not isinstance(raw_block, dict):
            continue
        block = cast(dict[str, Any], raw_block)
        text = block.get("text")
        if block.get("type") == "text" and isinstance(text, str):
            parts.append(text)
    return "\n".join(parts).strip()


def _resolve_workspace(workspace: Path | str | None = None) -> Path:
    if workspace is not None:
        return Path(workspace).expanduser().resolve()
    raw = os.environ.get("NANOBOT_WORKSPACE", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    try:
        from nanobot.config.loader import load_config
        return load_config().workspace_path.expanduser().resolve()
    except Exception:
        return Path.cwd().resolve()


def _resolve_sessions_db(workspace: Path) -> Path | None:
    raw = os.environ.get("NANOBOT_SESSIONS_DB", "").strip()
    if raw:
        path = Path(raw).expanduser()
        if path.is_file():
            return path
    raw_dir = os.environ.get("NANOBOT_SESSIONS_DIR", "").strip()
    if raw_dir:
        path = Path(raw_dir).expanduser() / "sessions.sqlite3"
        if path.is_file():
            return path
    try:
        candidate = SessionLocation(workspace).sessions_dir / "sessions.sqlite3"
        if candidate.is_file():
            return candidate
    except Exception:
        pass
    fallback = workspace / "sessions" / "sessions.sqlite3"
    if fallback.is_file():
        return fallback
    return None


def _is_skip_session_key(key: str, metadata_str: str | None) -> bool:
    if not key or is_internal_session(key):
        return True
    if key.startswith("dream:") or key.startswith("journal:") or key.startswith("kanban:") or key == "heartbeat":
        return True
    if key.startswith("temp:"):
        return True
    if metadata_str:
        try:
            parsed: object = json.loads(metadata_str)
            if isinstance(parsed, dict):
                meta = cast(dict[str, Any], parsed)
                if meta.get("temporary") is True:
                    return True
        except Exception:
            pass
    return False


def refresh(
    workspace: Path | None = None,
    *,
    force: bool = False,
    db_path: Path | None = None,
) -> None:
    """Incrementally synchronize search index from chats, journal, and kanban."""
    if not check_fts5_available():
        return

    path = db_path or search_db_path()
    conn = _init_db(path)
    now = time.time()

    try:
        if not force:
            row = conn.execute("SELECT val FROM sync_meta WHERE key = 'last_sync'").fetchone()
            if row:
                try:
                    last_sync = float(row[0])
                    if now - last_sync < REFRESH_INTERVAL_SECONDS:
                        return
                except ValueError:
                    pass

        ws = _resolve_workspace(workspace)
        _sync_chats(conn, ws)
        _sync_journal(conn, ws)
        _sync_kanban(conn)

        conn.execute(
            "INSERT INTO sync_meta (key, val) VALUES ('last_sync', ?) ON CONFLICT(key) DO UPDATE SET val = excluded.val",
            (str(now),),
        )
        conn.commit()
    finally:
        conn.close()


def _sync_chats(search_conn: sqlite3.Connection, workspace: Path) -> None:
    sessions_db = _resolve_sessions_db(workspace)
    if not sessions_db or not sessions_db.is_file():
        return

    uri = f"file:{sessions_db}?mode=ro"
    try:
        s_conn = sqlite3.connect(uri, uri=True, timeout=5.0)
    except Exception as exc:
        logger.debug("Could not open sessions database in read-only mode: {}", exc)
        return

    try:
        cursor = s_conn.cursor()
        rows = cursor.execute("SELECT key, revision, updated_at, title, metadata FROM sessions").fetchall()
        valid_keys: set[str] = set()

        for key, revision, updated_at, title, metadata in rows:
            if _is_skip_session_key(key, metadata):
                continue
            valid_keys.add(key)
            version = f"{revision}:{updated_at}"

            curr = search_conn.execute(
                "SELECT version FROM sync_state WHERE source = 'chats' AND item_id = ?",
                (key,),
            ).fetchone()

            if curr is not None and curr[0] == version:
                continue

            # Session updated or new: re-index its messages
            escaped_key = _escape_like(key)
            search_conn.execute(
                "DELETE FROM docs WHERE source = 'chats' AND ref LIKE ? ESCAPE '\\'",
                (f"{escaped_key}#%",),
            )

            msg_cursor = s_conn.cursor()
            msgs = msg_cursor.execute(
                "SELECT position, record FROM messages WHERE session_key = ? ORDER BY position ASC",
                (key,),
            ).fetchall()

            doc_title = title.strip() or key
            for pos, raw_rec in msgs:
                try:
                    parsed: object = json.loads(raw_rec)
                except Exception:
                    continue
                if not isinstance(parsed, dict):
                    continue
                rec = cast(dict[str, Any], parsed)
                role = cast(object, rec.get("role"))
                if role not in {"user", "assistant"}:
                    continue
                if rec.get("_command") or is_hidden_history_message(rec):
                    continue
                body = _extract_message_text(rec)
                if not body:
                    continue
                ts_val = cast(object, rec.get("timestamp")) or updated_at or ""
                ts = str(ts_val)
                ref = f"{key}#{pos}"
                search_conn.execute(
                    "INSERT INTO docs (source, ref, title, body, ts) VALUES ('chats', ?, ?, ?, ?)",
                    (ref, doc_title, body, ts),
                )

            search_conn.execute(
                "INSERT INTO sync_state (source, item_id, version) VALUES ('chats', ?, ?) "
                "ON CONFLICT(source, item_id) DO UPDATE SET version = excluded.version",
                (key, version),
            )

        # Remove deleted sessions
        indexed = [
            r[0]
            for r in search_conn.execute("SELECT item_id FROM sync_state WHERE source = 'chats'").fetchall()
        ]
        for old_key in indexed:
            if old_key not in valid_keys:
                escaped_old = _escape_like(old_key)
                search_conn.execute(
                    "DELETE FROM docs WHERE source = 'chats' AND ref LIKE ? ESCAPE '\\'",
                    (f"{escaped_old}#%",),
                )
                search_conn.execute(
                    "DELETE FROM sync_state WHERE source = 'chats' AND item_id = ?",
                    (old_key,),
                )
    finally:
        s_conn.close()


def _sync_journal(search_conn: sqlite3.Connection, workspace: Path) -> None:
    journal_dir = workspace / "memory" / "journal"
    valid_files: set[str] = set()

    if journal_dir.is_dir():
        for file in journal_dir.iterdir():
            if not file.is_file() or not _DATE_FILE_RE.match(file.name):
                continue
            date_str = file.stem
            valid_files.add(file.name)
            try:
                mtime = file.stat().st_mtime
            except OSError:
                continue
            version = str(mtime)

            curr = search_conn.execute(
                "SELECT version FROM sync_state WHERE source = 'journal' AND item_id = ?",
                (file.name,),
            ).fetchone()

            if curr is not None and curr[0] == version:
                continue

            ref = f"journal:{date_str}"
            search_conn.execute("DELETE FROM docs WHERE source = 'journal' AND ref = ?", (ref,))

            try:
                content = file.read_text(encoding="utf-8").strip()
            except OSError:
                continue

            if content:
                title = f"Diario {date_str}"
                search_conn.execute(
                    "INSERT INTO docs (source, ref, title, body, ts) VALUES ('journal', ?, ?, ?, ?)",
                    (ref, title, content, date_str),
                )

            search_conn.execute(
                "INSERT INTO sync_state (source, item_id, version) VALUES ('journal', ?, ?) "
                "ON CONFLICT(source, item_id) DO UPDATE SET version = excluded.version",
                (file.name, version),
            )

    indexed = [
        r[0]
        for r in search_conn.execute("SELECT item_id FROM sync_state WHERE source = 'journal'").fetchall()
    ]
    for old_file in indexed:
        if old_file not in valid_files:
            date_str = old_file.removesuffix(".md")
            search_conn.execute("DELETE FROM docs WHERE source = 'journal' AND ref = ?", (f"journal:{date_str}",))
            search_conn.execute("DELETE FROM sync_state WHERE source = 'journal' AND item_id = ?", (old_file,))


def _sync_kanban(search_conn: sqlite3.Connection) -> None:
    k_path = kanban_db_path()
    if not k_path.is_file():
        return

    uri = f"file:{k_path}?mode=ro"
    try:
        k_conn = sqlite3.connect(uri, uri=True, timeout=5.0)
    except Exception as exc:
        logger.debug("Could not open kanban database in read-only mode: {}", exc)
        return

    try:
        cursor = k_conn.cursor()
        tasks = cursor.execute("SELECT id, title, description, summary, updated_at_ms FROM tasks").fetchall()
        valid_ids: set[str] = set()

        for task_id, title, description, summary, updated_at_ms in tasks:
            valid_ids.add(task_id)
            version = str(updated_at_ms)

            curr = search_conn.execute(
                "SELECT version FROM sync_state WHERE source = 'kanban' AND item_id = ?",
                (task_id,),
            ).fetchone()

            if curr is not None and curr[0] == version:
                continue

            ref = f"kanban:{task_id}"
            search_conn.execute("DELETE FROM docs WHERE source = 'kanban' AND ref = ?", (ref,))

            # Collect description, task summary, and run summaries
            body_parts: list[str] = []
            if description and description.strip():
                body_parts.append(description.strip())
            if summary and summary.strip():
                body_parts.append(summary.strip())

            runs = k_conn.execute(
                "SELECT summary FROM task_runs WHERE task_id = ? AND summary != ''",
                (task_id,),
            ).fetchall()
            for (run_summary,) in runs:
                if run_summary and run_summary.strip():
                    body_parts.append(run_summary.strip())

            body = "\n".join(body_parts).strip()
            date_str = datetime.fromtimestamp(updated_at_ms / 1000.0, tz=timezone.utc).isoformat() if updated_at_ms else ""

            if title or body:
                search_conn.execute(
                    "INSERT INTO docs (source, ref, title, body, ts) VALUES ('kanban', ?, ?, ?, ?)",
                    (ref, title.strip() or f"Task {task_id}", body, date_str),
                )

            search_conn.execute(
                "INSERT INTO sync_state (source, item_id, version) VALUES ('kanban', ?, ?) "
                "ON CONFLICT(source, item_id) DO UPDATE SET version = excluded.version",
                (task_id, version),
            )

        indexed = [
            r[0]
            for r in search_conn.execute("SELECT item_id FROM sync_state WHERE source = 'kanban'").fetchall()
        ]
        for old_id in indexed:
            if old_id not in valid_ids:
                search_conn.execute("DELETE FROM docs WHERE source = 'kanban' AND ref = ?", (f"kanban:{old_id}",))
                search_conn.execute("DELETE FROM sync_state WHERE source = 'kanban' AND item_id = ?", (old_id,))
    finally:
        k_conn.close()


def search(
    query: str,
    *,
    sources: list[str] | set[str] | tuple[str, ...] | None = None,
    limit: int = 20,
    workspace: Path | None = None,
    db_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Search documents across indexed sources using BM25 and highlighted snippets."""
    if not check_fts5_available():
        return []

    clean_query = query.strip()
    if not clean_query:
        return []

    fts_query = escape_fts5_query(clean_query)
    if not fts_query:
        return []

    # Refresh if needed
    refresh(workspace=workspace, db_path=db_path)

    path = db_path or search_db_path()
    if not path.is_file():
        return []

    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5.0)
    try:
        sql = (
            "SELECT source, ref, title, ts, "
            "snippet(docs, -1, '«', '»', '…', 15) as excerpt, "
            "bm25(docs) as rank "
            "FROM docs WHERE docs MATCH ?"
        )
        params: list[Any] = [fts_query]

        if sources:
            source_list = [s.strip() for s in sources if s.strip()]
            if source_list:
                placeholders = ",".join("?" for _ in source_list)
                sql += f" AND source IN ({placeholders})"
                params.extend(source_list)

        sql += " ORDER BY rank ASC LIMIT ?"
        params.append(max(1, limit))

        rows = conn.execute(sql, params).fetchall()
        results: list[dict[str, Any]] = []

        for source, ref, title, ts, excerpt, _rank in rows:
            item: dict[str, Any] = {
                "source": source,
                "ref": ref,
                "title": title,
                "snippet": excerpt,
                "excerpt": excerpt,
                "ts": ts,
                "date": ts,
            }
            if source == "chats":
                if "#" in ref:
                    session_key, pos_str = ref.rsplit("#", 1)
                    item["session_key"] = session_key
                    item["position"] = int(pos_str) if pos_str.isdigit() else 0
                else:
                    item["session_key"] = ref
                    item["position"] = 0
            elif source == "journal":
                item["date"] = ref.removeprefix("journal:")
            elif source == "kanban":
                item["task_id"] = ref.removeprefix("kanban:")

            results.append(item)

        return results
    except Exception as exc:
        logger.warning("FTS search failed for query {!r}: {}", fts_query, exc)
        return []
    finally:
        conn.close()


def dispatch_search_get(router: Any, request: WsRequest, got: str) -> Response | None:
    """Handle GET /api/ext/search route."""
    if got != PREFIX:
        return None

    secret = router.config.token_issue_secret.strip() or router.config.token.strip()
    if not router_admin_authorized(secret, router, request):
        return http_error(401, "Unauthorized")

    query_params = parse_qs(urlsplit(request.path).query)
    q = (query_params.get("q") or [""])[0].strip()
    sources_param = (query_params.get("sources") or [None])[0]
    sources = [s.strip() for s in sources_param.split(",") if s.strip()] if sources_param else None
    limit_param = (query_params.get("limit") or ["20"])[0]
    limit = int(limit_param) if limit_param.isdigit() else 20

    workspace = Path(router.skills_workspace_path) if hasattr(router, "skills_workspace_path") else None
    results = search(q, sources=sources, limit=limit, workspace=workspace)

    return http_json_response(
        {"results": results, "query": q},
        extra_headers=[("Cache-Control", "no-store")],
    )
