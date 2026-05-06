#!/usr/bin/env bash
VERSION=$(node -p "require('./package.json').version")
VSIX="../dist/4d-analyzer-${VERSION}.vsix"
npm run pack
mv ../dist/4d-analyzer.vsix "$VSIX"
code --install-extension "$VSIX" --force
