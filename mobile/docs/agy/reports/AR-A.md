# AR-A report — artifacts: web fix, compact card in chat, theme inside artifacts

## Files changed
- `mobile/scripts/fetch-viewer-libs.mjs` (fixed line 46: defined `const buf = Buffer.from(await res.arrayBuffer());` before `buf.toString(...)`)
- `mobile/src/screens/viewer/viewerLibs.ts` (added `Platform.OS === 'web'` branch using `fetch(asset.uri).then(r => r.text())` and exported `readViewerLib`)
- `mobile/src/screens/viewer/FileViewer.tsx` (fixed size boundary: `file.text()` read only when `size <= 2 * 1024 * 1024`; files > 10 MB trigger `setTooLarge(true)` without reading; added `chart` to `canPng`; passed `isDark` to `printDocument`)
- `mobile/src/artifacts/collect.ts` (loosened `CLAIM_RE` to match structural part `` `<kind> id=<id>` `` so both Italian and English fix claims continue the artifact)
- `mobile/src/artifacts/fix.ts` (localized fix prompt copy with `lang: "it" | "en"`, maintaining byte-identical Italian output)
- `mobile/src/i18n/it.json` and `mobile/src/i18n/en.json` (added i18n keys for artifact card: `artifact.openPreview`, `artifact.showCode`, `artifact.hideCode`, `artifact.generating`, `artifact.lineCount_one`, `artifact.lineCount`, and fix prompt templates)
- `mobile/src/screens/viewer/ArtifactWebView.tsx` (implemented `buildThemeCss(isDark, options)` defining CSS variables `--nb-bg`, `--nb-fg`, `--nb-card`, `--nb-muted`, `--nb-border`, `--nb-primary`, `--nb-primary-fg`, `--nb-radius`, `--nb-font` and base element/`.nb-card` styles placed before user CSS; added Vega `toImageURL("png")` export for charts; deferred chart PNG export until preview reported ready)
- `mobile/src/screens/viewer/exportArtifact.ts` (injected theme CSS variables and base stylesheet into exported HTML/PDF document `<head>`)
- `mobile/src/ui/markdown/CodeBlock.tsx` (rendered compact card when `canPreview` is true with icon, title, version badge, line count, 48dp "Apri anteprima" button, and "Mostra codice" toggle; rendered streaming indicator with ActivityIndicator and "Sto generando «{title}»…"; preserved regular code block for non-previewable languages)
- `mobile/src/ui/markdown/Markdown.tsx` (threaded `isStreaming` prop down to `CodeBlock`)
- `nanobot/skills/artifacts/SKILL.md` (documented theme variables and `.nb-card` class with single-line prose paragraphs and example)
- `mobile/test/artifacts/collect.test.ts` (added test for English claim lines continuing artifacts)
- `mobile/test/artifacts/fix.test.ts` (added tests verifying byte-identical Italian prompt and localized English prompt)
- `mobile/test/screens/artifacts.test.tsx` (added tests for 11 MB html size routing without reading, CSS theme variables in light/dark, base stylesheet precedence, chart Vega export script, and chart `canPng` flag)
- `mobile/test/screens/export-artifact.test.ts` (added tests for light and dark theme CSS variable injection in exported documents)
- `mobile/test/screens/viewer-libs.test.ts` (created: unit tests for native `FileSystem` and web `fetch` library loading paths)
- `mobile/test/ui/markdown.test.tsx` (added tests for previewable card, toggle open/close, streaming line indicator, non-previewable blocks, and English translations)

## Dependencies added
None.

