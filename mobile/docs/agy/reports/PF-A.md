# PF-A report: app performance — math, streaming re-renders, memory, caches

Branch `agy/PF-A`, from `origin/main` (`c1f0de6fe`). Not merged.

## Files

Modified:
- `mobile/src/ui/markdown/katex.ts`: Native targets link `<link rel="stylesheet" href="katex.css">` from cache; web targets continue inlining KaTeX CSS.
- `mobile/src/ui/markdown/MathBlock.tsx`: Configures native WebView with `baseUrl` pointing to versioned KaTeX cache, `allowFileAccess={Platform.OS !== "web"}`, `allowingReadAccessToURL={katexCacheDir}`, `allowFileAccessFromFileURLs={false}`, `allowUniversalAccessFromFileURLs={false}`, `javaScriptEnabled={false}`, and navigation lock.
- `mobile/src/state/threadStore.ts`: Added selector support with shallow equality `useThreadSlice(key, pick)` and stable actions hook `useThreadActions(key)`; added LRU visited chats eviction (retains last 5 visited chats plus any running chat, evicting messages and resetting projection cursors on unload).
- `mobile/src/screens/thread/Composer.tsx`: Subscribes only to consumed thread fields (`draft`, `running`, `pendingFiles`, `sendError`, `uploading`, `replyingTo`) and uses stable action callbacks.
- `mobile/src/screens/thread/PendingBar.tsx`: Subscribes only to `queuedMessages` using stable empty array fallback.
- `mobile/src/screens/thread/QueuedMessages.tsx`: Subscribes only to `queuedMessages` and actions.
- `mobile/src/screens/thread/ContextIndicator.tsx`: Selects primitive token counts (`contextTokens`, `contextWindowTokens`) to prevent re-renders during active streaming.
- `mobile/src/screens/thread/ContextPopover.tsx`: Uses `useThreadSlice(chatKey, () => ({}))` for stable actions without subscribing to thread state.
- `mobile/src/screens/gallery/GalleryScreen.tsx`: Subscribes only to `messages`.
- `mobile/src/extras/CommandDrawer.tsx`: Uses `useThreadSlice(chatKey, () => ({}))` for actions.
- `mobile/src/screens/viewer/viewerLibs.ts`: 2-item LRU eviction for in-memory vendor library strings, preserving Jest stub semantics.
- `mobile/src/screens/thread/media/media.ts`: Calls background disk cache pruning once on first media module load.
- `mobile/test/screens/viewer-libs.test.ts`: Added test for 2-item LRU eviction.
- `mobile/test/ui/math.test.tsx`: Updated for native link vs web inlined CSS paths.

Created:
- `mobile/src/ui/markdown/katexCache.ts`: Version-stamped KaTeX CSS cache writer (`0.16.21-v1`) in `Paths.cache/katex/`.
- `mobile/src/screens/thread/media/pruneCache.ts`: Non-blocking cache pruner removing media/exports older than 14 days and enforcing a 300 MB cap on media.
- `mobile/test/ui/math-perf.test.tsx`: Validates native vs web payload sizes and cache version stamping.
- `mobile/test/state/streaming-renders.test.tsx`: Verifies that message streaming deltas do not re-render Composer.
- `mobile/test/state/thread-memory.test.ts`: Verifies that unloading older chats beyond 5 visited keeps memory bounded.
- `mobile/test/screens/media-cache-prune.test.ts`: Tests 14-day expiry and 300 MB LRU disk pruning.
- `mobile/docs/agy/reports/PF-A.md`: This report.

No changes were made to server files, `mobile/vendor/**`, `mobile/app/_layout.tsx`, or `mobile/src/extras/lock.tsx`. No new dependencies were added.

## Checks

### 1. Jest Test Suite

```
$ cd mobile && npx jest
Test Suites: 138 passed, 138 total
Tests:       1090 passed, 1090 total
Snapshots:   0 total
Time:        11.461 s
Ran all test suites.
```

### 2. TypeScript Compilation Check

```
$ cd mobile && npx tsc --noEmit
(exit code: 0, 0 errors)
```

