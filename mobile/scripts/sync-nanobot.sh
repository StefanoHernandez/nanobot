#!/usr/bin/env bash
# Usage: sync-nanobot.sh <nanobot-checkout-dir>
# Copies the explicit file list below into vendor/nanobot/ (paths preserved), writes VERSION and
# src/platform/vendorVersion.ts.
# Transitive additions beyond the initial brief list: client-run-ledger.ts (upstream 0d1beac3).
set -euo pipefail
SRC="${1:?usage: sync-nanobot.sh <nanobot-checkout-dir>}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/vendor/nanobot"
FILES=(
  webui/src/lib/nanobot-client.ts webui/src/lib/api.ts webui/src/lib/types.ts
  webui/src/lib/bootstrap.ts webui/src/lib/runtime.ts webui/src/lib/http.ts
  webui/src/lib/subagent-tasks.ts webui/src/lib/thread-event-projection.ts
  webui/src/lib/activity-timeline.ts webui/src/lib/media.ts webui/src/lib/tool-traces.ts
  webui/src/lib/model-request-failure.ts webui/src/lib/user-message-quote.ts
  webui/src/lib/client-run-ledger.ts
  packages/client-events/attachments.ts packages/client-events/delivery.ts
  packages/client-events/notifications.ts packages/client-events/fixtures.json
  LICENSE
)
for f in "${FILES[@]}"; do [ -f "$SRC/$f" ] || { echo "missing: $f" >&2; exit 1; }; done
rm -rf "$DEST"
for f in "${FILES[@]}"; do mkdir -p "$DEST/$(dirname "$f")"; cp "$SRC/$f" "$DEST/$f"; done
# SYNC_COMMIT: the upstream sha when SRC is a merge of it (upstream-sync.yml); else SRC's HEAD.
COMMIT="${SYNC_COMMIT:-$(git -C "$SRC" rev-parse HEAD)}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'commit: %s\ndate: %s\n' "$COMMIT" "$NOW" > "$DEST/VERSION"
cat > "$(dirname "$DEST")/../src/platform/vendorVersion.ts" <<TS
// Written by scripts/sync-nanobot.sh from vendor/nanobot/VERSION (checked by test/vendorVersion.test.ts).
export const VENDOR_COMMIT = "$COMMIT";
export const VENDOR_DATE = "${NOW%%T*}";
TS
echo "synced ${#FILES[@]} files -> $DEST"
