# Report: FX-B (app fixes from the external audit)

## Files changed
- `mobile/src/screens/thread/ToolActivitySheet.tsx`: added `detailError === null` to `needsFetch` condition and added a "Riprova" (`common.retry`) Button action in the detail view error state.
- `mobile/src/extras/approvals.ts`: replaced direct `fetch()` calls with `session.get` and `session.post`.
- `mobile/src/extras/costs.ts`: replaced direct `fetch()` calls with `session.get` and `session.post`.
- `mobile/src/extras/prompts.ts`: replaced direct `fetch()` calls with `session.get` and `session.post`.
- `mobile/src/extras/system.ts`: replaced direct `fetch()` call with `session.get`.
- `mobile/src/extras/backup.ts`: replaced direct `fetch()` calls with `session.get` and `session.post`.
- `mobile/src/core/pairing.ts`: replaced direct authenticated `fetch()` calls (`mintPairingCode`, `revokeDevice`, `setFullPower`) with `session.post`. Unauthenticated `claimDevice` handshake is unchanged.
- `mobile/src/extras/keepAliveWiring.ts`: stopped keep-alive foreground service on `state === "auth_error"` in addition to `"none"`.
- `mobile/src/platform/secretStoreShared.ts`: removed dead code `browserSecretStore` and unused `WebStorage` type.
- `mobile/src/extras/notifier.ts`: deleted file (dead code, unused across the codebase).
- `mobile/docs/agy/README.md`: updated instructions for `npx jest` without `LANG=en_US.UTF-8`.
- `mobile/test/setup-timeouts.js`: added deterministic number formatting (`Number.prototype.toLocaleString` default locale) and forced English locale before each file via `beforeAll`.
- `mobile/test/state/fake.ts`: added `session.post` to `fakeSession` and provided fallback to `globalThis.fetch` when routes are not explicitly mocked.
- `mobile/test/screens/thread-tool-sheet.test.tsx`: added test verifying failing trace-detail fetch is called once and "Riprova" action re-triggers the fetch.
- `mobile/test/extras/keepAlive.test.tsx`: added test verifying keep-alive service stops when state becomes `auth_error`.
- `mobile/test/core/session.test.ts`: added test verifying `session.post` retries once after a 401 response and refreshed token.
- `mobile/test/core/pairing-fullpower.test.ts`: updated mocks to use `session.post` instead of `fetchMock`.
- `mobile/test/screens/devices-card.test.tsx`: updated mocks to provide and assert `session.post` for device revocation.
- `mobile/test/platform/browser-store.test.ts`: removed `browserSecretStore` tests and tested `browserKv` isolation directly.
- `mobile/test/extras/notifier.test.ts`: deleted file alongside `notifier.ts`.

## Self-check against the brief
1. **Tool detail fetch loops forever**: implemented in `mobile/src/screens/thread/ToolActivitySheet.tsx:320` (`detailError === null` added to `needsFetch`) and lines 619-634 (renders error with `common.retry` button that sets `detailError(null)`). Tested in `mobile/test/screens/thread-tool-sheet.test.tsx:239-311` (asserts failing fetch called once, retry triggers second fetch).
2. **Direct `fetch` instead of the session**: migrated authenticated calls in `mobile/src/extras/approvals.ts:43-65`, `mobile/src/extras/costs.ts:91-100`, `mobile/src/extras/prompts.ts:56-94`, `mobile/src/extras/system.ts:69-71`, `mobile/src/extras/backup.ts:66-116`, and `mobile/src/core/pairing.ts:74-85, 134-162`. Handshake in `pairing.ts:claimDevice` kept unauthenticated as specified. Tested in `mobile/test/core/session.test.ts:64-72`, `mobile/test/core/pairing-fullpower.test.ts:31-125`, and existing test suites updated.
3. **Keep-alive service and `auth_error`**: updated condition in `mobile/src/extras/keepAliveWiring.ts:25-30` to stop service when `state === "none" || state === "auth_error"`. Tested in `mobile/test/extras/keepAlive.test.tsx:92-108`.
4. **Tests independent of the system language**: configured in `mobile/test/setup-timeouts.js:6-18` forcing English language before each file and deterministic `Number.prototype.toLocaleString` formatting. Updated `mobile/docs/agy/README.md:38`. All test suites pass with plain `npx jest`.
5. **Dead code**: removed `mobile/src/extras/notifier.ts` and `mobile/test/extras/notifier.test.ts` after verifying zero imports in production code. Removed `browserSecretStore` from `mobile/src/platform/secretStoreShared.ts:9-16` after confirming zero production imports.

