# AR-B Report: Artifacts that remember and can talk to the chat

## Files Changed
- `mobile/src/artifacts/artifactState.ts`: MMKV and session memory state storage, debounce handling (<= 1 write / 500 ms), 64 KB validation, `clearArtifactStateForChat`, and `chatsStore.remove` hook.
- `mobile/src/screens/viewer/ArtifactWebView.tsx`: Bridge injection (`window.nanobot`) in `buildShellHtml` for `html` and `react` only; `nanobotStateGet`, `nanobotStateSet`, and `nanobotSend` message handlers.
- `mobile/src/screens/viewer/FileViewer.tsx`: "Reset dati" entry in viewer menu (when state exists), confirmation dialog for `nanobotSend`, routing send via `threadStore.send(..., { steer: true })`.
- `mobile/src/screens/viewer/previewBridge.ts`: Added `nanobotResponse` to `HostCommand` union and parser in `hostCommandFromInject`.
- `nanobot/skills/artifacts/SKILL.md`: Added "Mini app" section with API documentation and checklist example.
- `mobile/src/i18n/it.json`: Added `resetData`, `sendPrompt`, `sendConfirm`, `dataReset`, `menu` keys under `artifact` (additions only).
- `mobile/src/i18n/en.json`: Added `resetData`, `sendPrompt`, `sendConfirm`, `dataReset`, `menu` keys under `artifact` (additions only).
- `mobile/test/artifacts/ar-b.test.tsx`: Test suite covering all AR-B specifications.

## Where State Lives
- Artifacts associated with a chat and artifact ID: stored in MMKV with key `artifact-state:<chatKey>:<artifactId>`. The same key is shared by all versions of the same artifact ID.
- Artifacts opened from a file without chat or artifact ID: kept in-memory in `sessionMemory` for the current session only.
- Chat deletion: `clearArtifactStateForChat(chatKey)` removes all MMKV keys starting with `artifact-state:<chatKey>:`. In addition, `chatsStore.getState().remove` is hooked dynamically in `artifactState.ts` so chat deletion automatically cleans up artifact state keys without modifying `mobile/src/state/chatsStore.ts`.

## Self-Check Against Brief
| Brief Item | Implementation |
|---|---|
| Bridge injection in `buildShellHtml` for html and react only | `mobile/src/screens/viewer/ArtifactWebView.tsx:1056-1127, 1406-1430, 1616-1623` |
| `nanobot.state.get(): Promise<any>` | `mobile/src/screens/viewer/ArtifactWebView.tsx:1096-1098`, `mobile/src/artifacts/artifactState.ts:32-48` |
| `nanobot.state.set(value): Promise<void>` (<= 64 KB, debounce <= 1 write / 500 ms) | `mobile/src/screens/viewer/ArtifactWebView.tsx:1099-1115`, `mobile/src/artifacts/artifactState.ts:50-117` |
| `nanobot.send(text): Promise<boolean>` | `mobile/src/screens/viewer/ArtifactWebView.tsx:1116-1121, 2341-2354` |
| Request ID matching for bridge promises | `mobile/src/screens/viewer/ArtifactWebView.tsx:1062-1085` |
| State storage in MMKV (`artifact-state:<chatKey>:<artifactId>`) | `mobile/src/artifacts/artifactState.ts:18-20` |
| In-memory fallback for file / no chat or no id | `mobile/src/artifacts/artifactState.ts:8, 23-26, 33-40, 65-68` |
| Reset dati entry in viewer menu for artifacts with state | `mobile/src/screens/viewer/FileViewer.tsx:1149-1156, 1177-1189` |
| Chat deletion cleanup of keys | `mobile/src/artifacts/artifactState.ts:145-189` |
| Send dialog with confirmation ("L'artefatto vuole inviare al bot:") | `mobile/src/screens/viewer/FileViewer.tsx:1190-1205` |
| Send length limit 4000 chars (longer -> false without dialog) | `mobile/src/screens/viewer/FileViewer.tsx:143` |
| One pending send at a time (concurrent -> false) | `mobile/src/screens/viewer/FileViewer.tsx:145` |
| Send reuses FileViewer ask path (`threadStore.send(..., { steer: true })`) and `canAsk` conditions | `mobile/src/screens/viewer/FileViewer.tsx:144, 163` |
| Exports omit `window.nanobot` | `mobile/src/screens/viewer/exportArtifact.ts` (unchanged, produces document without bridge) |
| Skill documentation (`nanobot/skills/artifacts/SKILL.md`) | `nanobot/skills/artifacts/SKILL.md:84-124` |
| i18n keys added | `mobile/src/i18n/it.json:508-512`, `mobile/src/i18n/en.json:508-512` |

## Verification Checks

### 1. Jest (`cd mobile && npx jest`)
```text
PASS test/artifacts/ar-b.test.tsx
PASS test/screens/viewer.test.tsx
PASS test/screens/artifacts.test.tsx
...
Test Suites: 135 passed, 135 total
Tests:       1094 passed, 1094 total
Snapshots:   0 total
Time:        16.051 s
Ran all test suites.
```

### 2. TypeScript (`cd mobile && npx tsc --noEmit`)
```text
(exited with code 0, no errors)
```

### 3. Expo Android Export (`cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-arb`)
```text
Android Bundled 11723ms index.js (2567 modules)
› android bundles (1):
_expo/static/js/android/index-4a6a4d285e9887eff975dba9215d0cf5.hbc (8.1MB)
› Files (1):
metadata.json (4.6KB)
Exported: /tmp/nb-export-arb
```

## Dependencies Added
None. Reused existing MMKV storage, Expo modules, and React Native components.

## Doubts or Deviations
None. To prevent merge conflicts with other parallel agents and respect README hard rules against editing `mobile/src/state/**`, the chat deletion cleanup hooks `chatsStore.getState().remove` dynamically from `src/artifacts/artifactState.ts`, while also exposing `clearArtifactStateForChat(chatKey)` directly if Claude prefers a direct invocation inside `chatsStore.ts:184`.

## What Needs a Phone
- Physical interaction with the "Send" confirmation dialog on native Android.
- State persistence and debouncing verification with native Nitro MMKV module on a real device.
- Full WebView gesture and DOM rendering of the mini app checklist on device.
