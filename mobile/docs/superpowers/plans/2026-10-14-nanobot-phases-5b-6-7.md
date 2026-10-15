# Master Plan: Completing nanobot mobile & fork (Phases 5b, 6, 7)

Date: 2026-10-14
Author: OpenCode (Gemini 4 Argon Contributor)

Update 2026-10-15: Phase 6 is parked (Dream stays, no vector database). The legacy WebUI will be replaced by a web export of `mobile/` after kanban; see `mobile/docs/roadmap.md`. Do not add a kanban or pairing page to `nanobot/web`.

## Overview & Execution Order
This plan specifies the remaining server and mobile work to bring **nanobot mobile + fork** to 100% completion, while keeping upstream `HKUDS/nanobot` merge conflicts near zero.

| Wave | Task ID | Scope | Where | Parallelizable with |
|---|---|---|---|---|
| **5-Wave 2** (running) | `P5-T1` | Read-aloud assistant replies (`expo-speech`) | `mobile/` | `P5-W1` |
| **5-Wave 2** (running) | `P5-W1` | Android home widget, quick tile & `/new-chat` | `mobile/` | `P5-T1` |
| **5b** | `P5b-S1` | `build-luffy` workflow + Server Device Pairing (`nanobot/ext/pairing.py`) | server + `.github/` | `P5b-M1` |
| **5b** | `P5b-M1` | Mobile QR scanner (`ConnectScreen`) & Paired Devices management (`Settings`) | `mobile/` | `P5b-S1` |
| **6** | `P6-S1` | Hybrid Memory server (`nanobot/ext/memory_hybrid.py` + agent tools + HTTP API) | server | `P6-M1` |
| **6** | `P6-M1` | Mobile "Memoria" screen (Facts, Pending approvals, Relation graph) | `mobile/` | `P6-S1` |
| **7** | `P7-S1` | Multi-Bot Personas & Kanban server (`nanobot/ext/kanban.py` + tools + dispatcher) | server | `P7-M1` |
| **7** | `P7-M1` | Mobile "Kanban & Bot" screens (Board columns, Task sheet, Bot personas, Group chat) | `mobile/` | `P7-S1` |

Notice a key property of this split:
- Every phase is split into **`-S1` (Python server in `nanobot/ext/` + `tests/`)** and **`-M1` (React Native app in `mobile/`)**.
- Because `-S1` only touches Python/CI files at the repo root and `-M1` only touches `mobile/`, **each phase's `-S1` and `-M1` have 0% file overlap and can be executed in parallel in two worktrees (`nanobot-agy` and `nanobot-agy3`)!**

---

## Core Architectural Rules (Binding for all briefs)

1. **Upstream isolation (`nanobot/ext/`):**
   - All new server logic lives in `nanobot/ext/{pairing,memory_hybrid,kanban}.py` and `nanobot/agent/tools/{memory_hybrid,kanban_tools}.py`.
   - `ToolLoader.discover()` (`nanobot/agent/tools/loader.py`) automatically discovers tool classes in `nanobot/agent/tools/*.py` with zero edits to upstream files.
   - `nanobot/webui/ws_http.py` receives only a thin delegation hook (1 import + 1 route check in `_dispatch_resolved` + 1 check in `_handle_bootstrap`).
2. **RAM budget on luffy (Arduino UNO Q, 3.6 GB RAM):**
   - Everything runs in-process inside the existing gateway + SQLite (`~/.nanobot/ext_*.db`, WAL mode). No extra daemon processes or stdio MCP subprocesses.
   - Vector embeddings in `nanobot/ext/memory_hybrid.py` lazy-load ONNX only when configured and unload after 300 s of inactivity, with FTS5 lexical search always active out-of-the-box.
3. **Mobile hard rules:**
   - Never subscribe to `client.onChat` outside `threadStore.ts`.
   - Never edit `mobile/vendor/**`.
   - Never log URLs, tokens, pairing codes, or secrets (`no console.*`).
   - Theme tokens only, ≥ 48 dp touch targets, `KeyboardAvoidingView behavior="padding"`, i18n keys in both `it.json` and `en.json`.

---

## Verification Commands per Wave

- **Server tasks (`P5b-S1`, `P6-S1`, `P7-S1`):**
  ```bash
  uv run --no-sync pytest tests/test_device_pairing.py tests/test_memory_hybrid.py tests/test_kanban.py -v
  uv run --no-sync ruff check nanobot/ext/ nanobot/agent/tools/
  ```
- **Mobile tasks (`P5-T1`, `P5-W1`, `P5b-M1`, `P6-M1`, `P7-M1`):**
  ```bash
  cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit
  ```
- **Final APK build (on `main` after merges):**
  ```bash
  cd mobile && bash scripts/build-apk.sh
  ```
