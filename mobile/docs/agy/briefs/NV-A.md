# NV-A: Settings with clear names, one place per setting (owner: agy)

Branch `agy/NV-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`. **App only.** Read the spec first: `mobile/docs/superpowers/specs/2026-10-19-navigation-design.md` (section "Settings" and the rules). This brief covers only the Settings part; "Il mio bot" is a later brief.

Other agents work in parallel: W2-sec (server), LK-A (`app/_layout.tsx`, `NativeIntegrations.tsx`, `src/extras/lock.tsx`, `src/screens/connect/**`), EC-A (`src/screens/ecosystem/apps/**`, `src/ecosystem/apps.ts`, `mcp.ts`), AR-B (`src/screens/viewer/**`, `src/artifacts/**`), PF-A (`src/ui/markdown/**`, `src/state/threadStore.ts` + its consumers, `viewerLibs.ts`). You own `src/screens/settings/**`, `app/settings/**`, `src/settings/runtimeFields.ts`. i18n: only **add** keys (old keys may stay unused; list them in the report).

Keep today's look and every existing control: this moves and renames, it does not redesign. No server changes.

## 1. Section list (`SettingsScreen.tsx`)
- `SECTIONS` becomes: `overview`, `models`, `features`, `prompts`, `behavior`, `security`, `costs`, `server`, `backup`, `advanced`, `app`, `about`, shown under the group headers BOT, SICUREZZA, SPESA, SERVER, QUESTO TELEFONO (Panoramica on top, no header). Each row has the subtitle from the spec.
- Old ids redirect: `capabilities` → `features`, `system` → `server`, `machine` → `server`, `appearance` → `app`. Update the internal links (`OverviewSection.tsx` pushes `/settings/machine`, `/settings/capabilities`).

## 2. Moves
- **Comportamento** (`behavior`): runtime groups `identity`, `sessions`, `tools`, `execution`, `chat` (change their page in `GROUPS`, `runtimeFields.ts:14`; add a `FieldPage` value).
- **Sicurezza** (`security`): `ApprovalsCard` (out of `AppearanceSection.tsx:211`), `DevicesCard` with full power (out of `AboutSection.tsx:154`), runtime groups `shell`, `safety`, and `NetworkSafetyCard` (out of `AdvancedSection`).
- **Stato del server** (`server`): `MachineSection` content plus what `SystemSection` shows today (config path, apply state); **one** restart row (today both have one).
- **Avanzate** (`advanced`): runtime groups `gateway`, `api`, `cli`; plus "Altri componenti" (below).
- **App** (`app`): `AppearanceSection` minus the approvals card. **Informazioni**: `AboutSection` minus devices.
- **Funzioni** (`features`): today's `CapabilitiesSection`.
- `network` group (proxy, user agent): keep it where `CapabilitiesSection` shows it today (web search), unless it is not shown anywhere: then put it in Avanzate. Say which in the report.

## 3. Optional packages next to their feature
Today `Features()` in `RuntimeConfigSection.tsx:161` lists all `/api/settings/nanobot-features` items (and EC-A's `PluginsTab` lists them again; do not touch `PluginsTab`, NV-B removes it).
- Make `Features` a small reusable component that takes a list of names and renders only those (same enable/install/disable behaviour and confirm dialog as today).
- Place: `azure`, `bedrock` in Modelli (near the providers); `olostep` in Funzioni near web search; `documents`, `pdf` in Funzioni; `api`, `langfuse` and **every name not in this map** in Avanzate → "Altri componenti"; `dev` hidden. Channel features (the ones the Channels screen manages) are not shown here; check how `PluginsTab`/`channels.ts` tell them apart and use the same rule.
- One map `PACKAGE_PLACE` in one file; a test that an unknown name falls into Avanzate.

## Tests
- Section list: groups, order, subtitles; each old id redirects.
- Every field in `RAW` maps to exactly one page that some section renders (loop over `RAW`).
- Approvals and devices render under Sicurezza and not under App / Informazioni.
- Known packages render in their section; an unknown package renders in Avanzate; `dev` never.
- Update existing settings tests that navigate by old ids.

## Checks
- `cd mobile && npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export-nv`
- `cd mobile && npx expo export --platform web --output-dir /tmp/nb-export-nv-web`

## Do not
- Edit server files or `mobile/vendor/**`. Add dependencies. Import `@react-navigation/*`. Restyle. Touch files owned by the other agents.

## Report
`mobile/docs/agy/reports/NV-A.md`: files, the final section → content table, tests, unused i18n keys, deviations, what needs a phone or the web app to check.

Commit (no `Co-Authored-By` lines, never `mobile/node_modules`), push `agy/NV-A`, and give the last hash. Do not merge.
