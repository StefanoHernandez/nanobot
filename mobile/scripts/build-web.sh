#!/usr/bin/env bash
# Export the app as a static web build for the gateway (opt-in, see roadmap "app web build").
# Output: mobile/dist-web/. Serve it with NANOBOT_APP_DIST=/path/to/mobile/dist-web on the gateway.
# Not part of the Python wheel or the `arduino` branch: copy it to the server yourself.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
rm -rf dist-web
npx expo export -p web --output-dir dist-web
test -f dist-web/index.html
du -sh dist-web
