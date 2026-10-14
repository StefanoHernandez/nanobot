# P4-U2-fix1: review fixes for the Apps UI (owner: agy)

Claude's review of your commit `75340e2` found the CLI, plugin, gate and secret handling good. Fix the issues below **on the same branch `agy/P4-U2`**, in the folder `nanobot_androidapp-agy`. The requirements are still `mobile/docs/agy/briefs/P4-U2.md`.

## Critical
1. **`McpOAuthSheet.tsx` ~19-47: `oauth.start()` is never called.** `authUrl` and `completionInput` only exist after `start()` (see `src/ecosystem/mcp.ts` ~181), so in the real app the flow cannot begin.
   - Show an "Avvia autorizzazione" / "Start authorization" button that calls `start()`, or call it once when the sheet opens. Never call it twice.
   - Show a spinner while it starts.
   - Your current test passes only because the mock already has `authUrl`. Add a test where the mock starts in `idle` with no `authUrl`, the button calls `start` once, and the Authorize button appears after the mock updates.

## Important
2. **~63: the paste field shows for any truthy `completionInput`, including `device_code`, which is polling-only.** Show the paste field only when the completion input is the callback-URL kind (check the exact value in `vendor/.../types.ts` near `McpOAuthFlowPayload` and in `mcp.ts`). For device code, show the user code, if present, plus the polling label.
3. **~30-34 and ~75: Submit can fire twice.** Add an in-flight ref so it sends at most once, disable the field and button after submit, and clear the field after success.
4. **`McpTab.tsx` ~21-31 and `McpSheet.tsx` ~43: MCP enable has no confirm and ignores the gate.** The row Switch and the sheet Save both call `enable`. Put both behind the confirm dialog ("Attiva il server MCP <name> sul computer host"). When `installGate(...).allowed` is false, disable them as you did for CLI and plugins.

## Minor
5. ~81-85: map `oauth.error` to a fixed i18n string such as `mcp.oauth.error`. Never render the raw server text.
6. `McpSheet.tsx` ~48-50: `handleSave` swallows errors. Show an error toast (policy toast on 403).
7. Replace `Platform.OS === "ios" ? "padding" : "padding"` with `"padding"` in both files.
8. `CliAppsTab.tsx` ~61-70: Test shows a success or failure toast, as the MCP tab does.
9. `AppsScreen.tsx` ~47-61: give the tabs `accessibilityRole="tab"` and `accessibilityState={{ selected }}`.

## Tests (add)
- OAuth start, as in point 1.
- `device_code` shows no paste field.
- A double tap on Submit calls complete once.
- With the gate off, the MCP enable switch is disabled. With the gate on, enable opens a confirm, and confirm calls `enable` once.
- A failing `handleSave` shows a toast.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit on `agy/P4-U2` as `fix(mobile): MCP OAuth start, enable confirm and gate`. Append a "fix1" section to `mobile/docs/agy/reports/P4-U2.md`.
