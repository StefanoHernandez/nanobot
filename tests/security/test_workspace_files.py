"""Gateway-side reads and writes under the workspace never follow agent-made symlinks."""

from __future__ import annotations

from nanobot.security.workspace_policy import read_workspace_text, write_workspace_text


def test_write_replaces_a_symlinked_file_instead_of_following_it(tmp_path):
    ws = tmp_path / "ws"
    (ws / "memory" / "journal").mkdir(parents=True)
    secret = tmp_path / "config.json"
    secret.write_text("SECRET", encoding="utf-8")
    link = ws / "memory" / "journal" / "2026-10-19.md"
    link.symlink_to(secret)
    assert write_workspace_text(ws, link, "diary") is True
    assert secret.read_text(encoding="utf-8") == "SECRET"
    assert not link.is_symlink() and link.read_text(encoding="utf-8") == "diary"


def test_write_refuses_a_symlinked_parent(tmp_path):
    ws = tmp_path / "ws"
    (ws / "memory").mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    (ws / "memory" / "journal").symlink_to(outside)
    assert write_workspace_text(ws, ws / "memory" / "journal" / "x.md", "x") is False
    assert list(outside.iterdir()) == []


def test_read_refuses_symlinks_and_reads_regular_files(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    secret = tmp_path / "config.json"
    secret.write_text("SECRET", encoding="utf-8")
    (ws / "link.md").symlink_to(secret)
    (ws / "ok.md").write_text("hello", encoding="utf-8")
    assert read_workspace_text(ws, ws / "link.md") is None
    assert read_workspace_text(ws, ws / "ok.md") == "hello"