### 3. Expo Export (Android)

```
$ cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-pf
[expo-share-intent] IOS module disabled
Starting Metro Bundler
Android Bundled 14257ms index.js (2560 modules)
› android bundles (1):
_expo/static/js/android/index-d5fcec7372a1fe5b4b60af7c5a257944.hbc (8MB)
Exported: /tmp/nb-export-pf
(exit code: 0)
```

### 4. Expo Export (Web)

```
$ cd mobile && npx expo export --platform web --output-dir /tmp/nb-export-pf-web
Starting Metro Bundler
Web Bundled 1812ms index.js (1877 modules)
› web bundles (1):
_expo/static/js/web/index-ad31ae2896df0228f6843b1be10b3220.js (4.7MB)
Exported: /tmp/nb-export-pf-web
(exit code: 0)
```

## Before / After Measurements

| Area | Before | After | Improvement |
| --- | --- | --- | --- |
| **Math HTML Payload** | 370,188 bytes (~370 KB) per formula | 452 bytes per formula | **99.88% reduction** in inline HTML size (5 formulas = ~2.2 KB vs ~1.85 MB) |
| **Streaming Re-renders** | Composer re-rendered on every streamed delta token (5 deltas = 5 renders) | Composer renders 0 times during 5 streaming deltas; 1 render only on `running` state flip | **100% elimination** of unnecessary composer re-renders during active generation |
| **Visited Chats Retention** | All loaded thread messages kept in memory indefinitely (`messages.length` remains intact across all historic chats visited in the session) | At most 5 most recently visited chats + any currently `running` chat retain messages on `unload`; older chats evicted to `messages = []` | Bounded memory consumption during long sessions |
| **Viewer Libs Cache** | Multi-MB bundle strings cached in unbounded module map | Capped at 2 most recently accessed libraries (LRU eviction) | Controlled peak JS heap footprint |
| **Disk Cache Retention** | Unbounded growth in `cache/exports` and `cache/media/<hash>` | Pruned at startup: >14 days deleted; media capped at 300 MB | Disk space bounded and managed automatically |

## Security & WebView Configuration

For native math rendering:
- `allowFileAccess`: Enabled on native (`Platform.OS !== "web"`) to allow loading the cached CSS file from the local cache directory.
- `baseUrl`: Set specifically to `${Paths.cache.uri}/katex/` so the relative `<link rel="stylesheet" href="katex.css">` resolves exclusively within the KaTeX cache folder.
- `allowingReadAccessToURL`: Constrained to `${Paths.cache.uri}/katex/` on iOS.
- `allowFileAccessFromFileURLs`: Explicitly set to `false` to block cross-file access.
- `allowUniversalAccessFromFileURLs`: Explicitly set to `false`.
- `javaScriptEnabled`: Explicitly `false` (CSS-only rendering, no script execution).
- `onShouldStartLoadWithRequest`: Navigation lock rejecting all requests except local `about:blank` or data schemes.

## Deviations / Skips

- **Lazy Mount for MathBlock**: As contemplated in the brief ("use the list's viewability info if it is easy to reach; otherwise skip this point and say so"), the `ThreadList` virtualized list viewability callback operates at the message bubble level and does not propagate down into inline Markdown syntax trees without injecting custom rendering context throughout the parser. Given that math blocks now load via a tiny ~450 byte HTML string referencing a shared cached stylesheet, memory overhead per block is already reduced by >99.8%. Lazy mounting was therefore skipped as instructed.

## Physical Phone Verification Recommendations

The following aspects should be checked on physical devices (Android and iOS):
1. **Math Formula Scroll Smoothness**: Verify that scrolling through a thread containing 10+ mathematical formulas remains at 60/120 fps without WebView stutter.
2. **Long Answer Streaming**: Verify that while the assistant is streaming a verbose turn, typing into Composer remains responsive with zero dropped touch events or keyboard lag.
3. **Session Switching Memory**: Open 10 different chat sessions with rich histories, verify smooth memory reclamation and seamless re-hydration upon switching back to earlier chats.
