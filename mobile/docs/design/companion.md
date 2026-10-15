# Design direction "Compagno" (chosen by the user, 2026-10-14)

The subject: a pocket dashboard for **your own** bot, which lives on a small Arduino board at home. The bot is a companion with a face, not a faceless tool. Everything stays calm and readable; **the face is the one memorable element**.

## Tokens (source of truth: `src/ui/theme.ts`)
| Role | Light | Dark | Use |
|---|---|---|---|
| background | `#EEF0FF` periwinkle mist | `#14163A` deep indigo | screen canvas |
| card | `#FFFFFF` | `#1E2150` | assistant bubble, composer, sheets |
| foreground / ink | `#1E2150` | `#ECEDFF` | text |
| mutedForeground | `#5A5E9A` | `#A3A7D6` | secondary text |
| muted / secondary | `#E1E4FB` | `#262A66` | quiet fills, chips |
| primary | `#1E2150` ink | `#F4B63F` sunflower | primary buttons (text = primaryForeground) |
| brand | `#F4B63F` sunflower | same | the bot's colour: eyes, send button, "alive" accents. Never for errors. |
| brandSoft / brandSoftForeground | `#FCE7B8` / `#6B4A07` | `#4A3A12` / `#FCE7B8` | tool-activity chips |
| userBubble | `#1E2150` | `#3A3F8F` | your messages (white text) |
| destructive | `#C2413B` | `#FF8A80` | errors, delete |
| success | `#2E8A5B` | `#5CC98F` | connected |
| border | `#D3D7F3` | `#33377A` | hairlines |

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

## Dark scheme (2026-10-15, from the user's palette)
The palette is Evergreen `#16302b`, Vintage Grape `#694873` and Dusty Mauve `#8b728e`. Surfaces step up in lightness, as in Material tonal elevation.

| Role | Hex |
|---|---|
| background | `#0e221e` |
| card | `#16302b` |
| popover | `#1c3a34` |
| text | `#e8f0ed` |
| secondary text | `#b9a8bd` (lightened mauve: the original reaches only 3.2:1) |
| primary button | `#c9a7d2` with `#2a1a30` text |
| user bubble | `#694873` (Vintage Grape) |
| bot | sunflower `#f4b63f` (unchanged) |

You are grape; the bot stays sunflower.

**Chart series** (context panel):

| Scheme | input | output | cached | warn |
|---|---|---|---|---|
| light | `#2f3389` | `#b8780a` | `#7f84cf` | `#c2413b` |
| dark | `#e4d4ec` | `#f4b63f` | `#9d7fa3` | `#ff9a94` |

The series differ in lightness as well as hue (colour-blind safe), and each reaches at least 3:1 on the panel. Both rules are enforced in `test/ui/theme.test.ts`.

**Reasoning pill:** a 3-notch scale (`effortNotches`) replaces the lightning icon.
