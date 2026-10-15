# Plan: "Notte Compagno" dark theme, UI refinements, better artifacts

Date: 2026-10-15. Status: **approved**. Wave 1 (U-C1, U-C2), **A-3**, **A-4**, **U-C3**, **U-D1**, **A-1**, **A-2**, **A-6**, **U-S1**, **A-7**, the **A-5 chart** slice and **Markdown documents** are on `claude/projects`. Maps and React are still open. T-N1 was replaced on 2026-10-15: dark is black, purple and gold, not the indigo "Notte Compagno" tokens.
Owner of this plan: Claude. Implementers: agy (briefs in `mobile/docs/agy/briefs/`), Claude for the design-critical and security parts.
Design references: `mobile/docs/design/companion.md` (identity) and the impeccable/frontend-design guidance (product register, Android).

## Why
- The dark theme from the user's palette (Evergreen/Grape, `43979047`) is pleasant but **breaks the identity**: the light theme is periwinkle/indigo, the dark one green/grape. The user approved Claude's proposal "Notte Compagno": the same family as light, darker and calmer, with sunflower as the only warm light.
- The UI works, but long answers, the crowded composer and the crowded header cost the most in daily use.
- Artifacts today: HTML/SVG/Mermaid preview from code blocks and document previews (PDF/docx/pptx/xlsx). They lack an overview, versions, a fix loop, zoom, and **offline** (all libraries come from `cdn.jsdelivr.net`).

## Tasks
| ID | What | Owner | Depends on | Touches (main files) |
|---|---|---|---|---|
| **T-N1** | Replaced: black, purple, gold (not the indigo Notte tokens) | **done** in `theme.ts` | none | `src/ui/theme.ts`, `docs/design/companion.md`, `test/ui/theme.test.ts` |
| **U-C1** | Bot replies without a bubble; Markdown headings in Atkinson bold | agy | none | `src/screens/thread/MessageRow.tsx`, `src/ui/markdown/Markdown.tsx` |
| **U-C2** | Composer on two rows | agy | none | `src/screens/thread/Composer.tsx` |
| **U-C3** | Thread header: overflow "⋮" menu | **done** on `claude/projects` | **F-A merged** | `src/screens/thread/ThreadScreen.tsx` |
| **U-D1** | Chat list grouped by date, Projects on top | **done** on `claude/projects` | **P-A merged** | `src/screens/chats/ChatDrawer.tsx` |
| **U-S1** | Material snackbar instead of toasts | **done** on `claude/projects` | none (shared UI kit, so check every caller) | `src/ui/components/Toast*.tsx` |
| **A-1** | Artifact identity and versions (+ server skill) | **done** on `claude/projects` | none | `src/artifacts/collect.ts`, viewer version bar, `nanobot/skills/artifacts/` |
| **A-2** | "Correggi" and "Chiedi modifica" from the artifact | **done** on `claude/projects` | none (A-1 makes it better, not required) | `ArtifactWebView.tsx`, `FileViewer.tsx`, viewer route |
| **A-3** | Zoom/pan, landscape, fit, artifact theme, export PNG/PDF | **done** on `claude/projects` | none | `ArtifactWebView.tsx` (shell HTML), viewer route |
| **A-4** | Offline: bundle the viewer libraries in the APK | Claude (CSP/security) | **done** on `claude/projects` | `ArtifactWebView.tsx`, `assets/viewers/` |
| **A-5** | Charts and Markdown documents done on `claude/projects`. Still open: maps, React | agy | A-4; maps and React also need A-6 | `ArtifactWebView.tsx`, `formats.ts`, `CodeBlock.tsx` |
| **A-6** | Per-artifact "allow network" toggle | **done** on `claude/projects` | A-4 | CSP builder, viewer UI |
| **A-7** | Artifact tab in "Media e file"; save an artifact to a Project | agy | **F-A and P-A merged**, A-1 | gallery screen, `src/projects/api.ts` |

