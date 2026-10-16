# UX-A: a clear network button for artifacts, "back" from a chat returns to the chat list, sheets stay above the keyboard, and stopping dictation keeps the text (owner: Grok)

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

## 3. The keyboard covers the fields of every bottom sheet
**What goes wrong:** for example, Progetti → new project. The sheet opens at the bottom, the keyboard comes up over it, and the user cannot see what they type.

**The cause is in the shared component, not in the projects screen.** `src/ui/components/Sheet.tsx` is a `Modal` whose panel sits at the bottom. It has **no** keyboard handling. `Dialog.tsx` already wraps its content in `<KeyboardAvoidingView behavior="padding">`. `Sheet` is used in about 28 places, so the bug is everywhere a sheet has a text field: the Kanban card editor, prompts, automations, skills…

**Fix it once, in `Sheet.tsx`:**
- Wrap the backdrop and the panel in `KeyboardAvoidingView`. Use `behavior="padding"` on iOS and `"height"` or `"padding"` on Android: pick the one that works inside a `statusBarTranslucent` Modal. Copy what `Dialog` does if it works there.
- **Cap the panel height** so a long sheet never goes above the screen: `maxHeight` at about 90% of the window height, minus the top inset.
- **Make the content scroll.** When the children are taller than the cap, wrap them in a `ScrollView` with `keyboardShouldPersistTaps="handled"`.
  - Do not nest a second ScrollView where a sheet already has its own, such as `TaskEditorSheet`. Either accept a prop (`scroll={false}`) or remove the inner one. Pick the smaller change and list the call sites you touched.
- **When the keyboard is open,** the focused field and the sheet's buttons must be visible above it.
- **Do not change** any sheet's content or layout beyond this.

**Tests:**
- `Sheet` renders its children inside a `KeyboardAvoidingView`;
- a sheet taller than the window scrolls: the ScrollView is present with `keyboardShouldPersistTaps="handled"`;
- the existing sheet and screen tests stay green.

**Checking it:** jest cannot open a real keyboard. In the report, list the sheets with text fields you checked by reading the code. Stefano will test on the phone: Progetti → new project, the Kanban card editor, and one more.

## 4. Stopping voice dictation must keep what was transcribed
**What goes wrong:** the user dictates with the device engine. The words show up live in the composer as partial results. They press stop and get "Trascrizione non riuscita", and **the text is gone**.

**Why it happens** (read `src/extras/sttEngine.ts` and `src/screens/thread/VoiceButton.tsx`):
1. Android only turns text "final" at the end of a sentence. Until then there are only `partial` results. `DeviceSttEngine` keeps `finalText` but **not** the last partial.
2. When the user calls `stop()` mid-sentence, Android often answers with an `error` event, such as `no-match`, `speech-timeout` or `client`, instead of a last final plus `end`.
3. The engine forwards it as `error` and resolves `stop()` with `null`.
4. `VoiceButton`'s `error` handler shows the toast. `stopDeviceRecording` then finds no final text, and `onPartial("")` has already wiped the live text. Everything is lost.

**Fix it in the engine, where every caller goes through:**
- Keep `lastPartial`: the joined text of the last `partial`, the same string that is emitted.
- Add a `stopping` flag, set when `stop()` is called.
- **When stopping:**
  - an `error` event is **not** a failure: finish the turn like `end` does and **do not** emit `error`;
  - `stop()` resolves with `finalText || lastPartial || null`;
  - this covers both `end` and `error`.
- **When not stopping:** errors behave as today. A real failure the user did not cause still shows the toast.
- `cancel()` still throws the text away. The user asked for that.
- **In `VoiceButton.tsx`:** `stopDeviceRecording` uses the string `stop()` returns, which now includes the partial. Remove any path that shows the error toast after the user pressed stop: the engine no longer emits it, so check that nothing else does.
- `voiceLoop.ts` uses the same engine: check that it still behaves. A stop in the loop must also keep the partial text.

**Tests** in `test/extras/sttEngine.test.ts`:
- partial "ciao come", then `stop()`, then a native `error` `no-match`: `stop()` resolves to "ciao come" and no `error` event is emitted;
- final "prima frase" + partial "seconda", then stop + `end`: it resolves to "prima frase seconda";
- an `error` without stop is still emitted, as today;
- `cancel()` after partials resolves or returns nothing and keeps no text.

**In `VoiceButton`:** stopping after partials passes the text to `onTranscript` and shows no toast.

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
