# PF-A: app performance — math, streaming re-renders, memory, caches (owner: agy)

Branch `agy/PF-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`. **App only.** Other agents work in parallel: W2-sec (server), LK-A (`app/_layout.tsx`, `NativeIntegrations.tsx`, `src/extras/lock.tsx`, `src/screens/connect/**`), EC-A (`src/screens/ecosystem/apps/**`, `src/ecosystem/apps.ts`, `mcp.ts`), AR-B (`src/screens/viewer/**` except `viewerLibs.ts`, `src/artifacts/**`). You own `src/ui/markdown/**`, `src/state/threadStore.ts` and the components that call `useThreadSlice`, `src/screens/viewer/viewerLibs.ts`, and the cache pruning. i18n: only **add** keys. No behaviour change visible to the user except speed.

Measure before and after where you can (render counts in tests; sizes in bytes) and put the numbers in the report.

## 1. Math blocks (`src/ui/markdown/MathBlock.tsx`, `katex.ts`)
Every `$$…$$` block is its own WebView with the whole KaTeX CSS and fonts inlined (`katexCss.generated.ts`, ~369 KB): five formulas ≈ 2 MB of HTML and five WebViews.
- Write the CSS and fonts **once** to `Paths.cache/katex/` (version-stamped, rewritten only when the version changes) and load them with a `<link>` from that folder; the inline HTML per block shrinks to the rendered markup. Keep `javaScriptEnabled={false}` and the navigation lock; allow file access only for that folder (`allowFileAccess` + `allowingReadAccessToURL`/`baseUrl` pointing there; check what `react-native-webview` 13.16 supports on Android and keep it as narrow as possible). If file access cannot be limited to that folder, stop and explain in the report instead of widening it.
- Web build: keep today's path (no filesystem); check `Platform.OS`.
- Lazy mount: a block outside the visible area renders a placeholder of the same height (`heightFor`) until it scrolls into view (use the list's viewability info if it is easy to reach; otherwise skip this point and say so).
- Tests: generated HTML no longer contains the inlined CSS on native; the CSS file is written once per version; web path unchanged.

## 2. Streaming re-renders (`src/state/threadStore.ts`)
`useThreadSlice` (`threadStore.ts:714`) subscribes to the whole thread slice, so every streaming delta re-renders all its users (Composer, PendingBar, QueuedMessages, ContextIndicator, ContextPopover, GalleryScreen, CommandDrawer).
- Give consumers field selectors: either `useThreadSlice(key, pick)` with `useShallow` (zustand 5: `zustand/react/shallow`) or per-field `useStore(threadStore, s => s.threads[key]?.x)`; actions as stable functions (not recreated each render). Update every caller to read only what it uses.
- Test: render-count test — a streaming delta (message text change) does not re-render `Composer`; a `running` flip does.

## 3. Memory
- **Visited chats:** `unload` keeps the thread's messages forever. Keep the messages of the last 5 visited chats plus any running one; evict the rest on unload (they reload from the server as today when reopened). Test.
- **Viewer libraries** (`viewerLibs.ts`): the in-memory `memory` map keeps multi-MB library strings for the whole app life. Keep at most the 2 most recently used libraries (LRU); others are read again from the asset when needed. Keep the jest stub behaviour. Test the LRU.

## 4. Caches on disk
`cache/media/<hash>/` (`src/screens/thread/media/media.ts:52`) and `cache/exports/` (`src/extras/exportChat.ts:236`) are never pruned. At app start (once, in the background, never blocking the first render): delete entries older than 14 days, then, if `media` is still over 300 MB, the oldest until under. Put it next to `media.ts` and call it from where other startup work runs (not `NativeIntegrations.tsx`: LK-A owns it; find another startup point, e.g. the session provider or the media module's first use). Test with a fake filesystem.

## Checks
- `cd mobile && npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-pf`
- `cd mobile && npx expo export --platform web --output-dir /tmp/nb-export-pf-web` (math web path).

## Do not
- Edit server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`. Enable JavaScript in the math WebView.

## Report
`mobile/docs/agy/reports/PF-A.md`: files, tests, before/after numbers, deviations, what needs a phone (scroll smoothness with many formulas, streaming a long answer, memory after visiting many chats).

Commit (no `Co-Authored-By` lines, never `mobile/node_modules`), push `agy/PF-A`, and give the last hash. Do not merge.
