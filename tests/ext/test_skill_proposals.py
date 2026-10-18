"""Server tests for skill proposals (nanobot/ext/skill_proposals.py)."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from websockets.datastructures import Headers
from websockets.http11 import Request as WsRequest

from nanobot.agent.skills import SkillsLoader
from nanobot.cron.service import CronService
from nanobot.ext import skill_proposals
from nanobot.session.manager import SessionManager

MASTER = "master-token"


class _Tokens:
    def check_api_token(self, request: object) -> bool:
        headers = getattr(request, "headers", {})
        return headers.get("Authorization") == f"Bearer {MASTER}"


def _sessions(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace, SessionManager(workspace, sessions_root=tmp_path / "sessions")


def _router(workspace: Path):
    return SimpleNamespace(
        skills_workspace_path=str(workspace),
        config=SimpleNamespace(token_issue_secret="", token=MASTER),
        check_api_token=lambda r: getattr(r, "headers", {}).get("Authorization") == f"Bearer {MASTER}",
    )


def _get(path: str, auth: bool = True):
    headers = Headers([("Authorization", f"Bearer {MASTER}")] if auth else [])
    return WsRequest(path, headers)


class _MockAiohttpRequest:
    def __init__(
        self,
        path: str,
        body: dict | None = None,
        auth: bool = True,
        headers: dict | None = None,
        remote: str = "127.0.0.1",
    ):
        self.method = "POST"
        self.path = path
        raw_headers = dict(headers or {})
        if auth and "Authorization" not in raw_headers:
            raw_headers["Authorization"] = f"Bearer {MASTER}"
        self.headers = raw_headers
        self.remote = remote
        self.transport = None
        self._body = json.dumps(body or {}).encode("utf-8") if body is not None else b""
        self.content_length = len(self._body)

        class _Content:
            def __init__(self, data: bytes):
                self._data = data

            async def read(self, n: int = -1):
                return self._data

        self.content = _Content(self._body)


def test_proposal_written_only_under_skills_proposed_and_loader_ignores_it(tmp_path: Path):
    workspace, _ = _sessions(tmp_path)
    # Write a proposal via helper
    skill_proposals.write_proposal(
        workspace,
        name="test-skill",
        summary="A test skill summary",
        reason="Test reason",
        content="---\nname: test-skill\ndescription: Test description\n---\n# Test",
        source="chat",
    )

    # 1. Proposal is under skills-proposed/
    prop_dir = workspace / "skills-proposed" / "test-skill"
    assert prop_dir.is_dir()
    assert (prop_dir / "SKILL.md").exists()
    assert (prop_dir / "proposal.json").exists()

    meta = json.loads((prop_dir / "proposal.json").read_text(encoding="utf-8"))
    assert meta["name"] == "test-skill"
    assert meta["summary"] == "A test skill summary"
    assert meta["reason"] == "Test reason"
    assert meta["source"] == "chat"

    # 2. SkillsLoader does not list it
    loader = SkillsLoader(workspace)
    skills = loader.list_skills(filter_unavailable=False)
    assert not any(s["name"] == "test-skill" for s in skills)


def test_activate_moves_proposal_and_keeps_bak_on_updates(tmp_path: Path):
    workspace, _ = _sessions(tmp_path)
    # Existing active skill
    active_dir = workspace / "skills" / "my-skill"
    active_dir.mkdir(parents=True, exist_ok=True)
    (active_dir / "SKILL.md").write_text("old content", encoding="utf-8")

    # Create proposal as update
    skill_proposals.write_proposal(
        workspace,
        name="my-skill",
        summary="Updated skill",
        reason="New pattern",
        content="new content",
        source="chat",
    )
    meta = json.loads((workspace / "skills-proposed" / "my-skill" / "proposal.json").read_text(encoding="utf-8"))
    assert meta.get("updates") == "my-skill"

    # Activate
    result = skill_proposals.activate_proposal(workspace, "my-skill")
    assert result.get("ok") is True

    # Check active skill is updated
    assert (active_dir / "SKILL.md").read_text(encoding="utf-8") == "new content"
    # Check .bak exists
    assert (active_dir / "SKILL.md.bak").read_text(encoding="utf-8") == "old content"
    # Check proposal dir is removed
    assert not (workspace / "skills-proposed" / "my-skill").exists()


def test_activate_without_privilege_returns_403(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    workspace, sessions = _sessions(tmp_path)
    skill_proposals.write_proposal(
        workspace,
        name="remote-skill",
        summary="A remote proposal",
        reason="Remote test",
        content="content",
        source="chat",
    )

    # Monkeypatch privileged_request to return False
    monkeypatch.setattr(skill_proposals, "privileged_request", lambda conn, headers: False)

    handler = skill_proposals.skill_proposals_post_handler(
        MASTER, _Tokens(), lambda r: None, workspace=workspace, sessions=sessions
    )
    req = _MockAiohttpRequest("/api/ext/skills/proposals/remote-skill/activate", remote="192.168.1.50")
    import asyncio
    resp = asyncio.run(handler(req))
    assert resp.status == 403


def test_reject_deletes_proposal(tmp_path: Path):
    workspace, _ = _sessions(tmp_path)
    skill_proposals.write_proposal(
        workspace,
        name="reject-skill",
        summary="Will be rejected",
        reason="Test reject",
        content="content",
        source="chat",
    )
    assert (workspace / "skills-proposed" / "reject-skill").exists()

    res = skill_proposals.reject_proposal(workspace, "reject-skill")
    assert res.get("ok") is True
    assert not (workspace / "skills-proposed" / "reject-skill").exists()


def test_invalid_names_and_path_traversal_rejected(tmp_path: Path):
    workspace, _ = _sessions(tmp_path)
    for bad_name in ("../evil", "Uppercase", "has spaces", "bad/slash", "a" * 65, "", "-start", "end-"):
        with pytest.raises(skill_proposals.SkillProposalError) as exc:
            skill_proposals.get_proposal(workspace, bad_name)
        assert exc.value.status == 400


def test_scout_respects_cursor_and_cap_and_disabled_by_default(tmp_path: Path):
    workspace, sessions = _sessions(tmp_path)
    history_file = workspace / "memory" / "history.jsonl"
    history_file.parent.mkdir(parents=True, exist_ok=True)

    # 4 history entries
    entries = [
        {"cursor": 1, "timestamp": "2026-10-18 20:00", "content": "did step 1"},
        {"cursor": 2, "timestamp": "2026-10-18 21:00", "content": "did step 2"},
        {"cursor": 3, "timestamp": "2026-10-18 22:00", "content": "did step 3"},
        {"cursor": 4, "timestamp": "2026-10-18 23:00", "content": "did step 4"},
    ]
    history_file.write_text("\n".join(json.dumps(e) for e in entries) + "\n", encoding="utf-8")

    # Disabled by default: runner does nothing
    agent_mock = SimpleNamespace(
        sessions=sessions,
        context=SimpleNamespace(memory=SimpleNamespace(workspace=workspace)),
    )
    called = []

    async def fake_turn(prompt: str, tools=None, session_key=None):
        called.append(prompt)
        # Attempt to write 3 proposals
        if tools:
            tool = tools.get("write_proposal")
            if tool:
                await tool.execute(name="scout-1", summary="s1", reason="r1", content="c1")
                await tool.execute(name="scout-2", summary="s2", reason="r2", content="c2")
                await tool.execute(name="scout-3", summary="s3", reason="r3", content="c3")

    skill_proposals.bind_skill_proposals_turn(fake_turn)

    import asyncio
    asyncio.run(skill_proposals.run_scout_job(agent_mock))
    assert len(called) == 0  # Off by default

    # Enable scout
    skill_proposals.save_scout_settings(workspace, {"enabled": True})
    asyncio.run(skill_proposals.run_scout_job(agent_mock))

    assert len(called) == 1
    # Check 2 proposals max
    assert (workspace / "skills-proposed" / "scout-1").exists()
    assert (workspace / "skills-proposed" / "scout-2").exists()
    assert not (workspace / "skills-proposed" / "scout-3").exists()

    # Check cursor updated to 4
    cursor = int((workspace / "skills-proposed" / ".cursor").read_text(encoding="utf-8").strip())
    assert cursor == 4

    # Run again without new entries: turn is not called
    called.clear()
    asyncio.run(skill_proposals.run_scout_job(agent_mock))
    assert len(called) == 0


@pytest.mark.asyncio
async def test_propose_with_empty_or_nonreusable_chat_returns_null(tmp_path: Path):
    workspace, sessions = _sessions(tmp_path)
    s_empty = sessions.get_or_create("websocket:empty_chat")
    sessions.save(s_empty)

    s_non = sessions.get_or_create("websocket:non_reusable")
    s_non.messages.append({"role": "user", "content": "hello what time is it?", "timestamp": "2026-10-18T10:00:00"})
    s_non.messages.append({"role": "assistant", "content": "it is 10am", "timestamp": "2026-10-18T10:01:00"})
    sessions.save(s_non)

    # Empty chat returns proposal: null
    res = await skill_proposals.propose_from_chat(workspace, sessions, "websocket:empty_chat")
    assert res["proposal"] is None
    assert "reason" in res

    async def fake_non_reusable_turn(prompt: str, tools=None, session_key=None):
        return "Nothing reusable in this chat"

    skill_proposals.bind_skill_proposals_turn(fake_non_reusable_turn)
    res2 = await skill_proposals.propose_from_chat(workspace, sessions, "websocket:non_reusable")
    assert res2["proposal"] is None
    assert "reason" in res2


@pytest.mark.asyncio
async def test_routes_dispatch_get_and_post(tmp_path: Path):
    workspace, sessions = _sessions(tmp_path)
    router = _router(workspace)

    # 1. GET /api/ext/skills/proposals
    res_list = skill_proposals.dispatch_skill_proposals_get(router, _get("/api/ext/skills/proposals"), "/api/ext/skills/proposals")
    assert res_list is not None and res_list.status_code == 200
    assert json.loads(res_list.body.decode("utf-8"))["proposals"] == []

    # Write a proposal
    skill_proposals.write_proposal(
        workspace,
        name="demo-skill",
        summary="A demo",
        reason="Demo reason",
        content="demo content",
        source="chat",
    )

    # List again
    res_list2 = skill_proposals.dispatch_skill_proposals_get(router, _get("/api/ext/skills/proposals"), "/api/ext/skills/proposals")
    assert res_list2 is not None and res_list2.status_code == 200
    items = json.loads(res_list2.body.decode("utf-8"))["proposals"]
    assert len(items) == 1
    assert items[0]["name"] == "demo-skill"

    # Detail
    res_det = skill_proposals.dispatch_skill_proposals_get(router, _get("/api/ext/skills/proposals/demo-skill"), "/api/ext/skills/proposals/demo-skill")
    assert res_det is not None and res_det.status_code == 200
    det_body = json.loads(res_det.body.decode("utf-8"))
    assert det_body["name"] == "demo-skill"
    assert det_body["text"] == "demo content"

    # POST scout settings
    cron = CronService(tmp_path / "cron" / "jobs.json")
    handler = skill_proposals.skill_proposals_post_handler(
        MASTER, _Tokens(), lambda r: None, cron=cron, workspace=workspace, sessions=sessions, timezone="UTC"
    )
    res_scout = await handler(_MockAiohttpRequest("/api/ext/skills/scout", {"enabled": True}))
    assert json.loads(res_scout.text) == {"enabled": True}

    # GET scout
    res_scout_get = skill_proposals.dispatch_skill_proposals_get(router, _get("/api/ext/skills/scout"), "/api/ext/skills/scout")
    assert res_scout_get is not None and res_scout_get.status_code == 200
    assert json.loads(res_scout_get.body.decode("utf-8")) == {"enabled": True}
