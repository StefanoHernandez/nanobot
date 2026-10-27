# UI-H1 report

## Files changed
- `mobile/src/ui/theme.ts` — Herald graphite palette, accent matrix, Geist type scale, radii, neutral `surface`/`bezel`
- `mobile/src/ui/ThemeProvider.tsx` — `ui.accent` in kv, `useAccentPreference`, memoized `getTheme(scheme, accent)`
- `mobile/src/ui/Halo.tsx` — SVG radial halo
- `mobile/src/ui/components/*` — Button, SegmentedTabs, Sheet, Dialog, TextField, ListItem; new `SectionLabel`, `StatusText`
- `mobile/src/screens/settings/AppearanceSection.tsx` — accent picker row
- `mobile/src/screens/settings/SettingsShell.tsx`, `ecosystem/apps/AppsScreen.tsx`, `thread/ThreadScreen.tsx` — Halo
- `mobile/src/screens/thread/{MessageRow,Composer}.tsx`, `markdown/CodeBlock.tsx` — pilot chat styling
- `mobile/src/screens/ecosystem/apps/McpTab.tsx` — status line, card surface, ghost remove
- `mobile/app.json`, `app/NativeIntegrations.web.tsx`, `package.json` — Geist fonts; removed Atkinson/Bricolage packages
- `mobile/src/i18n/en.json`, `it.json` — accent + MCP status strings
- Tests: `test/ui/theme.test.ts`, `test/ui/accent-preference.test.tsx`, `test/screens/mcp-status-ui.test.tsx`; artifact/export color expectations

## Dependencies
- Added `@expo-google-fonts/geist`, `@expo-google-fonts/geist-mono` via `npx expo install`
- Removed `@expo-google-fonts/atkinson-hyperlegible`, `@expo-google-fonts/bricolage-grotesque`

## Brief checklist
| Item | Location |
| --- | --- |
| Graphite tokens + new color fields | `theme.ts` |
| Accent picker (6 colours, 48dp target) | `AppearanceSection.tsx:69-108` |
| `useAccentPreference` + kv `ui.accent` | `ThemeProvider.tsx` |
| Geist fonts in app.json / web | `app.json`, `NativeIntegrations.web.tsx` |
| Button variants incl. inverse + quiet destructive | `Button.tsx` |
| SegmentedTabs well/thumb | `SegmentedTabs.tsx` |
| Sheet/Dialog/TextField/ListItem | respective files under `components/` |
| SectionLabel, StatusText, Halo | new components + `Halo.tsx` |
| Chat pilot (bubble, composer, code well) | `MessageRow.tsx`, `Composer.tsx`, `CodeBlock.tsx` |
| MCP pilot (status line, ghost remove) | `McpTab.tsx` |
| WCAG contrast test 6×2 accents | `test/ui/theme.test.ts` |

## Contrast (accentText on background, WCAG relative luminance)
| Accent | Light | Dark |
| --- | --- | --- |
| Violet | ≥4.5 | ≥4.5 |
| Blue | ≥4.5 | ≥4.5 |
| Green | ≥4.5 | ≥4.5 |
| Orange | ≥4.5 | ≥4.5 |
| Pink | ≥4.5 | ≥4.5 |
| Teal | ≥4.5 | ≥4.5 |

(Enforced in `test/ui/theme.test.ts` via `getTheme` for each pair.)

## What to check on device
- Settings → App: theme chips, new **Accent** row (six swatches), violet default
- Chat light/dark: soft halo top-left, violet user bubble with glow, composer single surface (no tray), code blocks in `well` with header
- Ecosystem → Apps → MCP: one status caption per card (no filled badges), Remove is text-only ghost

## Deviations / notes
- `ActivityRow` tool line was already a text link; no gold chip change needed in `thread/**` beyond theme token remap (`brand` → accent).
- Compile-test updates only in `artifacts.test.tsx` and `export-artifact.test.ts` (viewer CSS vars follow `lightTheme`/`darkTheme`).
- `expo install` created a local `mobile/node_modules` in the worktree (not committed).

## Verification
### jest (raw tail)
```
Test Suites: 144 passed, 144 total
Tests:       1146 passed, 1146 total
Snapshots:   0 total
Time:        9.629 s
Ran all test suites.
```

### tsc
```
(exit 0, no diagnostics)
```

### expo export
- `npx expo export --platform android --output-dir /tmp/nb-export-uih1` — OK
- `npx expo export --platform web --output-dir /tmp/nb-export-uih1-web` — OK

Not run on a physical device in this session.
