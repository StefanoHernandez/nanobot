"""Projects fork module: store rules and both HTTP faces (GET via router hook, POST via bridge)."""

import json
import os
from collections import namedtuple
from pathlib import Path
from types import SimpleNamespace

import aiohttp
import pytest
from aiohttp import web
from websockets.asyncio.server import serve
from websockets.datastructures import Headers
from websockets.http11 import Request as WsRequest

from nanobot.channels.websocket.binary_http import BinaryHTTPBridge
from nanobot.ext import projects as proj
from nanobot.ext.projects import ProjectError, ProjectStore

TOKEN = "api-token-test"


async def _chunks(data: bytes, size: int = 7):
    for i in range(0, len(data), size):
        yield data[i : i + size]


@pytest.fixture
def store(tmp_path):
    return ProjectStore(tmp_path / "projects")


# ---- store -------------------------------------------------------------------


def test_create_list_get_update(store):
    p = store.create("Tesi di laurea", description="capitoli", instructions="Rispondi in italiano.")
    assert p["id"] == "tesi-di-laurea"
    assert Path(p["path"]).is_dir()
    assert (Path(p["path"]) / "AGENTS.md").read_text(encoding="utf-8") == "Rispondi in italiano."
    assert [x["id"] for x in store.list()] == ["tesi-di-laurea"]

    project, instructions, files, truncated = store.get("tesi-di-laurea")
    assert project["name"] == "Tesi di laurea" and project["description"] == "capitoli"
    assert instructions == "Rispondi in italiano." and files == [] and truncated is False

    updated, text = store.update("tesi-di-laurea", name="Tesi", instructions="Nuove istruzioni")
    assert updated["name"] == "Tesi" and text == "Nuove istruzioni"
    assert updated["updated_at"] >= p["updated_at"]


def test_ids_are_unique_slugs(store):
    assert store.create("Casa")["id"] == "casa"
    assert store.create("casa")["id"] == "casa-2"
    assert store.create("Città & Mare!")["id"] == "citta-mare"
    assert store.create("???")["id"] == "progetto"


@pytest.mark.parametrize("name", ["", "   ", "x" * 121])
def test_create_rejects_bad_names(store, name):
    with pytest.raises(ProjectError):
        store.create(name)


def test_archive_moves_never_deletes(store):
    p = store.create("Vecchio")
    store.archive("vecchio")
    assert store.list() == []
    archived = list((store.root / ".archive").iterdir())
    assert len(archived) == 1 and archived[0].name.startswith("vecchio-")
    assert not Path(p["path"]).exists()


@pytest.mark.parametrize(
    "rel",
    ["../x", "/etc/passwd", "a/../../x", "a\\b", "", "a//b", ".git/config", "a/.hidden", "AGENTS.md", "project.json", "x\0y"],
)
def test_unsafe_paths_rejected(store, rel):
    store.create("P")
    with pytest.raises(ProjectError):
        store.resolve_file("p", rel, for_write=True)


def test_unknown_or_unsafe_project_id(store):
    for bad in ["nope", "../projects", ".archive", "A"]:
        with pytest.raises(ProjectError):
            store.get(bad)


def test_symlink_escape_rejected(store, tmp_path):
    p = store.create("P")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("s")
    os.symlink(outside, Path(p["path"]) / "link")
    with pytest.raises(ProjectError):
        store.resolve_file("p", "link/secret.txt")


@pytest.mark.asyncio
async def test_upload_list_overwrite_delete(store):
    store.create("P")
    data = b"hello project"
    entry = await store.save_upload("p", "docs/a.txt", _chunks(data), len(data), overwrite=False)
    assert entry == {"path": "docs/a.txt", "size": len(data), "modified_at": entry["modified_at"]}
    _, _, files, _ = store.get("p")
    assert [f["path"] for f in files] == ["docs/a.txt"]
    assert store.list()[0]["file_count"] == 1 and store.list()[0]["size_bytes"] == len(data)

    with pytest.raises(ProjectError) as exists:
        await store.save_upload("p", "docs/a.txt", _chunks(b"x"), 1, overwrite=False)
    assert exists.value.status == 409
    await store.save_upload("p", "docs/a.txt", _chunks(b"new"), 3, overwrite=True)
    assert store.resolve_file("p", "docs/a.txt").read_bytes() == b"new"

    store.delete_file("p", "docs/a.txt")
    assert store.get("p")[2] == []


