# R-S1: "Compagno" redesign of the settings screens (owner: agy)

Branch `agy/R-S1`, created from `claude/redesign-companion`. Worktree `../nanobot-agy`.

## Read first
1. `mobile/docs/design/companion.md`: the design spec. It is binding.
2. `mobile/src/ui/theme.ts`: the tokens (`th.colors.*`, `th.font.*`, `th.radius.*`).
3. Reference screens already done by Claude, to copy the look:
   - `src/screens/thread/ThreadScreen.tsx` and `MessageRow.tsx`;
   - `src/screens/chats/ChatDrawer.tsx`;
   - `src/screens/connect/ConnectScreen.tsx`;
   - `src/screens/settings/SettingsShell.tsx` (header and restart banner);
   - `src/screens/settings/common.tsx` (`Head`).

## Scope (only these files)
- `src/screens/settings/*.tsx`, except `SettingsShell.tsx` and `common.tsx` `Head` (both done).
- `app/settings/*.tsx`.

## What to do
This is a **visual change only**. Do not change any behaviour, payload, prop name, i18n key or test ID.

1. **Grouped cards.** Every list of `ListItem`s or controls under a `Head` goes inside a card:
   ```tsx
   <View style={{ backgroundColor: th.colors.card, borderRadius: th.radius.md, marginHorizontal: 16, overflow: "hidden" }}>
   ```
   Use hairline separators between rows: `borderTopWidth: StyleSheet.hairlineWidth` and `borderTopColor: th.colors.border`, except on the first row. The settings root list (`SettingsScreen.tsx`) becomes cards of sections, each row with a leading `MaterialCommunityIcons` icon (24, `th.colors.foreground`).
2. **Fonts.** Every `Text` gets a `fontFamily` from `th.font`: `regular` for body, `medium` for emphasis, `displayBold` for in-card titles.
   - Remove every `fontWeight` in these files. With custom fonts on Android, `fontWeight` makes the text fall back to the system font.
   - Minimum size 13; body 15-16.
3. **Colours.** Use tokens only: no hex and no `rgba(` literals.
   - Status pills (enabled/disabled, active, default): `brandSoft`/`brandSoftForeground` for "on", `muted`/`mutedForeground` for "off", `destructive` for errors.
4. **Buttons.** At most one `variant="primary"` per screen; the rest are `secondary` or `ghost`.
5. **Touch targets.** Keep everything ≥ 48dp.

## Tests
- Add `test/screens/redesign-settings.test.tsx`. Render the settings root and one section (models) inside `ThemeProvider`. Assert that:
  - no rendered `Text` has `fontWeight` in its flattened style;
  - every rendered `Text` has a `fontFamily`.

  Use `StyleSheet.flatten` on `UNSAFE_getAllByType(Text)`.
- All existing tests must still pass unchanged. If a test breaks because of a style change, that is a regression: fix the code, not the test.
- Run `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit`.

## Done when
- Both commands are green.
- Commit `feat(mobile): Compagno redesign of settings screens`.
- Write the report `mobile/docs/agy/reports/R-S1.md`, following README "Before you say done". Say plainly that nothing was checked on a device.
