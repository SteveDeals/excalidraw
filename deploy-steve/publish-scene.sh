#!/usr/bin/env bash
#
# publish-scene.sh — publish a local .excalidraw file as a shared "scene" on
# the voxen /diagrams deploy.
#
# Scenes live in ~/lab/diagrams/html/scenes/ on `steve`. Once published a scene:
#   - is listed at   https://labs.voxen.dev/diagrams/scenes/
#   - opens editable  https://labs.voxen.dev/diagrams/?scene=<name>
#
# There is no backend: "saving" a scene = putting a .excalidraw file in that
# directory. Editing a scene in the app stays in the visitor's own browser; to
# update the shared copy, export/save the .excalidraw locally and re-run this.
#
# Usage:
#   ./publish-scene.sh path/to/diagram.excalidraw [scene-name]
#
#   scene-name  optional; defaults to the file's basename without .excalidraw.
#               Must match [A-Za-z0-9-] (the app only loads names in that set).
#
# Env overrides:
#   SCENE_HOST  ssh target        (default: steve)
#   SCENE_DIR   remote scenes dir  (default: ~/lab/diagrams/html/scenes)
#
set -euo pipefail

SCENE_HOST="${SCENE_HOST:-steve}"
SCENE_DIR="${SCENE_DIR:-~/lab/diagrams/html/scenes}"

die() {
  echo "error: $*" >&2
  exit 1
}

[ $# -ge 1 ] || die "usage: $0 path/to/diagram.excalidraw [scene-name]"

SRC="$1"
[ -f "$SRC" ] || die "no such file: $SRC"
case "$SRC" in
  *.excalidraw) ;;
  *) die "expected a .excalidraw file, got: $SRC" ;;
esac

# Quick sanity check that the file is a valid excalidraw JSON scene.
if command -v jq >/dev/null 2>&1; then
  jq -e '.type == "excalidraw"' "$SRC" >/dev/null 2>&1 \
    || die "$SRC does not look like an excalidraw scene (\"type\":\"excalidraw\")"
fi

# Derive + sanitize the scene name.
NAME="${2:-$(basename "$SRC" .excalidraw)}"
if ! printf '%s' "$NAME" | grep -Eq '^[A-Za-z0-9-]+$'; then
  die "invalid scene name '$NAME' — only letters, digits and dashes are allowed"
fi

DEST="$SCENE_HOST:$SCENE_DIR/$NAME.excalidraw"

echo "Publishing '$SRC' -> $DEST"
# shellcheck disable=SC2086
ssh "$SCENE_HOST" "mkdir -p $SCENE_DIR"
rsync -av "$SRC" "$DEST"

echo
echo "Published. It should now be:"
echo "  listed at   https://labs.voxen.dev/diagrams/scenes/"
echo "  editable at https://labs.voxen.dev/diagrams/?scene=$NAME"
