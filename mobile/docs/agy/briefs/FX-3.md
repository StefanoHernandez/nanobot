# FX-3: web polish and FX-2 leftovers (owner: agy)

Branch `agy/FX-3`, from `origin/main` (see the README: no rebase).

WA-A and FX-2 are merged. Claude tested the web app in a real browser against the gateway:
- login, cookie, reload and logout all work;
- Claude also fixed an infinite page reload (`session.ts`) and `crypto.randomUUID` on plain http.

What is left is small.

## Web (desktop browser)
1. **Enter sends the message.**
   - On web only, in the chat composer: **Enter sends** and **Shift+Enter adds a newline**.
   - IME composition must not send: ignore Enter while `nativeEvent.isComposing` is true.
   - Native behaviour does not change.
   - Tests:
     - on web, Enter calls send;
     - Shift+Enter does not;
     - on android, Enter does not send.
2. **Device labels on web.**
   - In Settings → Informazioni the list is titled `about.devices` ("Telefoni collegati"), but on web it also lists browsers.
   - Add `about.devicesAll` ("Dispositivi collegati" / "Linked devices") and use it on web.
   - Do the same for `about.pairPhone`: on web show `about.pairDevice` ("Collega un dispositivo" / "Link a device").
3. **Logout without the device id.**
   - If the active profile is `auth: "cookie"` but `pairedDevice.get` has no id (e.g. the user cleared site data), "Esci da questo browser" must still be there. It calls `webLogout` and then removes the profile.
   - If `webLogout` fails because of the network, show `common.operationFailed` and **keep** the profile, so the user can try again.
   - Tests for both cases.

## FX-2 leftovers
4. `ThreadScreen` export: while exporting, show the `export.exporting` text (as `ProjectDetailScreen` does), not only the spinner on the menu button.
5. `test/extras/backup-export.test.tsx`: three queries still pick the "last match" with `[length - 1]` (around lines 736, 836 and 896). Scope them with `within(dialog)` or give the confirm button its own label.
6. `test/extras/prompts.test.tsx`, the item 9 test from FX-2:
   - seed `promptsStore` with project A's prompts **before** the fetch;
   - make the fetch never resolve;
   - assert that the picker in a chat with no project shows only the global ones.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- `bash scripts/build-web.sh` completes.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `fix(mobile): web composer, device labels and export polish`.
- Report in `mobile/docs/agy/reports/FX-3.md`.
