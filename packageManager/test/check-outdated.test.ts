import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubDependency } from '../src/dependency/GithubDependency';
import type { DependencySpec, LockEntry, Environment } from '../src/types';
import type { Fetcher } from '../src/dependency/Fetcher';
import type { CacheManager } from '../src/cache/CacheManager';
import { Version } from '../src/version/Version';

describe('GitHubDependency.checkOutdated', () => {
    let mockFetcher: Fetcher;
    let mockCacheManager: CacheManager;

    beforeEach(() => {
        vi.clearAllMocks();

        mockFetcher = {
            rateLimit: vi.fn().mockResolvedValue(5000),
            getLatestRelease: vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' }),
            getReleases: vi.fn().mockResolvedValue([
                { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
                { id: 2, tag_name: 'v1.1.0', name: 'v1.1.0', draft: false, prerelease: false },
                { id: 3, tag_name: 'v1.2.0', name: 'v1.2.0', draft: false, prerelease: false },
                { id: 4, tag_name: 'v2.0.0', name: 'v2.0.0', draft: false, prerelease: false },
            ]),
            downloadReleaseAsset: vi.fn(),
        };

        mockCacheManager = {
            getCacheRoot: vi.fn().mockReturnValue('/cache'),
            getDependencyFolder: vi.fn().mockReturnValue('/cache/.github/owner/repo/v1.2.0'),
        } as unknown as CacheManager;
    });

    it('should mark dependency as outdated when newer version exists in range', async () => {
        const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
        const dep = new GitHubDependency(spec, true);
        const lock: LockEntry = { tag: 'v1.0.0' };

        // Mock getPackage to check cache existence
        vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

        await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

        expect(lock.outdated).toBe(true);
        expect(lock.wanted).toBe('v1.2.0');
        expect(lock.current).toBe('v1.0.0');
    });

    it('should not mark as outdated when already at latest in range', async () => {
        const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
        const dep = new GitHubDependency(spec, true);
        const lock: LockEntry = { tag: 'v1.2.0' };

        await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

        expect(lock.outdated).toBeUndefined();
        expect(lock.wanted).toBeUndefined();
    });

    it('should set wantedInCache when wanted version is cached', async () => {
        const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
        const dep = new GitHubDependency(spec, true);
        const lock: LockEntry = { tag: 'v1.0.0' };

        // Mock getPackage to return a "cached" package
        vi.spyOn(dep, 'getPackage' as any).mockResolvedValue({
            getListDependencies: vi.fn().mockResolvedValue(null),
        });

        await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

        expect(lock.outdated).toBe(true);
        expect(lock.wantedInCache).toBe(true);
    });

    it('should set wantedInCache=false when wanted version is not cached', async () => {
        const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
        const dep = new GitHubDependency(spec, true);
        const lock: LockEntry = { tag: 'v1.0.0' };

        vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

        await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

        expect(lock.wantedInCache).toBe(false);
    });

    it('should skip when lock has no tag', async () => {
        const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
        const dep = new GitHubDependency(spec, true);
        const lock: LockEntry = {};

        await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

        expect(mockFetcher.getReleases).not.toHaveBeenCalled();
        expect(lock.outdated).toBeUndefined();
    });

    it('should filter out drafts and prereleases', async () => {
        mockFetcher.getReleases = vi.fn().mockResolvedValue([
            { id: 1, tag_name: 'v1.0.0', draft: false, prerelease: false },
            { id: 2, tag_name: 'v1.1.0', draft: true, prerelease: false },
            { id: 3, tag_name: 'v1.2.0-beta', draft: false, prerelease: true },
            { id: 4, tag_name: 'v1.3.0', draft: false, prerelease: false },
        ]);

        const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
        const dep = new GitHubDependency(spec, true);
        const lock: LockEntry = { tag: 'v1.0.0' };

        vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

        await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

        // Should skip v1.1.0 (draft) and v1.2.0-beta (prerelease), pick v1.3.0
        expect(lock.wanted).toBe('v1.3.0');
    });

    it('should handle fetch errors gracefully', async () => {
        mockFetcher.getReleases = vi.fn().mockRejectedValue(new Error('API rate limit'));

        const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
        const dep = new GitHubDependency(spec, true);
        const lock: LockEntry = { tag: 'v1.0.0' };

        await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

        expect(lock.update?.errors).toBeDefined();
        expect(lock.update?.errors?.[0].message).toBe('API rate limit');
    });
});
