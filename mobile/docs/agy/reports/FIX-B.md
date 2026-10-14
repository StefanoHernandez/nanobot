# FIX-B report — final review fixes, ecosystem

## Summary
Execution of task `FIX-B` addressing findings from `docs/agy/reviews/final-review-p234.md` across the ecosystem screens, hooks, components, i18n dictionaries, and test suites.

## Status of Findings

| ID | Finding | Status | Fix Details |
|---|---|---|---|
| **I5** | Channel enable installs on host without confirm, gate or policy copy | **Fixed** | Added confirmation `Dialog` naming the channel before enabling in `ChannelRow.tsx`, mapped 403 policy errors via `toastEcosystemError`, and handled timeout with `apps.timedOut` toast. |
| **I6** | MCP OAuth never completes for gateway-redirect flow; unmount never cancels | **Fixed** | Updated `useMcpOAuth` in `mcp.ts` to poll whenever `completion_input !== "callback_url"` using `usePolling` with expiry timestamp, sends `settings.mcp.oauth_cancel` on unmount for pending flows, and calls `onDone` to refresh list. |
| **I7** | Sheets own a second copy of list hook causing stale state | **Fixed** | Removed sheet-local hook calls in `AutomationJobSheet.tsx` and `McpSheet.tsx`. Lifted actions (`run`, `deleteJob`, `update`, `changeChat`, `fetchResult`, `enable`, `tools`) and derived jobs from parent screens down as props. |
| **I8** | Automation edit corrupts `at` and `every` schedules and drops `tz` | **Fixed** | `AutomationJobSheet.tsx` preserves schedule `kind` (`cron`, `at`, `every`), mapping `at_ms` and `every_ms` numerically when edited, preserving `tz` and original schedule fields on message-only edits. |
| **I9** | Install gate never refreshes on focus or pull-to-refresh | **Fixed** | Added navigation focus listeners and pull-to-refresh handlers calling `useSettings().refresh()` in `AppsScreen.tsx` and `SkillsScreen.tsx`. |
| **I10** | Pairing requests never refresh; approve/deny errors unhandled | **Fixed** | In `ChannelsScreen.tsx`, focus and pull-to-refresh reload both channels and pairing requests. In `PairingSection.tsx`, `approve` and `deny` are wrapped in try/catch with `toastEcosystemError`. |
| **I11** | Plugins enable has no in-flight state during 150s install | **Fixed** | In `PluginsTab.tsx`, tracked `inFlight: Set<string>` to disable Switch, display `ActivityIndicator`, and ignore duplicate toggles during enable. |
| **M8** | Raw `e.message` toasts across ecosystem screens | **Fixed** | Implemented `toastEcosystemError(e, t)` in `src/ecosystem/common.ts` mapping 403 to `apps.gateBanner`, 504/timeout to `apps.timedOut`, and all other errors to `common.operationFailed`, ensuring raw messages are never toasted. |
| **M9** | Missing i18n keys in both `en.json` and `it.json` | **Fixed** | Added all missing keys: `common.back`, `common.success`, `common.close`, `common.saving`, `common.show`, `common.hide`, `common.edit`, `common.keep`, `common.operationFailed`, `channels.enableTitle`, `channels.enableMessage`, `automations.runSuccess`, `automations.saved`, `automations.chatChanged`. |
| **M10** | Channel connect success not applied | **Fixed** | Passed `apply` from `useChannels` as `onFeatures` through `ChannelsScreen -> ChannelSheet -> ChannelConnect -> useChannelConnect`. |
| **M11** | Channel connect polling has no bound and no profile guard | **Fixed** | In `useChannelConnect`, resets `sid` and `gen` on session change and stops polling after 5 consecutive non-403 errors. |
| **M12** | Restart banner stays after a restart | **Fixed** | Refetches channels and plugins features when `restartState === "done"` in `ChannelsScreen.tsx` and `PluginsTab.tsx`. |
| **M13** | ChannelSheet can wipe typed input on object identity change | **Fixed** | In `ChannelSheet.tsx`, form resets on `open` or `channel.name` change instead of `channel` object identity. |
| **M14** | "Run now" can report completion too early | **Fixed** | In `automations.ts`, `run(id)` polls `/api/webui/automations` (every 2s, up to 60s) until `run_history` contains a run with `run_at_ms >= clickedAtMs`, then fetches the result. |
| **M15** | CLI apps track one in-flight app | **Fixed** | In `CliAppsTab.tsx`, replaced single `loadingApp` string with `inFlightApps: Set<string>` to track loading operations per app. |
| **M16** | Hardcoded `#fff` in ecosystem screens | **Fixed** | Replaced `#fff` in `ChannelRow.tsx` and `ChannelSheet.tsx` with `th.colors.destructiveForeground`. |
| **M17** | Settings data loaded once in `SettingsShell` | **Fixed** | Added navigation focus listener in `SettingsShell.tsx` calling `refresh()` on focus. |

## Modified Files
- `mobile/src/ecosystem/common.ts`
- `mobile/src/ecosystem/channels.ts`
- `mobile/src/ecosystem/mcp.ts`
- `mobile/src/ecosystem/automations.ts`
- `mobile/src/screens/ecosystem/channels/ChannelRow.tsx`
- `mobile/src/screens/ecosystem/channels/ChannelSheet.tsx`
- `mobile/src/screens/ecosystem/channels/ChannelConnect.tsx`
- `mobile/src/screens/ecosystem/channels/ChannelsScreen.tsx`
- `mobile/src/screens/ecosystem/channels/PairingSection.tsx`
- `mobile/src/screens/ecosystem/apps/AppsScreen.tsx`
- `mobile/src/screens/ecosystem/apps/CliAppsTab.tsx`
- `mobile/src/screens/ecosystem/apps/McpSheet.tsx`
- `mobile/src/screens/ecosystem/apps/McpTab.tsx`
- `mobile/src/screens/ecosystem/apps/McpOAuthSheet.tsx`
- `mobile/src/screens/ecosystem/apps/PluginsTab.tsx`
- `mobile/src/screens/ecosystem/skills/SkillsScreen.tsx`
- `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx`
- `mobile/src/screens/ecosystem/automations/AutomationsScreen.tsx`
- `mobile/src/screens/settings/SettingsShell.tsx`
- `mobile/src/i18n/en.json`
- `mobile/src/i18n/it.json`
- `mobile/test/ecosystem/apps-skills-automations.test.ts`
- `mobile/test/screens/ecosystem-channels.test.tsx`
- `mobile/test/screens/ecosystem-automations.test.tsx`
- `mobile/test/screens/ecosystem-apps.test.tsx`
- `mobile/test/screens/ecosystem-skills.test.tsx`
- `mobile/test/screens/settings.test.tsx`

## Dependencies
None added.

## Raw Output

### `npx tsc --noEmit`
```
> nanobot-mobile@1.0.0 typecheck
> tsc --noEmit

(clean - 0 errors)
```

### `npx jest`
```
Test Suites: 49 passed, 49 total
Tests:       424 passed, 424 total
Snapshots:   0 total
Time:        9.599 s, estimated 54 s
Ran all test suites.
```
