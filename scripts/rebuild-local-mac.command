#!/bin/zsh
set -euo pipefail

# Resolve the Desktop shortcut back to this repository.
script_path="$0"
while [[ -L "$script_path" ]]; do
  script_dir="$(cd -P "$(dirname "$script_path")" && pwd)"
  target="$(readlink "$script_path")"
  if [[ "$target" = /* ]]; then script_path="$target"; else script_path="$script_dir/$target"; fi
done
project_room_repo="$(cd -P "$(dirname "$script_path")/.." && pwd)"
project_room_desktop="${PROJECT_ROOM_DESKTOP_DIR:-$HOME/Desktop}"
project_room_builds="${PROJECT_ROOM_BUILD_DIR:-$HOME/Documents/Codex/Project Room Local Builds}"
project_room_shortcut="$project_room_desktop/Project Room.app"

if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  print -u2 'This local builder needs an Apple Silicon Mac.'
  exit 1
fi
if [[ -e "$project_room_shortcut" && ! -L "$project_room_shortcut" ]]; then
  print -u2 "The Desktop already contains a real app at $project_room_shortcut. Move it first so the builder cannot replace it."
  exit 1
fi

cd "$project_room_repo"
if [[ ! -x node_modules/.bin/electron-builder ]]; then
  print 'Installing project build dependencies…'
  npm ci
fi
if [[ ! -d node_modules/electron/dist/Electron.app ]]; then
  print 'Preparing Electron from the local cache or official download…'
  node node_modules/electron/install.js
fi

mkdir -p "$project_room_builds"
project_room_revision="$(git rev-parse --short HEAD 2>/dev/null || print local)"
project_room_output="$(mktemp -d "$project_room_builds/Project-Room-$project_room_revision-XXXXXXXX")"
print "Building Project Room from $project_room_repo"
print "Source revision: $project_room_revision"
print "Build folder: $project_room_output"
print ''
npm run package:mac:app -- "--config.directories.output=$project_room_output"

project_room_app="$project_room_output/mac-arm64/Project Room.app"
if [[ ! -x "$project_room_app/Contents/MacOS/Project Room" ]]; then
  print -u2 "Build finished without a launchable app: $project_room_app"
  exit 1
fi

mkdir -p "$project_room_desktop"
project_room_next="$project_room_desktop/.Project Room.app.next-$$"
trap 'rm -f "$project_room_next"' EXIT
ln -s "$project_room_app" "$project_room_next"
if [[ -L "$project_room_shortcut" ]]; then rm "$project_room_shortcut"; fi
mv "$project_room_next" "$project_room_shortcut"

print ''
print "Done. Open Project Room.app on your Desktop for the new local build ($project_room_revision)."
print 'If Project Room is already open, quit it first so macOS does not reuse the old running app.'
print 'This is a local development build; Settings labels it Built locally.'
