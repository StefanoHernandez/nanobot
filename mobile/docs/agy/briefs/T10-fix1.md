# T10 fix 1 (owner: agy)

**Branch:** `agy/T10`. Work on the same branch, append to `mobile/docs/agy/reports/T10.md`, and commit.

Claude's review found that the components are right, but there is one rule violation and the tests are too weak in some places. Fix exactly these:

1. **Revert your change to `mobile/src/extras/effort.ts`** (the `|| !session.client` guard). That file is Claude's tested logic, and production code must not change just to satisfy a mock. Fix the mock instead. In `mobile/test/screens/composer.test.tsx` (and in any other test that breaks), either give the mocked session a client, `session: { id: "s1", client: { onRuntimeModelUpdate: () => () => {}, onChat: () => () => {} } }`, or `jest.mock` `useEffort` to return `{ state: null, loading: false, apply: jest.fn(), error: null }`. Pick one, and say which in the report.
2. **The apply-error test** (`test/extras/ui.test.tsx`, ~106-129) must prove what the brief asks:
   - Pass `onClose={jest.fn()}` and assert that it is **not** called after the error. The current `getByText(/apply/i)` check passes even if the sheet closed.
   - Assert that the previously current level is still highlighted (`accessibilityState.selected === true` on the current level, `false` on the one you tried). If the segments do not expose `accessibilityState.selected`, add it in `EffortSheet.tsx`; it is good for a11y anyway.
3. **The apply-success test** (~131-157): add `expect(onClose).toHaveBeenCalledTimes(1)`.
4. **The StatusDot test** (~203-235):
   - Do not hardcode `"#ef4444"`. Compare against the theme's `destructive` color (import `lightTheme`/`darkTheme` from `src/ui/theme`, whichever the test renders with).
   - Assert the literals once: `STATUS_COLORS.open === "#22c55e"` and `STATUS_COLORS.reconnecting === "#eab308"` (or whatever your keys are named).
5. **The command tests** (~170-199): add `toHaveBeenCalledTimes(1)` for `send("/goal ship it")` and `send("/compact")`.
6. **The banner test:** add one case. The state goes `reconnecting`, then back to `open` at 2 s, then the clock advances to 5 s. The banner never appears.
7. **The report:** use plain text (`>= 48 dp`), not LaTeX.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass, and `git diff dev -- mobile/src/extras/effort.ts` shows no change from your branch.
- The commit is `fix(mobile): T10 review fixes`, and the report is appended with RAW output.
