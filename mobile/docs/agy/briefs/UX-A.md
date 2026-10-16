# UX-A: a clear network button for artifacts, and "back" from a chat returns to the chat list (owner: Grok)

Branch `grok/UX-A`, from `origin/main`, **in your own worktree** (see the prompt). Follow `mobile/docs/agy/README.md`: no rebase, one branch, a report at the end. App only: no server changes.

## 1. The artifact network switch becomes an icon button with a label
**Today:** in `src/screens/viewer/FileViewer.tsx`, around line 872, the toolbar has a bare `Switch` (`canNetwork`). There is no icon and no text, so the user cannot tell what it does. Without network, an artifact cannot load anything from the internet (map tiles, CDN libraries, data), so it looks broken.

**The change applies to every kind of artifact (HTML, React, map, chart…). Do not special-case any one of them.**
- **Replace the `Switch` with one pressable "chip" button:**
  - a globe icon, `web` from the icon set the app already uses (`web-off` when it is off, if that icon exists);
  - the short label `artifact.networkShort`: "Rete" / "Network".
- **Off state:** muted colors, the same look as the other toolbar buttons.
- **On state:** filled with `th.colors.primary` and the label in `primaryForeground`, so the state is visible at a glance.
- **Touch target:** at least 48×48. Keep the row from wrapping on a 360 dp screen: if space is short, the label may be hidden on narrow widths, but the icon must stay.
- **Behavior does not change:**
  - turning it on still opens the existing confirm Dialog (`artifact.networkTitle` / `networkBody` / `networkAllow`);
  - turning it off is immediate;
  - `askNetwork` / `network` work as today.
- **Accessibility:**
  - `accessibilityRole="switch"`;
  - `accessibilityState={{ checked: network }}`;
  - `accessibilityLabel` stays `artifact.network` when off and `artifact.networkOn` when on. The existing tests find it by role `switch` and by those names: keep them passing, and update them only if a query must change.
- **One-time hint:** the first time an artifact with network capability opens with network off, show a small toast: `artifact.networkHint`, "Se l'anteprima resta vuota o incompleta, tocca Rete" / "If the preview looks empty or incomplete, tap Network".
  - Remember it in `kv` with a safe try/catch, so it shows once per install.
  - Show nothing when network is already on.

## 2. "Back" from a chat opens the chat list
**Today:** `app/(main)/chat/[key].tsx` `onBack` calls `router.back()`, or `router.replace("/")`. Both land on the Home screen ("Ciao… / Nuova chat"). The user expects to go back to the list they came from, which is the drawer (`ChatDrawer`).

**The fix:**
- `onBack`:
  - keeps the `scheduleLeave` logic;
  - goes to the Home route, **then opens the drawer**.

  Use the Drawer navigation from `useNavigation()` / `DrawerActions.openDrawer()` from `@react-navigation/native`, which is already a dependency through expo-router.
- **The Android hardware back button** in a chat must do the same: open the drawer instead of showing Home. Use `BackHandler` inside `useFocusEffect` on the chat route, and return `true` only while the chat is focused.
- **When the drawer is already open**, hardware back closes it, which is the drawer's default. Do not break that.
- **Do not change** how other screens go back (settings, ecosystem, viewer).

## Tests (jest)
- Network button:
  - off by default, with role `switch` and checked false;
  - pressing it opens the confirm Dialog;
  - confirming turns it on (checked true) and the WebView gets `network`;
  - pressing it again turns it off without a Dialog;
  - the hint toast shows once, not on the second open, and not when network is on.
- Chat back:
  - pressing the header back arrow dispatches `openDrawer`, as the Drawer mock or a spy records it;
  - the hardware back on a focused chat does the same and returns `true`.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`. Read the results yourself before committing.

## Do not
- Add new dependencies.
- Edit `mobile/vendor/**`.
- Edit server files.

## Report
`mobile/docs/agy/reports/UX-A.md` with:
- the files you touched;
- the test numbers;
- any deviations.

Commit, push `grok/UX-A`, and give the last hash. Do not merge.
