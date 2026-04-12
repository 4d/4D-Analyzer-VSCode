# @4dsas/package-manager

A package manager for 4D projects that fetches dependencies from GitHub or Gitlab repositories.

## Features

- Fetch dependencies defined in `dependencies.json`
- Support for version ranges (semver) and 4D R-Release formats
- Recursive sub-dependency resolution
- Lock file support for reproducible builds


## Usage

```typescript
import { PackageManager } from '@4dsas/package-manager';

// Create a new instance with project path
const pm = new PackageManager(
  '/path/to/your/4d/project',  // Project path (absolute)
  '/path/to/cache',            // Optional: custom cache folder
  'github-token',              // Optional: GitHub token for private repos
  '20.0'                       // Optional: IDE version for "4d" version keyword
);

// Initialize (reads configuration files)
await pm.initialize();

// Fetch all dependencies
const result = await pm.fetch();

console.log(`Fetched: ${result.fetchedCount}`);
console.log(`Skipped (cached): ${result.skippedCount}`);

// Fetch with options
const result2 = await pm.fetch({
  update: true,                // Force re-fetch even if cached
  filter: ['ComponentName']    // Only fetch specific dependencies
});
```

## Configuration Files

### dependencies.json

Located at `Project/Sources/dependencies.json`:

```json
{
  "version": 2100,
  "dependencies": {
    "MyComponent": {
      "github": "owner/MyComponent",
      "version": "^1.0.0"
    },
    "AnotherLib": {
      "github": "owner/AnotherLib",
      "tag": "v2.0.0-beta"
    }
  }
}
```

## Version Resolution

### Common rules

| Field | Behaviour |
|-------|-----------|
| `"tag": "<value>"` | Use that **exact** tag — no resolution is performed. |
| `"version": "<range>"` | Treated as a **semver range** (e.g. `^1.0.0`, `>=2.0.0 <3.0.0`). The highest release whose tag satisfies the range is selected. |
| `"version": "4d"` | Match the current IDE version. |

### GitHub

| Spec | Behaviour |
|------|-----------|
| `"version": "latest"` | Uses the release **pinned as "Latest"** on the GitHub repository (GitHub API `getLatestRelease`). |
| *(nothing specified)* | Same as `"latest"` — the release pinned as Latest on GitHub. |

### GitLab

| Spec | Behaviour |
|------|-----------|
| `"version": "highest"` | Collects **all** release tags, keeps only those that are a valid semantic version (or `v` + semantic version, the `v` prefix is stripped), then picks the **maximum** version. |
| `"version": "latest"` | Uses the **most recent** release returned by the GitLab API (sorted by creation date). |
| *(nothing specified)* | Same as `"highest"`. |


