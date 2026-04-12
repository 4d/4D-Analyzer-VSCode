import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubDependency } from '../src/dependency/GithubDependency';
import type { DependencySpec, LockEntry, Environment } from '../src/types';
import type { Fetcher } from '../src/dependency/Fetcher';
import type { CacheManager } from '../src/cache/CacheManager';
import * as fs from 'fs/promises';
import { Version } from '../src/version/Version';

describe('GitHubDependency', () => {


  describe('reconcileWithEnv', () => {
    it('should reconcile with environment spec', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const envSpec: DependencySpec = {
        github: 'owner/repo',
        version: '1.5.0',
      };

      dep.reconcileWithEnv(envSpec);
      
      // Verify the dependency has been updated
      expect(dep.version).toBe('1.5.0');
    });
  });

  describe('reconcileWithLock', () => {
    it('should restore tag from lock entry when update is false', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, false);
      
      // Tag should be restored from lock
      expect(dep.tag).toBe('v1.2.3');
    });

    it('should not override existing tag from spec when reconciling with lock', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
        tag: 'v2.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, false);
      
      // Tag from spec should take precedence (restoreFromLock only sets if !this._tag)
      expect(dep.tag).toBe('v2.0.0');
    });

    it('should ignore lock when update is true', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, true);
      
      // Should not restore tag when updating
      expect(dep.tag).toBe('');
    });

    it('should handle undefined lock entry', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      dep.reconcileWithLock(undefined, false);
      
      // Should not crash
      expect(dep.tag).toBe('');
    });
  });

  describe('fetch', () => {
    let mockFetcher: Fetcher;
    let mockCacheManager: CacheManager;
    let mockEnv: Environment;
    let lock: LockEntry;

    beforeEach(() => {
      vi.clearAllMocks();

      // Reset fs mock
      vi.mock('fs/promises', async (importOriginal) => {
        const actual = await importOriginal() as typeof fs;
        return {
          ...actual,
          mkdtemp: vi.fn().mockResolvedValue('/tmp/dep-123'),
          writeFile: vi.fn().mockResolvedValue(undefined),
        };
      });

      mockFetcher = {
        rateLimit: vi.fn().mockResolvedValue(5000),
        getLatestRelease: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0', draft: false, prerelease: false }),
        getReleases: vi.fn().mockResolvedValue([
          { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
          { id: 2, tag_name: 'v1.1.0', name: 'v1.1.0', draft: false, prerelease: false },
          { id: 3, tag_name: 'v2.0.0', name: 'v2.0.0', draft: false, prerelease: false },
        ]),
        downloadReleaseAsset: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      };

      mockCacheManager = {
        getCacheRoot: vi.fn().mockReturnValue('/cache'),
        getDependencyFolder: vi.fn().mockReturnValue('/cache/.github/owner/repo/v1.0.0'),
        getMetadataPath: vi.fn().mockReturnValue('/cache/.github/owner/repo/v1.0.0.json'),
        extractArchive: vi.fn().mockResolvedValue('/cache/.github/owner/repo/v1.0.0'),
        saveMetadata: vi.fn().mockResolvedValue(undefined),
      } as unknown as CacheManager;

      mockEnv = {
        cacheFolder: '/cache',
        github: { htmlURL: 'https://github.com' },
        gitlab: { host: 'https://gitlab.com' },
        fetch: { maxRecursivePass: 5 },
        update: {},
        trace: false,
        debug: false,
        dependencies: {},
        devDependencies: {},
      };

      lock = {};
    });

    it('should return false when owner or repo is missing', async () => {
      const spec: DependencySpec = { github: 'invalid', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      const result = await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(result).toBe(false);
      expect(mockFetcher.downloadReleaseAsset).not.toHaveBeenCalled();
    });

    it('should return false and add error when no matching version found', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^99.0.0' };
      const dep = new GitHubDependency(spec, true);

      // Mock getReleases to return versions that don't match
      mockFetcher.getReleases = vi.fn().mockResolvedValue([
        { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
      ]);

      const result = await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(result).toBe(false);
      expect(lock.errors).toBeDefined();
      expect(lock.errors?.[0].message).toBe('Unable to find a release for owner/repo on GitHub satisfying version ^99.0.0');
    });

    it('should return false (skip) when dependency is already cached and update is false', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      // Mock getPackage to return a cached package
      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue({
        getListDependencies: vi.fn().mockResolvedValue({ dependencies: {} }),
      });

      const result = await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager, false);

      expect(result).toBe(false); // Skipped, already cached
      expect(lock.found).toBe(true);
      expect(lock.path).toBeDefined();
      expect(mockFetcher.downloadReleaseAsset).not.toHaveBeenCalled();
    });

    it('should download and extract when dependency is not cached', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      // Mock getPackage to return null (not cached)
      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      const result = await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(result).toBe(true);
      expect(mockFetcher.downloadReleaseAsset).toHaveBeenCalledWith('owner', 'repo', 'v1.1.0');
      expect(mockCacheManager.extractArchive).toHaveBeenCalled();
      expect(mockCacheManager.saveMetadata).toHaveBeenCalled();
      expect(lock.found).toBe(true);
      expect(lock.tag).toBe('v1.1.0');
      expect(lock.archiveSize).toBe(1024);
    });

    it('should force download when update is true even if cached', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      // Mock getPackage to return a cached package
      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue({
        getListDependencies: vi.fn().mockResolvedValue({ dependencies: {} }),
      });

      const result = await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager, true);

      expect(result).toBe(true);
      expect(mockFetcher.downloadReleaseAsset).toHaveBeenCalled();
      expect(mockCacheManager.extractArchive).toHaveBeenCalled();
    });

    it('should set lock URLs correctly', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.htmlURL).toBe('https://github.com/owner/repo/releases/tag/v1.1.0');
      expect(lock.archiveURL).toBe('https://github.com/owner/repo/releases/download/v1.1.0/repo.zip');
    });

    it('should use custom github htmlURL from environment', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      mockEnv.github.htmlURL = 'https://github.mycompany.com';

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.htmlURL).toBe('https://github.mycompany.com/owner/repo/releases/tag/v1.1.0');
    });

    it('should handle download errors gracefully', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);
      mockFetcher.downloadReleaseAsset = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(result).toBe(false);
      expect(lock.found).toBe(false);
      expect(lock.errors?.[0].message).toBe('Unable to download release asset for owner/repo tag v1.1.0 on GitHub');
    });

    it('should handle extractArchive errors gracefully', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);
      mockCacheManager.extractArchive = vi.fn().mockRejectedValue(new Error('Extraction failed'));

      const result = await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(result).toBe(false);
      expect(lock.found).toBe(false);
      expect(lock.errors?.[0].message).toBe('Cannot unzip downloaded file for owner/repo tag v1.1.0');
    });

    it('should read sub-dependencies from cached package', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
      const dep = new GitHubDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue({
        getListDependencies: vi.fn().mockResolvedValue({
          dependencies: {
            'subDep': { github: 'other/subdep', version: '^1.0.0' }
          }
        }),
      });

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager, false);

      expect(lock.dependencies).toEqual({
        'subDep': { github: 'other/subdep', version: '^1.0.0' }
      });
    });

    it('should use specific tag when provided instead of resolving version', async () => {
      const spec: DependencySpec = { github: 'owner/repo', tag: 'v2.0.0-beta' };
      const dep = new GitHubDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.tag).toBe('v2.0.0-beta');
      expect(mockFetcher.getReleases).not.toHaveBeenCalled();
      expect(mockFetcher.downloadReleaseAsset).toHaveBeenCalledWith('owner', 'repo', 'v2.0.0-beta');
    });

    it('should use latest release when version is "latest"', async () => {
      const spec: DependencySpec = { github: 'owner/repo', version: 'latest' };
      const dep = new GitHubDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);
      mockFetcher.getLatestRelease = vi.fn().mockResolvedValue({ tag_name: 'v3.0.0' });

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.tag).toBe('v3.0.0');
      expect(mockFetcher.getLatestRelease).toHaveBeenCalledWith('owner', 'repo');
    });
  });
});
