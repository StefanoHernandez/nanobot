# P5-V1-fix2: second review round for artifacts (owner: agy)

Your fix1 (`ceab0f3`) passed most items. Fix the issues below **on the same branch `agy/P5-V1`**, in the folder `nanobot_androidapp-agy2`. Line numbers refer to `mobile/src/screens/viewer/ArtifactWebView.tsx` at `ceab0f3`.

## Important
1. **The first-load flag is never reset (~1082-1087).** When `source` changes (`onRenderProcessGone` switches to light mode, or a theme change rebuilds `shellHtml`), the reload is blocked and the page stays blank. Reset `isFirstLoadRef.current = true` whenever the WebView `source` (shell HTML) changes, before it is passed to the WebView. Use a `key` on the WebView tied to a shell version counter, so each new shell is a fresh load.
2. **The zip parser trusts sizes from the file (~233-235, ~264-269, ~526-541).** A crafted zip can make the page request gigabytes. Add hard caps inside the shell, failing with `{"type":"error"}`:
   - `cdSize <= 4 MB` and the central directory count `<= 20000` entries;
   - each entry `compSize <= 16 MB` and `uncompSize <= 64 MB`. Check `uncompSize` **before** `pako.inflateRaw`, and abort if the inflated output exceeds the cap;
   - every range satisfies `0 <= begin < end <= totalSize`;
   - the total bytes requested per light preview are `<= 64 MB`.
3. **The fallback timer restarts after ready (~1047-1054).** The effect depends on `[onFallback]`, and FileViewer passes inline arrows, so any re-render restarts a 20 s timer that falls back on an already-loaded page. Keep `onFallback` in a ref (`onFallbackRef.current = onFallback`) and run the timer effect only on mount and source change. After `ready`, never start the timer again.

## Spec gaps from fix1 (finish them)
4. **PDF pinch-zoom (~746, ~824).** Re-render the visible pages at the new scale. Capture pinch with `visualViewport` resize/scroll, or a two-finger gesture handler, then debounce 250 ms, compute `scale = base * zoom`, re-render the visible pages and keep the scroll anchor. Cap the scale at 4.
5. **PDF placeholders (~749).** Size each placeholder from its own page. Fetch `getPage(n).getViewport` lazily when the placeholder approaches the viewport; until then, use page 1's size as an estimate and correct it after.
6. **Mermaid version.** Pin the latest 11.x available on jsdelivr (check `https://data.jsdelivr.com/v1/package/npm/mermaid`), and write the exact version in the report.

## Minor
7. **Concurrent chunk requests (~506-523, ~540).** Key pending requests by `offset:length`, and keep the chunk cache keyed the same way, so a shorter reply never satisfies a longer request.
8. **Out-of-range `need` (~723-730).** A `need` with `offset >= size` is currently dropped and the page hangs. RN must reply with an explicit `window.__chunkError(offset)`, and the page must post `error`.
9. **Chunk cache eviction (~479-495).** Make the `__chunks` cache an LRU bounded at 32 MB.

## Tests (add)
- Changing the shell source after the first load: the new initial load is allowed (`onShouldStartLoadWithRequest` returns true once for it).
- A shell zip fixture with `cdSize` 100 MB posts `error` and issues no `need` beyond the first tail read. Simulate this by unit-testing the extracted parser function if needed; move the parser into a pure exported string or function you can test.
- Re-rendering `ArtifactWebView` with a new inline `onFallback` after `ready`: after 25 s of fake timers, `onFallback` is not called.
- `need` with `offset >= size` results in `injectJavaScript` with `__chunkError`.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit on `agy/P5-V1` as `fix(mobile): artifacts zip caps, reload flag and pdf zoom`. Append a "fix2" section to `mobile/docs/agy/reports/P5-V1.md`.
