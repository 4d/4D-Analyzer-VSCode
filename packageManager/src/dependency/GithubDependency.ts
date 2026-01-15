import { CacheManager } from '../cache/CacheManager';
import { Range } from '../version/Range';
import {
  DependencySpec,
  LockEntry,
  Environment,
} from '../types';
import { Fetcher } from './Fetcher';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Dependency } from './Dependency';

/**
 * GitHub-based dependency implementation
 */
export class GitHubDependency extends Dependency {
  private github_url: string | undefined;
  constructor(spec: DependencySpec, isPrimary: boolean) {
    let owner = "";
    let name = "";
    const split = spec.github?.split("/");
    if (split && split.length == 2) {
      owner = split[0];
      name = split[1];
    }
    super(owner, name, spec.version ? spec.version : "", spec.tag ? spec.tag : "", isPrimary);

    this.github_url = spec.github;

  }

  /**
   * Fetch this dependency
   */
  async fetch(
    ideVersion: string,
    env: Environment,
    lock: LockEntry,
    fetcher: Fetcher,
    cacheManager: CacheManager,
    update: boolean = false
  ): Promise<boolean> {

    if (!(this.owner && this.repo))
      return false;
    const owner = this.owner;
    const repo = this.repo;
    console.log(`Fetching GitHub dependency: ${owner}/${repo}`);
    try {
      // Resolve version
      const tag = await this.resolveVersion(fetcher, ideVersion);
      if (!tag) {
        this.addError(lock, 'No matching version found');
        return false;
      }

      lock.tag = tag;
      const dependencyLocation = path.join(cacheManager.getCacheRoot(), this.getCacheFolderPath(tag));
      const project = await this.getPackage(dependencyLocation);

      // Check if already in cache
      const exists = project != null;

      if (exists && !update) {
        const dependencyPath = cacheManager.getDependencyFolder(this, tag);
        lock.path = dependencyPath;
        lock.found = true;

        // Read sub-dependencies
        const subDeps = await project.getListDependencies();
        if (subDeps?.dependencies) {
          lock.dependencies = subDeps.dependencies;
        }

        return false; // Already cached, nothing fetched
      }

      // Download archive
      const archiveBuffer = await fetcher.downloadReleaseAsset(
        owner,
        repo,
        tag,
      );

      lock.archiveSize = archiveBuffer.byteLength;
      const temp_file = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-')) + '.zip';
      await fs.writeFile(temp_file, Buffer.from(archiveBuffer));

      // Extract to cache
      const dependencyPath = await cacheManager.extractArchive(
        temp_file,
        this,
        tag
      );
      lock.path = dependencyPath;
      lock.found = true;

      // Build URLs
      const htmlURL = env.github.htmlURL || 'https://github.com';
      lock.htmlURL = `${htmlURL}/${owner}/${repo}/releases/tag/${tag}`;
      lock.archiveURL = `${htmlURL}/${owner}/${repo}/releases/download/${tag}/${repo}.zip`;

      // Read sub-dependencies
      const subDeps = await project?.getListDependencies();
      if (subDeps?.dependencies) {
        lock.dependencies = subDeps.dependencies;
      }

      // Save metadata
      await cacheManager.saveMetadata(this, tag, {
        name: this.name,
        github: this.github_url,
        tag,
        fetchedAt: new Date().toISOString(),
        archiveSize: archiveBuffer.byteLength
      });

      return true; // Successfully fetched
    } catch (error : any) {
      this.addError(lock, error.message);
      lock.found = false;
      return false;
    }
  }




  /**
   * Check if dependency is outdated
   */
  async checkOutdated(
    fetcher: Fetcher,
    ideVersion: string,
    lock: LockEntry,
    cacheManager: CacheManager
  ): Promise<void> {
    if (!lock.tag) {
      return;
    }

    try {
      const owner = this.owner;
      const repo = this.repo;

      // Get current range
      const rangeSpec = this.version || 'latest';
      const range = rangeSpec.toLowerCase() === '4d'
        ? new Range(`^${ideVersion}`)
        : new Range(rangeSpec);

      // Get available versions
      const releases = await fetcher.getReleases(owner, repo);
      const validReleases = releases.filter(r => !r.draft && !r.prerelease);
      const tags = validReleases.map(r => r.tag_name);

      // Find newest version in range
      const wanted = range.maxSatisfying(tags);

      if (wanted && wanted !== lock.tag) {
        lock.wanted = wanted;
        lock.outdated = true;
        lock.current = lock.tag;
        const dependencyLocation = path.join(cacheManager.getCacheRoot(), this.getCacheFolderPath(wanted));

        // Check if wanted version is in cache
        const p = this.getPackage(dependencyLocation);
        const wantedInCache = p != null;

        lock.wantedInCache = wantedInCache;
      }
    } catch (error: any) {
      if (!lock.update) {
        lock.update = {};
      }
      this.addError(lock, error.message);
    }
  }


  /**
   * Get the relative cache folder path
   * Returns: .github/owner/repo/encodedTag
   */
  getCacheFolderPath(tag: string): string {
    return `.github/${this.getCachePath(tag)}`;
  }

  /**
   * Get the relative metadata file path
   * Returns: .github/owner/repo/encodedTag.json
   */
  getMetadataFilePath(tag: string): string {
    return `.github/${this.getCachePath(tag)}.json`;
  }


  /**
   * Reconcile with environment configuration
   */
  reconcileWithEnv(envSpec: string | DependencySpec): void {
    this.mergeWithEnv(envSpec);
  }

  /**
   * Reconcile with lock file
   */
  reconcileWithLock(lockEntry: LockEntry | undefined, update: boolean): void {
    if (!lockEntry || update) {
      return;
    }

    this.restoreFromLock(lockEntry.tag);
  }
}