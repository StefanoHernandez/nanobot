#!/usr/bin/env bash
# Start the local Android emulator (Pixel 7, Android 15, x86_64) and install the latest APK.
# One-time setup: sdkmanager "emulator" "system-images;android-35;google_apis;x86_64"
#   && avdmanager create avd -n nanobot-pixel -k "system-images;android-35;google_apis;x86_64" -d pixel_7
# The APK must include x86_64: ARCHS=arm64-v8a,x86_64 scripts/build-apk.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=/dev/null
source ./env.sh
# software GPU: the host GPU backend crashed shortly after boot on this Linux PC
"$ANDROID_HOME/emulator/emulator" -avd nanobot-pixel -gpu swiftshader_indirect -no-snapshot-save -no-boot-anim &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
APK=$(ls -t dist/*.apk | head -1)
adb install -r "$APK" && adb shell monkey -p dev.nanobot.mobile -c android.intent.category.LAUNCHER 1 >/dev/null
wait
