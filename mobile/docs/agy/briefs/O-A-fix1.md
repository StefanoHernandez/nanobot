# O-A-fix1 (owner: agy, branch `agy/O-A`, worktree `../nanobot-agy`)

Claude added commit `0b885998` on your branch: `core/pairing.ts` now has `pairedDevice.get/set/clear(profileId)`, saved at pairing. Build on it.

## 1. PDF export: decided by Claude (Critical)
`viewerCsp(false,false)` still allows inline scripts, so the CSP doesn't stop scripts.
- **Markdown → PDF** (`markdownToPrintHtml`):
  - print with a CSP that also has `script-src 'none'`. Add an option to `printDocument`, e.g. `printDocument(html, { scripts: false })`, that builds the CSP with `script-src 'none'`. Do not change `viewerCsp` for the live viewer.
  - **Remove** the `stripDangerousHtml` pass on the raw markdown: it mangles code blocks and prose (`onclick=` examples, `<script>` in fences). Keep at most a sanitizer on the *rendered* HTML. The CSP is now the real guard.
- **Full HTML artifacts** keep their scripts (charts need them) but stay without network, as today. Write a code comment that says this.
- Inject the CSP into the *first* real `<head>` only: parse with the first match of `<head\b` that comes before `<body`. Otherwise wrap.
- **Tests:**
  - markdown print: the CSP contains `script-src 'none'`;
  - a fenced code block containing `<script>` and `onclick=` survives in the printed HTML (escaped by marked);
  - an HTML artifact print keeps its `<script>` and has `connect-src 'none'`.

## 2. Revoke-self warning without guessing (Important)
In `DevicesCard.tsx`:
- delete the guess chain (`session.deviceId`, `profile.device_id`, `kv` keys…);
- use only `pairedDevice.get(activeProfileId)`;
- the test seeds it through `pairedDevice.set`, not an invented key.

Also call `pairedDevice.clear(id)` where a profile is deleted (`ConnectScreen.tsx` `confirmDelete`).

## 3. Gallery "viewed version" (Important)
`GalleryScreen.tsx:387-396`: don't use the global `artifactStore` with a loose `!opened.id ||` match.
- Compare artifact ids strictly. If the stored entry isn't the same artifact, save the **latest** version.
- Remove the `artifactStore.set` effect added in `FileViewer.tsx:140-147`, unless it is needed for that strict match. If you keep it, add a comment explaining why.
- Test: view artifact A at v1, then save gallery item B → B's latest version is uploaded.

## 4. Minor
`readingPages.ts`: the `[\s/]+on…=` regex must not touch normal text. This is covered by item 1 removing the raw-markdown pass.

## Done when
- jest (`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`) and tsc are green.
- Commit `fix(mobile): O-A review fixes (print CSP, revoke-self, gallery version)`.
- Append "fix1" to `mobile/docs/agy/reports/O-A.md`.
