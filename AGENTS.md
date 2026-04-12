# Agent Instructions

## Build & Install the Extension

### Build
From the workspace root:
```bash
npm run build
```
This compiles both the `packageManager` and `editor` workspaces.

### Package
```bash
cd editor && npm run pack
```
Produces `dist/4d-analyzer.vsix` at the workspace root.

### Install into VS Code
```bash
code --install-extension dist/4d-analyzer.vsix --force
```

### All-in-one¨
```bash
mkdir -p dist && npm run build && (cd editor && npm run pack) && code --install-extension dist/4d-analyzer.vsix --force
```
