# P2-A1 fix 1 (owner: agy)

**Branch:** `agy/P2-A1`. Work on the same branch, append to `mobile/docs/agy/reports/P2-A1.md`, and commit.

The review passed the spec, but the CSV table needs a fix, plus a few smaller items:

1. **CSV column widths** (`FileViewer.tsx` ~184-222). The header and the body columns must line up. Compute one width per column once (e.g. `clamp(maxChars(col) * 8 + 16, 80, 240)` over the header + the shown rows) and apply the same `width` to every cell in that column. Long cells wrap or ellipsize inside that width.
2. **CSV scrolling** (`FileViewer.tsx` ~198). Remove the vertical ScrollView nested inside the horizontal one. Instead, use a horizontal ScrollView that contains **one** vertical `FlatList`, with `stickyHeaderIndices={[0]}` (row 0 = header) and `nestedScrollEnabled`, or an equivalent single vertical list. Vertical and horizontal scrolling must both work on Android, and the header must stay visible.
3. **Bottom inset** (`FileViewer.tsx` ~254): apply `insets.bottom` as padding at the end of the scroll content.
4. **`parseCsv`** (`formats.ts`):
   - strip a leading BOM (`﻿`);
   - drop completely empty lines;
   - keep a final empty quoted field `""` at end of input (e.g. `a,""` → `["a",""]`).

   Add tests for: CRLF line endings, a quoted field containing a newline, a BOM, an empty line, and `a,""`.
5. **Performance** (`FileViewer.tsx` ~162-176): wrap `prettyJson(...)` and `parseCsv(...)` in `useMemo` keyed on the text. For `code`/`json`/`text` over 200 KB, show the first 200 KB plus the note "Anteprima troncata — usa Apri con…" / "Preview truncated — use Open with…" instead of highlighting it all. Add the i18n keys.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit `fix(mobile): viewer CSV layout and scrolling, parser edge cases`, then append the report with RAW output.
