#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

PUBLISH=false
for arg in "$@"; do
  [[ "$arg" == "--publish" ]] && PUBLISH=true
done

mkdir -p "$REPO_ROOT/dist"

pushd "$REPO_ROOT" >/dev/null
npm run build
popd >/dev/null

VERSION=$(node -p "require('$SCRIPT_DIR/package.json').version")
VSIX="$REPO_ROOT/dist/4d-analyzer-${VERSION}.vsix"
TAG="v${VERSION}-dev"

pushd "$SCRIPT_DIR" >/dev/null
npm run pack
popd >/dev/null

mv "$REPO_ROOT/dist/4d-analyzer.vsix" "$VSIX"
code --install-extension "$VSIX" --force

if $PUBLISH; then
  if gh release view "$TAG" &>/dev/null; then
    gh release upload "$TAG" "$VSIX" --clobber
    echo "Published $VSIX to release $TAG"
  else
    echo "Release $TAG not found — skipping publish"
  fi
fi
