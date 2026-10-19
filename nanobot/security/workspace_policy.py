"""Workspace path boundary helpers.

These helpers are application-level guards.  They make path decisions
consistent across tools, but they are not a replacement for an OS sandbox.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

WORKSPACE_BOUNDARY_NOTE = (
    " (this is a hard policy boundary, not a transient failure; "
    "do not retry with shell tricks or alternative tools, and ask "
    "the user how to proceed if the resource is genuinely required)"
)


class WorkspaceBoundaryError(PermissionError):
    """Raised when a requested path escapes an allowed workspace boundary."""


def resolve_path(path: str | Path, workspace: str | Path | None = None, *, strict: bool = False) -> Path:
    """Resolve *path*, interpreting relative paths against *workspace* when set."""
    candidate = Path(path).expanduser()
    if not candidate.is_absolute() and workspace is not None:
        candidate = Path(workspace).expanduser() / candidate
    return candidate.resolve(strict=strict)


def _resolve_logical_path(path: str | Path, workspace: str | Path | None = None) -> Path:
    """Return an absolute normalized path without following symlinks."""
    candidate = Path(path).expanduser()
    if not candidate.is_absolute() and workspace is not None:
        candidate = Path(workspace).expanduser() / candidate
    return Path(os.path.abspath(candidate))


def _path_key(path: str | Path) -> str:
    return os.path.normcase(os.fspath(path))


def is_path_within(path: str | Path, root: str | Path) -> bool:
    """Return True when *path* resolves to *root* or a descendant of *root*."""
    try:
        resolved_path = Path(path).expanduser().resolve(strict=False)
        resolved_root = Path(root).expanduser().resolve(strict=False)
        resolved_path.relative_to(resolved_root)
        return True
    except (OSError, RuntimeError, TypeError, ValueError):
        return False


def safe_workspace_file(root: str | Path, path: str | Path) -> Path | None:
    """Return *path* as a Path if it is a regular file within *root* and not a symlink.

    Returns None if *path* does not exist, is a symlink, is not a regular file,
    or resolves outside of *root*.
    """
    try:
        r = Path(root).expanduser().resolve(strict=False)
        p = Path(path).expanduser()
        if not p.is_absolute():
            p = r / p
        if p.is_symlink():
            return None
        resolved = p.resolve(strict=False)
        if not resolved.is_relative_to(r):
            return None
        if not p.is_file():
            return None
        return p
    except (OSError, RuntimeError, ValueError):
        return None


def read_workspace_text(root: str | Path, path: str | Path) -> str | None:
    """Read a regular file under *root* without following a symlink swapped in after the check."""
    safe = safe_workspace_file(root, path)
    if safe is None:
        return None
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(safe, flags)
    except OSError:
        return None
    try:
        import stat

        if not stat.S_ISREG(os.fstat(fd).st_mode):
            return None
        with os.fdopen(fd, "rb") as fh:
            fd = -1
            return fh.read().decode("utf-8")
    except (OSError, UnicodeError):
        return None
    finally:
        if fd != -1:
            os.close(fd)


def read_workspace_file(root: str | Path, path: str | Path) -> str:
    """Like :func:`read_workspace_text`, raising ``OSError`` instead of returning ``None``."""
    text = read_workspace_text(root, path)
    if text is None:
        raise OSError(f"not a readable workspace file: {path}")
    return text


def write_workspace_text(root: str | Path, path: str | Path, text: str) -> bool:
    """Write *text* to *path* under *root*, refusing symlinked parents.

    The file is replaced atomically, so a symlink at *path* is swapped out, never followed.
    """
    try:
        r = Path(root).expanduser().resolve(strict=False)
        p = Path(path).expanduser()
        if not p.is_absolute():
            p = r / p
        rel = p.parent.relative_to(r) if p.parent != r else Path()
        current = r
        for part in rel.parts:
            current = current / part
            if current.is_symlink():
                return False
        if not p.parent.resolve(strict=False).is_relative_to(r):
            return False
        p.parent.mkdir(parents=True, exist_ok=True)
        import tempfile

        fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=f".{p.name}.")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(text)
            os.replace(tmp, p)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        return True
    except (OSError, RuntimeError, ValueError):
        return False


def is_path_allowed(path: str | Path, roots: Iterable[str | Path]) -> bool:
    """Return True when *path* is inside any allowed root."""
    return any(is_path_within(path, root) for root in roots)


def _is_path_exactly_allowed(
    logical_path: Path,
    resolved_path: Path,
    files: Iterable[str | Path],
) -> bool:
    """Return True when *path* resolves exactly to one of the allowed files."""
    logical_key = _path_key(logical_path)
    if _path_key(resolved_path) != logical_key:
        return False
    for file in files:
        try:
            allowed_file = _resolve_logical_path(file)
        except (OSError, RuntimeError, TypeError, ValueError):
            continue
        if _path_key(allowed_file) == logical_key:
            return True
    return False


def require_path_within(
    path: str | Path,
    root: str | Path,
    *,
    message: str | None = None,
) -> Path:
    """Resolve *path* and require it to be inside *root*."""
    resolved = Path(path).expanduser().resolve(strict=False)
    if not is_path_within(resolved, root):
        raise WorkspaceBoundaryError(
            message
            or f"Path {path} is outside allowed directory {Path(root).expanduser()}"
            + WORKSPACE_BOUNDARY_NOTE
        )
    return resolved


def resolve_allowed_path(
    path: str | Path,
    *,
    workspace: str | Path | None = None,
    allowed_root: str | Path | None = None,
    extra_allowed_roots: Iterable[str | Path] | None = None,
    extra_allowed_files: Iterable[str | Path] | None = None,
    strict: bool = False,
) -> Path:
    """Resolve a path and enforce containment in allowed roots when configured."""
    resolved = resolve_path(path, workspace, strict=False)
    files = list(extra_allowed_files or [])
    if allowed_root is None and not files:
        return resolve_path(path, workspace, strict=strict) if strict else resolved

    roots: list[str | Path] = []
    if allowed_root is not None:
        roots.append(allowed_root)
    roots.extend(extra_allowed_roots or [])
    exact_allowed = bool(files) and _is_path_exactly_allowed(
        _resolve_logical_path(path, workspace),
        resolved,
        files,
    )
    if not is_path_allowed(resolved, roots) and not exact_allowed:
        boundary = Path(allowed_root).expanduser() if allowed_root is not None else "allowed files"
        raise WorkspaceBoundaryError(
            f"Path {path} is outside allowed directory {boundary}"
            + WORKSPACE_BOUNDARY_NOTE
        )
    if strict:
        return resolve_path(path, workspace, strict=True)
    return resolved
