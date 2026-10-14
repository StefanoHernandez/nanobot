#!/usr/bin/env bash
# Local release APK (signed with the Expo-default debug keystore). Output: mobile/dist/nanobot-mobile-<version>.apk
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=/dev/null
source ./env.sh
VERSION=$(node -p "require('./app.json').expo.version")
npx expo prebuild -p android --clean
# arm64 only (~1/3 size); ARCHS=arm64-v8a,x86_64 scripts/build-apk.sh for an emulator
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures="${ARCHS:-arm64-v8a}")
mkdir -p dist
OUT="dist/nanobot-mobile-$VERSION.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
ls -l "$OUT"; echo "$(pwd)/$OUT"
