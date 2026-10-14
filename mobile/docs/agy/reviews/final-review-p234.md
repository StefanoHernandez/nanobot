# Final whole-branch review: Phases 2, 3, 4 (dev, 91e8380..HEAD @ efd3742)

Reviewer: Claude (controller plus 3 read-only scope reviewers). I re-checked every Important finding against the code. Parked ledger minors are not repeated.

## Verdict
**Not ready to merge to main.** The architecture holds:
- The HARD RULE holds: the only `client.onChat` is at `threadStore.ts:317`.
- No `console.*` calls in `src` or `app`.
- Raw mutations use snake_case on the wire.
- Every install path uses 150 s.
- 504 triggers a refetch and 403 shows the policy message.
- Exclusions are respected.
- The settings store resets on profile switch.

Even so, 15 Important integration bugs remain:
- 4 in the composer and thread lifecycle;
- 7 in the ecosystem screens: stale copies of hook state, an MCP OAuth flow that never ends, and a channel enable that installs packages on the host with no confirm;
- 4 in settings, security and the UI kit: a public deep link that reads app-private files, a web-search key that gets deleted, a custom-provider sentinel collision, and toasts hidden behind modals.

No Critical findings.

## Checks run
- `cd mobile && npx jest`: 49 suites, 406 tests pass.
- `npx tsc --noEmit`: clean.
- i18n it/en key sets are identical. 11 keys are used with an inline English fallback and are missing from both files (M9).
- `grep onChat` and `grep console.*`: clean.
- WebView: only `MathBlock.tsx`, with JS off, `about:blank` only and no file access.
- Mutations still pending when a profile closes are rejected by vendor `handleClose` (503). A stale *mutation* therefore can't write into a new session. Stale HTTP GETs and async IIFEs still can (see below).

## Critical
None.

## Important

### I1. Composer mentions leak across chats
- **Where:** `mobile/src/screens/thread/Composer.tsx:67-69`, `:262-277`; `ThreadScreen.tsx:45`.
- **Why:** the Drawer keeps a single `chat/[key]` screen instance (`app/(main)/_layout.tsx`; `ChatDrawer` uses `router.navigate`), so Composer is not remounted when `chatKey` changes. `pickedSessions`, `pickedApps`, `pickedPresets`, `cursor` and `sheetOpen` are local state and are never pruned in `handleSend`.
- **Scenario:** in chat A pick `@chatX` or a CLI app. Switch to chat B through the drawer, where the draft is "hello", and press send. B's message carries A's `session_mentions` / `cli_apps`, so another chat's context gets injected. A voice transcript still in flight also lands in B's draft.
- **Fix:** `<Composer key={chatKey} chatKey={chatKey} />`, and run `pruneMentions(draft, …)` on all three lists inside `handleSend`.

### I2. Mentions dropped after an async upload failure
- **Where:** `Composer.tsx:271-276` with `threadStore.ts:396-417`.
- **Why:** with files attached, `send()` returns `true` before the upload runs, so Composer clears the picked mentions at once. The upload then fails, and the draft and `pendingFiles` are kept as designed.
- **Scenario:** attach a file and pick `@chatX`. The upload fails (for example `upload_unavailable` after a reconnect), the user taps send again, and the text still shows `@chatX` but no `session_mentions` are sent.
- **Fix:** store the picked mentions in the thread slice next to `pendingFiles` and clear them only on upload success. Or clear them in Composer only when `uploading` goes true→false with no `sendError`.

### I3. Upload is not bound to one connection and has no timeout
- **Where:** `mobile/src/core/upload.ts:53-75`, called from `threadStore.ts:406-407`.
- **Why:** vendor `uploadAttachments` checks that the connection is unchanged before each file and before sending, and it aborts after 315 s. The mobile copy reads `session.uploadCapability` fresh for each file and has no abort signal.
- **Scenario:**
  - The socket reconnects between file 1 and file 2. The references come from two capabilities and are sent on the new connection, so the server rejects or ignores some of them.
  - A stalled POST on a flaky phone network leaves `uploading: true` forever. Send stays disabled for that chat until a profile switch.
- **Fix:** capture `cap0 = session.uploadCapability`, and throw `upload_unavailable` if `session.uploadCapability !== cap0` before each file and before `sendMessage`. Pass `signal: AbortSignal.timeout(315_000)` to `fetch`. This also covers Review Focus 2.

### I4. Temporary chat not discarded on Back
- **Where:** `app/(main)/chat/[key].tsx:6`; `threadStore.ts:461-467` (`useThread` cleanup).
- **Why:** `leave`/`scheduleLeave` runs only on unmount or when the key changes. `router.back()` returns to Home, but the Drawer keeps the `chat/[key]` screen mounted.
- **Scenario:** open a temporary chat and press Back. The chat stays in the drawer list, its subscription stays live, and `discard_temporary_chat` is not sent. This breaks Review Focus 3 ("back").
- **Fix:** in `onBack`, call `threadStore.getState().leave(session, key)` when `chatsStore.getState().isTemporary(key)`. Or schedule the leave on blur with `useFocusEffect`.

