"""Which web client the gateway serves (fork extension): our app (default) or the legacy WebUI.

The choice lives in ``~/.nanobot/ext_webui.json`` and is read at gateway start;
``nanobot ui legacy|app`` changes it (then restart the gateway). ``NANOBOT_APP_DIST``
still overrides both, for a locally built app.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Annotated, Literal

import typer

Mode = Literal["app", "legacy"]
MODES: tuple[Mode, ...] = ("app", "legacy")


def mode_file() -> Path:
    raw = os.environ.get("NANOBOT_WEBUI_MODE_FILE", "").strip()
    return Path(raw).expanduser() if raw else Path.home() / ".nanobot" / "ext_webui.json"


def get_mode() -> Mode:
    try:
        value = json.loads(mode_file().read_text(encoding="utf-8")).get("mode")
    except (OSError, ValueError, AttributeError):
        return "app"
    return value if value in MODES else "app"


def set_mode(mode: Mode) -> None:
    path = mode_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"mode": mode}), encoding="utf-8")
    os.replace(tmp, path)


def _usable(path: Path) -> bool:
    return path.is_dir() and (path / "index.html").is_file()


def bundled_app_dist() -> Path | None:
    """The app's web export shipped in the package (``build-arduino`` puts it in nanobot/web/app)."""
    candidate = Path(__file__).resolve().parent.parent / "web" / "app"
    return candidate if _usable(candidate) else None


def is_app_dist(path: Path | None) -> bool:
    """True for an Expo web export (our app), False for the legacy WebUI."""
    return path is not None and (path / "_expo").is_dir()


def ui_command(
    mode: Annotated[str | None, typer.Argument(help="app (default) or legacy; omit to show the current one")] = None,
) -> None:
    """Choose the web client the gateway serves: our app or the legacy WebUI."""
    if mode is None:
        current = get_mode()
        note = "" if current == "legacy" or bundled_app_dist() else " (app not bundled: legacy is served)"
        typer.echo(f"web client: {current}{note}")
        return
    if mode not in MODES:
        raise typer.BadParameter("use 'app' or 'legacy'")
    set_mode(mode)
    typer.echo(f"web client set to {mode}. Restart the gateway: nanobot gateway stop; nanobot gateway --background")
