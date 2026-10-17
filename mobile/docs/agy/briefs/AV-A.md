# AV-A: nanobot's face — the "Antenna" robot with six states (owner: agy)

Branch `agy/AV-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only.** It can run alongside CH-A: it touches only `src/ui/BotFace.tsx`, its callers' props, and the assets.

## The chosen design: "A · Antenna"
Draw it on a 100×100 grid and scale it to `size`. Use `react-native-svg`, which is already installed, and RN `Animated` with the native driver where possible.

**Shapes:**
- **Head:** a rounded rect, x18 y24, 64×56, radius 18.
  - Dark theme: `colors.accent` (#272233).
  - Light theme: `colors.foreground` (#1c1428), so the head stays dark on light backgrounds.
- **Ears:** two small rounded bars, 6×16, radius 3, at x12 and x82, y44, in a slightly lighter tone than the head.
- **Antenna:** a line from y14 to y24, plus a ball at cx50 cy11, r4.5, in `colors.brand`.
- **Eyes:** two rounded bars, 9×16, radius 4.5, at x34 and x57, y40, in `colors.brand`, the sunflower yellow.
- **Extras that appear only in some states:**
  - a "mouth" of three small bars under the eyes, 4×7, at x40, x48 and x56, y64, in `colors.primary`;
  - three "thought dots" top right, growing in size;
  - a small dashed "gear" ring bottom right, in `colors.primary`.

## The six states
`FaceState` becomes `"idle" | "thinking" | "working" | "writing" | "offline" | "error"`.

| State | When | Motion |
|---|---|---|
| idle | connected, nothing running | blinks every ~4 s: eyes scaleY 1 → 0.1 → 1 in about 200 ms |
| thinking | running, no tool active, no text streaming yet | eyes move up 5 units with a soft spring; the thought dots fade in a loop (staggered by 0.2 s); the antenna ball pulses its opacity |
| working | a tool is running | eyes glance right and left in a 1.6 s loop; the gear ring spins |
| writing | assistant text is streaming | eyes squint (scaleY 0.55, 3 units down); the mouth bars bounce like an equalizer (staggered) |
| offline | not connected | eyes become flat lines (scaleY 0.18) in `mutedForeground`; the antenna is grey; no motion |
| error | the last turn failed | eyes and antenna in `colors.destructive`; a short head shake, three times, then still |

**Transitions:** moving between states is smooth, about 300 ms on the eyes' position and size. Never jump.

**Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled`): keep the shapes of each state, with no loops and no shake.

## Wiring the states
- `faceStateOf(conn, running, tooling, failed)` gains a `streaming` argument. The order is:
  1. offline;
  2. error;
  3. working, if a tool is running;
  4. writing, if text is streaming;
  5. thinking, if running;
  6. idle.
- Update the caller in `screens/thread/ThreadScreen.tsx`, which must know when assistant text is streaming: the thread state already has the streaming message. Check the other callers: `ChatDrawer`, `ConnectScreen` (+`.web`), `ProjectsScreen`, `ProjectDetailScreen`. Their states stay as they are.
- The face in the chat header uses `size` about 36. Make sure the antenna ball does not get clipped: give the component its full box.

## App icon (optional, last)
- If time allows, export the idle face on the `primary` background as the adaptive icon foreground in `mobile/assets/`, and update `app.json`.
- **Do not** change the splash screen.
- Say in the report if you did it.

## Tests
- `faceStateOf` covers all six, with the right priority.
- `BotFace` renders each state, using a `testID` per state such as `face-idle`, `face-writing`.
- Reduced motion renders with no animation started (mock `isReduceMotionEnabled` to true).
- Existing snapshots and queries for `face-eye-*` still pass, or are updated on purpose.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Add dependencies: no Lottie, no Reanimated if it is not already a direct dependency.
- Edit server files or `mobile/vendor/**`.

## Report
`mobile/docs/agy/reports/AV-A.md` with:
- the files;
- the tests;
- what needs a phone to judge (the motion);
- whether the app icon was done.

Commit, push `agy/AV-A`, and give the last hash. Do not merge.
