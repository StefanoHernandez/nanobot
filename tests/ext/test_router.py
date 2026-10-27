"""Fork ext router: POST chain and GET dispatch reach the right module."""

from __future__ import annotations

from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from aiohttp import web
from websockets.http11 import Response

from nanobot.ext.router import _GET_DISPATCH, _POST_CHAIN, dispatch_ext_get, ext_post_handler

_POST_PREFIXES: tuple[tuple[str, str, str], ...] = (
    ("nanobot.ext.projects", "projects_post_handler", "/api/ext/projects/x"),
    ("nanobot.ext.devices", "devices_post_handler", "/api/ext/devices/x"),
    ("nanobot.ext.kanban", "kanban_post_handler", "/api/ext/kanban/x"),
    ("nanobot.ext.approvals", "approvals_post_handler", "/api/ext/approvals/x"),
    ("nanobot.ext.costs", "costs_post_handler", "/api/ext/costs/x"),
    ("nanobot.ext.prompts", "prompts_post_handler", "/api/ext/prompts/x"),
    ("nanobot.ext.backup", "backup_post_handler", "/api/ext/backup/x"),
    ("nanobot.ext.journal", "journal_post_handler", "/api/ext/journal/x"),
    ("nanobot.ext.automations", "automations_post_handler", "/api/ext/automations/x"),
    ("nanobot.ext.skill_proposals", "skill_proposals_post_handler", "/api/ext/skills/x"),
)

_GET_CASES: tuple[tuple[str, str, str], ...] = (
    ("nanobot.ext.projects", "dispatch_projects_get", "/api/ext/projects"),
    ("nanobot.ext.memory_pages", "dispatch_memory_get", "/api/ext/memory/pages"),
    ("nanobot.ext.journal", "dispatch_journal_get", "/api/ext/journal/today"),
    ("nanobot.ext.devices", "dispatch_devices_get", "/api/ext/devices"),
    ("nanobot.ext.kanban", "dispatch_kanban_get", "/api/ext/kanban"),
    ("nanobot.ext.approvals", "dispatch_approvals_get", "/api/ext/approvals"),
    ("nanobot.ext.system", "dispatch_system_get", "/api/ext/system"),
    ("nanobot.ext.costs", "dispatch_costs_get", "/api/ext/costs"),
    ("nanobot.ext.prompts", "dispatch_prompts_get", "/api/ext/prompts"),
    ("nanobot.ext.backup", "dispatch_backup_get", "/api/ext/backup"),
    ("nanobot.ext.search", "dispatch_search_get", "/api/ext/search"),
    ("nanobot.ext.skill_proposals", "dispatch_skill_proposals_get", "/api/ext/skills"),
)


def _channel() -> SimpleNamespace:
    return SimpleNamespace(
        config=SimpleNamespace(token_issue_secret="", token="secret"),
        gateway=SimpleNamespace(
            tokens=object(),
            workspaces=object(),
            cron_service=object(),
            session_manager=object(),
        ),
    )


def _stub_post_factory(prefix: str, marker: str):
    def factory(*args, **_kwargs):
        fallback = args[2] if len(args) > 2 else args[-1]

        async def handler(request: web.BaseRequest) -> web.StreamResponse:
            if request.path == prefix or request.path.startswith(prefix + "/"):
                return web.Response(text=marker)
            return await fallback(request)

        return handler

    return factory


def _passthrough_post_factory(*args, **_kwargs):
    return args[2] if len(args) > 2 else args[-1]


def _get_response(marker: str) -> Response:
    return Response(200, "OK", [], marker.encode())


def _stub_get_dispatch(marker: str, prefix: str):
    def dispatch(_server, _request, got: str) -> Response | None:
        if got == prefix or got.startswith(prefix + "/"):
            return _get_response(marker)
        return None

    return dispatch


def _stub_get_dispatch_async(marker: str, prefix: str):
    async def dispatch(_server, _request, got: str) -> Response | None:
        if got == prefix or got.startswith(prefix + "/"):
            return _get_response(marker)
        return None

    return dispatch


def _enter_get_patches(stack: ExitStack, target: str, marker: str, prefix: str) -> None:
    for mod_name, factory_name, mode in _GET_DISPATCH:
        qual = f"{mod_name}.{factory_name}"
        if qual == target:
            if mode == "await":
                stack.enter_context(patch(qual, _stub_get_dispatch_async(marker, prefix)))
            else:
                stack.enter_context(patch(qual, _stub_get_dispatch(marker, prefix)))
        elif mode == "await":
            stack.enter_context(patch(qual, AsyncMock(return_value=None)))
        else:
            stack.enter_context(patch(qual, lambda *_a, **_k: None))


@pytest.mark.parametrize(("mod_name", "factory_name", "path"), _POST_PREFIXES)
@pytest.mark.asyncio
async def test_post_ext_prefix_reaches_module(mod_name: str, factory_name: str, path: str) -> None:
    marker = f"post-{factory_name}"
    target = f"{mod_name}.{factory_name}"
    prefix = path[: path.rfind("/")]

    async def fallback(_request: web.BaseRequest) -> web.StreamResponse:
        return web.Response(text="fallback")

    with ExitStack() as stack:
        for m, f in _POST_CHAIN:
            qual = f"{m}.{f}"
            if qual == target:
                stack.enter_context(patch(qual, _stub_post_factory(prefix, marker)))
            else:
                stack.enter_context(patch(qual, _passthrough_post_factory))
        handler = ext_post_handler(_channel(), fallback)
        response = await handler(SimpleNamespace(path=path))
    assert response.text == marker


@pytest.mark.asyncio
async def test_post_outside_ext_reaches_fallback() -> None:
    async def fallback(_request: web.BaseRequest) -> web.StreamResponse:
        return web.Response(text="fallback")

    with ExitStack() as stack:
        for m, f in _POST_CHAIN:
            stack.enter_context(patch(f"{m}.{f}", _passthrough_post_factory))
        handler = ext_post_handler(_channel(), fallback)
        response = await handler(SimpleNamespace(path="/api/upload"))
    assert response.text == "fallback"


@pytest.mark.parametrize(("mod_name", "factory_name", "path"), _GET_CASES)
@pytest.mark.asyncio
async def test_get_ext_prefix_reaches_module(mod_name: str, factory_name: str, path: str) -> None:
    marker = f"get-{factory_name}"
    target = f"{mod_name}.{factory_name}"

    with ExitStack() as stack:
        _enter_get_patches(stack, target, marker, path)
        response = await dispatch_ext_get(SimpleNamespace(), SimpleNamespace(), path)
    assert response is not None
    assert response.body.decode() == marker


@pytest.mark.asyncio
async def test_get_outside_ext_returns_none() -> None:
    with ExitStack() as stack:
        for m, f, mode in _GET_DISPATCH:
            qual = f"{m}.{f}"
            if mode == "await":
                stack.enter_context(patch(qual, AsyncMock(return_value=None)))
            else:
                stack.enter_context(patch(qual, lambda *_a, **_k: None))
        assert await dispatch_ext_get(SimpleNamespace(), SimpleNamespace(), "/api/sessions") is None