## Self-check against brief
- **1.1 Web app library loading (`viewerLibs.ts:111-118`):** Added `Platform.OS === "web"` branch reading asset uri via `fetch(uri).then(r => r.text())`. Verified with unit tests in `mobile/test/screens/viewer-libs.test.ts:32-54` and via `npx expo export --platform web`.
- **1.2 Missing `buf` in script (`scripts/fetch-viewer-libs.mjs:46`):** Added `const buf = Buffer.from(await res.arrayBuffer());`.
- **1.3 File size check (`FileViewer.tsx:237`):** Replaced buggy `size <= 2 MB || size > 10 MB` condition so files are read into memory only when `size <= 2 * 1024 * 1024`. Files above 10 MB set `tooLarge` without reading. Verified in `mobile/test/screens/artifacts.test.tsx:292-303`.
- **1.4 Italian/English fix claim (`collect.ts:8`, `fix.ts:24-41`):** `CLAIM_RE` matches structural `` `<kind> id=<id>` ``. Added i18n support in `fix.ts` with byte-identical Italian output. Verified in `mobile/test/artifacts/collect.test.ts:30-44` and `mobile/test/artifacts/fix.test.ts:26-57`.
- **1.5 PNG export for charts (`FileViewer.tsx:133`, `ArtifactWebView.tsx:1152-1161, 2088-2140`):** Added `chart` to `canPng`. Added Vega `window.__vegaView.toImageURL("png")` support in `exportPngScript`. Added chart readiness guard before executing `window.__exportPng()`. Verified in `mobile/test/screens/artifacts.test.tsx:913-930, 1040-1052`.
- **2 Artifact card in chat (`CodeBlock.tsx:169-285`):** When `canPreview` is true, renders compact card with type icon, title, version badge, line count, 48dp "Apri anteprima" button, and "Mostra codice" toggle. While streaming, renders single line "Sto generando «{title}»…" with ActivityIndicator. Non-previewable blocks retain syntax-highlighted block. Verified in `mobile/test/ui/markdown.test.tsx:80-128`.
- **3 Theme inside artifacts (`ArtifactWebView.tsx:956-1045`, `exportArtifact.ts:16-30`, `SKILL.md:21, 26-36`):** Injected `--nb-bg`, `--nb-fg`, `--nb-card`, `--nb-muted`, `--nb-border`, `--nb-primary`, `--nb-primary-fg`, `--nb-radius`, `--nb-font` and base element stylesheet before user styles. Applied to export documents. Documented in `SKILL.md` with single-line prose paragraphs. Verified in `mobile/test/screens/artifacts.test.tsx:1008-1039` and `mobile/test/screens/export-artifact.test.ts:32-72`.

## Verification commands and raw output

### `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest`
```
Test Suites: 130 passed, 130 total
Tests:       1048 passed, 1048 total
Snapshots:   0 total
Time:        11.701 s
Ran all test suites.
```

### `npx tsc --noEmit`
```
(completed with exit code 0, no errors, no warnings)
```

### `npx expo export --platform android --output-dir /tmp/nb-export`
```
Android Bundled 11933ms index.js (2544 modules)
› Assets (70)
› android bundles (1):
_expo/static/js/android/index-ccc0d1333b997c44bab29c0041ec9fe7.hbc (8MB)
› Files (1):
metadata.json (4.6KB)
Exported: /tmp/nb-export
```

### `npx expo export --platform web --output-dir /tmp/nb-export-web`
```
Web Bundled 5513ms index.js (1863 modules)
› Assets (58)
› web bundles (1):
_expo/static/js/web/index-3c0bda5daa11b50ff78c5f273ca18c28.js (4.7MB)
› Files (3):
favicon.ico (15KB)
index.html (1.2KB)
metadata.json (49B)
Exported: /tmp/nb-export-web
```

## What could not be verified
- Physical Android device rendering and touch interactions (verified via Jest component tests and release Android bundle export).
- Web browser rendering of live interactive WebViews with Vega charts and leaflet maps (verified via Jest web platform unit tests and release web bundle export).
- `pytest tests`: Python virtual environment is not configured with pytest on this host machine (`/usr/bin/python3: No module named pytest`), though only Markdown documentation `nanobot/skills/artifacts/SKILL.md` was touched outside mobile.
