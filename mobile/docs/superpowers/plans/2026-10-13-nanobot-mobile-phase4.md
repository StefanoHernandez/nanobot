# nanobot mobile, Phase 4 (ecosystem) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebUI parity for the ecosystem pages: Channels (credentials, QR/link connect, pairing approvals), Apps (CLI apps, MCP with OAuth, optional features as "plugins"), Skills (installed, discover, search, trending), and Automations (calendar, run, results).

**Architecture:**
- Logic goes in `src/ecosystem/*`: pure helpers plus hooks over `session.get` and `useSettings().mutate`. Payloads are wire snake_case, sent raw.
- Screens go in `src/screens/ecosystem/*`, reached from a new "Ecosistema" / "Ecosystem" entry in the drawer.
- API facts with file:line references are in `.superpowers/sdd/phase4-vendor-map.md`; every task reads its sections.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, expo-router, jest-expo, `react-native-qrcode-svg` + `react-native-svg` for showing QR codes.

**Spec:** `mobile/docs/superpowers/specs/2026-10-13-nanobot-mobile-design.md` (Fase 4, Sicurezza)

## Global Constraints
- Never modify the nanobot server, and never edit `mobile/vendor/**`. Types come from `@/lib/types`.
- **Exclusions** (user decision, 2026-10-13, recorded as ruling R-P4-1):
  - all `remote.*` (loopback-only, 403 from a phone);
  - custom and import MCP servers, including the cwd and command fields (they run arbitrary host commands);
  - `skill.delete` (403 from a phone);
  - `api_service.*`;
  - editing `tools.webui_allow_remote_package_install`, which can only be changed host-local.
- **Installs** (user decision R-P4-2): CLI app install, update and uninstall, skill install and update, and `feature.enable` all go behind a confirm `Dialog` that says what is installed on the host. There is no biometric step. They use `timeoutMs: 150_000`.
  - When the host flag is false or the server returns 403, show "Abilita le installazioni remote dal PC (Impostazioni → Avanzate)" and do not retry.
  - After a 504, re-fetch the list.
- **Other confirms** (destructive `Dialog`): uninstall, `automation.run`, automation delete, pairing approve (it grants a sender access to the agent), MCP remove, and clearing a channel secret.
- **Secrets are write-only.**
  - Channel secrets: show "Salvato" / "Saved" from `configured_fields`; send `null` to clear.
  - MCP fields: a `configured` boolean.
  - Reuse `HintSecretField` with a synthesised hint.
  - Never log secrets, auth URLs, callback URLs or QR URLs. All of these are live credentials.
- **Polling:** follow `interval_ms` and `expires_at_ms`, pause while the app is in the background (AppState), and stop on unmount or expiry.
- UI rules (agy README): i18n for it and en, theme colours only, touch targets of at least 48 dp, safe area, keyboard.

## Review Focus
1. **Host install flag off:** every install path shows the "enable on PC" message, sends no retries, and leaves no spinner stuck. Test: P4-C1 / P4-U2.
2. **QR connect expiry and background:** polling stops at `expires_at_ms`, pauses in the background, resumes when the app is active again, and cancel sends the cancel action. Test: P4-C1.
3. **Channel secret round-trip:** an untouched secret is omitted, a cleared secret is sent as `null` behind a confirm, and a configured secret shows "Saved". Test: P4-C1.
4. **MCP OAuth with the http gateway:** for the callback_url completion, the user pastes the failed URL, it is sent once, polling ends, and nothing is logged. Test: P4-C2.
5. **Automation run:** it asks for confirmation, sends exactly one `automation.run`, and fetches the result. Test: P4-C2.

## Execution waves
| Wave | Logic (Claude) | UI |
|---|---|---|
| 1 | P4-C1 shared helpers + channels logic | — |
| 2 | P4-C2 apps, MCP, skills, automations logic | P4-U1 drawer entry + Channels UI |
| 3 | — | P4-U2 Apps UI; P4-U3 Skills UI; P4-U4 Automations UI |

---

### Task P4-C1 [Claude]: Shared ecosystem helpers + Channels logic
**Files:**
- `mobile/src/ecosystem/common.ts`
- `mobile/src/ecosystem/channels.ts`
- Test: `mobile/test/ecosystem/channels.test.ts`

**Produces, in `common.ts`:**
- `installGate(settings): { allowed: boolean }`, which reads `runtime_config["tools.webui_allow_remote_package_install"]`.
- `isPolicyError(e)`, true for a 403.
- `longMutation(mutate, action, payload)`: a 150 s mutation. On a 504 it resolves `{ timedOut: true }` so the caller re-fetches.
- `usePolling({ intervalMs, expiresAtMs, tick, enabled })`: pauses in the background, stops at expiry, and is cleaned up on unmount.

**Produces, in `channels.ts`:**
- `useChannels()`: features where `type === "channel"`, plus instances and runtime status, from `/api/settings/nanobot-features`.
- `channelFormFromContract(contract, values, configured_fields)`.
- `channelConfigurePayload(contract, form)`: secrets are omitted when untouched and sent as `null` when cleared; int, bool, list and enum are coerced.
- `validateChannelForm`.
- `useChannelConnect(channel, instanceId?)` returns `{ state: "idle" | "waiting" | "done" | "expired" | "error"; qrUrl?; linkUrl?; start(); cancel() }`. It covers `channel.connect.start/poll/cancel`, the weixin `verify_code` param, and `usePolling`.
- `usePairing()`: `/api/settings/pairing` with `approve(code)` and `deny(code)`.
- `channelEnable` and `channelDisable` via `feature.enable` / `feature.disable` with `instance_id`.