### I5. Channel enable installs on the host with no confirm, gate or policy copy
- **Where:** `mobile/src/screens/ecosystem/channels/ChannelRow.tsx:48-61`.
- **Why:** the switch calls `channelEnable` → `settings.feature.enable`, which can pip-install the channel package on the host. There is no confirm `Dialog`, no `installGate`, no `isPolicyError` mapping, and the `{timedOut:true}` result is ignored.
- **Scenario:**
  - One tap installs software on the host, which violates the R-P4-2 / P3 dangerous-change rule.
  - With the host flag off, the user sees the raw 403 text instead of "Abilita le installazioni remote dal PC".
  - A 504 is treated as success.
- **Fix:** reuse the PluginsTab pattern: a confirm Dialog that names the package, the policy banner on 403, and a toast `apps.timedOut` + refresh on timeout. Track the in-flight state per channel.

### I6. MCP OAuth never completes for a gateway-redirect flow; no cancel on unmount
- **Where:** `mobile/src/ecosystem/mcp.ts:126-134`, `:201-203`.
- **Why:** `McpOAuthFlowPayload.completion_input` is only ever `"callback_url"` or absent (vendor `types.ts:1274`), never `"device_code"`.
  - When it is absent (the https gateway redirects back to the host), `start()` never calls `pollStatus`, so the sheet stays on "awaiting user" after the browser authorises.
  - The unmount cancel is gated on `device_code`, so it is dead code and the host flow is never cancelled.
  - On `done` the MCP list is not refreshed.
  - `pollStatus` is a bare `for(;;)` loop that ignores AppState. It binds `session` from the closure and has no profile-switch guard.
- **Fix:**
  - Poll whenever `completion_input !== "callback_url"`, through `usePolling` with `expiresAtMs`.
  - Cancel any live flow on unmount.
  - Refresh `useMcp` on `done`.

### I7. Sheets own a second copy of the hook, so lists go stale after actions
- **Where:** `AutomationJobSheet.tsx:37` (`useAutomations()`), `McpSheet.tsx:27` (`useMcp()`).
- **Why:** each sheet creates its own hook instance, with an extra GET on mount. Run, delete, update and changeChat (automations), and enable/tools (MCP), update only the sheet's copy.
- **Scenario:**
  - Delete an automation: the sheet closes and the deleted job stays listed.
  - Save an MCP preset: the card still says "Disabled / Not configured".
  - The `job` prop stays stale.
- **Fix:** pass the parent screen's actions or `refresh` into the sheet as props, and drop the sheet-local hook.

### I8. Automation edit corrupts "at" and "every" schedules
- **Where:** `AutomationJobSheet.tsx:66`, `:118-134`.
- **Why:**
  - For an `at` job, `String(at_ms)` is sent as `expr` with `kind:"at"` and no `at_ms`.
  - For an `every` job, the field starts empty and `scheduleRequired` blocks even a message-only edit.
  - `tz` is dropped for cron jobs.
- **Scenario:** editing only the message of a one-shot or interval job either fails with a 400 or rewrites the schedule. A cron job loses its timezone.
- **Fix:** send `schedule` only when it was edited, map it per kind (`at_ms` / `every_ms` / `expr`), and keep `tz`.

### I9. Install gate never refreshes
- **Where:** `AppsScreen.tsx:22`, `SkillsScreen.tsx:33`; gate checks at `apps.ts:41,102` and `skills.ts:77`.
- **Why:** `installGate` reads the settings store. Only `SettingsShell` loads it, and only `if (!data)`. The ecosystem screens never refresh it, and pull-to-refresh refetches only the lists.
- **Scenario:**
  - The user follows the banner, enables remote installs on the PC, comes back and pulls to refresh. The buttons stay disabled because the client-side gate throws before reaching the server.
  - After a profile switch the store is `null`, so the gate fails closed until Settings is opened.
- **Fix:** call `useSettings().refresh()` on focus and on pull-to-refresh in Apps and Skills, or whenever `data` is null.

### I10. Pairing requests never refresh; approve and deny errors unhandled
- **Where:** `channels/PairingSection.tsx:12-19`, `ChannelsScreen.tsx:50`.
- **Why:** `usePairing` fetches once on mount. Pull-to-refresh refreshes channels only. `handleConfirmApprove` and `deny` have no catch, and `error` is never rendered.
- **Scenario:** a new pairing request (someone asking for access to the agent) never appears until the screen is re-entered. A failed approve is an unhandled rejection with no feedback.
- **Fix:** call the pairing `refresh` from the screen's `onRefresh` and on focus, and wrap approve/deny in try/catch with a toast.

