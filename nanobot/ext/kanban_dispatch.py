"""In-process Kanban task and mention dispatch loop."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from typing import Any, cast

from loguru import logger

from nanobot.bus.events import InboundMessage
from nanobot.ext.kanban import KanbanStore, kanban_db_path
from nanobot.triggers.local_session_turns import LOCAL_TRIGGER_META


class KanbanTurnFailed(Exception):  # noqa: N818
    """Raised when a kanban turn stops with an error stop reason."""


_TASK_FOOTER = (
    "Reply with the outcome. You may call the kanban tool (action complete, request_review or block)."
)
_REVIEW_FOOTER = (
    "Reply with your review verdict using the kanban tool (action verdict, approved, feedback)."
)
_WAKE_PREFIX = "Board message for you:\n"
_WAKE_FAILURE_MESSAGE = "I couldn't reply to this message."
_TURN_FAILURE = "turn failed"
# A hung provider or tool must not freeze the single dispatcher (and its running task) forever.
TURN_TIMEOUT_S = 600


def _safe_prose(text: str, limit: int, *, fallback: str) -> str:
    cleaned = "".join(
        ch for ch in text if ch in "\n\r\t" or (ord(ch) >= 32 and ord(ch) != 127)
    ).strip()
    return (cleaned or fallback)[:limit]


def kanban_turn_message(session_key: str, content: str) -> InboundMessage:
    return InboundMessage(
        channel="system",
        sender_id="kanban",
        chat_id="kanban",
        content=content,
        session_key_override=session_key,
        metadata={
            LOCAL_TRIGGER_META: {
                "trigger_id": session_key,
                "trigger_name": "kanban",
                "delivery_id": uuid.uuid4().hex,
                "persist_content": content,
            },
        },
    )


def is_failed_turn(reply: Any) -> bool:
    if reply is None:
        return True
    if hasattr(reply, "finish_reason") and getattr(reply, "finish_reason") == "error":
        return True
    if hasattr(reply, "stop_reason") and getattr(reply, "stop_reason") == "error":
        return True
    if hasattr(reply, "error") and getattr(reply, "error"):
        return True
    if isinstance(reply, dict):
        d = cast(dict[str, Any], reply)
        if (
            d.get("finish_reason") == "error"
            or d.get("stop_reason") == "error"
            or bool(d.get("error"))
        ):
            return True
    return False


def turn_text_or_raise(response: Any) -> str:
    """Return the turn's reply text, or raise KanbanTurnFailed if it stopped with an error."""
    if response is None:
        return ""
    stop_reason = response.metadata.get("_stop_reason")
    if stop_reason in {"error", "tool_error"}:
        raise KanbanTurnFailed(f"turn stopped with {stop_reason}")
    return response.content


def _fail_claimed_turn(
    store: KanbanStore, task_id: str, bot_id: str, is_review: bool, error: str = _TURN_FAILURE
) -> None:
    if is_review:
        store.record_review_failure(task_id, bot_id, error)
    else:
        _fail_running_task(store, task_id)


async def dispatch_once(
    store: KanbanStore,
    run_turn: Callable[[str, str], Awaitable[str]],
    *,
    now_ms: int | None = None,
) -> None:
    claimed = store.claim_next_ready_task(now_ms)
    if claimed is not None:
        task_id = str(claimed["task_id"])
        bot_id = str(claimed["bot_id"])
        session_key = str(claimed["session_key"])
        is_review = bool(claimed.get("is_review"))
        ctx = claimed["runtime_context"]
        footer = _REVIEW_FOOTER if is_review else _TASK_FOOTER
        content = f"{ctx.content}\n{footer}"
        try:
            reply = await asyncio.wait_for(run_turn(session_key, content), TURN_TIMEOUT_S)
        except Exception:
            _fail_claimed_turn(store, task_id, bot_id, is_review)
            return
        if is_failed_turn(reply):
            _fail_claimed_turn(store, task_id, bot_id, is_review)
            return
        try:
            task = store.get_task_detail(task_id)["task"]
            if task["status"] == "running":
                store.complete_task(task_id, _safe_prose(reply, 8000, fallback="done"), [])
            elif task["status"] == "review":
                store.record_review_failure(task_id, bot_id, "reviewer completed turn without verdict")
        except Exception:
            _fail_claimed_turn(store, task_id, bot_id, is_review)
        return

    wake = store.take_wake()
    if wake is None:
        return

    wake_id = str(wake["id"])
    bot_id = str(wake["bot_id"])
    board_id = str(wake["board_id"])
    # One session per (board, bot): the bot keeps the board conversation, and disk
    # holds one session file per pair instead of one per mention.
    session_key = f"kanban:wake:{board_id}:{bot_id}"
    content = f"{_WAKE_PREFIX}{wake['content']}"
    try:
        reply = await asyncio.wait_for(run_turn(session_key, content), TURN_TIMEOUT_S)
    except Exception:
        _fail_wake(store, wake, bot_id, board_id)
        return
    if is_failed_turn(reply):
        _fail_wake(store, wake, bot_id, board_id)
        return

    author_name = _bot_display_name(store, bot_id)
    try:
        store.post_message(
            board_id,
            _safe_prose(reply, 4000, fallback=_WAKE_FAILURE_MESSAGE),
            author_type="bot",
            author_id=bot_id,
            author_name=author_name,
            parent_hop_count=int(wake["hop_count"]),
        )
    except Exception:
        _fail_wake(store, wake, bot_id, board_id)
        return
    store.finish_wake(wake_id)


def _fail_running_task(store: KanbanStore, task_id: str) -> None:
    task = store.get_task_detail(task_id)["task"]
    if task["status"] == "running":
        store.record_failure(task_id, _TURN_FAILURE)


def _fail_wake(store: KanbanStore, wake: dict[str, Any], bot_id: str, board_id: str) -> None:
    attempts = int(wake["attempts"]) + 1
    if not store.requeue_wake(wake, attempts):
        return
    store.post_message(
        board_id,
        _WAKE_FAILURE_MESSAGE,
        author_type="bot",
        author_id=bot_id,
        author_name=_bot_display_name(store, bot_id),
        parent_hop_count=int(wake["hop_count"]),
    )


def _bot_display_name(store: KanbanStore, bot_id: str) -> str:
    for bot in store.list_bots():
        if bot["id"] == bot_id:
            name = str(bot.get("name") or "").strip()
            return name or bot_id
    return bot_id


async def kanban_dispatch_loop(
    run_turn: Callable[[str, str], Awaitable[str]],
    *,
    interval_s: float = 30,
    stop: asyncio.Event,
    enabled: Callable[[], bool] = lambda: True,
) -> None:
    """Run one task or mention per tick.

    Idle (no DB, no seeding) until the board exists, i.e. the user opened Kanban once,
    and while ``agents.defaults.kanban_dispatch`` is off.
    """
    store: KanbanStore | None = None
    while not stop.is_set():
        try:
            if enabled() and (store is not None or kanban_db_path().exists()):
                if store is None:
                    store = KanbanStore()
                    if recovered := store.recover_interrupted():
                        logger.info("kanban: {} interrupted task(s) requeued after restart", len(recovered))
                await dispatch_once(store, run_turn)
        except Exception:
            logger.error("kanban dispatch failed")
        if stop.is_set():
            return
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_s)
            return
        except TimeoutError:
            pass
