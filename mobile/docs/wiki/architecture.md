# Architecture
```
mobile/
  app/               expo-router routes; _layout.tsx calls installPolyfills() first
  vendor/nanobot/    synced copy of nanobot client code (never edit)
  src/platform/      polyfills, MMKV storage (kv), babel import.meta plugin, vite-env types
  src/extras/        our own features (StatusDot, EffortPill stubs for now)
  scripts/           sync-nanobot.sh
  test/              jest (jest-expo)
```
- Alias `@/lib/*` -> `vendor/nanobot/webui/src/lib/*` (tsconfig paths + babel module-resolver) so vendor files import each other unchanged.
- Vendor browser deps are met by globals installed in `installPolyfills()` (window, localStorage on MMKV, crypto.randomUUID, location/history stubs) and a babel plugin for `import.meta.env`. Never patch vendor.
- Native dirs `android/`, `ios/` are generated (CNG) and git-ignored.
