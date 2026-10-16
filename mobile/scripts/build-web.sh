#!/usr/bin/env bash
# Export the app as a static web build. Output: mobile/dist-web/.
# build-arduino.yml copies it to nanobot/web/app, which the gateway serves by default (`nanobot ui`).
# Locally: NANOBOT_APP_DIST=/path/to/mobile/dist-web overrides it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
rm -rf dist-web
npx expo export -p web --output-dir dist-web
test -f dist-web/index.html
du -sh dist-web
