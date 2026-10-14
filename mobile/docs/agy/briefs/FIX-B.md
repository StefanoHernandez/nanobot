# FIX-B: final review fixes, ecosystem (owner: agy)

The final whole-branch review of Phases 2-4 is in `mobile/docs/agy/reviews/final-review-p234.md`. Read it first. Each finding has file:line, a failure scenario and a suggested fix. Also read `mobile/docs/agy/README.md`.

- **Branch:** `agy/FIX-B`, which Claude creates from `dev`.
- **Folder:** `nanobot_androidapp-agy3`.
- **Before starting:** `cd mobile && npm ci`.

For this task you MAY edit `src/ecosystem/*`. Keep the existing tests green.

## Fix these findings
- **I5:** the channel enable switch goes behind a confirm ("Installa/attiva il canale <name> sul computer host"), respects `installGate`, and shows the policy toast on 403.
- **I6:** MCP OAuth for the gateway-redirect flow.
  - Poll whenever the flow is pending, according to the server payload, not only for `device_code`. Check the upstream semantics in `.superpowers/sdd/phase4-vendor-map.md` §2 and the vendor types.
  - Stop at expiry.
  - Send cancel on unmount or dismiss for every pending flow.
- **I7:** sheets must not own a second copy of the list hook. Lift the hook to the screen, and pass the data and actions down as props (Automations, MCP).
- **I8:** the automation edit must preserve the schedule kind (`at`, `every`, `cron`/`expr`) and `tz`. Send the same shape the job came with, and only change the edited fields.
- **I9:** refresh settings on focus of the Apps and Skills screens, so the install gate is current. Also do this in `SettingsShell` (M17).
- **I10:** pairing refreshes on focus and on pull-to-refresh. Approve and deny errors show a toast (policy toast on 403).
- **I11:** add an in-flight state per plugin row during the 150 s enable. A second toggle is ignored while it runs.
- **M8:** map the ecosystem error toasts to i18n generic messages. Show the policy message on 403 and the timeout message on `timedOut`; otherwise show a generic "Operazione non riuscita" / "Operation failed". Never show the raw `e.message`.
- **M9:** add the missing i18n keys to both it and en.
- **M10:** pass `apply` from `useChannels` as `onFeatures` in `ChannelConnect`.
- **M11:** channel connect resets `sid` and `gen` on session change, and stops after 5 consecutive non-403 errors.
- **M12:** refetch the features payload when `restartState === "done"`.
- **M13:** ChannelSheet resets the form only on `channel.name` change or open, not on object identity.
- **M14:** after "Run now", poll the run result (every 2 s, up to 60 s) until `run_history` shows a run newer than the click. Until then, show "In esecuzione…" / "Running…".
- **M15:** CLI in-flight state is per app: a `Set`, or a map from name to operation.
- **M16:** replace the hardcoded `#fff` with a theme token.
- **M17:** see I9.

## Tests (write first)
Add one focused test per Important (I5-I11), plus M8 (no raw message is toasted) and M14.

## Done when
- In `mobile/`, `npx jest` and `npx tsc --noEmit` pass.
- Commit on `agy/FIX-B` as `fix(mobile): final review fixes for ecosystem`, with the report in `mobile/docs/agy/reports/FIX-B.md` listing each finding as fixed or not and why.
