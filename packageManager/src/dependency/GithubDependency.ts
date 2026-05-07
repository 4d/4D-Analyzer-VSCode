import { CacheManager } from '../cache/CacheManager';
import { Range } from '../version/Range';
import {
  DependencySpec,
  LockEntry,
  Environment,
} from '../types';
import { Fetcher, FetchError } from './Fetcher';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Dependency } from './Dependency';
import { Version } from '../version/Version';

/**
 * GitHub-based dependency implementation
 */
export class GitHubDependency extends Dependency {
  private github_url: string | undefined;
  constructor(spec: DependencySpec, isPrimary: boolean) {
    let owner = "";
    let name = "";
    const split = spec.github?.split("/");
    if (split && split.length === 2) {
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
    ideVersion: Version,
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
    const repoPath = `${owner}/${repo}`;
    this.logger?.info(`Fetching GitHub dependency: ${repoPath}`);

    // Phase 1: Resolve version
    let tag: string | null;
    try {
      tag = await this.resolveVersion(fetcher, ideVersion);
    } catch (error: any) {
      this.logger?.error(`${repoPath}: ${error.message}`);
      if (this.version) {
        this.addFetchError(lock, `Unable to find a release for ${repoPath} on GitHub satisfying version ${this.version}`, error);
      } else {
        this.addFetchError(lock, `Unable to find a release for ${repoPath} on GitHub`, error);
      }
      lock.found = false;
      return false;
    }

    if (!tag) {
      this.logger?.warn(`${repoPath}: no matching version found`);
      if (this.version) {
        this.addError(lock, `Unable to find a release for ${repoPath} on GitHub satisfying version ${this.version}`);
      } else {
        this.addError(lock, `Unable to find a release for ${repoPath} on GitHub`);
      }
      lock.found = false;
      return false;
    }

    this.logger?.debug(`${repoPath}: resolved to tag ${tag}`);
    lock.tag = tag;
    lock.version = this.getEffectiveLockVersion(ideVersion);
    const dependencyLocation = path.join(cacheManager.getCacheRoot(), this.getCacheFolderPath(tag));
    const project = await this.getPackage(dependencyLocation);

    // Check if already in cache
    const exists = project != null;

    if (exists && !update) {
      this.logger?.debug(`${repoPath}@${tag}: found in cache`);
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

    // Phase 2: Download archive
    let archiveBuffer: ArrayBuffer;
    try {
      this.logger?.debug(`${repoPath}@${tag}: downloading archive...`);
      archiveBuffer = await fetcher.downloadReleaseAsset(
        owner,
        repo,
        tag,
      );
    } catch (error: any) {
      this.logger?.error(`${repoPath}: ${error.message}`);
      this.addFetchError(lock, `Unable to download release asset for ${repoPath} tag ${tag} on GitHub`, error);
      lock.found = false;
      return false;
    }

    lock.archiveSize = archiveBuffer.byteLength;

    // Phase 3: Write temp file and extract archive
    let dependencyPath: string;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-'));
    try {
      const temp_file = path.join(tempDir, 'archive.zip');
      await fs.writeFile(temp_file, Buffer.from(archiveBuffer));

      dependencyPath = await cacheManager.extractArchive(
        temp_file,
        this,
        tag
      );
    } catch (error: any) {
      this.logger?.error(`${repoPath}: ${error.message}`);
      this.addError(lock, `Cannot unzip downloaded file for ${repoPath} tag ${tag}`);
      this.addFetchError(lock, error.message, error);
      lock.found = false;
      return false;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    lock.path = dependencyPath;
    lock.found = true;

    // Build URLs
    const htmlURL = env.github.htmlURL || 'https://github.com';
    lock.htmlURL = `${htmlURL}/${owner}/${repo}/releases/tag/${tag}`;
    lock.archiveURL = `${htmlURL}/${owner}/${repo}/releases/download/${tag}/${repo}.zip`;

    // Read sub-dependencies from freshly extracted package
    const extractedProject = await this.getPackage(dependencyPath);
    const subDeps = await extractedProject?.getListDependencies();
    if (subDeps?.dependencies) {
      lock.dependencies = subDeps.dependencies;
    }

    // Save metadata
    await cacheManager.saveMetadata(this, tag, {
      name: this.name,
      github: this.github_url ?? '',
      tag,
      fetchedAt: new Date().toISOString(),
      archiveSize: archiveBuffer.byteLength
    });

    return true; // Successfully fetched
  }

  /**
   * Add error from a FetchError (with status/url) or plain Error
   */
  private addFetchError(lock: LockEntry, message: string, error: any): void {
    if (error instanceof FetchError) {
      this.addError(lock, message, { status: error.status, url: error.url });
    } else {
      this.addError(lock, message);
    }
    this.addOriginalError(lock, message, error);
  }




  /**
   * Check if dependency is outdated
   */
  async checkOutdated(
    fetcher: Fetcher,
    ideVersion: Version,
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
      const range = new Range(rangeSpec, ideVersion)

      // Get available versions
      const releases = await fetcher.getReleases(owner, repo);
      const validReleases = releases.filter(r => !r.draft && !r.prerelease);

      // Normalize tags for semver comparison (replace R-release format)
      const normalizedTags = validReleases.map(r => r.tag_name.replace("R", "."));

      // Find newest version in range
      const wantedNormalized = range.maxSatisfying(normalizedTags);

      if (wantedNormalized) {
        // Map back to original tag name
        const idx = normalizedTags.indexOf(wantedNormalized);
        const wanted = idx >= 0 ? validReleases[idx].tag_name : wantedNormalized;

        if (wanted !== lock.tag) {
          lock.wanted = wanted;
          lock.outdated = true;
          lock.current = lock.tag;
          const dependencyLocation = path.join(cacheManager.getCacheRoot(), this.getCacheFolderPath(wanted));

          // Check if wanted version is in cache
          const p = await this.getPackage(dependencyLocation);
          const wantedInCache = p != null;

          lock.wantedInCache = wantedInCache;
        }
      }
    } catch (error: any) {
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

  getSourceType(): 'github' {
    return 'github';
  }

  getSourceSpec(): string | undefined {
    return this.github_url;
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
  reconcileWithLock(lockEntry: LockEntry | undefined, update: boolean, ideVersion?: Version): void {
    if (!lockEntry || update) {
      return;
    }

    // Compare effective version with lock to detect changes
    const effectiveVersion = this.getEffectiveLockVersion(ideVersion);
    const lockedVersion = lockEntry.version || "";
    if (effectiveVersion !== lockedVersion) {
      return;
    }

    this.restoreFromLock(lockEntry.tag);
  }

  /**
   * Compute the effective version string for the lock file.
   * - no version / "latest" → "latest"
   * - "4d" → "4D:<ideVersion>" (or "4d" if ideVersion unavailable)
   * - anything else → as-is
   */
  getEffectiveLockVersion(ideVersion?: Version): string {
    if (!this.version || this.version === 'latest') {
      return 'latest';
    }
    if (this.version.toLowerCase() === '4d') {
      return ideVersion ? this.format4DLockVersion(ideVersion) : '4d';
    }
    return this.version;
  }
}