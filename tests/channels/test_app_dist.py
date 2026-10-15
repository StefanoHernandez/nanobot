"""Opt-in folder for the exported app."""

from nanobot.channels.manager import _default_webui_dist


def test_app_dist_is_used_when_it_has_an_index(monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("app", encoding="utf-8")
    monkeypatch.setenv("NANOBOT_APP_DIST", str(tmp_path))
    assert _default_webui_dist() == tmp_path.resolve()


def test_bad_app_dist_does_not_replace_the_legacy_site(monkeypatch, tmp_path):
    missing = tmp_path / "missing"
    monkeypatch.setenv("NANOBOT_APP_DIST", str(missing))
    chosen = _default_webui_dist()
    assert chosen != missing.resolve()
    monkeypatch.delenv("NANOBOT_APP_DIST")
    assert _default_webui_dist() == chosen
