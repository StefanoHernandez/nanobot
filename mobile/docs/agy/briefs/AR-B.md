# AR-B: artifacts that remember and can talk to the chat (owner: agy)

Branch `agy/AR-B`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`. **App, plus one skill file.** Other agents work in parallel: W2-sec (server ext), LK-A (`app/_layout.tsx`, `NativeIntegrations.tsx`, `src/extras/lock.tsx`, `src/screens/connect/**`), EC-A (`src/screens/ecosystem/apps/**`, `src/ecosystem/apps.ts`, `mcp.ts`, MCP/CLI server files), PF-A (`src/ui/markdown/**`, `src/state/threadStore.ts` and its consumers, `src/screens/viewer/viewerLibs.ts`, cache pruning). You own `src/screens/viewer/**` (except `viewerLibs.ts`), `src/artifacts/**`, `nanobot/skills/artifacts/SKILL.md`. i18n: only **add** keys.

## Why
Today an `html`/`react` artifact is a page that forgets everything when closed (a shopping list loses its ticks) and cannot ask the bot anything. Two small APIs turn it into a mini app.

## 1. `window.nanobot` in the artifact shell
Injected by `buildShellHtml` (`ArtifactWebView.tsx`) for `html` and `react` only, before the artifact's own scripts. Messages go through the existing `postMessage` channel (`ArtifactWebView.tsx:~558`, handled in `handleMessage` ~2130).
- `nanobot.state.get(): Promise<any>` — the saved JSON for this artifact, or `null`.
- `nanobot.state.set(value): Promise<void>` — save JSON (≤ 64 KB serialized; larger → rejected promise with a clear error). Debounce writes on the app side (≤ 1 write / 500 ms).
- `nanobot.send(text): Promise<boolean>` — ask the app to send `text` to the chat the artifact belongs to. Resolves `true` if the user confirmed and it was sent, `false` otherwise.
- Promises are matched by a request id; unknown or malformed messages are ignored, as today.

## 2. App side
- **State storage:** MMKV (the store the app already uses, check `src/core` / `outbox.ts`), key `artifact-state:<chatKey>:<artifactId>`; the same state is shared by all versions of one artifact id. Find the artifact id and chat key the viewer already has (`collectArtifacts`, `FileViewer.tsx` `chatKey`). Artifacts opened from a file (no chat or no id): `state` works in memory only for the session and `send` resolves `false`.
- **Clearing:** a "Reset dati" entry in the viewer's menu for artifacts that have saved state. When a chat is deleted, delete its `artifact-state:<chatKey>:*` keys (find where chat deletion happens; one call).
- **Send = always confirmed by the user.** The artifact content is model-written and may carry injected instructions, so every `send` opens a dialog: "L'artefatto vuole inviare al bot:" + the full text (scrollable), buttons "Invia" / "Annulla". Max 4000 characters (longer → `false` without a dialog); one pending request at a time (another while the dialog is open → `false`). On "Invia" reuse the send path `FileViewer` already uses for "ask" (`threadStore.getState().send(..., { steer: true })` ~335) and respect the same `canAsk` conditions.
- No new network access: CSP unchanged. Exports (HTML/PDF): `window.nanobot` is absent, so artifacts must feature-detect it.

## 3. Skill
`nanobot/skills/artifacts/SKILL.md`: a short section "Mini app" with the three calls, the 64 KB limit, "always check `if (window.nanobot)`", and one tiny example (a checklist that saves its ticks and a button that sends "Ho finito la lista"). Keep the skill short.

## Tests
- Shell contains the bridge for html/react, not for other kinds.
- `state.set` then reopen → `state.get` returns it; > 64 KB rejected; reset clears; deleting the chat clears its keys.
- `send` opens the dialog with the text; confirm sends once to the right chat; cancel → `false`; second request while open → `false`; > 4000 chars → `false` without dialog; no chat → `false`.

## Checks
- `cd mobile && npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-arb`

## Do not
- Loosen the CSP or add network access. Edit server files (except the skill) or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/AR-B.md`: files, tests, where state lives, deviations, what needs a phone (save/reopen, send dialog).

Commit (no `Co-Authored-By` lines, never `mobile/node_modules`), push `agy/AR-B`, and give the last hash. Do not merge.
