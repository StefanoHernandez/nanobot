# NV-A Report: Settings with clear names, one place per setting

- **Branch:** `agy/NV-A`
- **Owner:** agy
- **Specification:** `mobile/docs/superpowers/specs/2026-10-19-navigation-design.md`
- **Brief:** `mobile/docs/agy/briefs/NV-A.md`

---

## 1. Executive Summary

This task implements the settings reorganization for `nanobot-mobile` specified in NV-A:
1. **Section List & Groups**: Restructured `SECTIONS` to exactly 12 sections under group headers `BOT`, `SICUREZZA`, `SPESA`, `SERVER`, `QUESTO TELEFONO` (with Panoramica at top, no header). Every section row has the subtitle specified in the navigation design spec.
2. **Backward-Compatible Redirects**: Old paths (`capabilities` → `features`, `system` → `server`, `machine` → `server`, `appearance` → `app`) redirect automatically via `app/settings/[section].tsx` and resolve cleanly in `SettingsSection`. Updated internal router links in `OverviewSection.tsx`.
3. **Controls Moved to Single Canonical Locations**:
   - `ApprovalsCard` moved from `AppearanceSection` to `SecuritySection`.
   - `DevicesCard` moved from `AboutSection` to `SecuritySection`.
   - `NetworkSafetyCard` moved from `AdvancedSection` to `SecuritySection`.
   - `SystemSection` content (config path, apply state) merged into `MachineSection` (`ServerSection`), retaining exactly **one** restart action with confirmation dialog.
   - `RuntimeConfigSection` groups mapped to their respective sections (`behavior`, `security`, `advanced`).
4. **Optional Packages Placed Next to Their Feature**:
   - `azure`, `bedrock` in **Modelli** (`models`).
   - `olostep` in **Funzionalità** (`features`) near web search.
   - `documents`, `pdf` in **Funzionalità** (`features`).
   - `api`, `langfuse`, and all unknown / third-party packages in **Avanzate** (`advanced`) under "Altri componenti".
   - `dev` and channel packages hidden from settings.
   - Created reusable `<Features />` component and centralized map `PACKAGE_PLACE` in `packagePlace.ts`.
5. **i18n Integrity**: Only added new keys in `it.json` and `en.json`; no existing keys deleted.

---

## 2. Files Changed & Created

### Created Files
1. `mobile/src/screens/settings/packagePlace.ts`: Central `PACKAGE_PLACE` dictionary, `getPackagePlace(name)` (defaults unknown packages to `"advanced"`, `"dev"` to `null`), and `isSettingsFeatureVisible(f)` (filters out channels, `dev`, and `settings_visible === false`).
2. `mobile/src/screens/settings/Features.tsx`: Reusable component displaying optional features filtered by `place` or `names`, with enable/disable/install flows and confirmation dialogs.
3. `mobile/src/screens/settings/SecuritySection.tsx`: Aggregates `ApprovalsCard`, `DevicesCard` (for active sessions), and runtime security groups (`shell`, `safety`) led by `NetworkSafetyCard`.
4. `mobile/test/screens/nv-a.test.tsx`: Dedicated comprehensive NV-A test suite (14 tests covering sections order, groups, subtitles, redirects, RAW field completeness loop, approvals/devices placement, and package routing).

### Modified Files (Owned by NV-A)
1. `mobile/src/settings/runtimeFields.ts`:
   - Added `"behavior"` and `"security"` to `FieldPage`.
   - Updated `GROUPS`: `identity`, `sessions`, `tools`, `execution`, `chat` → `page: "behavior"`; `shell`, `safety` → `page: "security"`; `cli`, `gateway`, `api` → `page: "advanced"`.
   - Exported `RAW` and `GROUPS`.
2. `mobile/src/screens/settings/SettingsScreen.tsx`:
   - Updated `SECTIONS` to 12 sections in spec order.
   - Created `SECTION_GROUPS` with headers `BOT`, `SICUREZZA`, `SPESA`, `SERVER`, `QUESTO TELEFONO`.
   - Rendered subtitles per section.
   - Added `SETTINGS_REDIRECTS` map and `resolveSettingsSection`.
3. `mobile/src/screens/settings/SettingsSection.tsx`:
   - Routed new sections (`features`, `behavior`, `security`, `server`, `app`).
   - Used `resolveSettingsSection(section)` for backwards compatibility.
4. `mobile/app/settings/[section].tsx`:
   - Added URL redirection using `router.replace` for legacy section slugs.
5. `mobile/src/screens/settings/AppearanceSection.tsx`:
   - Removed `ApprovalsCard` and its unused import.
   - Exported `AppSection = AppearanceSection`.