- [ ] **Steps:** write failing tests for:
  - the gate when the flag is false;
  - a 403 being a policy error;
  - a 504 resolving to `timedOut`;
  - polling that pauses in the background and stops at expiry;
  - an untouched secret omitted and a cleared one sent as `null`;
  - list and int coercion;
  - connect start → waiting with a qrUrl → poll done;
  - cancel sending the cancel action;
  - pairing approve sending the code.

  Then implement, run the tests until they pass, and commit `feat(mobile): ecosystem helpers and channels logic`.

### Task P4-C2 [Claude]: Apps, MCP, Skills, Automations logic
**Files:**
- `mobile/src/ecosystem/apps.ts`
- `mobile/src/ecosystem/mcp.ts`
- `mobile/src/ecosystem/skills.ts`
- `mobile/src/ecosystem/automations.ts`
- Test: `mobile/test/ecosystem/apps-skills-automations.test.ts`

**Produces:**
- **CLI apps:** `useCliApps()` (list plus `install`, `update`, `uninstall`, `test`).
- **Features ("plugins"):** `useFeatures()`, the non-channel features with enable and disable.
- **MCP:**
  - `useMcp()` lists presets with enable, disable, remove, test, reconnect and tools. It has **no custom or import**.
  - `useMcpOAuth(preset)` is a sibling of `src/settings/oauth.ts` covering `oauth_start` (30 s), complete and cancel. It supports the callback_url paste, uses `Linking.openURL`, expires, cancels on unmount for device flows, and logs nothing.
- **Skills:** `useSkills()` returns installed skills plus `discover`, `search(q)` and `trending`, with `install` and `update`. There is **no delete**.
- **Automations:**
  - `useAutomations()` returns the list, a calendar view model with `groupByDay(jobs, now)`, `run(id)`, `enable`, `disable`, `delete`, `update`, `changeChat`, and `result(id)`.
  - `fetchAutomationChats` and `fetchAutomationRunResult` go through `session.get`.

- [ ] **Steps:** write failing tests for:
  - install routed through `longMutation` with a 150 s timeout and a gate check;
  - no custom or import action exists in `mcp.ts` (an `Object.keys` assertion);
  - MCP OAuth callback_url sent once, then polled to done, with the expiry handled;
  - `skills` has no delete;
  - `automation.run` sent once, after which the result is fetched;
  - `groupByDay` ordering;
  - automation update payload keys in snake_case.

  Then implement, run the tests until they pass, and commit `feat(mobile): apps, MCP, skills and automations logic`.

### Task P4-U1: Drawer entry + Channels UI
- Add an "Ecosistema" / "Ecosystem" item in the ChatDrawer header area, next to settings, leading to `app/ecosystem/index.tsx`. The index lists Canali, App, Skills and Automazioni (Channels, Apps, Skills, Automations).
- **Channels list:** status chip (running, error, disabled), an enable toggle, and instances.
- **Channel sheet:** a generic contract form whose secrets use `HintSecretField` with "Saved", plus validation and errors.
- **Connect:** shows the QR (`react-native-qrcode-svg`), a link button (`Linking.openURL`), and a countdown with cancel.
- **Pairing requests section:** approve (confirm) and deny.
- **Tests:**
  - an untouched secret is not sent;
  - clearing asks for confirmation;
  - connect shows a QR when `qrUrl` is set;
  - expiry shows the expired message;
  - approve needs a confirm.

### Task P4-U2: Apps UI (CLI apps, MCP, plugins)
- **Tabs:** CLI, MCP, Plugin.
- **CLI apps and plugins:** each row has status, install, update, uninstall and test, behind confirms. When the gate is off, show the "enable on PC" banner and disable the buttons.
- **MCP:** each row shows enabled/configured, tools count, enable/disable, test, reconnect and remove (confirm). The OAuth sheet follows the provider OAuth UI pattern, with a callback URL paste field.
- There is no custom-server button. Instead, a note: "Aggiungi server personalizzati dalla WebUI sul PC" / "Add custom servers from the WebUI on your computer".
- **Tests:**
  - the gate banner disables install;
  - install asks for confirmation and calls it with 150 s;
  - a 403 shows the policy message;
  - MCP remove asks for confirmation;
  - the OAuth callback paste is submitted;
  - there is no custom-server entry.

### Task P4-U3: Skills UI
- **Tabs:** Installate, Scopri, Tendenze (Installed, Discover, Trending), plus a search field (debounced).
- Each row shows name, description, source and version, with install/update (confirm, gate).
- There is no delete. Show a note "Rimuovi dalla WebUI sul PC" / "Remove from the WebUI on your computer".
- **Tests:**
  - the search is debounced and calls `search`;
  - install asks for confirmation;
  - the gate off disables install;
  - there is no delete button.

### Task P4-U4: Automations UI
- **List and calendar:** `groupByDay` sections, each job with its schedule, next run, enabled toggle and target chat.
- **Job sheet:**
  - Run (confirm) → result view;
  - edit the message and schedule (`update`);
  - change the chat (picker from `fetchAutomationChats`);
  - delete (confirm).
- **Tests:**
  - run asks for confirmation and shows the result;
  - the enable toggle sends enable/disable;
  - delete asks for confirmation;
  - the calendar groups jobs by day.
