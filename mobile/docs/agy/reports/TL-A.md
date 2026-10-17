# TL-A Report: Tool Activity Sheet & Detail View

## Summary
Implemented the tool activity bottom sheet with a timeline list and detail view modeled after Claude's mobile app, replacing the previous pill inline expansion with a quiet line in chat and keeping in-between text and reasoning readable under the line.

---

## Files Changed
- `mobile/src/screens/thread/toolCalls.ts`: Pure helper module implementing `toolCallsOf(messages)`, `toolIcon(name)`, `extractMainArg(args)`, `formatToolDescription(name, hint, args)`, and `formatRowDescription(desc)`.
- `mobile/src/screens/thread/ToolActivitySheet.tsx`: Bottom sheet component with timeline list view, tool category icons, execution status, and detail view with command/args, result (with 4000-char truncation and "Mostra tutto"), copy buttons, trace-detail fetching, and `FileEditList` diff views.
- `mobile/src/screens/thread/ActivityRow.tsx`: Replaced pill with quiet line ("Eseguiti N strumenti ›", "Sto eseguendo… ›", "Lavorato per 43s · N strumenti ›") opening `ToolActivitySheet`. Kept intermediate model text and collapsible `ReasoningBlock` under the line in chat.
- `mobile/src/screens/thread/MessageRow.tsx`: Passed `chatKey` prop down to `ActivityRow`.
- `mobile/src/i18n/it.json`: Added localized strings for tool activity, tool statuses, and sheet headers.
- `mobile/src/i18n/en.json`: Added English localized strings corresponding to the Italian ones.
- `mobile/test/screens/thread-tool-calls.test.ts`: Unit tests for `toolCallsOf`, pairing start/end events, error statuses, description derivation, unique anonymous IDs, icon mapping, and arg extraction.
- `mobile/test/screens/thread-tool-sheet.test.tsx`: Component tests for line count, opening sheet with N rows, detail view display and copying, fetching traceDetail, live updates, 4000-char truncation, and in-between reasoning in chat.
- `mobile/test/screens/thread.test.tsx`: Updated regex in assertion to match new quiet line label and sheet item.

---

## Choice Made for Point 4
In point 4 ("The model's in-between text and the reasoning stay readable: show them in the chat, under the line, collapsed by default as today, or as non-tappable rows in the list"):
- **Choice**: Shown **in the chat, under the line**.
- **Rationale**: Model reasoning (`ReasoningBlock`) and intermediate model thoughts are conversational elements that belong directly in the message flow of the thread (with `ReasoningBlock` collapsed by default as in WebUI/prior implementation). Placing them in chat keeps the tool activity sheet strictly focused on tool call metadata and execution details (command, arguments, output/error, file edits timeline) matching Claude's mobile app experience.

---

## Self-Check Against Brief Requirements

| Item | Brief Requirement | Implementation (file:line) |
|---|---|---|
| 1 | Quiet line instead of pill ("Eseguiti 5 strumenti ›", "Sto eseguendo… ›", duration preserved) | `mobile/src/screens/thread/ActivityRow.tsx:103-125` |
| 2 | Bottom sheet titled "Eseguiti N strumenti" with X to close, timeline list, icons by tool kind, status ("Eseguito", red "Errore", "In corso…"), one-line description ending in "…" | `mobile/src/screens/thread/ToolActivitySheet.tsx:112-243`, `mobile/src/screens/thread/toolCalls.ts:63-124` |
| 3 | Detail view with back arrow, tool name title, status, description, monospace command/arguments with copy, monospace result/error with copy & 4000-char truncation + "Mostra tutto", trace-detail ref fetch, file edits diff view | `mobile/src/screens/thread/ToolActivitySheet.tsx:245-530` |
| 4 | Model in-between text & reasoning stay readable in chat under the line | `mobile/src/screens/thread/ActivityRow.tsx:127-154` |
| 5 | Live updates: list and detail view reactively update as tools start/end | `mobile/src/screens/thread/ToolActivitySheet.tsx:69-72`, `mobile/src/screens/thread/ActivityRow.tsx:49-51` |
| 6 | Pairing calls: start and end paired by call_id; calls without call_id stay separate | `mobile/src/screens/thread/toolCalls.ts:141-267` |

---

## Dependencies
No dependencies added.

---

## Deviations
- In `mobile/test/screens/thread.test.tsx:94,97`, updated the test regex from `/Lavorato.*1 strument/` and exact `"read_file(a.py)"` to `/1 strument/` and `/read_file\(a\.py\)/` to accommodate the new quiet line label and the sheet list item ending with an ellipsis.

---

## Verification Evidence

### Raw Jest Output
```text
Test Suites: 124 passed, 124 total
Tests:       976 passed, 976 total
Snapshots:   0 total
Time:        26.495 s
Ran all test suites.
```

### Raw TypeScript (`tsc --noEmit`) Output
```text
$ npx tsc --noEmit
(clean exit with code 0)
```

### Raw Expo Export Output
```text
$ npx expo export --platform android --output-dir /tmp/nb-export
Starting Metro Bundler
Android Bundled 10887ms index.js (2538 modules)
Exported checks, assets, and bundles to: /tmp/nb-export
(clean exit with code 0)
```

### What Could Not Be Verified
- Tested under Node/Jest environment using React Native Testing Library and Expo CLI export bundle verification; not verified on a physical Android device or emulator.
