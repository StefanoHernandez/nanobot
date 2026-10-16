# UX-A report

Branch `grok/UX-A`, from `origin/main` (`f26179f6e`). Not merged.

## Files

- `mobile/src/screens/viewer/FileViewer.tsx` — network chip, confirm dialog, one-time hint
- `mobile/src/i18n/en.json`, `mobile/src/i18n/it.json` — `artifact.networkShort`, `artifact.networkHint`
- `mobile/app/(main)/chat/[key].tsx` — header back and hardware back open the drawer
- `mobile/src/ui/components/Sheet.tsx` — keyboard wrap, height cap, optional scroll
- Sheets that already scroll, now `scroll={false}` (or only while their own scroller is showing): `TaskEditorSheet.tsx`, `PromptEditorSheet.tsx`, `PromptPickerSheet.tsx`, `AutomationJobSheet.tsx`, `ChannelSheet.tsx`, `McpSheet.tsx`, `SkillDetailSheet.tsx`, `SubagentsSheet.tsx`, `WorkspaceSheet.tsx`
- `mobile/src/extras/sttEngine.ts` — keep the live partial when stop ends in `error` or `end`
- `mobile/src/screens/thread/VoiceButton.tsx` — `stop()` text goes to `onTranscript`; no toast after the user stops
- `mobile/src/extras/voiceLoop.ts` — a loop stop dispatches the same kept text
- Tests: `test/screens/artifacts.test.tsx`, `test/screens/o-a.test.tsx`, `test/screens/chat-back.test.tsx`, `test/screens/voice-stop.test.tsx`, `test/ui/sheet.test.tsx`, `test/extras/sttEngine.test.ts`, `test/fixes/fix-a.test.tsx`
- `mobile/docs/agy/reports/UX-A.md`

No new dependencies. `mobile/vendor/**` was not edited. No server files.

## Brief items

1. Network chip. `FileViewer.tsx` `891`–`929`: `web` / `web-off`, label `artifact.networkShort`, off is transparent, on is `primary` / `primaryForeground`, min 48×48, role `switch`, checked state, labels `artifact.network` / `artifact.networkOn`. Label hidden when the window is under 400 dp (`918`). Turning on opens the existing dialog (`1067`); turning off is immediate (`896`). Hint once, via `kv` key `artifact.networkHint`, only when network is off (`144`–`155`).
2. Chat back. `chat/[key].tsx` `35`–`40`: `scheduleLeave` stays, then `router.replace("/")` and `DrawerActions.openDrawer()`. Hardware back `46`–`49` does the same and returns `true` while focused. If the drawer is already open it returns `false` so the drawer closes itself (`47`). Other screens are unchanged.
3. Keyboard. `Sheet.tsx` `21`–`45`: `KeyboardAvoidingView` with `padding` on iOS and `height` on Android, `maxHeight` about 90% of the window minus the top inset, `ScrollView` with `keyboardShouldPersistTaps="handled"` unless `scroll={false}`.
4. Dictation. `sttEngine.ts` `66`–`67`, `131`–`148`, `170`–`180`: `lastPartial`, `stopping`, an error while stopping does not emit `error`, `stop()` resolves `lastPartial || finalText`. `cancel()` still clears both (`184`–`188`). `VoiceButton.tsx` `75`–`97` uses that string. `voiceLoop.ts` `343`–`355` dispatches it.

`stop()` prefers `lastPartial` over `finalText`. The brief wrote `finalText || lastPartial`, but a partial is stored already joined with earlier sentences, and the brief's own test requires `"prima frase seconda"`.

The sheet test cannot see the `KeyboardAvoidingView` class: React Native renders it as a `View` with bottom padding. The test checks that wrap and the `RCTScrollView`.

## Sheets with text fields (read, not run on a phone)

The shared `Sheet` is what moves. Call sites with fields: new project (`ProjectsScreen.tsx`), edit project (`ProjectDetailScreen.tsx`), Kanban card (`TaskEditorSheet.tsx`), prompt editor and the prompt variable form, automation job, channel, MCP, provider add/edit, model preset, MCP OAuth. Stefano still needs to try on the phone: Progetti → new project, the Kanban card editor, and one more.

## Checks

```
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest --forceExit
Test Suites: 112 passed, 112 total
Tests:       912 passed, 912 total
Time:        8.392 s

npx tsc --noEmit
(no errors)
```

Jest printed `A worker process has failed to exit gracefully` and was force-exited. The suite itself passed. Not run on a device: keyboard, hardware back, and the globe icon were not checked on a phone.