@pytest.mark.asyncio
async def test_upload_size_mismatch_leaves_nothing(store):
    store.create("P")
    with pytest.raises(ProjectError):
        await store.save_upload("p", "a.bin", _chunks(b"12345"), 3, overwrite=False)
    with pytest.raises(ProjectError):
        await store.save_upload("p", "b.bin", _chunks(b"12"), 3, overwrite=False)
    root = Path(store.get("p")[0]["path"])
    assert sorted(x.name for x in root.iterdir()) == ["AGENTS.md", "project.json"]


@pytest.mark.asyncio
async def test_upload_limits(store, monkeypatch):
    store.create("P")
    with pytest.raises(ProjectError) as big:
        await store.save_upload("p", "a.bin", _chunks(b""), proj.MAX_UPLOAD_BYTES + 1, overwrite=False)
    assert big.value.status == 413
    Usage = namedtuple("Usage", "total used free")
    monkeypatch.setattr(proj.shutil, "disk_usage", lambda _p: Usage(10, 0, proj.MIN_FREE_BYTES))
    with pytest.raises(ProjectError) as full:
        await store.save_upload("p", "a.bin", _chunks(b"x"), 1, overwrite=False)
    assert full.value.status == 507


def test_listing_caps_and_skips_hidden(store, monkeypatch):
    p = store.create("P")
    root = Path(p["path"])
    (root / ".git").mkdir()
    (root / ".git" / "HEAD").write_text("x")
    for i in range(5):
        (root / f"f{i}.txt").write_text("x")
    monkeypatch.setattr(proj, "MAX_LIST_FILES", 3)
    _, _, files, truncated = store.get("p")
    assert len(files) == 3 and truncated is True
    assert all(not f["path"].startswith(".") for f in files)


# ---- GET face (router hook) ----------------------------------------------------


class _Tokens:
    def check_api_token(self, request):
        return request.headers.get("Authorization") == f"Bearer {TOKEN}"


def _router(tmp_path):
    scope = SimpleNamespace(project_path=tmp_path)
    return SimpleNamespace(tokens=_Tokens(), workspaces=SimpleNamespace(default_scope=lambda: scope))


def _get(path: str, *, auth=True, extra=()):
    headers = [("Authorization", f"Bearer {TOKEN}")] if auth else []
    return WsRequest(path, Headers([*headers, *extra]))


def _json(resp):
    return json.loads(resp.body.decode("utf-8"))


def test_get_routes(tmp_path):
    router = _router(tmp_path)
    s = ProjectStore(tmp_path / "projects")
    s.create("Alpha", instructions="ciao")
    (Path(s.get("alpha")[0]["path"]) / "n.txt").write_bytes(b"0123456789")

    assert proj.dispatch_projects_get(router, _get("/api/other"), "/api/other") is None
    assert proj.dispatch_projects_get(router, _get("/api/ext/projects", auth=False), "/api/ext/projects").status_code == 401

    listing = _json(proj.dispatch_projects_get(router, _get("/api/ext/projects"), "/api/ext/projects"))
    assert [p["id"] for p in listing["projects"]] == ["alpha"]

    detail = _json(proj.dispatch_projects_get(router, _get("/api/ext/projects/alpha"), "/api/ext/projects/alpha"))
    assert detail["instructions"] == "ciao" and [f["path"] for f in detail["files"]] == ["n.txt"]

    full = proj.dispatch_projects_get(router, _get("/api/ext/projects/alpha/file?path=n.txt"), "/api/ext/projects/alpha/file")
    assert full.status_code == 200 and full.body == b"0123456789"

    part = proj.dispatch_projects_get(
        router, _get("/api/ext/projects/alpha/file?path=n.txt", extra=[("Range", "bytes=2-4")]), "/api/ext/projects/alpha/file"
    )
    assert part.status_code == 206 and part.body == b"234"

    bad = proj.dispatch_projects_get(router, _get("/api/ext/projects/alpha/file?path=../x"), "/api/ext/projects/alpha/file")
    assert bad.status_code == 400
    missing = proj.dispatch_projects_get(router, _get("/api/ext/projects/zzz"), "/api/ext/projects/zzz")
    assert missing.status_code == 404


