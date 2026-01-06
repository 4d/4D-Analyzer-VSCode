# Package Manager

A TypeScript library to fetch package dependencies from GitHub repositories using Octokit.

## Installation

```bash
npm install @guillaume-kotulski/package-manager
```

## Usage

```typescript
import { DependencyFetcher } from '@guillaume-kotulski/package-manager';

// Create a new instance (optionally with GitHub token for higher rate limits)
const fetcher = new DependencyFetcher({
  auth: 'your-github-token', // Optional
});

// Fetch dependencies from a single repository
const deps = await fetcher.fetchDependencies('owner', 'repo');
console.log(deps.dependencies);
console.log(deps.devDependencies);

// Fetch dependencies from multiple repositories
const results = await fetcher.fetchMultipleDependencies([
  { owner: 'facebook', repo: 'react' },
  { owner: 'vuejs', repo: 'core', ref: 'main' },
]);

// Get aggregated dependencies across multiple repositories
const aggregated = await fetcher.getAggregatedDependencies([
  { owner: 'facebook', repo: 'react' },
  { owner: 'vuejs', repo: 'core' },
]);
```

## API

### `DependencyFetcher`

#### Constructor

```typescript
new DependencyFetcher(options?: DependencyFetcherOptions)
```

Options:
- `auth` (optional): GitHub personal access token for authentication
- `octokit` (optional): Custom Octokit instance

#### Methods

##### `fetchDependencies(owner: string, repo: string, ref?: string): Promise<PackageDependencies>`

Fetches dependencies from a single GitHub repository.

##### `fetchMultipleDependencies(repositories: RepositoryInfo[]): Promise<Map<string, PackageDependencies>>`

Fetches dependencies from multiple repositories concurrently.

##### `getAggregatedDependencies(repositories: RepositoryInfo[]): Promise<Record<string, Set<string>>>`

Returns all unique dependencies across multiple repositories with their versions.

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run in watch mode
npm run dev

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Testing

The project uses [Vitest](https://vitest.dev/) for testing. Tests are located in the `test/` directory and cover:

- **Version parsing**: Standard semver and 4D R-Release formats
- **Range matching**: Version range resolution and filtering
- **GitHub dependencies**: Dependency specification and reconciliation
- **Package manager**: Core functionality and error handling

Run the test suite with:

```bash
npm test
```

For development with automatic test re-runs:

```bash
npm run test:watch
```

To generate a coverage report:

```bash
npm run test:coverage
```

## License

MIT