# UI-H1: a calmer look, graphite surfaces and one accent (owner: Cursor)

Branch `agy/UI-H1`, from `origin/main`, **in your own worktree** (`../nanobot-agy-ui-h1`). Follow `mobile/docs/agy/README.md`. **App only.** Other tasks may run in parallel on the server (RT-A, KB-C) and docs (DOC-A, CV-A): do not touch their files.

## Why
Stefano finds the app visually noisy. The reference is the Herald Android app (MIT, `~/Documenti/ProgettiPersonali/herald`, design system in `shared/designsystem/src/commonMain/kotlin/dev/hermeskotlin/designsystem/`: `Tokens.kt`, `ThemeColors.kt`, `HermesTheme.kt`, `AccentPalette.kt`, `components/Halo.kt`; screenshots in `docs/screenshots/`). Read them first. Take its **rules**, not its identity: no Herald blue as default, no Herald logo or name.

What makes it calmer, and what this task copies:
1. **Neutral graphite**, no hue in the greys. Depth comes from **lightness steps** (background → surface → surface 2 → surface 3), with translucent hairlines; **no drop shadows, no lit top edge, no double bezel**.
2. **One accent** for the main action, the user's bubble, links, selected states and toggles. Nothing else is coloured, except danger/success/warning used as **text or small tinted circles**, never as big fills.
3. **One font family** (Geist + Geist Mono), weights 400/500/600 only, slightly tight tracking.
4. Smaller radii.
5. One soft accent glow at the top of each screen (Herald's `halo`).

Today (`mobile/src/ui/theme.ts`): violet-tinted blacks, lilac primary, gold "brand", salmon destructive, Atkinson Hyperlegible + Bricolage ExtraBold, `medium` mapped to a 700 bold, radii 12/22/30, shadows + bezel.

## 1. Tokens (`src/ui/theme.ts`)
Keep the `Theme` type's existing field names (about 100 screens read `colors.primary`, `radius.md`, `font.medium`, `surface`, `bezel`…): **change their values**, add new fields, do not rename.
- **Greys**: use Herald's values (`Palette` in `ThemeColors.kt`) for dark and light: background, card = surface, `secondary`/`muted`/`accent` = surface 2 / surface 3 roles, popover = sheet, border = 7% white (dark) / 8% ink (light), input = surface, mutedForeground = text 4. Add `surface2`, `surface3`, `well` (code, commands), `thumb` (segmented pick), `textSecondary`, `textMuted`, `borderStrong`, `accentSoft`, `accentText`, `inverse`, `inverseForeground`, `dangerSoft`, `successSoft`, `warning`, `warningSoft`.
- **Accent**: `primary`, `ring`, `userBubble`, `brand`, `accentSoft`, `accentText` all come from the chosen accent (point 2). `brand` (the bot's eyes, send button) becomes the accent: one accent, no gold. `brandSoft*` = accent soft + accent text.
- `destructive`: Herald's danger (`#F85149` dark, `#CF222E` light). It is used for text, icons and soft circles; see point 4 for buttons.
- Chart colours: keep four distinct series, derived from accent / text / muted / danger; they must stay distinguishable (lightness differs).
- `radius`: `sm: 10, md: 14, lg: 20`; add `xs: 6`, `xl: 26` (composer, sheets).
- `surface`: background = card, `borderRadius: radius.lg`, 1 px border = border colour. **No `boxShadow`, no `borderTopColor`.**
- `bezel`: becomes neutral (no padding, transparent, no border), so the ~47 places that spread it keep working and stop drawing a tray. Leave a comment that it is kept for compatibility.
- `font`: `regular` = Geist 400, `medium` = Geist 600 (it is used for titles and labels today), add `semibold` = Geist 600 and `label` = Geist 500, `mono` = Geist Mono 400, `display` and `displayBold` = Geist 600. Add `type` with Herald's scale as `{fontSize, lineHeight, letterSpacing}`: display 32/35, title 22/26, heading 16/21, body 15/22.5, bodySmall 13.5/19.5, label 13/17, caption 12/16, code 12.5/19.5, eyebrow 11/14 upper-case +0.08em. Convert em to RN `letterSpacing` points (`em * fontSize`).

## 2. Accent picker
- Six accents: **Violet (default)**, Blue, Green, Orange, Pink, Teal. Values: Herald's `AccentPalette.kt` (Violet `#7C3AED` light / `#A78BFA` dark, etc.). Text on the accent fill: white on light accents, near-black `#0A0A0C` on dark accents (as Herald). Soft tint 10% (light) / 14% (dark).
- `ThemeProvider.tsx`: add `ui.accent` in `kv` next to `ui.theme` (unknown value → Violet), an `useAccentPreference()` hook like `useThemePreference`, and build the theme from (scheme, accent). Memoize the theme objects (12 combinations at most) so the context value is stable.
- `src/screens/settings/AppearanceSection.tsx`: under the theme choice, a row "Accento" / "Accent", subtitle "Pulsanti, link e i tuoi messaggi." / "Buttons, links and your own messages.", six 36 dp circles (touch target 48 dp), the selected one with a 2 dp ring in the accent and a gap; accessibility label = colour name, `selected` state.
- Test: default violet; pick → stored, theme `primary` changes; unknown stored value → violet.

## 3. Fonts
- `npx expo install @expo-google-fonts/geist @expo-google-fonts/geist-mono`.
- `app.json` `expo-font` plugin: replace the Atkinson and Bricolage files with Geist 400/500/600 and Geist Mono 400 (check the exact file names in `node_modules`). Android family name = file name; use those names in `theme.ts`.
- `app/NativeIntegrations.web.tsx`: same fonts for the web build.
- Remove the two old font packages from `package.json` if nothing else imports them (grep `src`, `app`, `scripts`).
- `grep -rn "AtkinsonHyperlegible\|BricolageGrotesque" src app` must return nothing after.

## 4. Base components (`src/ui/components/`)
- `Button.tsx`: variants
  - `primary`: accent fill, accent foreground; the only coloured glow: `boxShadow` `0 6px 18px -8px <accent at 55%>`;
  - `secondary`: surface 2 fill, no border, foreground text;
  - `ghost`: transparent, text secondary;
  - `destructive`: **quiet**: danger-soft fill, danger text (no full red fill);
  - new `inverse`: inverse fill (near-white on dark, ink on light), inverse foreground: for the highest-stakes confirm (approvals "Allow once");
  - label font: `font.label` (500), size 15; keep press scale.
  Keep the prop API; existing call sites keep working.
- `SegmentedTabs.tsx`: track = `well` with 1 px border, selected segment = `thumb` with the border-strong hairline; label 500 when selected, text-secondary otherwise; optional leading icon prop.
- `Sheet.tsx`, `Dialog.tsx`: popover/sheet colour, `radius.xl` top corners (sheet) / `radius.lg` (dialog), hairline border, no bezel tray, no shadow other than a plain black one under dialogs.
- `TextField.tsx`: input fill, 1 px border, `border-strong` + accent caret when focused, `radius.md`.
- `ListItem.tsx`: title `font.regular` 15, subtitle text-tertiary 13.5; pressed = surface 2.
- New `src/ui/components/SectionLabel.tsx`: eyebrow text (upper case, text-tertiary, `type.eyebrow`), 16 dp left padding; export from `index.ts`.
- New `src/ui/components/StatusText.tsx`: `{ tone: "accent" | "success" | "warning" | "danger" | "muted"; children }` coloured caption text; plus `StatusIcon` (a 32 dp circle in the tone's soft tint with an icon in the tone colour). These replace filled badges.
- New `src/ui/Halo.tsx`: an absolutely positioned, `pointerEvents="none"` radial glow in `accentSoft`, brightest near the top-left, gone by 260 dp, drawn behind screen content. Draw it with `react-native-svg` (already installed): an `Svg` filling the area with a `RadialGradient` from `accentSoft` to transparent. No new dependency for it. Add it to the main chat screen and the settings and ecosystem screens' root.

## 5. Two screens as the pilot
Apply the new components to these two only (the rest follows in UI-H2):
- **Chat** (`src/screens/thread/**`): user bubble = accent fill, `radius.lg`, soft accent glow under it; composer = surface with `radius.xl` and hairline, no bezel tray; code blocks = `well` with a header row (language + Copy) as Herald's `reply.jpg`; tool-activity chips = surface 2 pill with hairline (no gold).
- **MCP list** (`src/screens/ecosystem/apps/McpTab.tsx`): each card = `surface`; replace the "Abilitato"/"Configurato" badges with one `StatusText` line (e.g. accent "Attivo · Configurato", muted "Disattivato", warning "Da configurare", danger with the error); the switch stays top right; buttons: Test and Riconnetti `secondary`, Rimuovi becomes a `ghost` with danger text **or** moves into a "…" menu if the card has one; at most one filled button per card.
Update the tests that assert old colours/badges; add one test that the MCP card shows the status line and no filled destructive button.

## Checks
- `cd mobile && npx jest && npx tsc --noEmit`
- `npx expo export --platform android --output-dir /tmp/nb-export-uih1` and `--platform web --output-dir /tmp/nb-export-uih1-web`.
- Contrast: text tokens on background and on surface, and accent text on background, at least 4.5:1 for each accent and scheme; write a small jest test computing it (WCAG formula) over the six accents × two schemes.

## Do not
- Rename `Theme` fields or touch screens other than the two pilots (except for compile fixes, listed in the report).
- Use Herald's blue as default, its logo, name or icons.
- Edit `mobile/vendor/**`, server files, `src/core/**`, `src/platform/**`, `src/state/**`. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/UI-H1.md`: files, raw jest/tsc output, screenshots or a description of what to look at on the phone (chat light/dark, MCP list, accent picker), contrast table, deviations.

Commit (no `Co-Authored-By`, never `mobile/node_modules`), push `agy/UI-H1`, give the last hash. Do not merge.
