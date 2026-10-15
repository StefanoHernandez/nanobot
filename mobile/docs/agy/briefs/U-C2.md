# U-C2: composer on two rows (owner: agy)

Branch `agy/U-C2`, created from the branch Claude tells you (default: `claude/projects`). Plan: `mobile/docs/superpowers/plans/2026-10-15-ui-artifacts-plan.md` (task U-C2).

## Read first
- `mobile/docs/agy/README.md` (rules) and `mobile/docs/design/companion.md` (design).
- `src/screens/thread/Composer.tsx`: the whole file. It coordinates mentions, the slash menu, attachments, voice, the outbox, steering and stop.

## Scope (only this file and tests)
`src/screens/thread/Composer.tsx` (layout only), new tests. No behaviour changes.

## What to build
Today the attach button, the reasoning pill and the context ring sit left of the input, and voice plus send sit right of it, so the text field is narrow. The new layout keeps everything inside the existing rounded white container:
- **Row 1:** the `TextInput` at full width; it grows from 1 to 6 lines, then scrolls.
- **Row 2:** `[attach] [reasoning pill] [context ring] ……spacer…… [microphone] [send | steer | stop]`.
- Everything above the container stays where it is: mentions popover, slash menu, attachment bar.
- **Keep exactly:**
  - every `accessibilityLabel`, `testID` and `onPress`;
  - the conditional logic: voice shown only when available, send vs steer vs stop, `disabled`/`loading`;
  - touch targets ≥ 48dp;
  - `KeyboardAvoidingView` behaviour.
- Padding: 12dp inside the container, 4dp between the rows.

## Tests (write first)
- **Layout:** the TextInput is not a sibling of the send button in the same row. Assert that the input's parent row contains no buttons, and that a second row contains attach and send.
- **Behaviour regression:** typing then pressing Send still calls `send` once. With `running` and an empty draft, Stop shows. With voice available and an empty draft, the microphone shows instead of Send.
- **All existing Composer tests pass unchanged.**

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `feat(mobile): composer on two rows`.
- Report in `mobile/docs/agy/reports/U-C2.md`.
