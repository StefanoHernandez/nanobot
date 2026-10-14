# P5-V1-fix1: review fixes for artifacts and previews (owner: agy)

Claude's review of your commit `cb45d8b` found the sandbox, CSP props, link confirm and code-block store all good. The issues below must be fixed **on the same branch `agy/P5-V1`**, in the same folder `nanobot_androidapp-agy2`. The requirements are still `mobile/docs/agy/briefs/P5-V1.md`; re-read its "big files" and "size handling" parts.

## Security (fix all)
1. **`ArtifactWebView.tsx` ~542-559, `need` length is uncapped.** Clamp it: `len = Math.min(length, 1048576, size - offset)`. Reject `length <= 0`, a non-integer, `offset < 0` or `offset >= size`.
2. **~507-518, navigation allowlist.** Only the very first load may pass, tracked with a ref flag set after the first allowed request. After that, `about:blank` and `data:` navigations are blocked too. http(s) keeps the confirm; other schemes are blocked silently.
3. **~402, xlsx cells go into `innerHTML` unescaped.** Build the cells with `textContent`, or escape `& < > " '` with one shared `escapeHtml` helper.
4. **~243, mermaid source goes into `<pre>` unescaped.** Use the same escape, or pass it via `textContent`.
5. **CDN versions.** Bump mermaid to the latest 11.x and pin the exact version. Keep pdfjs 3.11.174 (legacy UMD build) and xlsx 0.18.5, but add a comment noting that the xlsx parsing risk is contained by the sandbox (no network, no secrets).

## Big files (the brief's core requirement, currently missing)
6. **Stream the PDF.** Replace `loadAllChunks` + `getDocument({data})` with `PDFDataRangeTransport`:
   - `length` = file size, initial data = the first chunk;
   - `requestDataRange(begin, end)` triggers `need` messages, and the replies are delivered via `onDataRange`;
   - set `disableAutoFetch: true` and `disableStream: true`;
   - render pages **lazily**, using an IntersectionObserver on per-page placeholders sized from `page.getViewport`;
   - free canvases more than 3 pages away from the viewport;
   - support pinch-zoom: re-render the visible pages at the new scale, debounced.
7. **Light previews** (pptx, docx or xlsx over 150 MB, and the `onRenderProcessGone` fallback). Implement them inside the WebView with JSZip over the chunk protocol, without loading the whole file:
   - Read the zip central directory from the end of the file (the last ~64 KB, then the offsets it points to), and extract single entries by range.
   - **pptx:** `docProps/thumbnail.jpeg` plus the first 30 `ppt/media/*` images as a gallery.
   - **docx:** the plain text of the first 200 `<w:p>` from `word/document.xml`.
   - **xlsx:** `xl/sharedStrings.xml` plus `xl/worksheets/sheet1.xml`, showing the first 200 rows.
   - If the zip entry is compressed with deflate, decompress it with JSZip or pako (jsdelivr, pinned).
   - Replace the current placeholder `<Text>`.
8. **The 20 s timeout kills slow loads.** Reset the timer on every `need`/`__chunk` exchange, so it measures inactivity rather than total time. Keep 20 s of inactivity.
9. **pptx false success (~355).** Use the real `pptx-preview` API, `init(container, opts).preview(arrayBuffer)`; check its README on jsdelivr. Post `ready` only after it resolves, and `error` if the API is missing or it throws.
10. **html, svg and mermaid between 2 and 10 MB** must use the chunk protocol (FileViewer.tsx ~79-84), not one inlined string.
11. **i18n.** The progress label, the sheet tabs and "Mostra altre righe" must take their strings from it/en via the shell builder (pass the translated strings in).

## Tests (add, write first)
- `need` with length 50_000_000 injects at most 1 MB.
- A second navigation to `data:text/html,...` after the first load returns false.
- An xlsx cell value `<img src=x onerror=alert(1)>` appears escaped in the generated HTML.
- Mermaid source `</pre><script>` appears escaped.
- The PDF shell uses `PDFDataRangeTransport`: it contains that identifier and does not call `loadAllChunks` for pdf.
- Fallback timer: with chunks arriving every 5 s for 60 s, `onFallback` is not called.
- A pptx with no `pptx-preview` API posts `error`, not `ready`.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit on `agy/P5-V1` as `fix(mobile): artifacts security hardening and large-file streaming`. Append a "fix1" section to `mobile/docs/agy/reports/P5-V1.md`. If you can test in a dev build, note the results: a PDF over 100 MB, a pptx, a docx, and a malicious xlsx.
