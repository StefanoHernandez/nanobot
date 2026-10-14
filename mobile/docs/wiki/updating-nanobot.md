# Updating nanobot
1. Check out the target nanobot tag/commit somewhere.
2. `cd mobile && scripts/sync-nanobot.sh <checkout-dir>` (fails if a listed file vanished; edit the list in the script when upstream moves things; add transitive imports there).
3. `npx jest && npx tsc --noEmit`.
4. Fix breakage in `src/platform` or `src/state`, never in `vendor/`. Record new shims in `known-issues.md`.
5. Commit vendor + `VERSION` together; log it in `log.md`.