**Waves** (tasks in the same wave never touch the same files, except i18n JSON, which merges as a union):
1. **Now:** T-N1 (Claude), U-C1 (agy #1), U-C2 (agy #2). A-2 and A-3 both edit `ArtifactWebView.tsx`, so they run in sequence: A-3 first, then A-2.
2. **After P-A and F-A are merged:** U-C3, U-D1, A-7. Also A-4 (Claude) and A-1 (Claude design, then agy).
3. **Then:** U-S1, A-5, A-6.

## Details

### T-N1: "Notte Compagno" (Claude)
- **Scene:** checking the bot on the phone in the evening, often in a dark room. Low glare, with one warm light: the bot's eyes.
- **Tokens (dark):**

  | Role | Hex |
  |---|---|
  | background | `#12131f` |
  | card | `#1a1c2c` |
  | popover | `#232539` |
  | text | `#e9e8f2` |
  | secondary text | `#a9a8c2` |
  | user bubble | `#3a3d6e` (option: the user's Grape `#694873`, decided with the preview) |
  | brand and primary buttons | sunflower `#f4b63f` with dark text |
  | chart: input / output / cached / warn | `#d9d6f5` / `#f4b63f` / `#8f8bc9` / `#ff9a94` |

  Tune the values with the existing contrast tests (text ≥ 4.5:1, chart ≥ 3:1).
- **Process:** first screenshots of the same screens in the emulator (current Evergreen vs Notte), and the user picks. Only then replace `DARK`. Keep the user's palette in the git history and note it in `companion.md`.

### U-C1: replies without a bubble
- Assistant answers render full width on the background, with no card bubble. The user's messages keep their bubble.
- A thin gap and the activity chip mark turn boundaries.
- Markdown h1-h3 use `th.font.medium` (Atkinson bold) at fixed sizes. The display face stays for screen titles and the bot name only (product register: no display fonts in content).
- Code blocks, tables and media get the full width.

### U-C2: composer on two rows
- Row 1: the text field at full width, growing to 6 lines.
- Row 2: attach · reasoning notches · context ring · (spacer) · microphone · send/stop.
- Same behaviour and accessibility labels; touch targets ≥ 48dp. Mentions, the slash menu and the attachment bar stay above row 1.

### U-C3: header overflow
- Kept in the header: back, face, name, model pill, status.
- A "⋮" button opens a Material menu (bottom sheet) with: Media e file, Cartella di lavoro, Sub-agent, Comandi. Badges (running subagents, media count) move onto the menu items, and a small dot on "⋮" means "something running".

### U-D1: grouped chat list
- Sections Progetti (up to 3 recent projects, then "Tutti i progetti"), Oggi, Ieri, Questa settimana, Più vecchie.
- Each section title is sentence case in the Atkinson medium face. Search flattens the list.

### U-S1: snackbar
- Replace the toast with a Material snackbar: bottom, above the composer and the IME, a single line, an optional action ("Riprova", "Annulla"), 4s.
- Keep the `toast.show(msg)` API; add `toast.show(msg, { action: { label, onPress } })`.
- Keep the I15 rule: the top-most host renders, never twice.

### A-1: artifact identity and versions
- **Problem:** today every previewable code block is a separate thing, so the app can't tell "v2 of the same dashboard".
- **Convention:** a fenced block whose info string carries an id, e.g. ```` ```html id=sales-dashboard title="Vendite" ````.
  - The same id later in the chat means a new version.
  - Blocks without an id are standalone artifacts (current behaviour).
- **Server side (no code):** a fork skill `nanobot/skills/artifacts/SKILL.md` teaches the agent this convention, to reuse the id when it revises, and to keep artifacts self-contained.
- **App:**
  - `src/artifacts/collect.ts` turns the messages into artifacts with their versions (pure and tested);
  - the viewer gets "‹ v2/3 ›" and a "Confronta" (side-by-side) mode for HTML/SVG/Mermaid.

### A-2: "Correggi" and "Chiedi modifica"
- The WebView already posts `{type:"error"}`. Carry the message and line, then show a bottom bar in the viewer: "Errore nell'artefatto" plus **Correggi**.
- **Correggi** sends a new message to the source chat: a short Italian template with the error text plus the artifact id/kind, not the full code when the artifact is still in the chat. One tap; it is visible in the chat like any message.
- **Chiedi modifica:** a text field in the viewer ("Cosa vuoi cambiare?"). It sends to the source chat with the artifact reference.
- The viewer needs to know the source chat key, through a route param (the chat key only, never content), set by `CodeBlock` when it opens the preview.

### A-3: zoom, landscape, theme, export
- **Zoom:**
  - pinch-zoom and pan for SVG and Mermaid inside the shell HTML (CSS transform plus pointer events, double-tap to fit);
  - HTML artifacts keep their own viewport, plus a "Adatta/100%" toggle.
- **Landscape:** a rotate button that unlocks orientation for the viewer only (`expo-screen-orientation`, viewer route); restore on exit.
- **Theme:** pass the app scheme into the shell. Mermaid gets `theme: dark|default` with our palette; charts too (A-5).
- **Export:**
  - PNG: the WebView renders the SVG to a canvas, then a data URL comes back over postMessage and is written to cache, then Share;
  - PDF: `expo-print` from the shell HTML (installed with `npx expo install`).

### A-4: offline viewer libraries (Claude)
- Today `CDN_URLS` loads mermaid, pdfjs, docx-preview, jszip and pako from jsdelivr at view time, which fails offline and leaks "what you open" to a CDN.
- Ship pinned copies as app assets, read them as text, inject them inline or as `file://` from cache, and tighten the CSP (`script-src 'unsafe-inline'` only, no CDN hosts).
- Measure the APK size: mermaid is about 3 MB. Cache the libraries after the first use.

### A-5: new artifact types
- **Charts:** fenced `chart` / `vega-lite` JSON. Render with a bundled Vega-Lite (or Chart.js) as an interactive chart; a CSV in chat gets "Mostra come grafico".
- **Markdown documents:** "Apri come documento" on a long answer. A paginated reading view; export to PDF (`expo-print`).
- **Maps:** a `geojson` block on Leaflet. Tiles need network, so it needs A-6.
- **React:** a `jsx`/`tsx` block in a sandbox with bundled React UMD and Babel standalone. External imports need network (A-6).

### A-6: network toggle (Claude)
- Default stays `connect-src 'none'`.
- A per-artifact "Consenti rete" switch in the viewer, behind a confirm, rebuilds the CSP for that render only. It is never remembered across artifacts.

### A-7: artifact tab and save to project
- "Media e file" gets an **Artefatti** tab: every artifact (latest version) with a live thumbnail (snapshot PNG from A-3, cached) and its kind.
- **Salva nel progetto:** pick a project, then upload as a file (`uploadProjectFile`) named `<id or title>.<ext>`. The bot finds it in future project chats.

## Verification (every task)
- **App:** `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`. For visual tasks, also screenshots from the emulator (`mobile/scripts/emulator.sh`) in light and dark.
- **Server/skill:** `.venv/bin/python -m pytest tests/ext`. The skill loads in a real gateway.
- Claude reviews every agy branch (REVIEWER §4) before merging.