6. `mobile/src/screens/settings/AboutSection.tsx`:
   - Removed `DevicesCard` and its unused import.
7. `mobile/src/screens/settings/MachineSection.tsx`:
   - Added config path and apply state summary cards.
   - Retained single restart row with confirmation dialog.
   - Exported `ServerSection = MachineSection`.
8. `mobile/src/screens/settings/RuntimeConfigSection.tsx`:
   - Replaced old static Features list with `<Features place="advanced" />`.
   - Re-exported `RuntimeGroups`, `BehaviorSection`, `SystemSection`, `Features`.
9. `mobile/src/screens/settings/ModelsSection.tsx`:
   - Added `<Features names={["azure", "bedrock"]} />` adjacent to providers.
10. `mobile/src/screens/settings/CapabilitiesSection.tsx`:
    - Added `<Features names={["olostep"]} />` near web search.
    - Added `<Features names={["documents", "pdf"]} />`.
    - Exported `FeaturesSection = CapabilitiesSection`.
11. `mobile/src/screens/settings/OverviewSection.tsx`:
    - Updated navigation targets: `/settings/machine` → `/settings/server`, `/settings/capabilities` → `/settings/features`.
12. `mobile/src/i18n/it.json` & `mobile/src/i18n/en.json`:
    - Added only new keys under `settings.sections`, `settings.groups`, `settings.sectionSubtitles`, `system.otherComponents`, `system.documentsTitle`, `system.groups.chat`.

### Updated Existing Test Suites (due to moved sections & labels)
1. `mobile/test/screens/settings.test.tsx`: Updated tests navigating to `"app"`, `"features"`, and verifying restart label.
2. `mobile/test/screens/overview.test.tsx`: Updated navigation assertions to `/settings/server` and `/settings/features`.
3. `mobile/test/screens/machine-dashboard.test.tsx`: Updated `SECTIONS` inclusion assertion to `"server"`.
4. `mobile/test/extras/backup-export.test.tsx`: Updated `SECTIONS` relative order assertion (`backup` after `server`).
5. `mobile/test/screens/redesign-settings.test.tsx`: Updated `test.each` to cover all redesigned sections.
6. `mobile/test/screens/runtime-settings.test.tsx`: Updated test navigation to `server`, `behavior`, `security`, `advanced`.
7. `mobile/test/settings/runtime-capabilities.test.ts`: Updated page expectation for `timezone` and `tools.exec.timeout`.

---

## 3. Final Section → Content Table

| Group Header | Section ID | Translated Title (IT) | Subtitle | Content & Controls |
|---|---|---|---|---|
| *(none - top)* | `overview` | Panoramica | spending today, bot state, journal, kanban | System status, today/month costs, active model, memory, kanban quick link, capabilities badges. |
| **BOT** | `models` | Modelli | providers, chat model, task models (+ azure, bedrock) | Provider cards, custom providers, model call order, default models, `<Features names={["azure", "bedrock"]} />`. |
| **BOT** | `features` | Funzionalità | images, voice, web search (+ olostep), documents and PDF (+ documents, pdf), memory | Image generation card, web search card + `<Features names={["olostep"]} />`, transcription card, memory card, `<Features names={["documents", "pdf"]} />`. |
| **BOT** | `prompts` | Prompt salvati | saved prompts | Saved prompt library, new prompt creation, scope filter. |
| **BOT** | `behavior` | Comportamento | runtime groups identity, sessions, tools, execution, chat | Runtime configuration groups: `identity` (timezone), `sessions`, `tools`, `execution`, `chat`. |
| **SICUREZZA** | `security` | Sicurezza | command approvals · devices and full power · runtime groups shell, safety · network safety card | `ApprovalsCard` (shell approval toggle, always-allowed chats), `DevicesCard` (paired phones, revoke, full power toggle), `NetworkSafetyCard` (local service access, default access mode), runtime groups `shell` and `safety`. |
| **SPESA** | `costs` | Spesa | daily limits, monthly spending, tokens | Daily spending cap, alert thresholds, model pricing editor, token usage breakdowns. |
| **SERVER** | `server` | Stato del server | machine stats, recent errors, one restart, apply state, config path | Config path, apply state, CPU / RAM / Swap / Disk / Temperature / Load gauges, uptime, recent errors log, one Restart gateway button with confirmation dialog. |
| **SERVER** | `backup` | Backup e ripristino | export and restore data | Backup directory config, create backup, backup archive list, restore and delete actions. |
| **SERVER** | `advanced` | Avanzate | runtime groups gateway, api, cli; "Other components" (api, langfuse, unknown extras) | Runtime configuration groups: `gateway`, `api`, `cli`; and `<Features place="advanced" />` ("Altri componenti"). |
| **QUESTO TELEFONO** | `app` | App | language, look, sounds, notifications, background connection, battery, lock, voice replies | Language selector, theme mode, notification sounds, kanban alerts, background connection toggle, battery exemption, app lock (biometrics), voice auto-read replies. |
| **QUESTO TELEFONO** | `about` | Informazioni | version, connected server, change server | App version, connected profile / host info, change server button, link to repository and MIT license. |