## Dependencies added
None.

## Doubts or deviations from the brief
None. Followed all requirements and guidelines to the letter.

## Raw output of tests

### npx jest
```
Test Suites: 128 passed, 128 total
Tests:       1030 passed, 1030 total
Snapshots:   0 total
Time:        11.252 s
Ran all test suites.
```

### npx tsc --noEmit
```
(clean - exited with code 0, no output)
```

### npx expo export --platform android --output-dir /tmp/nb-export
```
Android Bundled 16685ms index.js (2544 modules)

› Assets (70):
assets/viewers/babel.min.vendorjs (3.1MB)
assets/viewers/docx-preview.min.vendorjs (72KB)
assets/viewers/jszip.min.vendorjs (98KB)
assets/viewers/leaflet.css.vendorjs (15KB)
assets/viewers/leaflet.vendorjs (148KB)
assets/viewers/mermaid.min.vendorjs (3.6MB)
assets/viewers/pako.min.vendorjs (47KB)
assets/viewers/pdfjs-worker.min.vendorjs (1.1MB)
assets/viewers/pdfjs.min.vendorjs (320KB)
assets/viewers/pptx-preview.umd.min.vendorjs (1.4MB)
assets/viewers/react-dom.production.min.vendorjs (132KB)
assets/viewers/react.production.min.vendorjs (11KB)
assets/viewers/vega-embed.min.vendorjs (60KB)
assets/viewers/vega-lite.min.vendorjs (258KB)
assets/viewers/vega.min.vendorjs (521KB)
assets/viewers/xlsx.full.min.vendorjs (882KB)
node_modules/@expo-google-fonts/atkinson-hyperlegible/400Regular/AtkinsonHyperlegible_400Regular.ttf (54KB)
node_modules/@expo-google-fonts/atkinson-hyperlegible/700Bold/AtkinsonHyperlegible_700Bold.ttf (54KB)
node_modules/@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf (91KB)
node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf (91KB)
node_modules/@expo-google-fonts/material-symbols/400Regular/MaterialSymbols_400Regular.ttf (971KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/AntDesign.ttf (130KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Entypo.ttf (66KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/EvilIcons.ttf (13KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf (56KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf (166KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Brands.ttf (134KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Regular.ttf (34KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Solid.ttf (203KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Brands.ttf (209KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Regular.ttf (68KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Solid.ttf (424KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Fontisto.ttf (314KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Foundation.ttf (57KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf (390KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf (1.3MB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf (357KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Octicons.ttf (69KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/SimpleLineIcons.ttf (54KB)
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Zocial.ttf (26KB)
node_modules/expo-router/assets/arrow_down.png (9.5KB)
node_modules/expo-router/assets/arrow_right.xml (307B)
node_modules/expo-router/assets/checkmark.xml (312B)
node_modules/expo-router/assets/error.png (469B)
node_modules/expo-router/assets/file.png (138B)
node_modules/expo-router/assets/forward.png (188B)
node_modules/expo-router/assets/pkg.png (364B)
node_modules/expo-router/assets/react-navigation/drawer/toggle-drawer-icon.png (4 variations | 107B)
node_modules/expo-router/assets/react-navigation/elements/back-icon-mask.png (653B)
node_modules/expo-router/assets/react-navigation/elements/back-icon.png (4 variations | 152B)
node_modules/expo-router/assets/react-navigation/elements/clear-icon.png (4 variations | 425B)
node_modules/expo-router/assets/react-navigation/elements/close-icon.png (4 variations | 235B)
node_modules/expo-router/assets/react-navigation/elements/search-icon.png (4 variations | 599B)
node_modules/expo-router/assets/sitemap.png (465B)
node_modules/expo-router/assets/unmatched.png (4.8KB)

› android bundles (1):
_expo/static/js/android/index-a90cbcfbfc316f4881d21471e7871d96.hbc (8MB)

› Files (1):
metadata.json (4.6KB)

Exported: /tmp/nb-export
```

## What could not be verified (needs physical device)
- Notification tray dismissal behavior when Android foreground service stops on `auth_error` was verified by unit tests mocking the service bridge, but not on a physical Android device.
- Token refresh behavior after device wakeup and OS battery optimization un-throttling was verified by simulated session mock timing, but requires physical phone execution for device wake verification.
