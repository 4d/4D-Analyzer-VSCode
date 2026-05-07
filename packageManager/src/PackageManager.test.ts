import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { PackageManager } from './PackageManager';
import { ConfigReader } from './config/ConfigReader';
import { CacheManager } from './cache/CacheManager';
import { GithubFetcher } from './dependency/GithubFetcher';
import { GitlabFetcher } from './dependency/GitlabFetcher';
import { GitHubDependency } from './dependency/GithubDependency';
import { GitLabDependency } from './dependency/GitlabDependency';

// Cross-platform test paths
const TEST_PROJECT_PATH = path.resolve('/tmp/test-project');
const TEST_CACHE_PATH = path.resolve('/tmp/test-cache');
const TEST_IDE_VERSION = "21.2.0";
// Mock dependencies
vi.mock('./config/ConfigReader');
vi.mock('./cache/CacheManager');
vi.mock('./dependency/GithubFetcher');
vi.mock('./dependency/GitlabFetcher');
vi.mock('./dependency/GithubDependency');
vi.mock('./dependency/GitlabDependency');

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

        // Setup GitlabFetcher mock
        vi.mocked(GitlabFetcher).mockImplementation((token?: string, host?: string) => ({
            getHost: vi.fn().mockReturnValue((host || 'https://gitlab.com').replace(/\/+$/, '')),
            token,
            host
        }) as unknown as GitlabFetcher);

        // Setup GitHubDependency mock
        vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => ({
            ID: spec.github,
            name: spec.github?.split('/')[1] || 'unknown',
            version: spec.version,
            isPrimary,
            reconcileWithEnv: vi.fn(),
            reconcileWithLock: vi.fn(),
            getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
            fetch: vi.fn().mockResolvedValue(true),
            compare: vi.fn(),
            checkOutdated: vi.fn()
        }) as unknown as GitHubDependency);

        packageManager = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
    });

    describe('constructor validation', () => {
        it('should throw when project path is empty', () => {
            expect(() => new PackageManager('', TEST_IDE_VERSION)).toThrow('Project path is required');
        });

        it('should throw when project path is not a string', () => {
            expect(() => new PackageManager(123 as any, TEST_IDE_VERSION)).toThrow('Project path is required');
        });

        it('should throw when project path is relative', () => {
            expect(() => new PackageManager('relative/path', TEST_IDE_VERSION)).toThrow('absolute path');
        });

        it('should accept options object', () => {
            const pm = new PackageManager(TEST_PROJECT_PATH, { ideVersion: TEST_IDE_VERSION });
            expect(pm).toBeDefined();
        });

        it('should accept deprecated positional arguments', () => {
            const pm = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION, 'token', '/tmp/cache');
            expect(pm).toBeDefined();
        });
    });

    describe('static create()', () => {
        it('should create and initialize in one step', async () => {
            const pm = await PackageManager.create(TEST_PROJECT_PATH, { ideVersion: TEST_IDE_VERSION });
            expect(pm).toBeInstanceOf(PackageManager);
            // Should be initialized — fetch should not throw "Not initialized"
            const result = await pm.fetch();
            expect(result.success).toBe(true);
        });
    });

    describe('lock restoration', () => {
        it('should call reconcileWithLock when fetch() uses default options (update=false)', async () => {
            // Provide a lock file with an existing tag for dep1
            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue(mockDependenciesFile),
                buildEnvironment: vi.fn().mockResolvedValue(mockEnvironment),
                readLock: vi.fn().mockResolvedValue({
                    version: 2120,
                    dependencies: {
                        'dep1': { tag: 'v1.5.0', github: 'owner/dep1', found: true },
                        'dep2': { tag: 'v2.3.0', github: 'owner/dep2', found: true }
                    }
                }),
                writeLock: vi.fn().mockResolvedValue(undefined)
            }) as unknown as ConfigReader);

            const reconcileWithLockCalls: Array<{ update: boolean }> = [];
            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => ({
                ID: spec.github,
                name: spec.github?.split('/')[1] || 'unknown',
                version: spec.version,
                isPrimary,
                reconcileWithEnv: vi.fn(),
                reconcileWithLock: vi.fn().mockImplementation((_lockEntry, update) => {
                    reconcileWithLockCalls.push({ update });
                }),
                getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
                fetch: vi.fn().mockResolvedValue(true),
                compare: vi.fn(),
                checkOutdated: vi.fn()
            }) as unknown as GitHubDependency);

            const pm = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
            await pm.initialize();

            // fetch() with default options → update=false → reconcile(false) should call reconcileWithLock
            await pm.fetch();

            // reconcileWithLock should have been called with update=false
            const lockCalls = reconcileWithLockCalls.filter(c => c.update === false);
            expect(lockCalls.length).toBeGreaterThan(0);
        });

        it('should NOT call reconcileWithLock when fetch({update: true})', async () => {
            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue(mockDependenciesFile),
                buildEnvironment: vi.fn().mockResolvedValue(mockEnvironment),
                readLock: vi.fn().mockResolvedValue({
                    version: 2120,
                    dependencies: {
                        'dep1': { tag: 'v1.5.0', github: 'owner/dep1', found: true }
                    }
                }),
                writeLock: vi.fn().mockResolvedValue(undefined)
            }) as unknown as ConfigReader);

            const reconcileWithLockCalls: boolean[] = [];
            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => ({
                ID: spec.github,
                name: spec.github?.split('/')[1] || 'unknown',
                version: spec.version,
                isPrimary,
                reconcileWithEnv: vi.fn(),
                reconcileWithLock: vi.fn().mockImplementation(() => {
                    reconcileWithLockCalls.push(true);
                }),
                getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
                fetch: vi.fn().mockResolvedValue(true),
                compare: vi.fn(),
                checkOutdated: vi.fn()
            }) as unknown as GitHubDependency);

            const pm = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
            await pm.initialize();

            // fetch with update=true → reconcile(true) → reconcileWithLock should NOT be called
            await pm.fetch({ update: true });

            expect(reconcileWithLockCalls.length).toBe(0);
        });
    });

    describe('fetchRecursively', () => {
        it('should prune removed primary lock entries but keep recursive ones', async () => {
            const writeLock = vi.fn().mockResolvedValue(undefined);

            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue({
                    dependencies: {
                        'dep2': { github: 'owner/dep2', version: '^2.0.0' }
                    }
                }),
                buildEnvironment: vi.fn().mockResolvedValue(mockEnvironment),
                readLock: vi.fn().mockResolvedValue({
                    version: 2120,
                    dependencies: {
                        'dep1': {
                            github: 'owner/dep1',
                            version: '^1.0.0',
                            isPrimary: true,
                            errors: [{ message: 'stale primary error' }]
                        },
                        'dep2': {
                            github: 'owner/dep2',
                            version: '^2.0.0',
                            isPrimary: true
                        },
                        'subDep1': {
                            github: 'owner/subDep1',
                            version: '^1.0.0',
                            isPrimary: false,
                            errors: [{ message: 'recursive error' }]
                        }
                    }
                }),
                writeLock
            }) as unknown as ConfigReader);

            packageManager = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
            await packageManager.initialize();
            const result = await packageManager.fetch();

            expect(result.lock.dependencies['dep1']).toBeUndefined();
            expect(result.lock.dependencies['dep2']).toBeDefined();
            expect(result.lock.dependencies['subDep1']).toBeDefined();
            expect(result.errors.map(e => e.dependency)).not.toContain('dep1');
            expect(writeLock).toHaveBeenCalledWith(expect.objectContaining({
                dependencies: expect.not.objectContaining({
                    dep1: expect.anything()
                })
            }));
        });

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
                getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
                fetch: vi.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.resolve(callCount !== 1); // First one skipped
                }),
                compare: vi.fn()
            }) as unknown as GitHubDependency);

            packageManager = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
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
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
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

            packageManager = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
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
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
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

            packageManager = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
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
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
                    fetch: vi.fn().mockImplementation(async () => {
                        fetchedDeps.push(name);
                        return true;
                    }),
                    compare: vi.fn()
                } as unknown as GitHubDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
            await packageManager.initialize();
            const result = await packageManager.fetch({ filter: ['dep1'] });

            expect(result.success).toBe(true);
            expect(result.fetchedCount).toBe(1);
            expect(fetchedDeps).toContain('dep1');
            expect(fetchedDeps).not.toContain('dep2');
        });

        it('should invoke the callback with the GitLab dependency name before fetching', async () => {
            const callback = vi.fn();
            const gitlabFetch = vi.fn().mockResolvedValue(true);

            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue({
                    dependencies: {
                        'GitLab Component': { gitlab: 'group/project', version: 'latest' }
                    }
                }),
                buildEnvironment: vi.fn().mockResolvedValue({
                    ...mockEnvironment,
                    gitlab: {
                        host: 'https://gitlab.com',
                        hosts: {}
                    }
                }),
                readLock: vi.fn().mockResolvedValue({ version: 2120, dependencies: {} }),
                writeLock: vi.fn().mockResolvedValue(undefined)
            }) as unknown as ConfigReader);

            vi.mocked(GitLabDependency).mockImplementation((spec, isPrimary) => {
                const dep = {
                    ID: spec.gitlab,
                    name: 'project',
                    version: spec.version,
                    isPrimary,
                    host: undefined,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
                    fetch: gitlabFetch,
                    compare: vi.fn(),
                    checkOutdated: vi.fn()
                };
                Object.setPrototypeOf(dep, GitLabDependency.prototype);
                return dep as unknown as GitLabDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH, {
                ideVersion: TEST_IDE_VERSION,
                callback
            });

            await packageManager.initialize();
            await packageManager.fetch();

            expect(callback).toHaveBeenCalledWith('GitLab Component');
            expect(gitlabFetch).toHaveBeenCalledOnce();
        });

        it('should write GitLab host information to the lock for primary dependencies', async () => {
            const gitlabFetch = vi.fn().mockResolvedValue(true);

            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue({
                    dependencies: {
                        'Private GitLab Component': {
                            gitlab: 'group/private-component',
                            version: 'highest',
                            host: 'https://private.gitlab.example.com'
                        }
                    }
                }),
                buildEnvironment: vi.fn().mockResolvedValue({
                    ...mockEnvironment,
                    gitlab: {
                        host: 'https://gitlab.com',
                        token: 'default-token',
                        hosts: {
                            'https://private.gitlab.example.com': { token: 'config-private-token' }
                        }
                    }
                }),
                readLock: vi.fn().mockResolvedValue({ version: 2120, dependencies: {} }),
                writeLock: vi.fn().mockResolvedValue(undefined)
            }) as unknown as ConfigReader);

            vi.mocked(GitLabDependency).mockImplementation((spec, isPrimary) => {
                const dep = {
                    ID: spec.gitlab,
                    name: spec.gitlab?.split('/').slice(-1)[0] || 'unknown',
                    version: spec.version,
                    isPrimary,
                    host: spec.host,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'highest'),
                    fetch: gitlabFetch,
                    compare: vi.fn(),
                    checkOutdated: vi.fn()
                };
                Object.setPrototypeOf(dep, GitLabDependency.prototype);
                return dep as unknown as GitLabDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH, {
                ideVersion: TEST_IDE_VERSION,
                gitlabAuthTokens: {
                    'https://private.gitlab.example.com': 'extension-private-token'
                }
            });

            await packageManager.initialize();
            const result = await packageManager.fetch();

            expect(result.lock.dependencies['Private GitLab Component']).toEqual(expect.objectContaining({
                gitlab: 'group/private-component',
                host: 'https://private.gitlab.example.com',
                version: 'highest',
                isPrimary: true
            }));
            expect(GitlabFetcher).toHaveBeenCalledWith('config-private-token', 'https://private.gitlab.example.com');
            expect(gitlabFetch).toHaveBeenCalledOnce();
        });

        it('should preserve GitLab private host information in sub-dependency lock entries', async () => {
            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue({
                    dependencies: {
                        'dep1': { github: 'owner/dep1', version: '^1.0.0' }
                    }
                }),
                buildEnvironment: vi.fn().mockResolvedValue({
                    ...mockEnvironment,
                    gitlab: {
                        host: 'https://gitlab.com',
                        hosts: {}
                    }
                }),
                readLock: vi.fn().mockResolvedValue({ version: 2120, dependencies: {} }),
                writeLock: vi.fn().mockResolvedValue(undefined)
            }) as unknown as ConfigReader);

            vi.mocked(GitHubDependency).mockImplementation((spec, isPrimary) => ({
                ID: spec.github,
                name: spec.github?.split('/')[1] || 'unknown',
                version: spec.version,
                isPrimary,
                reconcileWithEnv: vi.fn(),
                reconcileWithLock: vi.fn(),
                getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
                fetch: vi.fn().mockImplementation(async (_ideVersion, _env, lockEntry) => {
                    lockEntry.dependencies = {
                        'Private GitLab Subdep': {
                            gitlab: 'group/private-subdep',
                            version: 'latest',
                            host: 'https://private.gitlab.example.com'
                        }
                    };
                    return true;
                }),
                compare: vi.fn(),
                checkOutdated: vi.fn()
            }) as unknown as GitHubDependency);

            vi.mocked(GitLabDependency).mockImplementation((spec, isPrimary) => {
                const dep = {
                    ID: spec.gitlab,
                    name: spec.gitlab?.split('/').slice(-1)[0] || 'unknown',
                    version: spec.version,
                    isPrimary,
                    host: spec.host,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'highest'),
                    fetch: vi.fn().mockResolvedValue(true),
                    compare: vi.fn(),
                    checkOutdated: vi.fn()
                };
                Object.setPrototypeOf(dep, GitLabDependency.prototype);
                return dep as unknown as GitLabDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH, {
                ideVersion: TEST_IDE_VERSION,
                gitlabAuthTokens: {
                    'https://private.gitlab.example.com': 'extension-private-token'
                }
            });

            await packageManager.initialize();
            const result = await packageManager.fetch();

            expect(result.lock.dependencies['Private GitLab Subdep']).toEqual(expect.objectContaining({
                gitlab: 'group/private-subdep',
                host: 'https://private.gitlab.example.com',
                version: 'latest',
                isPrimary: false
            }));
            expect(GitlabFetcher).toHaveBeenCalledWith('extension-private-token', 'https://private.gitlab.example.com');
        });

        it('should create separate GitLab fetchers when dependencies use different hosts', async () => {
            vi.mocked(ConfigReader).mockImplementation(() => ({
                readDependencies: vi.fn().mockResolvedValue({
                    dependencies: {
                        'Public GitLab Component': {
                            gitlab: 'group/public-component',
                            version: 'latest'
                        },
                        'Private GitLab Component': {
                            gitlab: 'group/private-component',
                            version: 'latest',
                            host: 'https://private.gitlab.example.com'
                        }
                    }
                }),
                buildEnvironment: vi.fn().mockResolvedValue({
                    ...mockEnvironment,
                    gitlab: {
                        host: 'https://gitlab.com',
                        token: 'default-token'
                    }
                }),
                readLock: vi.fn().mockResolvedValue({ version: 2120, dependencies: {} }),
                writeLock: vi.fn().mockResolvedValue(undefined)
            }) as unknown as ConfigReader);

            vi.mocked(GitLabDependency).mockImplementation((spec, isPrimary) => {
                const dep = {
                    ID: spec.gitlab,
                    name: spec.gitlab?.split('/').slice(-1)[0] || 'unknown',
                    version: spec.version,
                    isPrimary,
                    host: spec.host,
                    reconcileWithEnv: vi.fn(),
                    reconcileWithLock: vi.fn(),
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'highest'),
                    fetch: vi.fn().mockResolvedValue(true),
                    compare: vi.fn(),
                    checkOutdated: vi.fn()
                };
                Object.setPrototypeOf(dep, GitLabDependency.prototype);
                return dep as unknown as GitLabDependency;
            });

            packageManager = new PackageManager(TEST_PROJECT_PATH, {
                ideVersion: TEST_IDE_VERSION,
                gitlabAuthTokens: {
                    'https://private.gitlab.example.com': 'extension-private-token'
                }
            });

            await packageManager.initialize();
            await packageManager.fetch();

            expect(GitlabFetcher).toHaveBeenNthCalledWith(1, 'default-token', 'https://gitlab.com');
            expect(GitlabFetcher).toHaveBeenNthCalledWith(2, 'extension-private-token', 'https://private.gitlab.example.com');
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
                    getEffectiveLockVersion: vi.fn().mockReturnValue(spec.version || 'latest'),
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

            packageManager = new PackageManager(TEST_PROJECT_PATH, TEST_IDE_VERSION);
            await packageManager.initialize();
            await packageManager.fetch();

            // dep2 should only be fetched once even though it's referenced as sub-dep
            expect(fetchCounts['dep2']).toBe(1);
        });
    });
});
