"""In-process Kanban task and mention dispatch loop."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable

from loguru import logger

from nanobot.bus.events import InboundMessage
from nanobot.ext.kanban import KanbanStore, kanban_db_path
from nanobot.triggers.local_session_turns import LOCAL_TRIGGER_META

_TASK_FOOTER = (
    "Reply with the outcome. You may call kanban_complete, kanban_request_review, or kanban_block."
)
_WAKE_PREFIX = "Board message for you:\n"
_WAKE_FAILURE_MESSAGE = "Non sono riuscito a rispondere."
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


async def dispatch_once(
    store: KanbanStore,
    run_turn: Callable[[str, str], Awaitable[str]],
    *,
    now_ms: int | None = None,
) -> None:
    claimed = store.claim_next_ready_task(now_ms)
    if claimed is not None:
        task_id = str(claimed["task_id"])
        session_key = str(claimed["session_key"])
        ctx = claimed["runtime_context"]
        content = f"{ctx.content}\n{_TASK_FOOTER}"
        try:
            reply = await asyncio.wait_for(run_turn(session_key, content), TURN_TIMEOUT_S)
        except Exception:
            _fail_running_task(store, task_id)
            return
        try:
            task = store.get_task_detail(task_id)["task"]
            if task["status"] == "running":
                store.complete_task(task_id, _safe_prose(reply, 8000, fallback="done"), [])
        except Exception:
            _fail_running_task(store, task_id)
        return

    wake = store.take_wake()
    if wake is None:
        return

    wake_id = str(wake["id"])
    bot_id = str(wake["bot_id"])
    board_id = str(wake["board_id"])
    session_key = f"kanban:wake:{wake_id}:{bot_id}"
    content = f"{_WAKE_PREFIX}{wake['content']}"
    try:
        reply = await asyncio.wait_for(run_turn(session_key, content), TURN_TIMEOUT_S)
    except Exception:
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


def _fail_running_task(store: KanbanStore, task_id: str) -> None:
    task = store.get_task_detail(task_id)["task"]
    if task["status"] == "running":
        store.record_failure(task_id, _TURN_FAILURE)


def _fail_wake(store: KanbanStore, wake: dict, bot_id: str, board_id: str) -> None:
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
                store = store or KanbanStore()
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
