import { describe, it, expect } from 'vitest';
import { PackageManager } from '../src/index';
import type { FetchOptions, FetchResult, PackageManagerOptions, DependencyMetadata, Fetcher } from '../src/index';

describe('Package Exports', () => {
  it('should export PackageManager class', () => {
    expect(PackageManager).toBeDefined();
    expect(typeof PackageManager).toBe('function');
  });

  it('should export type interfaces without runtime errors', () => {
    // Type-level checks — these just verify the imports resolve at build time.
    // At runtime we verify the shapes are usable by constructing conforming objects.
    const opts: PackageManagerOptions = { ideVersion: '21.0.0' };
    expect(opts.ideVersion).toBe('21.0.0');

    const fetchOpts: FetchOptions = { update: true, filter: ['a'] };
    expect(fetchOpts.update).toBe(true);

    const meta: DependencyMetadata = { name: 'n', github: 'o/r', tag: 'v1', fetchedAt: '', archiveSize: 0 };
    expect(meta.name).toBe('n');

    const result: FetchResult = { success: true, lock: { version: 2120, dependencies: {} }, errors: [], warnings: [], fetchedCount: 0, skippedCount: 0 };
    expect(result.success).toBe(true);

    // Fetcher is a type-only export; verify the symbol is importable (compile-time check)
    const _fetcher: Fetcher | undefined = undefined;
    expect(_fetcher).toBeUndefined();
  });
});