def test_byte_range_parser():
    assert proj._byte_range("bytes=0-0", 10) == (0, 0)
    assert proj._byte_range("bytes=5-", 10) == (5, 9)
    assert proj._byte_range("bytes=-3", 10) == (7, 9)
    assert proj._byte_range("bytes=8-100", 10) == (8, 9)
    for bad in ["bytes=10-", "bytes=5-2", "bytes=-", "items=0-1", "bytes=0-1,3-4"]:
        with pytest.raises(ValueError):
            proj._byte_range(bad, 10)


def test_full_get_too_large_needs_range(tmp_path, monkeypatch):
    router = _router(tmp_path)
    s = ProjectStore(tmp_path / "projects")
    s.create("A")
    (Path(s.get("a")[0]["path"]) / "big.bin").write_bytes(b"x" * 100)
    monkeypatch.setattr(proj, "MAX_FULL_GET_BYTES", 10)
    resp = proj.dispatch_projects_get(router, _get("/api/ext/projects/a/file?path=big.bin"), "/api/ext/projects/a/file")
    assert resp.status_code == 413


# ---- POST face (real socket through BinaryHTTPBridge) ----------------------------


@pytest.mark.asyncio
async def test_post_routes_over_bridge(tmp_path):
    fallback_hits = []

    async def fallback(request):
        fallback_hits.append(request.path)
        return web.json_response({"fallback": True})

    handler = proj.projects_post_handler(_Tokens(), SimpleNamespace(default_scope=lambda: SimpleNamespace(project_path=tmp_path)), fallback)
    bridge = BinaryHTTPBridge(handler)

    async def noop(connection):
        await connection.wait_closed()

    server = await serve(noop, "127.0.0.1", 0, create_connection=bridge.connection_factory)
    base = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
    auth = {"Authorization": f"Bearer {TOKEN}"}
    try:
        async with aiohttp.ClientSession() as c:
            async with c.post(f"{base}/api/attachments", data=b"x") as r:
                assert (await r.json()) == {"fallback": True}
            async with c.post(f"{base}/api/ext/projects", json={"name": "Beta"}) as r:
                assert r.status == 401
            async with c.post(f"{base}/api/ext/projects", json={"name": "Beta", "instructions": "i"}, headers=auth) as r:
                assert r.status == 201
                project = (await r.json())["project"]
                assert project["id"] == "beta"
            body = os.urandom(200_000)
            async with c.post(f"{base}/api/ext/projects/beta/files?path=data/x.bin", data=body, headers=auth) as r:
                assert r.status == 201, await r.text()
                assert (await r.json())["file"]["size"] == len(body)
            assert (Path(project["path"]) / "data" / "x.bin").read_bytes() == body
            async with c.post(f"{base}/api/ext/projects/beta/files?path=../evil", data=b"x", headers=auth) as r:
                assert r.status == 400
            async with c.post(f"{base}/api/ext/projects/beta/update", json={"description": "d"}, headers=auth) as r:
                assert (await r.json())["project"]["description"] == "d"
            async with c.post(f"{base}/api/ext/projects/beta/files/delete", json={"path": "data/x.bin"}, headers=auth) as r:
                assert (await r.json()) == {"ok": True}
            async with c.post(f"{base}/api/ext/projects/beta/archive", headers=auth) as r:
                assert (await r.json()) == {"ok": True}
        assert fallback_hits == ["/api/attachments"]
        assert not (tmp_path / "projects" / "beta").exists()
    finally:
        server.close()
        await server.wait_closed()
        await bridge.shutdown()
