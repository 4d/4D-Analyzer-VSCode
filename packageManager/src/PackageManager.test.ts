import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { PackageManager } from './PackageManager';
import { ConfigReader } from './config/ConfigReader';
import { CacheManager } from './cache/CacheManager';
import { GithubFetcher } from './dependency/GithubFetcher';
import { GitHubDependency } from './dependency/GithubDependency';

// Cross-platform test paths
const TEST_PROJECT_PATH = path.resolve('/tmp/test-project');
const TEST_CACHE_PATH = path.resolve('/tmp/test-cache');

// Mock dependencies
vi.mock('./config/ConfigReader');
vi.mock('./cache/CacheManager');
vi.mock('./dependency/GithubFetcher');
vi.mock('./dependency/GithubDependency');

describe('PackageManager', () => {
    let packageManager: PackageManager;

    const mockDependenciesFile = {
        dependencies: {
            'dep1': { github: 'owner/dep1', version: '^1.0.0' },
            'dep2': { github: 'owner/dep2', version: '^2.0.0' }
        }
    };

    const mockEnvironment = {
        dependencies: {},
        fetch: {
            maxRecursivePass: 5
        }
    };

    const mockLockFile = {
        version: 2120,
        dependencies: {}
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup ConfigReader mock
        vi.mocked(ConfigReader).mockImplementation(() => ({
            readDependencies: vi.fn().mockResolvedValue(mockDependenciesFile),
            buildEnvironment: vi.fn().mockResolvedValue(mockEnvironment),
            readLock: vi.fn().mockResolvedValue({ ...mockLockFile, dependencies: {} }),
            writeLock: vi.fn().mockResolvedValue(undefined)
        }) as unknown as ConfigReader);

        // Setup CacheManager mock
        vi.mocked(CacheManager).mockImplementation(() => ({
            getCacheRoot: vi.fn().mockReturnValue(TEST_CACHE_PATH)
        }) as unknown as CacheManager);

        // Setup GithubFetcher mock
        vi.mocked(GithubFetcher).mockImplementation(() => ({}) as unknown as GithubFetcher);

        // Setup GitHubDependency mock
        vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => ({
            ID: spec.github,
            name: spec.github?.split('/')[1] || 'unknown',
            version: spec.version,
            isPrimary,
            reconcileWithEnv: vi.fn(),
            reconcileWithLock: vi.fn(),
            fetch: vi.fn().mockResolvedValue(true),
            compare: vi.fn(),
            checkOutdated: vi.fn()
        }) as unknown as GitHubDependency);

        packageManager = new PackageManager(TEST_PROJECT_PATH);
    });

    describe('fetchRecursively', () => {
        it('should fetch all primary dependencies concurrently', async () => {
            await packageManager.initialize();
            const result = await packageManager.fetch();

            expect(result.success).toBe(true);
            expect(result.fetchedCount).toBe(2);
            expect(result.skippedCount).toBe(0);
        });

        it('should handle skipped dependencies', async () => {
            // Mock one dependency to return false (skipped)
            let callCount = 0;
            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => ({
                ID: spec.github,
                name: spec.github?.split('/')[1] || 'unknown',
                version: spec.version,
                isPrimary,
                reconcileWithEnv: vi.fn(),
                reconcileWithLock: vi.fn(),
                fetch: vi.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.resolve(callCount !== 1); // First one skipped
                }),
                compare: vi.fn()
            }) as unknown as GitHubDependency);

            packageManager = new PackageManager(TEST_PROJECT_PATH);
            await packageManager.initialize();
            const result = await packageManager.fetch();

            expect(result.success).toBe(true);
            expect(result.fetchedCount).toBe(1);
            expect(result.skippedCount).toBe(1);
        });

        it('should fetch sub-dependencies in subsequent passes', async () => {
            const fetchCalls: string[] = [];

            // Mock with sub-dependencies
            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => {
                const name = spec.github?.split('/')[1] || 'unknown';
                return {
                    ID: spec.github,
                    name,
                    version: spec.version,
                    isPrimary,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    fetch: vi.fn().mockImplementation(async (_ideVersion, _env, lockEntry) => {
                        fetchCalls.push(name);
                        // Add sub-dependency on first dependency
                        if (name === 'dep1') {
                            lockEntry.dependencies = {
                                'subDep1': { github: 'owner/subDep1', version: '^1.0.0' }
                            };
                        }
                        return true;
                    }),
                    compare: vi.fn()
                } as unknown as GitHubDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH);
            await packageManager.initialize();
            const result = await packageManager.fetch();

            expect(result.success).toBe(true);
            // dep1, dep2 in first pass, subDep1 in second pass
            expect(result.fetchedCount).toBe(3);
            expect(fetchCalls).toContain('dep1');
            expect(fetchCalls).toContain('dep2');
            expect(fetchCalls).toContain('subDep1');
        });

        it('should respect maxRecursivePass limit', async () => {
            let passCount = 0;

            // Mock environment with low maxRecursivePass
            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue({
                    dependencies: {
                        'dep1': { github: 'owner/dep1', version: '^1.0.0' }
                    }
                }),
                buildEnvironment: vi.fn().mockResolvedValue({
                    dependencies: {},
                    fetch: { maxRecursivePass: 2 }
                }),
                readLock: vi.fn().mockResolvedValue({ version: 2120, dependencies: {} }),
                writeLock: vi.fn().mockResolvedValue(undefined)
            }) as unknown as ConfigReader);

            // Each fetch adds a new sub-dependency (infinite chain)
            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => {
                const name = spec.github?.split('/')[1] || 'unknown';
                return {
                    ID: spec.github,
                    name,
                    version: spec.version,
                    isPrimary,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    fetch: vi.fn().mockImplementation(async (_ideVersion, _env, lockEntry) => {
                        passCount++;
                        // Always add a new sub-dependency
                        lockEntry.dependencies = {
                            [`subDep${passCount}`]: { github: `owner/subDep${passCount}`, version: '^1.0.0' }
                        };
                        return true;
                    }),
                    compare: vi.fn()
                } as unknown as GitHubDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH);
            await packageManager.initialize();
            const result = await packageManager.fetch();

            expect(result.success).toBe(true);
            // Should stop at maxRecursivePass (2 passes)
            expect(result.fetchedCount).toBe(2);
        });

        it('should filter dependencies when filter option is provided', async () => {
            const fetchedDeps: string[] = [];

            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => {
                const name = spec.github?.split('/')[1] || 'unknown';
                return {
                    ID: spec.github,
                    name,
                    version: spec.version,
                    isPrimary,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    fetch: vi.fn().mockImplementation(async () => {
                        fetchedDeps.push(name);
                        return true;
                    }),
                    compare: vi.fn()
                } as unknown as GitHubDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH);
            await packageManager.initialize();
            const result = await packageManager.fetch({ filter: ['dep1'] });

            expect(result.success).toBe(true);
            expect(result.fetchedCount).toBe(1);
            expect(fetchedDeps).toContain('dep1');
            expect(fetchedDeps).not.toContain('dep2');
        });

        it('should not re-process already processed dependencies', async () => {
            const fetchCounts: Record<string, number> = {};

            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => {
                const name = spec.github?.split('/')[1] || 'unknown';
                return {
                    ID: spec.github,
                    name,
                    version: spec.version,
                    isPrimary,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    fetch: vi.fn().mockImplementation(async (_ideVersion, _env, lockEntry) => {
                        fetchCounts[name] = (fetchCounts[name] || 0) + 1;
                        // dep1 references dep2 as sub-dependency (already primary)
                        if (name === 'dep1') {
                            lockEntry.dependencies = {
                                'dep2': { github: 'owner/dep2', version: '^2.0.0' }
                            };
                        }
                        return true;
                    }),
                    compare: vi.fn()
                } as unknown as GitHubDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH);
            await packageManager.initialize();
            await packageManager.fetch();

            // dep2 should only be fetched once even though it's referenced as sub-dep
            expect(fetchCounts['dep2']).toBe(1);
        });
    });
});
