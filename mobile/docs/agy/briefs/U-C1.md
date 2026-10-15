# U-C1: bot replies without a bubble, readable Markdown headings (owner: agy)

Branch `agy/U-C1`, created from the branch Claude tells you (default: `claude/projects`). Plan: `mobile/docs/superpowers/plans/2026-10-15-ui-artifacts-plan.md` (task U-C1).

## Read first
- `mobile/docs/agy/README.md` (rules) and `mobile/docs/design/companion.md` (design).
- `src/screens/thread/MessageRow.tsx` (bubbles), `src/ui/markdown/Markdown.tsx` (headings), `src/screens/thread/MessageList.tsx` (spacing).

## Scope (only these files)
`src/screens/thread/MessageRow.tsx`, `src/ui/markdown/Markdown.tsx`, `src/screens/thread/MessageList.tsx` (spacing only), i18n if needed, new tests.

## What to build
1. **Assistant answers without a bubble.**
   - Render the assistant content (reasoning block, Markdown, media, the Listen button) at full content width on the screen background: no card background, no border radius, no tail.
   - Keep the long-press menu and every behaviour, test ID and accessibility label.
2. **User messages keep their bubble**, unchanged: right aligned, max 85%, user bubble colours, tail on the right.
3. **Turn rhythm:** 16dp extra space before each user message, so turns read as blocks. The activity chip keeps its look.
4. **Markdown headings (`Markdown.tsx`):**
   - h1-h3 use `th.font.medium` (Atkinson bold), not the display face;
   - sizes h1 22/28, h2 19/25, h3 17/23, h4+ = body bold 16/24;
   - spacing 12dp above and 4dp below;
   - the display face is no longer used inside messages.
5. **Width:** code blocks, tables and media use the full width available (no 94% cap).

## Tests (write first)
- **An assistant message renders no bubble:** the flattened style of its wrapper has no `backgroundColor` equal to `th.colors.card`, and no `borderRadius`.
- **A user message still renders the bubble** (`backgroundColor === th.colors.userBubble`).
- **A Markdown `# Title`** renders with `fontFamily === th.font.medium`, never `display`/`displayBold`.
- **All existing tests pass unchanged.** If one breaks because of a style, fix the code, not the test (unless the test asserted the old bubble: then update it and say so in the report).

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- Commit `feat(mobile): bot replies without bubble, readable markdown headings`.
- Report in `mobile/docs/agy/reports/U-C1.md`, with each item → file:line. Say what was not checked on a device.
