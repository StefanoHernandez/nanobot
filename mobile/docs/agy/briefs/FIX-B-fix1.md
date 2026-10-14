# FIX-B-fix1: FIX-B gaps (owner: agy)

Your FIX-B commit `819f174` fixed most findings. Fix the gaps below on the same branch, `agy/FIX-B`, in the folder `nanobot_androidapp-agy3`.

## Important
1. **I5 gate not enforced.** In `ChannelRow.tsx`, `gateAllowed` (~24) is computed but never used. When the gate is off, the enable switch must be disabled (enabled → disable still allowed). Show the gate banner, or a hint, as in Apps and Skills.
2. **M8 raw messages left.** `AutomationJobSheet.tsx` ~211 (`handleOpenChatPicker`) and ~230 (`handleSelectChat`) still toast `e.message`. Use `toastEcosystemError`. Then grep `src/screens/ecosystem` and `src/ecosystem` for any remaining `e.message`/`String(e)` reaching the UI.

## Minor
3. **M14:** the run-result polling loop (`automations.ts` ~133-177) must stop on unmount: use an active or gen ref, or an AbortSignal. Pick the run newer than the click by `run_at_ms`, not by array position.
4. **I6:**
   - A single poll network error must not end the OAuth flow. Tolerate up to 3 consecutive errors, then go to error.
   - On expiry, send `oauth_cancel` once.
5. **I8 UX:** for `at`/`every` schedules, show human input instead of raw milliseconds: a date-time for `at`, and a number plus unit (minutes, hours, days) for `every`. Invalid input shows an inline error instead of silently keeping the old value.

## Tests (add, write first)
- I5: with the gate off, the enable switch on a disabled channel is disabled; disabling an enabled channel still works.
- M8: the chat picker failure shows the generic message, not the raw text.
- M14: unmounting during polling makes no further `session.get` calls.
- I6: one transient poll error keeps polling.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit on `agy/FIX-B` as `fix(mobile): ecosystem gate, error copy and polling cleanup`. Append "fix1" to `mobile/docs/agy/reports/FIX-B.md`.
