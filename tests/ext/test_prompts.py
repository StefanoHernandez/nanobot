"""Prompt library store and HTTP."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from nanobot.ext import prompts as pr


@pytest.fixture(autouse=True)
def prompts_file(tmp_path, monkeypatch):
    path = tmp_path / "prompts.json"
    monkeypatch.setenv("NANOBOT_PROMPTS_FILE", str(path))
    return path


def test_variables_are_deduplicated_in_order():
    assert pr.variables("Hi {{ name }}, {{lang}} and {{name}} {{bad-one}}") == ["name", "lang"]


def test_global_and_project_scoping(prompts_file):
    g = pr.save_prompt({"title": "Global", "body": "Translate {{text}}"})
    p = pr.save_prompt({"title": "Proj", "body": "Review", "project_id": "alpha"})
    pr.save_prompt({"title": "Other", "body": "x", "project_id": "beta"})
    assert [x["title"] for x in pr.list_prompts()] == ["Global"]
    assert {x["id"] for x in pr.list_prompts("alpha")} == {g["id"], p["id"]}
    assert g["variables"] == ["text"]
    assert prompts_file.stat().st_mode & 0o777 == 0o600


def test_edit_used_and_delete(monkeypatch):
    clock = iter(range(1000, 2000))
    monkeypatch.setattr(pr.time, "time", lambda: next(clock))
    a = pr.save_prompt({"title": "A", "body": "a"})
    b = pr.save_prompt({"title": "B", "body": "b"})
    pr.mark_used(a["id"])
    assert pr.list_prompts()[0]["id"] == a["id"]  # recently used first
    pr.save_prompt({"id": b["id"], "title": "B2", "body": "b2"})
    assert pr.list_prompts()[0]["title"] == "B2"
    pr.delete_prompt(a["id"])
    assert [x["id"] for x in pr.list_prompts()] == [b["id"]]
    with pytest.raises(pr.PromptError):
        pr.delete_prompt(a["id"])


@pytest.mark.parametrize(
    "body",
    [{"title": "", "body": "x"}, {"title": "t", "body": " "}, {"title": "t", "body": "a\0b"},
     {"title": "t", "body": "x", "project_id": 3}, {"title": "t" * 121, "body": "x"},
     {"id": "missing", "title": "t", "body": "x"}],
)
def test_invalid_bodies(body):
    with pytest.raises(pr.PromptError):
        pr.save_prompt(body)


def _post(path, body, auth):
    raw = json.dumps(body).encode("utf-8")

    class _Content:
        @staticmethod
        async def read(_limit: int) -> bytes:
            return raw

    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    return SimpleNamespace(method="POST", path=pr.PREFIX + path, headers=headers,
                           content_length=len(raw), content=_Content())


class _Tokens:
    def check_api_token(self, request):
        return request.headers.get("Authorization") == "Bearer api"


async def _fallback(_request):
    raise AssertionError("fallback should not run")


async def test_http_save_and_delete():
    handler = pr.prompts_post_handler("master", _Tokens(), _fallback)
    assert (await handler(_post("/save", {"title": "t", "body": "b"}, None))).status == 401
    ok = await handler(_post("/save", {"title": "t", "body": "b"}, "api"))
    pid = json.loads(ok.text)["prompt"]["id"]
    assert (await handler(_post("/save", {"title": "", "body": "b"}, "api"))).status == 400
    assert (await handler(_post("/delete", {"id": pid}, "api"))).status == 200
    assert (await handler(_post("/delete", {"id": pid}, "api"))).status == 404
