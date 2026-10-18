# FX-B: app fixes from the external audit (owner: agy)

Branch `agy/FX-B`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires. **App only.** Six agy sessions run in parallel this round: **do not touch** `src/screens/viewer/**`, `src/artifacts/**`, `src/ui/markdown/**`, `scripts/fetch-viewer-libs.mjs` (AR-A owns them) or `src/screens/settings/ModelsSection.tsx` (MI-A).

## 1. Tool detail fetch loops forever
`src/screens/thread/ToolActivitySheet.tsx:320`: `needsFetch` ignores `detailError`. When `/tool-trace/...` fails, loading goes false and the effect fires again, forever. Add `detailError === null` to the condition; keep a "Riprova" action that clears the error. Test: a failing fetch is called once.

## 2. Direct `fetch` instead of the session
`src/extras/approvals.ts`, `costs.ts`, `prompts.ts`, `system.ts`, `backup.ts` and `src/core/pairing.ts` call `fetch()` with `Authorization: Bearer ${session.apiToken()}`. They skip `session.get()` / `session.post()` (`src/core/session.ts:244-306`), which wait for an in-flight token refresh and retry once on 401. After the phone wakes up these calls fail with 401.
- Move every authenticated call to `session.get` / `session.post` (add `session.delete` or a method option only if a module needs another verb).
- `pairing.ts`: only the calls made **with** a session; the unauthenticated pairing handshake stays as it is.
- Tests: update the existing mocks; one test per module that a 401 followed by a refreshed token succeeds (or one shared test on `session` if the modules are thin wrappers).

## 3. Keep-alive service and `auth_error`
`src/extras/keepAliveWiring.ts:20-30` only stops on `"none"`. On `"auth_error"` the "nanobot connesso" notification stays. Stop it on `auth_error` too (and on any state that means "no session will reconnect by itself"; read `SessionState` in `src/core/session.ts`). Test.

## 4. Tests independent of the system language
`src/i18n/index.ts:8-10` picks the language from the system locale, so 4 suites fail on an Italian PC unless jest runs with `LANG=en_US.UTF-8`. Force English in the jest setup (`test/setup-*.js`: `i18n.changeLanguage("en")` before each file, or the init option) and make number formatting in tests deterministic. Then `npx jest` must pass **without** the `LANG` prefix. Update the README line about it.

## 5. Dead code
Remove `src/extras/notifier.ts` and its test if nothing imports it (check). Remove `browserSecretStore` from `src/platform/secretStoreShared.ts` only if nothing in production imports it.

## Checks
- `cd mobile && npx jest && npx tsc --noEmit` (no LANG prefix: item 4).
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Edit server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/FX-B.md`: files, tests, deviations, what needs a phone to check.

Commit, push `agy/FX-B`, and give the last hash. Do not merge.
