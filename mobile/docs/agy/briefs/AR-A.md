# AR-A: artifacts — web fix, compact card in chat, theme inside artifacts (owner: agy)

Branch `agy/AR-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. App, plus one skill file. Six agy sessions run in parallel this round: you own `src/screens/viewer/**`, `src/artifacts/**`, `src/ui/markdown/**`, `scripts/fetch-viewer-libs.mjs` and `nanobot/skills/artifacts/SKILL.md`. Do not touch other server files.

## 1. Fixes
1. **Artifacts that need a library do not open on the web app.** `src/screens/viewer/viewerLibs.ts:106-116` reads the bundled `.vendorjs` with `FileSystem.readAsStringAsync`, which does not exist in the browser. Mermaid, chart, map, react, pdf, xlsx, docx and pptx all fail there. On web, read the asset with `fetch(asset.uri).then(r => r.text())` (a `viewerLibs.web.ts` override or a `Platform.OS` branch, whichever matches how the repo already splits web code). Test both paths.
2. **`scripts/fetch-viewer-libs.mjs:46`** uses `buf`, which is never defined. Add `const buf = Buffer.from(await res.arrayBuffer());`. Do not re-run it (it downloads); the committed assets stay.
3. **Files over 10 MB are read into memory** (`FileViewer.tsx:237`: `size <= 2 MB || size > 10 MB`). Read only when `size <= 2 MB`; above 10 MB show the existing "too large" message without reading. Test.
4. **"Fix this artifact" only works in Italian.** `src/artifacts/collect.ts:8` (`CLAIM_RE`) matches the whole Italian sentence that `src/artifacts/fix.ts:24-41` sends. Make the visible text i18n (`it`/`en`) and match only the structural part `` `<kind> id=<id>` ``. Keep the Italian output byte-identical to today, so old chats still match. Tests: Italian and English claim lines both continue the artifact.
5. **PNG export for charts.** `FileViewer.tsx:133`: `canPng` is only `svg | mermaid`. Add `chart` (Vega: `view.toImageURL("png")`). Before calling the page's export, wait until the preview reported ready (`ArtifactWebView.tsx` around 1930: there is a ready ref/state). Test the flag; the image itself needs the phone.

## 2. Artifact card in chat
**Today:** `src/ui/markdown/CodeBlock.tsx:74-96` prints the whole fenced block (often 200+ lines) with a small eye icon. On the phone that is pages of scrolling.

**Change:** when `canPreview` is true, render a **card** instead of the code:
- type icon, title (`info.title`, or the artifact title from `collectArtifacts`), version badge (`v2`) when the artifact has several versions, line count;
- primary button **"Apri anteprima"** (same `openPreview` as today);
- **"Mostra codice"** toggle, closed by default; when open, today's code view with the copy button;
- **while the message is streaming**: one line "Sto generando «{title}»…" with a small activity indicator, not the scrolling code. Find how `CodeBlock` can know the message is streaming (the markdown renderer's props, or `isStreaming` on the message); add a prop if needed.
- Non-previewable blocks (python, bash…) keep today's rendering.
- i18n `it`/`en`. Tests: card for previewable, code for others, toggle, streaming line.

## 3. Theme inside artifacts
`html` and `react` artifacts get bare HTML: the model writes long inline styles, and the colours clash with the app's light/dark theme.
- In the shell HTML (`buildShellHtml`, `ArtifactWebView.tsx:936`), inject CSS variables from the current app theme: `--nb-bg`, `--nb-fg`, `--nb-card`, `--nb-muted`, `--nb-border`, `--nb-primary`, `--nb-primary-fg`, `--nb-radius`, `--nb-font`. Plus a small base stylesheet (≤ 2 KB) that styles `body`, `button`, `input`, `select`, `table`, `th/td`, `a`, `code`, and a `.nb-card` class with those variables. The artifact's own CSS still wins (put the base sheet first).
- Same variables for the export to HTML/PDF so an exported file looks the same.
- Update `nanobot/skills/artifacts/SKILL.md`: say the variables and `.nb-card` exist, show one short example, and tell the model to prefer them over hard-coded colours. Keep the skill short.
- Tests: the shell contains the variables for light and dark; the base sheet comes before the artifact's own styles.

## Checks
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`
- `cd mobile && npx expo export --platform web --output-dir /tmp/nb-export-web` (item 1.1).

## Do not
- Edit other server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`. Loosen the artifact CSP.

## Report
`mobile/docs/agy/reports/AR-A.md`: files, tests, deviations, what needs a phone or the web app to check.

Commit, push `agy/AR-A`, and give the last hash. Do not merge.
