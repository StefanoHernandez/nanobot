# AP-A-fix1 (owner: agy, branch `agy/AP-A`, worktree `../nanobot-agy3`)

## 1. One decision per command (Critical)
`ApprovalCard.tsx:34-49`: a double tap can send two decides, or approve the *next* command unread.
- Add a `busy` ref and state. While a decide is in flight, the buttons are disabled.
- The decide is bound to the id rendered on screen. The next item appears only after the POST settles.
- Test: press Allow twice quickly → exactly one POST. The second item is not decided.

## 2. Don't drop an item on a failed decide (Important)
- Remove the item only after the POST succeeds or returns 404.
- On a network or 5xx error, keep it on screen and show `common.operationFailed` (i18n, never the raw `err.message`), so the user can retry.
- A `refresh()` that started before the decide must not re-add a decided id. Remember the decided ids for 10 s and filter them out.
- Test: decide fails with a network error → the card still shows the same command and the generic toast.

## 3. Background polling for approvals: decided by Claude (Important)
The spec was contradictory: `usePolling` pauses in background, so the background notification could never fire.
- **Decision:** approvals keep polling in background **every 15 s** (best effort, only while Android keeps the process alive). Every other poller stays paused.
- Add an opt-in option to `usePolling`, e.g. `{ background: boolean }`, default false. **Check every caller is unchanged.**
- The test drives a real tick in background state (fake timers plus `AppState` mocked as `background`) and asserts one notification for a new id.

## 4. Tests for the guards (Important)
Add:
- the generation guard: two overlapping refreshes, the older one resolves last → its result is ignored;
- a profile switch mid-refresh → the old result is dropped;
- the polling interval: 3 s when enabled, 60 s when disabled.

## 5. Minor
- `approvals.ts`: drop the `typeof session.get` fetch fallback; use one path, the same as the POSTs (`redirect: "error"`, `credentials: "omit"`).
- Remove the hard-coded Italian `defaultValue`s; the i18n keys exist.
- Settings `ApprovalsCard`: errors use `common.operationFailed`, never the raw message.

## Done when
- jest (`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`) and tsc are green.
- Commit `fix(mobile): AP-A review fixes (single decide, retry on failure, background poll)`.
- Append "fix1" to `mobile/docs/agy/reports/AP-A.md`.
