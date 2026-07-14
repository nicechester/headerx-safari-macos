#!/bin/bash
# Build HeaderX (macOS) in Release and wrap the built app in a DMG.
# The app is not notarized — recipients need right-click > Open on first
# launch, and Safari's "Allow Unsigned Extensions" if signing is ad-hoc.
# Usage: ./make-dmg.sh [output.dmg]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$SCRIPT_DIR/HeaderX/HeaderX.xcodeproj"
SCHEME="HeaderX (macOS)"
OUT="${1:-HeaderX.dmg}"
BUILD_DIR="$SCRIPT_DIR/build"

echo "==> Building $SCHEME (Release)..."
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -derivedDataPath "$BUILD_DIR" build

APP="$BUILD_DIR/Build/Products/Release/HeaderX.app"
if [ ! -d "$APP" ]; then
  echo "Error: built app not found at $APP" >&2
  exit 1
fi
echo "Built app: $APP"

echo "==> Creating $OUT..."
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
hdiutil create -volname "HeaderX" -srcfolder "$STAGING" -ov -format UDZO "$OUT"

echo "Done: $OUT"
echo "Note: not notarized — first launch on another Mac needs right-click > Open."