### I11. Plugins enable has no in-flight state during the 150 s install
- **Where:** `apps/PluginsTab.tsx:32-48`.
- **Why:** while `settings.feature.enable` runs, the Switch stays off and stays enabled.
- **Scenario:** the user toggles again and confirms again. A second install of the same package starts on the host, and the server lock answers 409, shown as a raw toast.
- **Fix:** track the feature names in flight, and disable their Switch with a spinner.

## Minor

- **M1.** Promoted to I12 (two reviewers found it independently).
- **M2. Optimistic attachment rows show a broken URL.** `threadStore.ts:386` stores the local `file://`/`content://` URI. `absoluteMediaUrl` (`media.ts:55`) prefixes it with the host, giving `https://host/file:///…`, so thumbnails break during upload and permanently on failed rows. Fix: pass `file:` and `content:` URIs through unchanged.
- **M3. Upload IIFE has no lifecycle guard.** `threadStore.ts:396-417`. After `leave()` or a profile `reset()`, `patch(key)` re-creates a ghost slice and `sendMessage` runs on a stopped client. Fix: compare the runtime identity (`rts.get(key) === rt`) before patching or sending.
- **M4. Workspace writes cross profiles.** `workspace.ts:97` (`/api/workspaces` response) and `:76-80` (scope timeout timer) have no session guard, so a late reply or timer writes into the new profile's state. Fix: check `chatsStore.getState().session === session`.
- **M5. Subagent writes unguarded.** `subagentsStore.ts:53-56` (`cancelSubagent` ingests after a reset) and `SubagentThreadScreen.tsx:22-27` (no active flag, so an older response can land last). Fix: add a gen/active guard.
- **M6. Stale send error re-toasts.** `Composer.tsx:129-146`. `sendError` stays in the slice, so switching back to that chat shows the toast again. Fix: add a store action to clear it once shown.
- **M7. `refreshSettings` error branch has no session check.** `src/settings/store.ts:50`. A failed fetch from the old profile sets `error` in the new one. Fix: add the same session guard the success branch has.
- **M8. Raw `e.message` toasts across the ecosystem screens.** McpTab:30,46,56,65,77; McpSheet:58; CliAppsTab:54,67; ChannelSheet:87; ChannelRow:59; Automations*. The ledger parked this for skills only, but it is wider: MCP test/reconnect and channel validate errors can echo server URLs or config values. Fix: map errors to i18n codes and show a generic message.
- **M9. i18n keys missing in both en and it**, so the inline English fallback shows in Italian: `common.back|success|close|saving|show|hide|edit|keep`, `automations.runSuccess|saved|chatChanged`.
- **M10. Channel connect success not applied.** `ChannelConnect.tsx:28`: `onFeatures` isn't passed, so the `nanobot_features` sent with a successful connect is dropped and the list stays stale. Fix: pass `apply` from `useChannels`.
- **M11. Channel connect polling has no bound and no profile guard.** `channels.ts:207-215`. Without `expires_at_ms`, non-403 errors keep it polling forever. After a profile switch, `mutateRef` targets the new host with the old `session_id`. Fix: reset `sid` and `gen` on session change, and cap consecutive errors.
- **M12. Restart banner stays after a restart.** `ChannelsScreen.tsx:34`, `PluginsTab.tsx:55`. `requiresRestart` comes from the features payload, but `runRestart` refreshes settings only. Fix: refetch on `restartState === "done"`.
- **M13. ChannelSheet can wipe typed input.** `ChannelSheet.tsx:53-60`. The form resets when the `channel` object identity changes, so a parent refresh while the sheet is open discards what the user typed, secrets included. Fix: reset on `channel.name` or open, not on identity.
- **M14. "Run now" can report completion too early.** `automations.ts:135-152`. The result is fetched straight after `automation.run`. If `run_history` isn't updated yet (async run, or a `delete_after_run` job), `run_at_ms` falls back to `Date.now()` and the UI shows "completed" with no result.
- **M15. CLI apps track one in-flight app.** `CliAppsTab.tsx:16`: `loadingApp` is a single string, so a test on app B clears A's install spinner.
- **M16. Hardcoded `#fff`.** `ChannelRow.tsx:34` and `ChannelSheet.tsx:188`: use a destructive-foreground token. The white QR background in `ChannelConnect.tsx:51` is acceptable.
- **M17. Settings data loaded once.** `SettingsShell.tsx:20-22` refreshes only when `data` is null, so changes made from the PC never show until a profile switch. Fix: refresh on focus.
- **M18. Gallery route decodes twice.** `app/gallery/[key].tsx:7` runs `decodeURIComponent` on a param expo-router has already decoded. It only breaks keys that contain `%`.

