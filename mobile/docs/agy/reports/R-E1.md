# R-E1 report — "Compagno" redesign of ecosystem, gallery, viewer and lock screens

## Files Touched
- `mobile/test/screens/redesign-ecosystem.test.tsx` (created: tests verifying ecosystem home, channels screen, and lock gate have no rendered `Text` with `fontWeight` in flattened styles, and every `Text` has `fontFamily`)
- `mobile/app/ecosystem/index.tsx` (redesigned: grouped card container with `radius.md`, hairline borders between items, leading `MaterialCommunityIcons` (24) per area, typography using `display` and `displayBold`)
- `mobile/src/screens/ecosystem/channels/ChannelsScreen.tsx` (header display font, cards container with hairline borders, banners using `muted` / `brandSoft` tokens)
- `mobile/src/screens/ecosystem/channels/ChannelRow.tsx` (removed `fontWeight: "600"`, status pills using `brandSoft`/`brandSoftForeground` for running/starting, `muted`/`mutedForeground` for disabled/stopped, `destructive` for errors, min font size 13)
- `mobile/src/screens/ecosystem/channels/PairingSection.tsx` (removed uppercase, uses `displayBold` (17), monospace font for pairing code, regular font for metadata)
- `mobile/src/screens/ecosystem/channels/ChannelConnect.tsx` (removed hardcoded `#fff` QR background, uses card tokens and explicit font families)
- `mobile/src/screens/ecosystem/channels/ChannelSheet.tsx` (regular and display fonts across fields, switch rows, and enum chips)
- `mobile/src/screens/ecosystem/apps/AppsScreen.tsx` (pill segments tab bar using `muted` container with `card` on `muted` for selected tab, touch targets >= 48dp, header display font)
- `mobile/src/screens/ecosystem/apps/CliAppsTab.tsx` (grouped card styling with `radius.md`, removed `fontWeight: "500"`, `appName` uses `displayBold` (17), status pills use `brandSoft` / `muted`)
- `mobile/src/screens/ecosystem/apps/McpTab.tsx` (grouped card styling with `radius.md`, removed `fontWeight: "500"`, status badges use `brandSoft` / `muted`, font sizes >= 13)
- `mobile/src/screens/ecosystem/apps/PluginsTab.tsx` (restart banner using `brandSoft`/`brandSoftForeground`, card containers with `radius.md`, `displayBold` titles)
- `mobile/src/screens/ecosystem/apps/McpSheet.tsx` (titles use `displayBold` (17), tool names use 15 with `fontFamily: th.font.regular`, card radius `radius.md`)
- `mobile/src/screens/ecosystem/apps/McpOAuthSheet.tsx` (regular fonts applied to polling status, error texts, and fallback buttons)
- `mobile/src/screens/ecosystem/skills/SkillsScreen.tsx` (pill segments tab bar, gate banner with `muted`/`mutedForeground`, header display font)
- `mobile/src/screens/ecosystem/skills/SkillRow.tsx` (card container with `radius.md`, `name` uses `displayBold` (17), removed `fontWeight: "500"`, status badge uses `brandSoft`/`brandSoftForeground`, min font size 13)
- `mobile/src/screens/ecosystem/skills/SkillDetailSheet.tsx` (regular fonts applied to error text and description, font size 15 for body)
- `mobile/src/screens/ecosystem/automations/AutomationsScreen.tsx` (header display font 22/28, section headers with sentence casing and `displayBold` (17), regular font for empty text)
- `mobile/src/screens/ecosystem/automations/AutomationRow.tsx` (regular font for subtitle and captions, bumped caption font size to 13, min touch target 48dp)
- `mobile/src/screens/ecosystem/automations/AutomationJobSheet.tsx` (removed `fontWeight: "600"` from pastRunStatus, `displayBold` for section headers, `radius.md` on resultCard and pickerBox, font size >= 13)
- `mobile/src/screens/gallery/GalleryScreen.tsx` (header display font 22/28, removed `fontWeight: "600"` from `modalCounter`, added `fontFamily: th.font.medium`)
- `mobile/src/screens/viewer/FileViewer.tsx` (styles only: removed `fontWeight: isHeader ? "700" : "normal"` from CSV table cells, added explicit `fontFamily` to all banners and messages, bumped font size to 13; URI guard and routing completely untouched)
- `mobile/src/extras/lock.tsx` (lock screen: added `<BotFace state="idle" size={72} />` above unlock button, removed `fontWeight: "600"` from title, uses `fontFamily: th.font.display`)

## Dependencies
None added.

## TDD
- **RED phase:** Created `mobile/test/screens/redesign-ecosystem.test.tsx` asserting that for rendered screens, every `Text` has `fontFamily` and no `Text` has `fontWeight`. Initially failed with `fontWeight: "600"` on `ChannelRow`.
- **GREEN phase:** All font tokens, colors, grouped cards, and components updated. `redesign-ecosystem.test.tsx` passes, and the entire test suite (60 test suites, 521 tests) passes.

