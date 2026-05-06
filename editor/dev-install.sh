#!/usr/bin/env bash
set -euo pipefail

PUBLISH=false
for arg in "$@"; do
  [[ "$arg" == "--publish" ]] && PUBLISH=true
done

VERSION=$(node -p "require('./package.json').version")
VSIX="../dist/4d-analyzer-${VERSION}.vsix"
TAG="v${VERSION}-dev"

npm run pack
mv ../dist/4d-analyzer.vsix "$VSIX"
code --install-extension "$VSIX" --force

if $PUBLISH; then
  if gh release view "$TAG" &>/dev/null; then
    gh release upload "$TAG" "$VSIX" --clobber
    echo "Published $VSIX to release $TAG"
  else
    echo "Release $TAG not found — skipping publish"
  fi
fi
