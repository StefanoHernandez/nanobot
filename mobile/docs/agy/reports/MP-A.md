# MP-A report

Branch `grok/MP-A`, from `origin/main` (`0c9965407`). Not merged.

App only. No new dependencies. `mobile/vendor/**` was not edited.

## Files

- `mobile/src/screens/settings/ModelsSection.tsx` — "Choose from list" opens a sibling `Sheet` (`scroll={false}`) with search and a virtualized `FlatList` of the whole catalog. Inline suggestions stay at 8, and deferred providers still wait for 2 characters there only.
- `mobile/test/screens/models-settings.test.tsx` — the old 30-match test now expects 8 inline rows and no "more" line; six picker tests.
- `mobile/src/i18n/en.json`, `mobile/src/i18n/it.json` — `models.choose`, `search`, `count`, `countOf`, `retry`, `catalogFailed`. Removed `models.moreMatches`.
- `mobile/docs/agy/reports/MP-A.md`

## Checks

```
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest
Test Suites: 114 passed, 114 total
Tests:       929 passed, 929 total

cd mobile && npx tsc --noEmit
(no output, exit 0)

cd mobile && npx expo export --platform android --output-dir /tmp/nb-export
Android Bundled, Exported: /tmp/nb-export
```

`test/screens/models-settings.test.tsx`: 27 passed. Jest still prints the pre-existing worker force-exit line.

## Deviations

- The picker body is about 80% of the window minus the sheet chrome (padding, grabber, title, bottom inset), so the `FlatList` scrolls inside the sheet instead of drawing past it.
- Context windows are formatted locally (`200000` → `200k`), same idea as the chat context popover.
- The spinner shows while the catalog is loading and still empty. A refresh that already has models keeps the list.
- Picker tests use `getAllByText(…).at(-1)` when the same id is also in the inline suggestions under the field.

## Not checked on a phone

Scrolling a catalog of 300 models, and that the sheet stays on screen with the keyboard open.
