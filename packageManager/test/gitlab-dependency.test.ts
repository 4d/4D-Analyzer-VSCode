import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitLabDependency } from '../src/dependency/GitlabDependency';
import type { DependencySpec, LockEntry, Environment } from '../src/types';
import type { Fetcher } from '../src/dependency/Fetcher';
import type { CacheManager } from '../src/cache/CacheManager';
import * as fs from 'fs/promises';
import { Version } from '../src/version/Version';

describe('GitLabDependency', () => {

  describe('constructor', () => {
    it('should parse simple group/project path', () => {
      const spec: DependencySpec = { gitlab: 'mygroup/myproject', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      expect(dep.owner).toBe('mygroup');
      expect(dep.repo).toBe('myproject');
      expect(dep.name).toBe('myproject');
      expect(dep.ID).toBe('mygroup/myproject');
    });

    it('should parse multi-level group/subgroup/project path', () => {
      const spec: DependencySpec = { gitlab: 'group/subgroup/project' };
      const dep = new GitLabDependency(spec, true);

      expect(dep.owner).toBe('group/subgroup');
      expect(dep.repo).toBe('project');
      expect(dep.ID).toBe('group/subgroup/project');
    });

    it('should parse deeply nested path', () => {
      const spec: DependencySpec = { gitlab: 'a/b/c/d' };
      const dep = new GitLabDependency(spec, true);

      expect(dep.owner).toBe('a/b/c');
      expect(dep.repo).toBe('d');
      expect(dep.ID).toBe('a/b/c/d');
    });

    it('should store the host from spec', () => {
      const spec: DependencySpec = {
        gitlab: 'group/project',
        host: 'https://private.gitlab.com',
      };
      const dep = new GitLabDependency(spec, true);

      expect(dep.host).toBe('https://private.gitlab.com');
    });

    it('should handle missing gitlab path', () => {
      const spec: DependencySpec = { version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      expect(dep.owner).toBe('');
      expect(dep.repo).toBe('');
    });
  });

  describe('cache paths', () => {
    it('should use .gitlab prefix for cache folder', () => {
      const spec: DependencySpec = { gitlab: 'group/project' };
      const dep = new GitLabDependency(spec, true);

      expect(dep.getCacheFolderPath('v1.0.0')).toBe('.gitlab/group/project/v1.0.0');
    });

    it('should use .gitlab prefix for metadata file', () => {
      const spec: DependencySpec = { gitlab: 'group/project' };
      const dep = new GitLabDependency(spec, true);

      expect(dep.getMetadataFilePath('v1.0.0')).toBe('.gitlab/group/project/v1.0.0.json');
    });

    it('should handle multi-level namespace in cache path', () => {
      const spec: DependencySpec = { gitlab: 'group/sub/project' };
      const dep = new GitLabDependency(spec, true);

      expect(dep.getCacheFolderPath('v2.0.0')).toBe('.gitlab/group/sub/project/v2.0.0');
    });
  });

  describe('reconcileWithEnv', () => {
    it('should reconcile with environment spec', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      const envSpec: DependencySpec = { version: '1.5.0' };
      dep.reconcileWithEnv(envSpec);

      expect(dep.version).toBe('1.5.0');
    });
  });

  describe('reconcileWithLock', () => {
    it('should restore tag from lock entry when update is false', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v1.2.3', version: '^1.0.0', found: true };
      dep.reconcileWithLock(lockEntry, false);

      expect(dep.tag).toBe('v1.2.3');
    });

    it('should not restore lock tag when version and tag are removed from spec (old lock format)', () => {
      const spec: DependencySpec = { gitlab: 'group/project' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v1.2.3', found: true };
      dep.reconcileWithLock(lockEntry, false);

      // Lock version ("") doesn't match effective version ("highest")
      expect(dep.tag).toBe('');
    });

    it('should restore tag when no version spec and lock has "highest"', () => {
      const spec: DependencySpec = { gitlab: 'group/project' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v2.0.0', version: 'highest', found: true };
      dep.reconcileWithLock(lockEntry, false, new Version('21.0.0'));

      // Effective "highest" matches lock "highest"
      expect(dep.tag).toBe('v2.0.0');
    });

    it('should restore tag when version="highest" and lock has "highest"', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: 'highest' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v2.0.0', version: 'highest', found: true };
      dep.reconcileWithLock(lockEntry, false, new Version('21.0.0'));

      expect(dep.tag).toBe('v2.0.0');
    });

    it('should restore tag when version="4d" and lock has matching "4D:<version>"', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '4d' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v20.0.0', version: '4D:20', found: true };
      dep.reconcileWithLock(lockEntry, false, new Version('20.0.0'));

      expect(dep.tag).toBe('v20.0.0');
    });

    it('should NOT restore tag when version="4d" and IDE version changed', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '4d' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v20.0.0', version: '4D:20', found: true };
      dep.reconcileWithLock(lockEntry, false, new Version('21.0.0'));

      expect(dep.tag).toBe('');
    });

    it('should not restore lock tag when version constraint changed', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^2.0.0' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v1.2.3', version: '^1.0.0', found: true };
      dep.reconcileWithLock(lockEntry, false);

      expect(dep.tag).toBe('');
    });

    it('should ignore lock when update is true', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      const lockEntry: LockEntry = { tag: 'v1.2.3', found: true };
      dep.reconcileWithLock(lockEntry, true);

      expect(dep.tag).toBe('');
    });

    it('should handle undefined lock entry', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      dep.reconcileWithLock(undefined, false);
      expect(dep.tag).toBe('');
    });
  });

  describe('getEffectiveLockVersion', () => {
    it('should return "highest" when no version specified', () => {
      const spec: DependencySpec = { gitlab: 'group/project' };
      const dep = new GitLabDependency(spec, true);
      expect(dep.getEffectiveLockVersion(new Version('21.0.0'))).toBe('highest');
    });

    it('should return "highest" when version is "highest"', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: 'highest' };
      const dep = new GitLabDependency(spec, true);
      expect(dep.getEffectiveLockVersion(new Version('21.0.0'))).toBe('highest');
    });

    it('should return "4D:<major>" for LTS version', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '4d' };
      const dep = new GitLabDependency(spec, true);
      expect(dep.getEffectiveLockVersion(new Version('20.0.0'))).toBe('4D:20');
    });

    it('should return "4D:<major>R<minor>" for R-release version', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '4d' };
      const dep = new GitLabDependency(spec, true);
      expect(dep.getEffectiveLockVersion(new Version('20R10'))).toBe('4D:20R10');
    });

    it('should return version as-is for semver ranges', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);
      expect(dep.getEffectiveLockVersion(new Version('21.0.0'))).toBe('^1.0.0');
    });

    it('should return version as-is for "latest"', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: 'latest' };
      const dep = new GitLabDependency(spec, true);
      expect(dep.getEffectiveLockVersion(new Version('21.0.0'))).toBe('latest');
    });

    it('should return version as-is for "newest"', () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: 'newest' };
      const dep = new GitLabDependency(spec, true);
      expect(dep.getEffectiveLockVersion(new Version('21.0.0'))).toBe('newest');
    });
  });

  describe('fetch', () => {
    let mockFetcher: Fetcher;
    let mockCacheManager: CacheManager;
    let mockEnv: Environment;
    let lock: LockEntry;

    beforeEach(() => {
      vi.clearAllMocks();

      vi.mock('fs/promises', async (importOriginal) => {
        const actual = await importOriginal() as typeof fs;
        return {
          ...actual,
          mkdtemp: vi.fn().mockResolvedValue('/tmp/dep-123'),
          writeFile: vi.fn().mockResolvedValue(undefined),
        };
      });

      mockFetcher = {
        rateLimit: vi.fn().mockResolvedValue(Infinity),
        getLatestRelease: vi.fn().mockResolvedValue({
          tag_name: 'v1.0.0', draft: false, prerelease: false,
        }),
        getReleases: vi.fn().mockResolvedValue([
          { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
          { id: 2, tag_name: 'v1.1.0', name: 'v1.1.0', draft: false, prerelease: false },
          { id: 3, tag_name: 'v2.0.0', name: 'v2.0.0', draft: false, prerelease: false },
        ]),
        downloadReleaseAsset: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      };

      mockCacheManager = {
        getCacheRoot: vi.fn().mockReturnValue('/cache'),
        getDependencyFolder: vi.fn().mockReturnValue('/cache/.gitlab/group/project/v1.0.0'),
        extractArchive: vi.fn().mockResolvedValue('/cache/.gitlab/group/project/v1.0.0'),
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
      } as Environment;

      lock = {};
    });

    it('should return false when owner or repo is missing', async () => {
      const spec: DependencySpec = { gitlab: 'invalid' };
      const dep = new GitLabDependency(spec, true);

      const result = await dep.fetch(
        new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager,
      );

      expect(result).toBe(false);
      expect(mockFetcher.downloadReleaseAsset).not.toHaveBeenCalled();
    });

    it('should return false and add error when no matching version found', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^99.0.0' };
      const dep = new GitLabDependency(spec, true);

      mockFetcher.getReleases = vi.fn().mockResolvedValue([
        { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
      ]);

      const result = await dep.fetch(
        new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager,
      );

      expect(result).toBe(false);
      expect(lock.errors).toBeDefined();
      expect(lock.errors?.[0].message).toBe('Unable to find a release for group/project on GitLab satisfying version ^99.0.0');
    });

    it('should skip fetch when dependency is already cached', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue({
        getListDependencies: vi.fn().mockResolvedValue({ dependencies: {} }),
      });

      const result = await dep.fetch(
        new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager, false,
      );

      expect(result).toBe(false);
      expect(lock.found).toBe(true);
      expect(mockFetcher.downloadReleaseAsset).not.toHaveBeenCalled();
    });

    it('should download and extract when not cached', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      const result = await dep.fetch(
        new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager,
      );

      expect(result).toBe(true);
      expect(mockFetcher.downloadReleaseAsset).toHaveBeenCalledWith('group', 'project', 'v1.1.0');
      expect(mockCacheManager.extractArchive).toHaveBeenCalled();
      expect(mockCacheManager.saveMetadata).toHaveBeenCalled();
      expect(lock.found).toBe(true);
      expect(lock.tag).toBe('v1.1.0');
      expect(lock.archiveSize).toBe(1024);
    });

    it('should force download when update is true even if cached', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue({
        getListDependencies: vi.fn().mockResolvedValue({ dependencies: {} }),
      });

      const result = await dep.fetch(
        new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager, true,
      );

      expect(result).toBe(true);
      expect(mockFetcher.downloadReleaseAsset).toHaveBeenCalled();
    });

    it('should build correct GitLab URLs in lock entry', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.htmlURL).toBe('https://gitlab.com/group/project/-/releases/v1.1.0');
      expect(lock.archiveURL).toContain('https://gitlab.com/group/project/-/archive/v1.1.0');
    });

    it('should use dependency host over environment host', async () => {
      const spec: DependencySpec = {
        gitlab: 'group/project',
        version: '^1.0.0',
        host: 'https://private.gitlab.com',
      };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.htmlURL).toContain('https://private.gitlab.com');
    });

    it('should use specific tag when provided', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', tag: 'v2.0.0-beta' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.tag).toBe('v2.0.0-beta');
      expect(mockFetcher.getReleases).not.toHaveBeenCalled();
      expect(mockFetcher.downloadReleaseAsset).toHaveBeenCalledWith('group', 'project', 'v2.0.0-beta');
    });

    it('should resolve "highest" to highest semver version', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: 'highest' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.tag).toBe('v2.0.0');
      expect(mockFetcher.getReleases).toHaveBeenCalled();
    });

    it('should resolve "newest" via getLatestRelease', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: 'newest' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);
      mockFetcher.getLatestRelease = vi.fn().mockResolvedValue({
        tag_name: 'v3.0.0', draft: false, prerelease: false,
      });

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.tag).toBe('v3.0.0');
      expect(mockFetcher.getLatestRelease).toHaveBeenCalled();
    });

    it('should resolve "latest" via getLatestRelease (same as GitHub)', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: 'latest' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);
      mockFetcher.getLatestRelease = vi.fn().mockResolvedValue({
        tag_name: 'v3.0.0', draft: false, prerelease: false,
      });

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(lock.tag).toBe('v3.0.0');
    });

    it('should handle download errors gracefully', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);
      mockFetcher.downloadReleaseAsset = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await dep.fetch(
        new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager,
      );

      expect(result).toBe(false);
      expect(lock.found).toBe(false);
      expect(lock.errors?.[0].message).toBe('Unable to download release asset for group/project tag v1.1.0 on GitLab');
    });

    it('should read sub-dependencies from cached package', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue({
        getListDependencies: vi.fn().mockResolvedValue({
          dependencies: {
            'subDep': { gitlab: 'other/subdep', version: '^2.0.0' },
          },
        }),
      });

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager, false);

      expect(lock.dependencies).toEqual({
        'subDep': { gitlab: 'other/subdep', version: '^2.0.0' },
      });
    });

    it('should save metadata with gitlab field', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.fetch(new Version('20.0.0'), mockEnv, lock, mockFetcher, mockCacheManager);

      expect(mockCacheManager.saveMetadata).toHaveBeenCalledWith(
        dep,
        'v1.1.0',
        expect.objectContaining({
          gitlab: 'group/project',
          name: 'project',
        }),
      );
    });
  });

  describe('checkOutdated', () => {
    let mockFetcher: Fetcher;
    let mockCacheManager: CacheManager;

    beforeEach(() => {
      mockFetcher = {
        rateLimit: vi.fn().mockResolvedValue(Infinity),
        getLatestRelease: vi.fn(),
        getReleases: vi.fn().mockResolvedValue([
          { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
          { id: 2, tag_name: 'v1.1.0', name: 'v1.1.0', draft: false, prerelease: false },
          { id: 3, tag_name: 'v2.0.0', name: 'v2.0.0', draft: false, prerelease: false },
        ]),
        downloadReleaseAsset: vi.fn(),
      };

      mockCacheManager = {
        getCacheRoot: vi.fn().mockReturnValue('/cache'),
      } as unknown as CacheManager;
    });

    it('should mark as outdated when newer version exists', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      const lock: LockEntry = { tag: 'v1.0.0' };

      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

      expect(lock.outdated).toBe(true);
      expect(lock.wanted).toBe('v1.1.0');
      expect(lock.current).toBe('v1.0.0');
    });

    it('should use "highest" as default version for checkOutdated', async () => {
      const spec: DependencySpec = { gitlab: 'group/project' };
      const dep = new GitLabDependency(spec, true);

      const lock: LockEntry = { tag: 'v1.0.0' };
      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

      // Should compare against all versions (any range) → v2.0.0 is highest
      expect(lock.outdated).toBe(true);
      expect(lock.wanted).toBe('v2.0.0');
    });

    it('should not mark as outdated when already at latest in range', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      const lock: LockEntry = { tag: 'v1.1.0' };
      vi.spyOn(dep, 'getPackage' as any).mockResolvedValue(null);

      await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

      expect(lock.outdated).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      const lock: LockEntry = { tag: 'v1.0.0' };
      mockFetcher.getReleases = vi.fn().mockRejectedValue(new Error('API error'));

      await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

      expect(lock.errors?.[0].message).toBe('API error');
    });

    it('should skip when lock has no tag', async () => {
      const spec: DependencySpec = { gitlab: 'group/project', version: '^1.0.0' };
      const dep = new GitLabDependency(spec, true);

      const lock: LockEntry = {};
      await dep.checkOutdated(mockFetcher, new Version('20.0.0'), lock, mockCacheManager);

      expect(mockFetcher.getReleases).not.toHaveBeenCalled();
    });
  });
});
