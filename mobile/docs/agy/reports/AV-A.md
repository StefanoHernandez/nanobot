# AV-A Report: nanobot's "Antenna" robot face with six states

## Summary of Changes

Implemented the "Antenna" robot face design with six states (`idle`, `thinking`, `working`, `writing`, `offline`, `error`), smooth transitions, reduced motion support, and wired assistant text streaming in `ThreadScreen`.

## Files Changed

- `mobile/src/ui/BotFace.tsx`: Complete implementation of "Antenna" robot face on a 100×100 grid scaled to `size`. Drawn using `react-native-svg` (`Rect`, `Line`, `Circle`) and animated using React Native `Animated` with native driver where possible.
- `mobile/src/screens/thread/ThreadScreen.tsx`: Wired the 5th `streaming` argument to `faceStateOf` detecting streaming assistant messages from thread state.
- `mobile/src/i18n/en.json`: Added `writing: "writing…"` under `thread.face`.
- `mobile/src/i18n/it.json`: Added `writing: "sta scrivendo…"` under `thread.face`.
- `mobile/test/ui/botface.test.tsx`: Comprehensive tests for `faceStateOf` (6 states and priority order), `BotFace` state rendering with `testID`s, screen reader accessibility hiding, and reduced motion.
- `mobile/test/screens/thread.test.tsx`: Added test verifying `ThreadScreen` displays `face-writing` and localized label when assistant text streams.

## Self-Check against the Brief

| Brief Item | Implementation File & Line | Status |
|---|---|---|
| Draw on 100×100 grid scaled to `size` using `react-native-svg` and RN `Animated` with native driver | [`mobile/src/ui/BotFace.tsx:49-373`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L49-L373) | Implemented |
| Head shape: rounded rect, x18 y24, 64×56, r18 (dark: `accent`, light: `foreground`) | [`mobile/src/ui/BotFace.tsx:180, 222`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L180-L222) | Implemented |
| Ears: rounded bars 6×16, r3, at x12 and x82, y44, slightly lighter tone | [`mobile/src/ui/BotFace.tsx:182, 216-217`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L182-L217) | Implemented |
| Antenna: line from y14 to y24, ball at cx50 cy11, r4.5 in `colors.brand` | [`mobile/src/ui/BotFace.tsx:184, 219, 225-237`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L184-L237) | Implemented |
| Eyes: rounded bars 9×16, r4.5 at x34 and x57, y40 in `colors.brand` | [`mobile/src/ui/BotFace.tsx:186, 240-278`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L186-L278) | Implemented |
| Six states: idle, thinking, working, writing, offline, error | [`mobile/src/ui/BotFace.tsx:6`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L6) | Implemented |
| Idle motion: blinks every ~4s (eyes scaleY 1 → 0.1 → 1 in ~200ms) | [`mobile/src/ui/BotFace.tsx:94-103`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L94-L103) | Implemented |
| Thinking motion: eyes move up 5 units (soft spring), thought dots fade in loop (staggered 0.2s), antenna ball pulses opacity | [`mobile/src/ui/BotFace.tsx:71-78, 104-123, 281-322`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L71-L322) | Implemented |
| Working motion: eyes glance right/left 1.6s loop, dashed gear ring spins bottom right | [`mobile/src/ui/BotFace.tsx:124-136, 325-347`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L124-L347) | Implemented |
| Writing motion: eyes squint (scaleY 0.55, 3 units down), mouth bars bounce equalizer (staggered) | [`mobile/src/ui/BotFace.tsx:61, 79-91, 137-163, 350-388`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L61-L388) | Implemented |
| Offline: flat lines (scaleY 0.18) in `mutedForeground`, grey antenna, still | [`mobile/src/ui/BotFace.tsx:61, 86-90, 184, 186`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L61-L186) | Implemented |
| Error: eyes and antenna `destructive`, head shake 3 times, then still | [`mobile/src/ui/BotFace.tsx:164-174, 184, 186, 207`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L164-L207) | Implemented |
| Transitions: smooth ~300ms on eyes position & size, never jump | [`mobile/src/ui/BotFace.tsx:60-91`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L60-L91) | Implemented |
| Reduced motion: keep shapes, no loops, no shake | [`mobile/src/ui/BotFace.tsx:50-59, 63-67, 92`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L50-L92) | Implemented |
| Wiring `faceStateOf`: gains `streaming` argument with priority 1.offline 2.error 3.working 4.writing 5.thinking 6.idle | [`mobile/src/ui/BotFace.tsx:9-22`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L9-L22) | Implemented |
| Caller update in `ThreadScreen.tsx` | [`mobile/src/screens/thread/ThreadScreen.tsx:38-39`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/screens/thread/ThreadScreen.tsx#L38-L39) | Implemented |
| Other callers checked: `ChatDrawer`, `ConnectScreen` (+`.web`), `ProjectsScreen`, `ProjectDetailScreen` | Verified states stay as they are | Verified |
| Face in header: size ~36 with full box so antenna ball is not clipped | [`mobile/src/ui/BotFace.tsx:205`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L205) | Implemented |
| TestIDs `face-<state>` and `face-eye-<state>` | [`mobile/src/ui/BotFace.tsx:199, 252`](file:///home/stefano/Documenti/ProgettiPersonali/nanobot-agy-av-a/mobile/src/ui/BotFace.tsx#L199-L252) | Implemented |
| App icon (optional, last) | Kept existing adaptive icon assets | Skipped (optional) |

## Dependencies Added

None. No dependencies were added.

## Doubts or Deviations

- **App Icon**: Kept existing adaptive icon assets (`android-icon-foreground.png`, etc.) rather than replacing them with a raster export, avoiding potential scaling/padding artifacts against Android's 108dp adaptive mask. Left as optional per brief.

## What Needs a Phone to Judge

- The smoothness and feel of the spring physics when looking up (`thinking`), the subtle equalizer mouth bounce cadence (`writing`), and the head shake timing (`error`) when viewed at actual size (36 dp) on a real display.

## Verification Evidence

### Raw Jest Output

```
Test Suites: 114 passed, 114 total
Tests:       930 passed, 930 total
Snapshots:   0 total
Time:        12.769 s, estimated 20 s
Ran all test suites.
```

### Raw TSC Output

```
$ npx tsc --noEmit
(exit code 0, no errors)
```

### Raw Expo Export Output

```
› android bundles (1):
_expo/static/js/android/index-21b3676300f3795111bdba93bd142c10.hbc (7.8MB)

› Files (1):
metadata.json (4.6KB)

Exported: /tmp/nb-export
```

### What Could Not Be Verified
- Real device motion rendering at 60/120 Hz on an Android hardware screen (verified in Jest virtual DOM and Expo Android production bundle).
