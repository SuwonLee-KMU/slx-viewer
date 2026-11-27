#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cd macos
xcodegen generate
identity="${SLX_SIGN_IDENTITY:-}"
if [[ -z "$identity" ]]; then
  identity="$(security find-identity -v -p codesigning | awk '/"Apple Development:/{print $2; exit}')"
fi
xcodebuild -quiet CODE_SIGN_IDENTITY="${identity:--}" -project SLXPreview.xcodeproj -scheme 'SLX Preview' -configuration Release -derivedDataPath build build
app="build/Build/Products/Release/SLX Preview.app"
codesign --verify --strict --deep "$app"
if [[ "${1:-build}" == install ]]; then
  dest="$HOME/Applications/SLX Preview.app"
  if [[ -e "$dest" && "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$dest/Contents/Info.plist")" != kr.ac.kookmin.fmcl.SLXPreview ]]; then
    echo "An unrelated app already occupies $dest" >&2
    exit 1
  fi
  mkdir -p "$HOME/Applications"
  ditto "$app" "$dest"
  lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
  "$lsregister" -u "$PWD/$app" >/dev/null || true
  pluginkit -r "$PWD/$app/Contents/PlugIns/DiagramPreview.appex" || true
  "$lsregister" -f "$dest"
  pluginkit -a "$dest/Contents/PlugIns/DiagramPreview.appex"
  pluginkit -e use -i kr.ac.kookmin.fmcl.SLXPreview.Diagram
fi
