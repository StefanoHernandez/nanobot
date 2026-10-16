# NT-A-fix1: notifications are never lost (owner: Grok)

Apply this on the same branch, `grok/NT-A`. Do not create a new branch and do not rebase. All NT-A checks must pass again.

## The bug: two ways to lose events (high)
`KanbanStore.events_since` in `nanobot/ext/kanban.py` has two problems:

1. **The 50 limit drops events for good.** When more than 50 events match, the store cuts the list but still returns `now`. The phone saves `now` as its cursor, so the events after the first 50 are never sent. This happens, for example, after the phone has been off for a day with a busy board or repeating cards.
2. **`now` is read after the queries.** An event that finishes between the two `SELECT`s and the `_now_ms()` call is newer than both queries but older than `now`. It is skipped this time and filtered out next time.

## Fix (server only)
- Read `now = _now_ms()` **before** the queries. Also cap both queries at `<= now`: add `AND r.finished_at_ms <= ?` and `AND t.updated_at_ms <= ?`.
- When the list is longer than 50, keep the 50 oldest, as today, and return as `now` **the `_ms` of the last kept event minus 1**. The next poll then starts from there:
  - events with the same millisecond as the cut come back again;
  - the phone already drops duplicates by `key` with `rememberKey`.

  Add a short comment that explains this.
- When the list fits, return the `now` you read before the queries.
- The phone does not change: it keeps saving `now`.

## Tests (`tests/ext/test_kanban.py`)
- **Paging:** 60 events. The first call returns 50 and a `now` lower than the 51st event. A second call with that `now` returns the remaining 10, plus any events with the same millisecond again. Together the two calls contain all 60 keys.
- **Upper bound:** an event with `finished_at_ms` after the `now` that was read is not returned in that call. It comes back in the next call. Simulate it by monkeypatching `_now_ms`.

## Report
Add a "fix1" section to `mobile/docs/agy/reports/NT-A.md` with:
- what changed;
- the test numbers.

Then commit and push the branch. Do not merge.