## Settings, security and UI kit (Phase 3 and cross-cutting)
Server-side check: `settings_models.py` accepts both snake_case and camelCase aliases, and restores masked `extra_headers` values.

Checked and fine:
- Concurrent card saves keep the other cards' edits (`useResync`).
- The exit guard works.
- Provider keys are sent only when typed.
- Feature checks fail closed and use 150 s.
- The `IconButton`/`Button` prop changes are additive, and every caller still matches.
- `Button`, `IconButton`, `TextField` and `Chips` are at least 48 dp; `ListItem` is 56.
- Route params carry no secrets.

### I12. `/viewer` deep link reads any app-private file (security)
- **Where:** `app/viewer.tsx:6`, `FileViewer.tsx:52-63,88-100`; the `nanobot` scheme is registered in `app.json:68`.
- **Scenario:** `nanobot://viewer?uri=file:///data/user/0/<pkg>/files/…&name=x.json`, from any link or app, renders a sandbox file. Share / Open-with then hands it to another app.
- **Fix:** accept only `uri` values under `Paths.cache` + `media/` (the `downloadMedia` output); otherwise show an error.

### I13. Web-search "keep current key" deletes the stored key
- **Where:** `screens/settings/common.tsx:56` with `CapabilitiesSection.tsx:206-207` and `settings/capabilities.ts:56`.
- **Why:** `HintSecretField` "keep" calls `onEdit(false)` then `onChangeText("")`. WebCard's two handlers both spread the same stale `f`, so the second wins: `keyEditing:true` and `apiKey:""`.
- **Scenario:** an `optional_api_key` provider has a stored key. The user taps the pencil, then "keep", then Save. `webSearchPayload` sends `api_key: ""` and the server deletes the key. This breaks P3 Review Focus 2.
- **Fix:** use functional updaters (`setF(x => ({...x, …}))`), or a single combined callback in `HintSecretField`.

### I14. "Add custom provider" sentinel collides with the built-in `custom` provider
- **Where:** `ProvidersPanel.tsx:23,27,42,45-46`.
- **Why:** `sel = "custom"` is also a real registry provider (`nanobot/providers/registry.py:207`).
- **Scenario:** tapping "Add custom" or the built-in Custom row mounts `ProviderSheet` and `CustomProviderSheet` as two stacked Modals.
- **Fix:** use a sentinel no provider can take (`"__add_custom__"`) or a tagged union.

### I15. Toasts are invisible while a Sheet or Dialog is open (Android)
- **Where:** `ToastHost` is mounted at `app/_layout.tsx:56`, outside every RN `Modal`. On Android each Modal is its own window, drawn above it.
- **Scenario:** a provider save fails with a non-field error (`ProvidersPanel.tsx:95,166,214`, `ModelsSection.tsx:168,180`), or an error occurs in McpSheet, ChannelSheet or AutomationJobSheet. The spinner stops and the user sees nothing. This defeats the spec rule that `ok:false` shows a toast.
- **Fix:** mount a `ToastHost` inside `Sheet` and `Dialog`, or show inline errors in sheets.

### Settings and UI minors
- **M19. Blank screen on settings load failure.** `store.ts:50` sets `error`, but no screen renders it, and sections `return null` with no retry. Fix: an error row with Retry in `SettingsShell`.
- **M20. Restart banner never clears.** `restartState` stays `"done"` for the whole session (`store.ts:123`). With no writable chat, `runRestart` goes straight to "timeout" (`store.ts:97`) with a misleading message.
- **M21. Local service access has no confirm.** `NetworkSafetyCard.tsx:30` saves `webui_allow_local_service_access=true` with no dialog, though it relaxes SSRF protection just as a whitelist edit does.
- **M22. One `busy` flag shared by all groups.** `RuntimeConfigSection.tsx:30,49`: the first save to finish clears another group's spinner.
- **M23. Unrendered field errors are swallowed.** `ProvidersPanel.tsx:94`: server field errors for keys that aren't rendered (`api`, `provider`) give neither a field error nor a toast.
- **M24. Provider catalogue cache survives a profile switch.** `settings/models.ts:137`: the module `catalogCache` is keyed by provider name only, so server B shows A's model list until refresh. Fix: clear it in the sessionStore `close()`.
- **M25. `router.back()` has no fallback.** Settings and ecosystem screens have no `canGoBack()` fallback, so a deep link straight into them can't go back.

## Blockers for the next agent
- Fix I1–I15 before the APK and phone test. I1, I3 and I4 touch threadStore/Composer: do them in one task. I5–I11 are ecosystem UI: they suit agy briefs.
- The vendor UI components (`AutomationsSettings.tsx` and others) are not vendored. Check automation-run result semantics (M14) against the upstream source.
- No virtualenv is involved (JS-only project).
