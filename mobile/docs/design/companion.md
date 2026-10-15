# Design direction "Compagno" (chosen by the user, 2026-10-14)

The subject: a pocket dashboard for **your own** bot, which lives on a small Arduino board at home. The bot is a companion with a face, not a faceless tool. Everything stays calm and readable; **the face is the one memorable element**.

## Tokens (source of truth: `src/ui/theme.ts`)
| Role | Light | Dark | Use |
|---|---|---|---|
| background | `#F7F4FB` violet paper | `#0C0B10` black | screen canvas |
| card | `#FFFFFF` | `#16141E` | cards, composer, sheets |
| foreground / ink | `#1C1428` | `#F4F0F8` | text |
| mutedForeground | `#5C4E70` | `#C4B4D4` | secondary text |
| muted / secondary | `#EFE6F6` | `#2A2436` | quiet fills, chips |
| primary | `#4A2C72` | `#C9A6E8` | primary buttons (text = primaryForeground) |
| brand | `#E0A01A` | `#F0B429` | the bot's gold: eyes, send, "alive" accents. Never for errors. |
| brandSoft / brandSoftForeground | `#F8E7C0` / `#5C3D06` | `#3A3218` / `#F8E2A8` | tool-activity chips |
| userBubble | `#4A2C72` | `#6B4589` | your messages (white text) |
| destructive | `#B42318` | `#FF9A94` | errors, delete |
| success | `#176B42` | `#7DCCA0` | connected |
| border | `#E0D6EC` | `#3A3348` | hairlines |

## Type
- **Bricolage Grotesque** (700, 800): display only — the bot's name, screen titles, Markdown h1-h3.
- **Atkinson Hyperlegible** (400, 700): everything else. Body 16/24, small 14/20, caption 12/16, titles 22/28 and 28/34.
- `th.font`: `regular`, `medium` (= Atkinson 700), `display` (Bricolage 800), `displayBold` (Bricolage 700), `mono`.
- Fonts are embedded at build time by the `expo-font` config plugin (app.json), so there's no runtime loading.
- No all-caps labels, and no letter-spaced eyebrows.

## Shapes
- `radius.sm` 10 (chips, inputs), `radius.md` 18 (bubbles, cards), `radius.lg` 24 (sheets), plus pills (999).
- Bubbles have a 6px "tail" corner on the speaker's side: yours bottom-right, the bot's bottom-left.
- Assistant replies sit in a white card bubble; yours in an ink bubble.
- The composer is a white pill with a round sunflower send button.

## The face (`BotFace`)
An ink rounded square with two sunflower eyes. The eyes show the bot's state:
- **idle:** open, with a slow blink every ~5s;
- **thinking:** eyes look up;
- **working / tool:** eyes glance side to side;
- **offline:** grey flat lines;
- **error:** small and red-tinted.

It lives in the thread header next to the bot name, with a one-line status under it ("sta pensando…", "cerca sul web…", "offline").
- **Motion:** only the face animates. With reduced motion on, it changes eye shape without animating.

## Rules for the other screens (settings, ecosystem, drawer)
- Use `useTheme()` tokens only; never hard-coded hex.
- Lists are white cards on the mist background, rounded `md`, grouped with Bricolage section titles (sentence case).
- At most one primary button per screen; the others are secondary or ghost.
- Touch targets ≥ 48dp. Keep every function: this is a visual redesign only.

## Dark scheme (2026-10-15)
Black, purple, and gold. Surfaces step up in lightness (background, then card, then popover).

| Role | Hex |
|---|---|
| background | `#0c0b10` |
| card | `#16141e` |
| popover | `#221e2c` |
| text | `#f4f0f8` |
| secondary text | `#c4b4d4` |
| primary button | `#c9a6e8` with `#1a1022` text |
| user bubble | `#6b4589` |
| bot | gold `#f0b429` |

You are purple; the bot stays gold.

**Chart series** (context panel):

| Scheme | input | output | cached | warn |
|---|---|---|---|---|
| light | `#4a2c72` | `#8a5608` | `#8b74a6` | `#b42318` |
| dark | `#e4d0f5` | `#f0b429` | `#9b86b0` | `#ff9b94` |

The series differ in lightness as well as hue (colour-blind safe), and each reaches at least 3:1 on the panel. Both rules are enforced in `test/ui/theme.test.ts`.

**Reasoning pill:** a 3-notch scale (`effortNotches`) replaces the lightning icon.