### Note on Network Group Placement
As specified in brief item 2 ("network group (proxy, user agent): keep it where CapabilitiesSection shows it today (web search), unless it is not shown anywhere: then put it in Avanzate. Say which in the report."):
The `network` runtime fields (`tools.web.proxy`, `tools.web.user_agent`) have `card: "web"` and are rendered within `CapabilitiesSection` (`features`) inside the Web search configuration card. Therefore, they remain in **Funzionalità** (`features`).

---

## 4. Package Placement Matrix

| Package Name | Destination Section | Rule / Placement Rationale |
|---|---|---|
| `azure` | `models` | Placed adjacent to LLM providers in ModelsSection. |
| `bedrock` | `models` | Placed adjacent to LLM providers in ModelsSection. |
| `olostep` | `features` | Placed next to web search configuration in CapabilitiesSection. |
| `documents` | `features` | Placed under document features in CapabilitiesSection. |
| `pdf` | `features` | Placed under document features in CapabilitiesSection. |
| `api` | `advanced` | Placed under "Altri componenti" in AdvancedSection. |
| `langfuse` | `advanced` | Placed under "Altri componenti" in AdvancedSection. |
| *Unknown / Third-party packages* | `advanced` | Fallback in `getPackagePlace` routes every unmapped package to "Altri componenti" in AdvancedSection. |
| `dev` | *(hidden)* | `getPackagePlace("dev")` returns `null`; filtered by `isSettingsFeatureVisible`. |
| *Channel packages (`type: "channel"`)* | *(hidden)* | Filtered out by `isSettingsFeatureVisible(f)` since they are managed on the Channels screen. |

---

## 5. Verification Results

### 1. TypeScript Check
```
$ npx tsc --noEmit
Exit code: 0 (0 errors)
```

### 2. Full Jest Test Run
```
$ npx jest --runInBand
Test Suites: 135 passed, 135 total
Tests:       1101 passed, 1101 total
Snapshots:   0 total
Time:        46.166 s
Exit code: 0
```

### 3. Android Export
```
$ npx expo export --platform android --output-dir /tmp/nb-export-nv
Android Bundled 16425ms index.js (2570 modules)
Exported: /tmp/nb-export-nv
Exit code: 0
```

### 4. Web Export
```
$ npx expo export --platform web --output-dir /tmp/nb-export-nv-web
Web Bundled 4013ms index.js (1882 modules)
Exported: /tmp/nb-export-nv-web
Exit code: 0
```

---

## 6. Unused i18n Keys Kept for Compatibility

In strict adherence to the brief ("i18n: only **add** keys (old keys may stay unused; list them in the report)"), the following keys were preserved in both `it.json` and `en.json` to prevent breaks in legacy references or other parts of the ecosystem:
- `settings.sections.appearance` ("Aspetto" / "Appearance") — replaced by `settings.sections.app`
- `settings.sections.capabilities` ("Funzionalità" / "Capabilities") — replaced by `settings.sections.features`
- `settings.sections.system` ("Sistema" / "System") — replaced by `settings.sections.server`
- `settings.sections.machine` ("Macchina" / "Machine") — replaced by `settings.sections.server`

---

## 7. Deviations or Doubts

None. All constraints from `mobile/docs/agy/README.md`, `mobile/docs/superpowers/specs/2026-10-19-navigation-design.md`, and `mobile/docs/agy/briefs/NV-A.md` were followed strictly:
- No changes to server files.
- No new dependencies added.
- No `@react-navigation/*` imports introduced.
- No restyling; current theme tokens, layout cards, and control structures were strictly preserved.

---

## 8. What Needs a Phone or the Web App to Check

1. **Physical Device Biometrics**: Face ID / Fingerprint app lock toggle under `app` (uses `expo-local-authentication`, which falls back gracefully in test/mock environments).
2. **Push Notifications for Approvals**: Permission dialog and native push receipt for shell approvals under `security` (requires Google Play Services / APNs).
3. **Gateway Restart Roundtrip**: Verifying the confirmation dialog, status spinner, and WebSocket reconnect sequence during actual host process restart under `server`.
4. **Web Browser Logout / Fallback**: Verification of `DevicesCard` cookie logout button when accessed from a desktop web browser.