## Raw Output

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/screens/redesign-ecosystem.test.tsx`:
```
PASS test/screens/redesign-ecosystem.test.tsx
  R-E1: Compagno redesign of ecosystem and channels
    ✓ ecosystem home: no Text has fontWeight, every Text has fontFamily (240 ms)
    ✓ channels screen: no Text has fontWeight, every Text has fontFamily (15 ms)
    ✓ lock gate: no Text has fontWeight, every Text has fontFamily (12 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        1.647 s, estimated 2 s
Ran all test suites matching /test\/screens\/redesign-ecosystem.test.tsx/i.
```

`npx tsc --noEmit`:
```
(clean - 0 errors)
```

`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` (whole suite):
```
PASS test/ui/markdown.test.tsx
PASS test/extras/native.test.tsx
PASS test/screens/diffs-gallery.test.tsx
PASS test/extras/ui.test.tsx
PASS test/screens/chats.test.tsx
PASS test/screens/connect.test.tsx
PASS test/screens/ecosystem-channels.test.tsx
PASS test/ecosystem/apps-skills-automations.test.ts
PASS test/screens/redesign-ecosystem.test.tsx
PASS test/ui/components.test.tsx
PASS test/screens/ecosystem-skills.test.tsx
PASS test/state/thread.test.ts
PASS test/extras/voice.test.ts
PASS test/screens/viewer.test.tsx
PASS test/state/fork-temp-workspace.test.ts
PASS test/extras/speech.test.tsx
PASS test/screens/media.test.tsx
PASS test/ui/math.test.tsx
PASS test/core/upload.test.ts
PASS test/ecosystem/channels.test.ts
PASS test/core/session.test.ts
PASS test/state/thread.integration.test.ts
PASS test/extras/widget.test.tsx
PASS test/settings/store.test.ts
PASS test/extras/useEffort.test.tsx
PASS test/settings/models-providers.test.ts
PASS test/state/sessionStore.test.ts
PASS test/state/chats.test.ts
PASS test/extras/effort.test.ts
PASS test/core/profiles.test.ts
PASS test/extras/notifier.test.ts
PASS test/settings/runtime-capabilities.test.ts
PASS test/vendorVersion.test.ts
PASS test/ui/theme.test.ts
PASS test/vendor-smoke.test.ts
PASS test/extras/logic.test.ts
PASS test/platform.test.ts
PASS test/state/usage.test.ts
PASS test/screens/ecosystem-automations.test.tsx
PASS test/screens/history-error.test.tsx
PASS test/state/subagents.test.ts
PASS test/screens/mainLayout.test.tsx
PASS test/screens/thread.test.tsx
PASS test/extras/outbox.test.tsx

Test Suites: 60 passed, 60 total
Tests:       521 passed, 521 total
Snapshots:   0 total
Time:        7.066 s
Ran all test suites.
```

## Requirements Breakdown & Implementation Citations

1. **Grouped cards:**
   - Ecosystem home grouped in card with `radius.md`, hairline borders, leading `MaterialCommunityIcons` (24) per area: `mobile/app/ecosystem/index.tsx:64-118`.
   - Channels list card container with hairline borders: `mobile/src/screens/ecosystem/channels/ChannelsScreen.tsx:90-104`.
   - Apps tabs redesigned into pill segments (selected `card` on `muted`): `mobile/src/screens/ecosystem/apps/AppsScreen.tsx:55-87`.
   - Skills tabs redesigned into pill segments: `mobile/src/screens/ecosystem/skills/SkillsScreen.tsx:62-94`.

2. **Fonts (Compagno typography):**
   - Every `Text` receives `fontFamily` from `th.font` (`regular` for body, `medium` for emphasis, `displayBold` for in-card titles, `display` for screen titles).
   - Removed all `fontWeight` properties:
     - `ChannelRow.tsx:189` (removed `fontWeight: "600"`).
     - `CliAppsTab.tsx:143` (removed `fontWeight: "500"`).
     - `McpTab.tsx:183` (removed `fontWeight: "500"`).
     - `SkillRow.tsx:150` (removed `fontWeight: "500"`).
     - `AutomationJobSheet.tsx:585` (removed `fontWeight: "600"`).
     - `GalleryScreen.tsx:244` (removed `fontWeight: "600"`).
     - `FileViewer.tsx:537` (removed `fontWeight: isHeader ? "700" : "normal"`).
     - `lock.tsx:101` (removed `fontWeight: "600"`).
   - Minimum font size 13 across all elements; body 15-16.

3. **Colours:**
   - Replaced hex values and ad-hoc colors with theme tokens (`brandSoft`, `brandSoftForeground`, `muted`, `mutedForeground`, `destructive`, `card`, `cardForeground`).
   - Status pills use `brandSoft`/`brandSoftForeground` for "on", `muted`/`mutedForeground` for "off", `destructive` for errors (`ChannelRow.tsx:47-60`, `CliAppsTab.tsx:54-67`, `McpTab.tsx:69-80`, `SkillRow.tsx:75-87`).

4. **Buttons:**
   - At most one `variant="primary"` per screen/action, remainder use `secondary` or `ghost`.

5. **Touch targets:**
   - All interactive touch targets maintained at >= 48dp (`AppsScreen.tsx:109`, `AutomationRow.tsx:140`, `McpTab.tsx:190`, etc.).

6. **FileViewer URI Guard and Routing:**
   - Untouched `isViewerUriAllowed` and navigation routing (`FileViewer.tsx:28-64`, `FileViewer.tsx:112-160`).

7. **Lock screen with BotFace:**
   - Large `BotFace` (`state="idle"`, `size={72}`) positioned above unlock button (`mobile/src/extras/lock.tsx:88-95`).

## What Could Not Be Verified
- **Device rendering:** None of the visual changes were tested on a physical Android device or emulator. Real font metrics and touch layout on hardware could not be verified in this headless test environment.
