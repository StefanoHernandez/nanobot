# Projects (like Claude's Projects): design

Date: 2026-10-15. Status: approved by the user (decisions below). Owner: Claude (server), agy (app screens).

## What a project is
A folder on the server, `<workspace>/projects/<id>/`, holding:
- `project.json`: `{ "name", "description", "created_at", "updated_at" }`;
- `AGENTS.md`: the project instructions. nanobot already loads the chat's workspace `AGENTS.md` into the system prompt (`nanobot/agent/context.py` `_load_bootstrap_files`);
- the project files, uploaded from the phone (any type).

A project chat is a normal chat whose workspace scope (`workspace_scope.project_path`) is the project folder. The server already supports setting it from remote clients (`new_chat` / `set_workspace_scope`), and `/api/sessions` already returns `workspaceScope` per chat.

## User decisions (2026-10-15)
| Question | Decision |
|---|---|
| Where | `~/.nanobot/workspace/projects/<id>`, inside the bot's workspace, so no extra access is needed |
| Files | any type; upload limit 100 MB per file |
| Project chats | shown both in the project page and in the normal chat list, with a project label |
| WebUI | app first; a WebUI page later |

## Server: `nanobot/ext/projects.py` (fork module) + two thin hooks
Hooks into upstream files, one line each:
- `nanobot/webui/ws_http.py` `_dispatch_resolved`: `dispatch_projects_get(...)` before the `/api/` 404, for GET routes;
- `nanobot/channels/websocket/runtime.py`: wrap the `BinaryHTTPBridge` handler with `projects_post_handler(...)`, for every non-GET route. The bridge only carries POST bodies, and upstream sends only `/api/attachments` there.

All routes require the gateway **API token** (`Authorization: Bearer <api_token>`), the same as every other `/api/*` read.

| Method and path | Body | Result |
|---|---|---|
| `GET /api/ext/projects` | | `{ projects: [Project] }` |
| `GET /api/ext/projects/<id>` | | `{ project: Project, instructions: string, files: [FileEntry], truncated: bool }` |
| `GET /api/ext/projects/<id>/file?path=<rel>` | | file bytes; `Range` supported; a full GET larger than 32 MB returns 413, so use `Range` |
| `POST /api/ext/projects` | JSON `{ name, description?, instructions? }` | 201 `{ project }` |
| `POST /api/ext/projects/<id>/update` | JSON `{ name?, description?, instructions? }` | `{ project, instructions }` |
| `POST /api/ext/projects/<id>/archive` | | moves the folder to `projects/.archive/<id>-<timestamp>`; never deletes |
| `POST /api/ext/projects/<id>/files?path=<rel>` | raw body, `Content-Length` required, at most 100 MB; `X-Overwrite: 1` to replace | 201 `{ file: FileEntry }` |
| `POST /api/ext/projects/<id>/files/delete` | JSON `{ path }` | `{ ok: true }` |

The types are:
- `Project = { id, name, description, path, created_at, updated_at, file_count, size_bytes }`. Times are epoch ms and `path` is absolute (the app needs it for `workspace_scope`).
- `FileEntry = { path, size, modified_at }`, where `path` is relative and uses `/`.

### Safety rules
- `id` is a slug: `[a-z0-9-]`, 1-48 characters, unique (suffix `-2`, `-3`…). Never trust a client path.
- File paths are relative. Rejected: absolute paths, `..`, NUL, backslashes, empty segments, hidden segments (`.git`, `.archive`…), the reserved names `AGENTS.md` and `project.json` (use `/update`), and anything whose resolved path leaves the project folder (symlink escape).
- Uploads stream to `.upload-<random>` in the target folder, then `os.replace`. The upload is refused if free disk space after it would be below 512 MB. A body different from `Content-Length` is discarded. `Transfer-Encoding`/`Content-Encoding` are rejected, the same as the attachment upload.
- Listing walks at most 2000 files and depth 6, skipping hidden entries and the reserved files (`truncated: true` when capped).
- Never log file contents, tokens or absolute paths of uploads at INFO level.

## App (agy brief after the server lands)
- The drawer gets a **Progetti** entry. The project list shows name, description and the number of files and chats.
- The project page shows:
  - the name and description;
  - the **Instructions** (`AGENTS.md`), editable in a full-screen editor;
  - the **Files**: upload from the phone (document picker), open in the existing viewer through `/file`, delete behind a confirm;
  - the **Chats**: the sessions whose `workspaceScope.project_path` equals the project `path`, plus "Nuova chat nel progetto" (`new_chat` with `workspace_scope: { project_path: path, access_mode: "restricted" }`).
- In the normal chat list, project chats get a small label with the project name.
- Archiving a project goes behind a confirm.

## Later
- A WebUI page.
- Per-project memory (Phase 6).
