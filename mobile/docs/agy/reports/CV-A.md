# CV-A Report: WebUI coverage matrix

- **Branch:** `agy/CV-A`
- **Worktree:** `../nanobot-agy-cv-a`
- **Brief:** `mobile/docs/agy/briefs/CV-A.md`
- **Upstream pin:** `219c8bb2bcaaf8b491361cb1386be866f01e1637` from `mobile/vendor/nanobot/VERSION`

## Method

1. Listed upstream areas from `webui/src/components/**` (settings subtree, `Sidebar.tsx`, `thread/*`, `remote/*`, `workbench/PaneWorkbench.tsx`, `SessionSearchDialog.tsx`) and `webui/src/components/settings/SettingsPage.tsx` section switch.
2. Mapped each row to `mobile/app/**` routes and `mobile/src/screens/**` (plus `settings/`, `ecosystem/`, `extras/` where settings/ecosystem UI lives).
3. Before any **covered** status, opened the cited app file(s) and confirmed non-trivial UI or logic (not route name alone). Examples: `ChatDrawer.tsx` for sidebar rename/delete; `Composer.tsx` for attachments and mentions; `McpOAuthSheet.tsx` for MCP OAuth; `FileViewer.tsx` / `ArtifactWebView.tsx` for Mermaid.
4. Used **partial** when app implements a subset or different surface; **missing** when grep + screen read found no counterpart; **not needed on phone** for TUI/desktop-only flows per `tui/README.md`.

## Deliverable

- Added `mobile/docs/webui-coverage.md` only (no app code).

## Rows marked partial or missing (uncertainty)

| Row | Why partial / missing |
| --- | --- |
| Video composer attachments | `mediaCore.ts` supports `video` class; `Composer.tsx` image library/camera explicitly `mediaTypes: ["images"]` only — video may only arrive via document picker. |
| Bang / shell one-shot | No WebUI-specific UI; treated as server/agent behavior. |
| Stream/recovery notices | `NoticeRow.tsx` present; did not diff every upstream notice component. |
| Provider parameter matrix | `ProvidersPanel.tsx` is large; not every upstream provider field verified. |
| MCP custom + JSON import | Confirmed absent via `mobile/test/ecosystem/apps-skills-automations.test.ts` and no UI in `McpTab.tsx`. |
| Appearance reading prefs | Upstream `AppearanceSettingsView` local prefs (`activityMode`, `codeWrap`, `brandLogos`, …) — no matches in `mobile/src/settings/prefs.ts`. |
| Browser notifications section | Upstream `NotificationSettings.tsx` is browser-permission oriented; mobile uses `expo-notifications` in `extras/notifications.ts` with different UX. |
| Automation calendar | Upstream `AutomationCalendar.tsx`; mobile `AutomationsScreen.tsx` uses day sections only. |
| Session Ctrl+K dialog | Upstream `SessionSearchDialog.tsx` for fast session switch; mobile `/search` is broader (`fetchSearch` sources). |
| Goal state UI | Upstream `GoalStateStrip` in `ThreadComposer.tsx`; zero `goal_state` references under `mobile/src`. |
| Remote SSH / multi-host | Entire `webui/src/components/remote/*` connection manager absent from `mobile/app` routes. |

## Brief checklist

| Brief item | Done |
| --- | --- |
| Single doc `mobile/docs/webui-coverage.md` | Yes |
| Upstream commit + date + 5-line summary at top | Yes |
| Tables by area with required columns | Yes |
| Code verification before "covered" | Yes (see method) |
| Report in `mobile/docs/agy/reports/CV-A.md` | Yes |
| No other files touched | Yes |

## Verification

- **Not run:** `jest`, `tsc`, `expo export` — documentation-only task; brief forbids code changes.
- **Not run on device:** coverage is from static code read only.

## Deviations

None.
